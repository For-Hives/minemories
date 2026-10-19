import { expect, test } from 'bun:test'
import { openShareToken, sealShareToken } from './share-token'

test('share tokens are encrypted with unique nonces and bound to their owner/capture', () => {
	const token = 'sensitive-link-token'
	const sealed = sealShareToken(token, 'test-secret', 'owner:memory')
	expect(sealed).not.toContain(token)
	expect(sealShareToken(token, 'test-secret', 'owner:memory')).not.toBe(sealed)
	expect(openShareToken(sealed, 'test-secret', 'owner:memory')).toBe(token)
	expect(openShareToken(sealed, 'other-secret', 'owner:memory')).toBeNull()
	expect(openShareToken(sealed, 'test-secret', 'other:memory')).toBeNull()
	expect(openShareToken('corrupt', 'test-secret', 'owner:memory')).toBeNull()
	expect(openShareToken(null, 'test-secret', 'owner:memory')).toBeNull()
})
