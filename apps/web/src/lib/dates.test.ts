import { describe, expect, it } from 'vitest'
import { formatRelativeDate } from './dates'

const NOW = Date.parse('2026-09-29T12:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

describe('formatRelativeDate', () => {
	it('reports recent moments as just now', () => {
		expect(formatRelativeDate(iso(NOW), NOW)).toBe('Just now')
		expect(formatRelativeDate(iso(NOW - 59_000), NOW)).toBe('Just now')
		expect(formatRelativeDate(iso(NOW + 60_000), NOW)).toBe('Just now')
	})

	it('counts minutes below one hour', () => {
		expect(formatRelativeDate(iso(NOW - 60_000), NOW)).toBe('1 minute ago')
		expect(formatRelativeDate(iso(NOW - 5 * 60_000), NOW)).toBe('5 minutes ago')
		expect(formatRelativeDate(iso(NOW - 59 * 60_000), NOW)).toBe('59 minutes ago')
	})

	it('counts hours below one day', () => {
		expect(formatRelativeDate(iso(NOW - 3_600_000), NOW)).toBe('1 hour ago')
		expect(formatRelativeDate(iso(NOW - 23 * 3_600_000), NOW)).toBe('23 hours ago')
	})

	it('counts days below one month', () => {
		expect(formatRelativeDate(iso(NOW - 86_400_000), NOW)).toBe('1 day ago')
		expect(formatRelativeDate(iso(NOW - 29 * 86_400_000), NOW)).toBe('29 days ago')
	})

	it('counts months below one year', () => {
		expect(formatRelativeDate(iso(NOW - 30 * 86_400_000), NOW)).toBe('1 month ago')
		expect(formatRelativeDate(iso(NOW - 300 * 86_400_000), NOW)).toBe('10 months ago')
	})

	it('counts years beyond that', () => {
		expect(formatRelativeDate(iso(NOW - 365 * 86_400_000), NOW)).toBe('1 year ago')
		expect(formatRelativeDate(iso(NOW - 900 * 86_400_000), NOW)).toBe('2 years ago')
	})

	it('rejects invalid dates', () => {
		expect(() => formatRelativeDate('yesterday', NOW)).toThrow(RangeError)
		expect(() => formatRelativeDate('', NOW)).toThrow(RangeError)
	})
})

it('formats every relative unit in French without changing protocol dates', () => {
	expect(formatRelativeDate(iso(NOW), NOW, 'fr')).toBe('À l’instant')
	for (const [duration, text] of [
		[60_000, 'il y a 1 minute'],
		[120_000, 'il y a 2 minutes'],
		[3_600_000, 'il y a 1 heure'],
		[86_400_000, 'il y a 1 jour'],
		[30 * 86_400_000, 'il y a 1 mois'],
		[365 * 86_400_000, 'il y a 1 an'],
	] as const)
		expect(formatRelativeDate(iso(NOW - duration), NOW, 'fr')).toBe(text)
})
