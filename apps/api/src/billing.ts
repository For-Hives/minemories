import type { Database } from 'bun:sqlite'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { checkout, polar, portal, webhooks } from '@polar-sh/better-auth'
import { createPolarCore, type PolarCore } from '@polar-sh/sdk/2026-10'
import * as z from 'zod'
import { type BillingConfig, billingConfig } from './billing-config'
import { type BillingDelivery, BillingLedger } from './billing-ledger'
import { AUTH_BODY_BYTES, boundedRequest } from './body-limits'

export const BILLING_WEBHOOK_BODY_BYTES = 256 * 1024
const trailingSlashes = /\/+$/
const input = z.strictObject({ slug: z.string() })
const deliveryContext = new AsyncLocalStorage<BillingDelivery>()
type Handler = (request: Request) => Promise<Response>

export function createBilling(
	database: Database,
	environment: Readonly<Record<string, string | undefined>>,
	client?: PolarCore
) {
	const config = billingConfig(environment)
	const ledger = config ? new BillingLedger(database, config) : null
	const plugins = config
		? [
				polar({
					client:
						client ??
						createPolarCore({
							environment: config.environment,
							accessToken: config.accessToken,
							organizationId: config.organizationId,
							timeout: 20,
						}),
					// Creating a Minemories account does not send its identity to a payment provider.
					createCustomerOnSignUp: false,
					use: [
						checkout({
							products: config.products,
							authenticatedUsersOnly: true,
							successUrl: `${config.returnUrl}?billing=return`,
							returnUrl: config.returnUrl,
							customerIpAddress: false,
						}),
						portal({ returnUrl: config.returnUrl }),
						webhooks({
							secret: config.webhookSecret,
							onPayload: event => {
								const delivery = deliveryContext.getStore()
								if (!(delivery && ledger)) throw new Error('Missing verified billing delivery context.')
								ledger.accept(delivery, event)
								return Promise.resolve()
							},
						}),
					],
				}),
			]
		: []
	async function handle(request: Request, handler: Handler): Promise<Response> {
		const url = new URL(request.url),
			path = url.pathname.replace(trailingSlashes, '')
		if (config && path.startsWith('/api/auth/customer/')) return handleCustomer(request, handler, url)
		if (!(config && ['/api/auth/checkout', '/api/auth/polar/webhooks'].includes(path))) return handler(request)
		const limit = path.endsWith('/webhooks') ? BILLING_WEBHOOK_BODY_BYTES : AUTH_BODY_BYTES
		const bounded = await boundedRequest(request, limit)
		if (!bounded) return Response.json({ error: 'body_too_large' }, { status: 413 })
		const response = path.endsWith('/webhooks')
			? await handleWebhook(bounded, handler)
			: await handleCheckout(bounded, handler, config)
		response.headers.set('Cache-Control', 'private, no-store')
		return response
	}
	return { config, plugins, handle }
}

async function handleWebhook(request: Request, handler: Handler): Promise<Response> {
	const id = request.headers.get('webhook-id')
	if (!id || id.length > 200) return Response.json({ error: 'invalid_delivery' }, { status: 400 })
	const body = await request.clone().text()
	return deliveryContext.run({ id, sha256: createHash('sha256').update(body).digest('hex') }, () => handler(request))
}
async function handleCheckout(request: Request, handler: Handler, config: BillingConfig): Promise<Response> {
	let parsed: ReturnType<typeof input.safeParse>
	try {
		parsed = input.safeParse(await request.json())
	} catch {
		return Response.json({ error: 'invalid_checkout' }, { status: 400 })
	}
	if (!(parsed.success && config.products.some(p => p.slug === parsed.data.slug)))
		return Response.json({ error: 'invalid_checkout' }, { status: 400 })
	const body = JSON.stringify({
		slug: parsed.data.slug,
		allow_trial: false,
		allow_discount_codes: false,
		redirect: false,
	})
	const headers = new Headers(request.headers)
	headers.set('content-length', String(Buffer.byteLength(body)))
	return handler(new Request(request, { headers, body }))
}

async function handleCustomer(request: Request, handler: Handler, url: URL): Promise<Response> {
	if (url.searchParams.has('reference_id') || url.searchParams.has('organizationId'))
		return Response.json({ error: 'individual_billing_only' }, { status: 400 })
	const response = await handler(request)
	response.headers.set('Cache-Control', 'private, no-store')
	return response
}
