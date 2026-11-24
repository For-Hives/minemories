import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth'
import { captcha } from 'better-auth/plugins'

type Environment = Readonly<Record<string, string | undefined>>

export const SIGN_UP_PATH = '/sign-up/email'
export const SIGN_IN_PATH = '/sign-in/email'
export const SIGN_IN_NAME_PATH = '/sign-in/username'
export const RESET_REQUEST_PATH = '/request-password-reset'
export const RESET_PATH = '/reset-password'
export const SIGN_UP_UNAVAILABLE = 'SIGN_UP_UNAVAILABLE'

/** Per client IP. They replace Better Auth's built-in `/sign-*` rule (3 requests per 10 seconds). */
export const AUTH_RATE_LIMIT_RULES = {
	[SIGN_UP_PATH]: { window: 60 * 60, max: 3 },
	[SIGN_IN_PATH]: { window: 10 * 60, max: 10 },
	[SIGN_IN_NAME_PATH]: { window: 10 * 60, max: 10 },
	// Each request may send an email: tight enough that nobody fills an inbox from one address.
	[RESET_REQUEST_PATH]: { window: 60 * 60, max: 3 },
	[RESET_PATH]: { window: 10 * 60, max: 10 },
}

/**
 * api.minemories.net is not proxied by Cloudflare (its DNS points straight at the server), so `CF-Connecting-IP`
 * would be a header any client can set. Traefik drops the client's own X-Forwarded-For and writes the peer address,
 * so a single-value X-Forwarded-For is the client. A longer chain is only read when TRUSTED_PROXY_IPS names the
 * proxies to skip from the right (the same rule as pairing); otherwise it falls into one shared bucket.
 */
export const CLIENT_IP_HEADER = 'x-forwarded-for'
const repeatedSlashes = /\/{2,}/g
const trailingSlash = /(.)\/$/

function trustedProxies(environment: Environment): string[] {
	return (environment.TRUSTED_PROXY_IPS ?? '')
		.split(',')
		.map(address => address.trim())
		.filter(Boolean)
}

function authPath(request: Request, basePath: string): string {
	const pathname = new URL(request.url).pathname
	const path = pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname
	return path.replace(repeatedSlashes, '/').replace(trailingSlash, '$1')
}

/** Production without a Turnstile secret refuses sign-up instead of leaving it open to robots. */
export const signUpUnavailable: BetterAuthPlugin = {
	id: 'sign-up-unavailable',
	onRequest(request, context) {
		if (authPath(request, context.options.basePath ?? '/api/auth') !== SIGN_UP_PATH) return Promise.resolve(undefined)
		const body = { code: SIGN_UP_UNAVAILABLE, message: 'Sign-up is unavailable right now.' }
		return Promise.resolve({ response: Response.json(body, { status: 503 }) })
	},
}

export interface AuthProtection {
	rateLimit: NonNullable<BetterAuthOptions['rateLimit']>
	advanced: NonNullable<BetterAuthOptions['advanced']>
	plugins: BetterAuthPlugin[]
}

/**
 * Anti-robot options for Better Auth: a database-backed rate limit (it survives restarts and redeploys) and a
 * Cloudflare Turnstile check on email sign-up. The browser sends the Turnstile token in `X-Captcha-Response`.
 * Outside production the rate limit is off and Turnstile only runs when TURNSTILE_SECRET_KEY is set (Cloudflare's
 * test secret works locally), so tests and local sign-ups need no network.
 */
export function authProtection(environment: Environment, options: { siteVerifyURL?: string } = {}): AuthProtection {
	const production = environment.NODE_ENV === 'production'
	const secretKey = environment.TURNSTILE_SECRET_KEY?.trim()
	const proxies = trustedProxies(environment)
	let plugins: BetterAuthPlugin[] = []
	if (secretKey) {
		plugins = [
			captcha({
				provider: 'cloudflare-turnstile',
				secretKey,
				endpoints: [SIGN_UP_PATH],
				...(options.siteVerifyURL ? { siteVerifyURLOverride: options.siteVerifyURL } : {}),
			}),
		]
	} else if (production) {
		console.warn('TURNSTILE_SECRET_KEY is not set: email sign-up is refused until it is.')
		plugins = [signUpUnavailable]
	}
	return {
		rateLimit: {
			enabled: production,
			storage: 'database',
			customRules: AUTH_RATE_LIMIT_RULES,
		},
		advanced: {
			ipAddress: {
				ipAddressHeaders: [CLIENT_IP_HEADER],
				...(proxies.length > 0 ? { trustedProxies: proxies } : {}),
			},
		},
		plugins,
	}
}
