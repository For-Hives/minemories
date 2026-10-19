const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

import type { Locale } from '../i18n/locales'

const justNow: Record<Locale, string> = {
	fr: 'À l’instant',
	'fr-CA': 'À l’instant',
	en: 'Just now',
	'en-GB': 'Just now',
	'en-CA': 'Just now',
	ru: 'Только что',
	de: 'Gerade eben',
	ko: '방금',
	'pt-BR': 'Agora mesmo',
	pl: 'Przed chwilą',
	ja: 'たった今',
}
function unit(value: number, name: Intl.RelativeTimeFormatUnit, locale: Locale): string {
	return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(-value, name)
}

export function formatRelativeDate(isoDate: string, now: number = Date.now(), locale: Locale = 'en'): string {
	const time = Date.parse(isoDate)
	if (Number.isNaN(time)) throw new RangeError('Date must be a valid ISO string')
	const elapsed = now - time
	if (elapsed < MINUTE_MS) return justNow[locale]
	if (elapsed < HOUR_MS) return unit(Math.floor(elapsed / MINUTE_MS), 'minute', locale)
	if (elapsed < DAY_MS) return unit(Math.floor(elapsed / HOUR_MS), 'hour', locale)
	if (elapsed < MONTH_MS) return unit(Math.floor(elapsed / DAY_MS), 'day', locale)
	if (elapsed < YEAR_MS) return unit(Math.floor(elapsed / MONTH_MS), 'month', locale)
	return unit(Math.floor(elapsed / YEAR_MS), 'year', locale)
}
