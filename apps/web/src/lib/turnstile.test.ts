import { expect, test } from 'vitest'
import { TURNSTILE_PRODUCTION_SITE_KEY, TURNSTILE_TEST_SITE_KEY, turnstileSiteKey } from './turnstile'

test('a configured site key wins, otherwise production builds use the minemories.net widget', () => {
	expect(turnstileSiteKey({ VITE_TURNSTILE_SITE_KEY: ' 0x4AAAAcustom ', PROD: true })).toBe('0x4AAAAcustom')
	expect(turnstileSiteKey({ VITE_TURNSTILE_SITE_KEY: '  ', PROD: true })).toBe(TURNSTILE_PRODUCTION_SITE_KEY)
	expect(turnstileSiteKey({ PROD: true })).toBe('0x4AAAAAAGJBjAbVI1VYsiiZ')
})

test('local and test builds use Cloudflare test key, which always passes', () => {
	expect(turnstileSiteKey({ PROD: false })).toBe(TURNSTILE_TEST_SITE_KEY)
	expect(TURNSTILE_TEST_SITE_KEY).toBe('1x00000000000000000000AA')
})
