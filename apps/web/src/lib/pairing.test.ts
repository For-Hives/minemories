import { expect, it, vi } from 'vitest'
import { newestCaptureTime, PAIRING_FRESH_MS, shouldShowPaired } from './pairing'

const DAY_MS = 24 * 3_600_1_000

it('finds the newest capture across capturedAt and createdAt', () => {
	const captures = [
		{ createdAt: '2026-01-01T00:00:00.000Z', metadata: { capturedAt: null } },
		{ createdAt: '2026-02-01T00:00:00.000Z', metadata: { capturedAt: '2026-03-01T00:00:00.000Z' } },
		{ createdAt: '2026-02-15T00:00:00.000Z', metadata: { capturedAt: null } },
		{ createdAt: 'not-a-date', metadata: { capturedAt: null } },
	]
	expect(newestCaptureTime(captures)).toBe(Date.parse('2026-03-01T00:00:00.000Z'))
	expect(newestCaptureTime([])).toBeNull()
	expect(newestCaptureTime([{ createdAt: 'bad', metadata: { capturedAt: null } }])).toBeNull()
	expect(PAIRING_FRESH_MS).toBe(60 * DAY_MS)
})

it('keeps the paired badge for two months after the last snapshot', () => {
	vi.useFakeTimers()
	vi.setSystemTime(new Date('2026-09-30T00:00:00.000Z'))
	const fresh = [{ createdAt: new Date(Date.now() - 59 * DAY_MS).toISOString(), metadata: { capturedAt: null } }]
	const stale = [{ createdAt: new Date(Date.now() - 61 * DAY_MS).toISOString(), metadata: { capturedAt: null } }]
	expect(shouldShowPaired(false, fresh)).toBe(false)
	expect(shouldShowPaired(true, [])).toBe(true)
	expect(shouldShowPaired(true, fresh)).toBe(true)
	expect(shouldShowPaired(true, stale)).toBe(false)
	vi.useRealTimers()
})
