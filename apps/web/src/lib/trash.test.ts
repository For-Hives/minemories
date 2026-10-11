import { expect, test } from 'vitest'
import { daysUntilPurge } from './trash'

test('calendar days match server deadlines including protected legacy captures', () => {
	const now = Date.parse('2026-02-01T12:00:00Z')
	expect(daysUntilPurge('2026-01-31T12:00:00Z', undefined, now)).toBe(29)
	expect(daysUntilPurge('2025-01-01T00:00:00Z', '2026-04-01T12:00:00Z', now)).toBe(59)
	expect(daysUntilPurge('invalid', '2026-02-02T11:59:59Z', now)).toBe(1)
	expect(daysUntilPurge('2025-01-01T00:00:00Z', undefined, now)).toBe(0)
	expect(daysUntilPurge('2026-01-01T00:00:00Z', '2026-02-01T12:00:00Z', now)).toBe(0)
	expect(daysUntilPurge('invalid', undefined, now)).toBeNull()
	expect(daysUntilPurge('2026-01-01T00:00:00Z', 'invalid', now)).toBeNull()
	expect(daysUntilPurge(new Date().toISOString())).toBe(30)
})
