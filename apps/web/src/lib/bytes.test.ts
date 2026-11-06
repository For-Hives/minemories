import { expect, test } from 'vitest'
import { formatExactBytes, quotaLevel, quotaPercent, formatBytes as rawBytes } from './bytes'

const formatBytes = (...args: Parameters<typeof rawBytes>) => rawBytes(...args).replace(/\s/g, ' ')

test('sizes use the decimal unit that fits, written for the interface language', () => {
	expect(formatBytes(0, 'fr')).toBe('0 o')
	expect(formatBytes(512, 'fr')).toBe('512 o')
	expect(formatBytes(2_500, 'en')).toBe('2.5 kB')
	expect(formatBytes(2_500_000, 'fr')).toBe('2,5 Mo')
	expect(formatBytes(1_900_000_000, 'fr')).toBe('1,9 Go')
	expect(formatBytes(15_340_000_000, 'en')).toBe('15.3 GB')
	expect(formatBytes(250_400_000_000, 'ru')).toBe('250 ГБ')
	expect(formatBytes(-5, 'en')).toBe('0 byte')
	expect(formatBytes(Number.NaN, 'en')).toBe('0 byte')
})
test('the exact count is spelled in full and tolerates odd numbers', () => {
	expect(formatExactBytes(2048, 'en')).toBe('2,048 bytes')
	expect(formatExactBytes(1, 'en')).toBe('1 byte')
	expect(formatExactBytes(-1, 'en')).toBe('0 bytes')
	expect(formatExactBytes(Number.POSITIVE_INFINITY, 'en')).toBe('0 bytes')
})
test('quota share is rounded, clamped and safe with an empty or invalid quota', () => {
	expect(quotaPercent(0, 100)).toBe(0)
	expect(quotaPercent(50, 100)).toBe(50)
	expect(quotaPercent(1, 3)).toBe(33)
	expect(quotaPercent(500, 100)).toBe(100)
	expect(quotaPercent(10, 0)).toBe(0)
	expect(quotaPercent(-10, 100)).toBe(0)
	expect(quotaPercent(Number.NaN, 100)).toBe(0)
})
test('quota levels switch at 90 % and 100 %', () => {
	expect(quotaLevel(0)).toBe('ok')
	expect(quotaLevel(89)).toBe('ok')
	expect(quotaLevel(90)).toBe('near')
	expect(quotaLevel(99)).toBe('near')
	expect(quotaLevel(100)).toBe('full')
})
