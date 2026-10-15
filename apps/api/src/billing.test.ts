import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { BILLING_WEBHOOK_BODY_BYTES, createBilling } from './billing'
import { billingConfig } from './billing-config'
import { BillingLedger } from './billing-ledger'

const billingEnvironment = {
	POLAR_ENVIRONMENT: 'sandbox',
	POLAR_ORGANIZATION_ID: '11111111-1111-4111-8111-111111111111',
	POLAR_ACCESS_TOKEN: 'isolated-test-access-token-at-least-32-chars',
	POLAR_WEBHOOK_SECRET: 'isolated-test-webhook-secret-at-least-32-chars',
	POLAR_PRODUCTS: JSON.stringify([{ slug: 'fixture', productId: '22222222-2222-4222-8222-222222222222' }]),
	WEB_ORIGIN: 'http://localhost:5173',
}
test('billing is opt-in and fails closed on incomplete or unreviewed configuration', () => {
	expect(billingConfig({})).toBeNull()
	expect(billingConfig({ POLAR_ENVIRONMENT: 'off' })).toBeNull()
	expect(() => billingConfig({ POLAR_ENVIRONMENT: 'typo' })).toThrow()
	expect(() => billingConfig({ ...billingEnvironment, POLAR_ENVIRONMENT: 'production' })).toThrow()
	expect(() =>
		billingConfig({ ...billingEnvironment, POLAR_ENVIRONMENT: 'production', POLAR_PRODUCTION_READY: 'true' })
	).toThrow()
	expect(() => billingConfig({ ...billingEnvironment, POLAR_ORGANIZATION_ID: 'bad' })).toThrow()
	expect(() => billingConfig({ ...billingEnvironment, POLAR_ACCESS_TOKEN: 'short' })).toThrow()
	expect(() => billingConfig({ ...billingEnvironment, POLAR_ACCESS_TOKEN: ' padded ' })).toThrow()
	expect(() => billingConfig({ ...billingEnvironment, POLAR_PRODUCTS: '[]' })).toThrow()
	expect(() =>
		billingConfig({
			...billingEnvironment,
			POLAR_PRODUCTS: JSON.stringify([
				{ slug: 'same', productId: '22222222-2222-4222-8222-222222222222' },
				{ slug: 'same', productId: '33333333-3333-4333-8333-333333333333' },
			]),
		})
	).toThrow()
	expect(() => billingConfig({ ...billingEnvironment, WEB_ORIGIN: 'http://localhost:5173/path' })).toThrow()
	expect(() =>
		billingConfig({
			...billingEnvironment,
			POLAR_ENVIRONMENT: 'production',
			POLAR_PRODUCTION_READY: 'true',
			POLAR_TERMS_VERSION: 'v1',
		})
	).toThrow()
	expect(
		billingConfig({
			...billingEnvironment,
			POLAR_ENVIRONMENT: 'production',
			POLAR_PRODUCTION_READY: 'true',
			POLAR_TERMS_VERSION: 'v1',
			WEB_ORIGIN: 'https://example.com',
		})?.returnUrl
	).toBe('https://example.com/gallery')
})
test('ledger binds its environment, isolates ownership, deduplicates signed deliveries and ignores stale revisions', () => {
	const db = new Database(':memory:')
	db.exec("PRAGMA foreign_keys=ON;CREATE TABLE user(id TEXT PRIMARY KEY);INSERT INTO user VALUES ('owner'),('other')")
	const config = billingConfig(billingEnvironment)
	if (!config) throw new Error('Test billing configuration required')
	const ledger = new BillingLedger(db, config)
	const event = (status: string, modified = '2026-10-16T10:00:00Z', owner = 'owner', kind = 'order') => ({
		type: `${kind}.updated`,
		timestamp: new Date(modified),
		data: {
			id: 'same-resource',
			customer: { organization_id: config.organizationId, external_id: owner },
			product_id: config.products[0]?.productId,
			status,
			paid: status === 'paid',
			modified_at: modified,
		},
	})
	let i = 0
	const delivery = (body: unknown) => ({
		id: `delivery-${++i}`,
		sha256: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
	})
	try {
		expect(ledger.accept(delivery({}), { type: 'customer.created' })).toBe(false)
		expect(() => ledger.accept({ id: '', sha256: '' }, event('paid'))).toThrow()
		const body = event('paid'),
			identity = delivery(body)
		expect(ledger.accept(identity, body)).toBe(true)
		expect(ledger.accept(identity, body)).toBe(false)
		expect(() => ledger.accept({ ...identity, sha256: 'a'.repeat(64) }, body)).toThrow()
		expect(ledger.accept(delivery({}), event('pending', '2026-10-15T10:00:00Z'))).toBe(true)
		expect(db.query('SELECT status,paid FROM billing_resources').get()).toEqual({ status: 'paid', paid: 1 })
		expect(() => ledger.accept(delivery({}), event('paid', '2026-10-17T10:00:00Z', 'other'))).toThrow('ownership')
		expect(ledger.accept(delivery({}), event('active', '2026-10-17T10:00:00Z', 'other', 'subscription'))).toBe(true)
		expect(db.query('SELECT COUNT(*) AS n FROM billing_resources').get()).toEqual({ n: 2 })
		expect(ledger.accept(delivery({}), event('paid', '2026-10-17T10:00:00Z', 'unknown'))).toBe(false)
		expect(() => ledger.accept(delivery({}), event('paid', 'invalid'))).toThrow()
		expect(() =>
			ledger.accept(delivery({}), { ...body, data: { ...body.data, customer: { organization_id: 'other' } } })
		).toThrow('organization')
		new BillingLedger(db, config)
		expect(() => new BillingLedger(db, { ...config, environment: 'production' })).toThrow('target changed')
		expect(ledger.accept(delivery({}), event('refunded', '2026-10-18T10:00:00Z'))).toBe(true)
		expect(db.query("SELECT status,paid FROM billing_resources WHERE kind='order'").get()).toEqual({
			status: 'refunded',
			paid: 0,
		})
	} finally {
		db.close()
	}
})
test('checkout boundary rejects arbitrary products, redirect overrides, trials and oversized webhook bodies', async () => {
	const db = new Database(':memory:')
	try {
		const disabled = createBilling(db, {})
		expect(disabled.plugins).toHaveLength(0)
		const handler = async (request: Request) => Response.json(await request.json())
		expect(
			await (
				await disabled.handle(
					new Request('http://localhost/api/auth/checkout', { method: 'POST', body: '{}' }),
					handler
				)
			).json()
		).toEqual({})
		const billing = createBilling(db, billingEnvironment)
		const request = (body: string, path = '/api/auth/checkout') =>
			new Request(`http://localhost${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
		expect((await billing.handle(request('bad'), handler)).status).toBe(400)
		expect((await billing.handle(request('{"slug":"absent"}'), handler)).status).toBe(400)
		expect(
			(
				await billing.handle(
					request('{"slug":"fixture","products":["evil"],"success_url":"https://evil.test"}'),
					handler
				)
			).status
		).toBe(400)
		const response = await billing.handle(request('{"slug":"fixture"}'), handler)
		expect(await response.json()).toEqual({
			slug: 'fixture',
			allow_trial: false,
			allow_discount_codes: false,
			redirect: false,
		})
		expect(response.headers.get('cache-control')).toBe('private, no-store')
		expect(
			(await billing.handle(request('x'.repeat(BILLING_WEBHOOK_BODY_BYTES + 1), '/api/auth/polar/webhooks'), handler))
				.status
		).toBe(413)
		expect((await billing.handle(request('{}', '/api/auth/polar/webhooks'), handler)).status).toBe(400)
	} finally {
		db.close()
	}
})
