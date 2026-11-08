import { translate } from '../i18n/catalog'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

import { type Locale, localeTag } from '../i18n/locales'

function unit(value: number, name: Intl.RelativeTimeFormatUnit, locale: Locale): string {
	return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(-value, name)
}

export function formatRelativeDate(isoDate: string, now: number = Date.now(), locale: Locale = 'en'): string {
	const time = Date.parse(isoDate)
	if (Number.isNaN(time)) throw new RangeError('Date must be a valid ISO string')
	const elapsed = now - time
	if (elapsed < MINUTE_MS) return translate(locale, 'Just now')
	if (elapsed < HOUR_MS) return unit(Math.floor(elapsed / MINUTE_MS), 'minute', locale)
	if (elapsed < DAY_MS) return unit(Math.floor(elapsed / HOUR_MS), 'hour', locale)
	if (elapsed < MONTH_MS) return unit(Math.floor(elapsed / DAY_MS), 'day', locale)
	if (elapsed < YEAR_MS) return unit(Math.floor(elapsed / MONTH_MS), 'month', locale)
	return unit(Math.floor(elapsed / YEAR_MS), 'year', locale)
}

/** `3 Oct → 8 Nov 2026`: the span of a play history, the year only where it differs from today's reading. */
export function formatDateSpan(first: string, last: string, locale: Locale = 'en'): string {
	const start = new Date(first)
	const end = new Date(last)
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—'
	const tag = localeTag(locale)
	const full = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric' })
	if (full.format(start) === full.format(end)) return full.format(end)
	const sameYear = start.getFullYear() === end.getFullYear()
	const short = new Intl.DateTimeFormat(
		tag,
		sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }
	)
	return `${short.format(start)} → ${full.format(end)}`
}
