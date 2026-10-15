import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import { createPolarCore } from '@polar-sh/sdk/2026-10'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { createBilling } from './billing'

const environment = {
	POLAR_ENVIRONMENT: 'sandbox',
	POLAR_ORGANIZATION_ID: '11111111-1111-4111-8111-111111111111',
	POLAR_ACCESS_TOKEN: 'isolated-fixture-access-token-at-least-32-chars',
	POLAR_WEBHOOK_SECRET: 'isolated-fixture-signing-secret-at-least-32-chars',
	POLAR_PRODUCTS: JSON.stringify([{ slug: 'fixture', productId: '22222222-2222-4222-8222-222222222222' }]),
	WEB_ORIGIN: 'http://localhost:5173',
}
test('real Better Auth and Polar SDK isolate checkout identity and verify signed, replayed and failed payment events', async () => {
	const calls: Array<{ path: string; body: Record<string, unknown> }> = []
	let fail = false
	const provider = Bun.serve({
		port: 0,
		async fetch(request) {
			calls.push({ path: new URL(request.url).pathname, body: (await request.json()) as Record<string, unknown> })
			return fail
				? Response.json({ detail: 'fixture unavailable' }, { status: 500 })
				: Response.json({
						url: 'https://sandbox.polar.sh/checkout/test',
						client_secret: 'fixture-secret',
						customer_portal_url: 'https://sandbox.polar.sh/portal/test',
					})
		},
	})
	const database = new Database(':memory:')
	const client = createPolarCore({
		environment: 'sandbox',
		organizationId: environment.POLAR_ORGANIZATION_ID,
		accessToken: environment.POLAR_ACCESS_TOKEN,
		baseUrl: provider.url.origin,
		timeout: 1,
	})
	const billing = createBilling(database, environment, client)
	const auth = betterAuth({
		database,
		baseURL: 'http://localhost:3001',
		secret: 'isolated-fixture-better-auth-secret-at-least-32',
		trustedOrigins: ['http://localhost:5173'],
		emailAndPassword: { enabled: true },
		plugins: billing.plugins,
		logger: { disabled: true },
	})
	await (await getMigrations(auth.options)).runMigrations()
	const handle = (request: Request) => billing.handle(request, incoming => auth.handler(incoming))
	const post = (path: string, body: unknown, cookie = '') =>
		handle(
			new Request(`http://localhost:3001/api/auth${path}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin: 'http://localhost:5173', cookie },
				body: JSON.stringify(body),
			})
		)
	try {
		const signup = await post('/sign-up/email', {
			name: 'Billing fixture',
			email: 'billing-fixture@example.com',
			password: 'isolated-fixture-password',
		})
		expect(signup.status).toBe(200)
		const cookie = signup.headers.get('set-cookie')?.split(';')[0] ?? ''
		const { user } = (await signup.json()) as { user: { id: string } }
		expect(calls).toHaveLength(0)
		expect((await post('/checkout', { slug: 'fixture' })).status).toBe(401)
		expect((await post('/checkout/', { slug: 'fixture', products: ['forbidden'] }, cookie)).status).toBe(400)
		expect((await post('/checkout', { slug: 'fixture', allow_trial: true }, cookie)).status).toBe(400)
		const checkout = await post('/checkout', { slug: 'fixture' }, cookie)
		expect(checkout.status).toBe(200)
		expect(await checkout.json()).toEqual({ url: 'https://sandbox.polar.sh/checkout/test', redirect: false })
		expect(calls).toHaveLength(1)
		expect(calls[0]?.body).toMatchObject({
			external_customer_id: user.id,
			products: ['22222222-2222-4222-8222-222222222222'],
			success_url: 'http://localhost:5173/gallery?billing=return',
			return_url: 'http://localhost:5173/gallery',
			allow_trial: false,
			allow_discount_codes: false,
		})
		expect(calls[0]?.body.customer_ip_address).toBeUndefined()
		expect(database.query('SELECT COUNT(*) AS n FROM billing_resources').get()).toEqual({ n: 0 })
		const portal = await post('/customer/portal', { redirect: false }, cookie)
		expect(portal.status).toBe(200)
		expect(await portal.json()).toEqual({ url: 'https://sandbox.polar.sh/portal/test', redirect: false })
		expect(calls.at(-1)?.body).toEqual({ external_customer_id: user.id, return_url: 'http://localhost:5173/gallery' })
		expect(
			(
				await handle(
					new Request('http://localhost:3001/api/auth/customer/subscriptions/list?reference_id=foreign', {
						headers: { cookie },
					})
				)
			).status
		).toBe(400)
		expect(
			(
				await handle(
					new Request('http://localhost:3001/api/auth/customer/portal?organizationId=foreign', { headers: { cookie } })
				)
			).status
		).toBe(400)

		const event = (status: string, at: string) => ({
			type: 'order.updated',
			timestamp: at,
			data: {
				id: 'order-fixture',
				status,
				paid: status === 'paid',
				product_id: '22222222-2222-4222-8222-222222222222',
				modified_at: at,
				customer: { organization_id: environment.POLAR_ORGANIZATION_ID, external_id: user.id },
			},
		})
		const webhook = (
			id: string,
			body: unknown,
			secret = environment.POLAR_WEBHOOK_SECRET,
			timestamp = Math.floor(Date.now() / 1000)
		) => {
			const raw = JSON.stringify(body),
				signature = createHmac('sha256', secret).update(`${id}.${timestamp}.${raw}`).digest('base64')
			return handle(
				new Request('http://localhost:3001/api/auth/polar/webhooks', {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						'webhook-id': id,
						'webhook-timestamp': String(timestamp),
						'webhook-signature': `v1,${signature}`,
					},
					body: raw,
				})
			)
		}
		const paid = event('paid', '2026-10-16T10:00:00Z')
		expect((await webhook('bad-signature', paid, 'wrong-secret')).status).toBe(403)
		expect((await webhook('expired', paid, environment.POLAR_WEBHOOK_SECRET, 1)).status).toBe(403)
		expect((await webhook('paid', paid)).status).toBe(200)
		expect((await webhook('paid', paid)).status).toBe(200)
		expect((await webhook('paid', event('pending', '2026-10-16T09:00:00Z'))).status).toBeGreaterThanOrEqual(400)
		expect((await webhook('stale', event('pending', '2026-10-16T09:00:00Z'))).status).toBe(200)
		expect(database.query('SELECT status,paid FROM billing_resources').get()).toEqual({ status: 'paid', paid: 1 })
		expect((await webhook('refund', event('refunded', '2026-10-16T11:00:00Z'))).status).toBe(200)
		expect(database.query('SELECT status,paid FROM billing_resources').get()).toEqual({ status: 'refunded', paid: 0 })
		expect(
			(
				await webhook('foreign', {
					...paid,
					data: { ...paid.data, customer: { organization_id: 'foreign', external_id: user.id } },
				})
			).status
		).toBeGreaterThanOrEqual(400)
		expect((await webhook('ignored', { type: 'customer.created', data: {}, timestamp: paid.timestamp })).status).toBe(
			200
		)
		expect((await webhook('unknown', { type: 'unrecognized.fixture', data: {} })).status).toBe(200)
		fail = true
		expect((await post('/checkout', { slug: 'fixture' }, cookie)).status).toBe(500)
	} finally {
		await provider.stop(true)
		database.close()
	}
}, 15000)
