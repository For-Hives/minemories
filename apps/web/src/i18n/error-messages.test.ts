import { expect, test } from 'vitest'
import { errorMessageKey, stableErrorMessages } from './error-messages'
import { translate } from './I18n'

test('known protocol codes and messages produce keys translated in both languages', () => {
	for (const code of [
		'UNAUTHORIZED',
		'FORBIDDEN',
		'NOT_FOUND',
		'TOO_MANY_REQUESTS',
		'BAD_REQUEST',
		'CONFLICT',
		'SERVICE_UNAVAILABLE',
		'INTERNAL_SERVER_ERROR',
		'INVALID_EMAIL_OR_PASSWORD',
		'INVALID_PASSWORD',
		'USER_ALREADY_EXISTS',
		'EMAIL_NOT_VERIFIED',
		'PASSWORD_TOO_SHORT',
		'MISSING_RESPONSE',
		'VERIFICATION_FAILED',
		'SIGN_UP_UNAVAILABLE',
	]) {
		const key = errorMessageKey({ code, message: 'internal private path /home/player' }, 'fallback')
		expect(key).not.toBe('fallback')
		expect(translate('fr', key)).not.toBe(key)
		expect(translate('en', key)).toBe(key)
	}
	for (const [message, key] of Object.entries(stableErrorMessages)) {
		expect(errorMessageKey(new Error(message), 'fallback')).toBe(key)
		expect(translate('fr', key)).not.toBe(key)
	}
})
test('a rate-limited auth request reads as too many attempts', () => {
	const limited = {
		status: 429,
		statusText: 'Too Many Requests',
		message: 'Too many requests. Please try again later.',
	}
	expect(errorMessageKey(limited, 'fallback')).toBe('Too many attempts. Wait a moment and try again.')
})
test('unknown errors use the stable contextual fallback and never expose raw server text', () => {
	for (const error of [
		null,
		undefined,
		false,
		'private token',
		12,
		{},
		{ code: 5, message: 3 },
		{ code: 'UNKNOWN', message: 'secret@example.com' },
		new Error('/home/player/secret.glb'),
		{ message: '__proto__' },
		{ code: 'constructor' },
	]) {
		expect(errorMessageKey(error, 'Could not load this memory.')).toBe('Could not load this memory.')
	}
})
