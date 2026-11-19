/** Cloudflare Turnstile on the sign-up form; the API checks the token (apps/api/src/auth-protection.ts). */
export const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
/** Widget « minemories.net inscription » (minemories.net, www.minemories.net). A site key is public. */
export const TURNSTILE_PRODUCTION_SITE_KEY = '0x4AAAAAAGJBjAbVI1VYsiiZ'
/** Cloudflare's always-passing test key, for local and test builds. */
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA'

export function turnstileSiteKey(env: { VITE_TURNSTILE_SITE_KEY?: string; PROD: boolean }): string {
	const configured = env.VITE_TURNSTILE_SITE_KEY?.trim()
	if (configured) return configured
	return env.PROD ? TURNSTILE_PRODUCTION_SITE_KEY : TURNSTILE_TEST_SITE_KEY
}
