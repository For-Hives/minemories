import * as z from 'zod'

const product = z.strictObject({
	productId: z.uuid(),
	slug: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
})
export interface BillingConfig {
	environment: 'sandbox' | 'production'
	organizationId: string
	accessToken: string
	webhookSecret: string
	products: z.infer<typeof product>[]
	returnUrl: string
}
function required(environment: Readonly<Record<string, string | undefined>>, key: string): string {
	const value = environment[key]
	if (!value || value !== value.trim()) throw new Error(`${key} must be explicitly configured.`)
	return value
}
/** Credentials alone never enable checkout; production also needs the operator's reviewed terms/configuration. */
export function billingConfig(environment: Readonly<Record<string, string | undefined>>): BillingConfig | null {
	const mode = environment.POLAR_ENVIRONMENT
	if (mode === undefined || mode === 'off') return null
	if (mode !== 'sandbox' && mode !== 'production') throw new Error('Invalid POLAR_ENVIRONMENT.')
	if (mode === 'production') {
		if (environment.POLAR_PRODUCTION_READY !== 'true') throw new Error('Polar production has not been configured.')
		required(environment, 'POLAR_TERMS_VERSION')
	}
	const organizationId = required(environment, 'POLAR_ORGANIZATION_ID')
	if (!z.uuid().safeParse(organizationId).success) throw new Error('Invalid POLAR_ORGANIZATION_ID.')
	const accessToken = required(environment, 'POLAR_ACCESS_TOKEN')
	const webhookSecret = required(environment, 'POLAR_WEBHOOK_SECRET')
	if (accessToken.length < 32 || webhookSecret.length < 32) throw new Error('Polar credentials are too short.')
	const products = z
		.array(product)
		.min(1)
		.max(32)
		.parse(JSON.parse(required(environment, 'POLAR_PRODUCTS')))
	if (
		new Set(products.map(p => p.slug)).size !== products.length ||
		new Set(products.map(p => p.productId)).size !== products.length
	)
		throw new Error('Polar products must have unique IDs and slugs.')
	const origin = new URL(required(environment, 'WEB_ORIGIN'))
	if (
		!['http:', 'https:'].includes(origin.protocol) ||
		origin.username ||
		origin.password ||
		origin.pathname !== '/' ||
		origin.search ||
		origin.hash ||
		(mode === 'production' && origin.protocol !== 'https:')
	)
		throw new Error('Polar requires a valid WEB_ORIGIN; production requires HTTPS.')
	return {
		environment: mode,
		organizationId,
		accessToken,
		webhookSecret,
		products,
		returnUrl: `${origin.origin}/gallery`,
	}
}
