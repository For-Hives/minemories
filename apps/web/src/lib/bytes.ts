import { type Locale, localeTag } from '../i18n/locales'

const UNITS = [
	['gigabyte', 1_000_000_000],
	['megabyte', 1_000_000],
	['kilobyte', 1_000],
] as const

function unitFormat(locale: Locale, unit: string, digits: number, display: 'short' | 'long' = 'short') {
	return new Intl.NumberFormat(localeTag(locale), {
		style: 'unit',
		unit,
		unitDisplay: display,
		maximumFractionDigits: digits,
	})
}
function fractionDigits(value: number): number {
	if (value >= 100) return 0
	return value >= 10 ? 1 : 2
}
/** Decimal (SI) size in the largest fitting unit, written by `Intl` for the interface language ("1,9 Go", "2.5 MB"). */
export function formatBytes(bytes: number, locale: Locale): string {
	const safe = Number.isFinite(bytes) ? Math.max(0, bytes) : 0
	const match = UNITS.find(([, size]) => safe >= size)
	if (!match) return unitFormat(locale, 'byte', 0).format(Math.round(safe))
	const value = safe / match[1]
	return unitFormat(locale, match[0], fractionDigits(value)).format(value)
}
/** The exact byte count, spelled out in full ("2,048 bytes"), for assistive technology and tooltips. */
export function formatExactBytes(bytes: number, locale: Locale): string {
	const safe = Number.isFinite(bytes) ? Math.max(0, Math.round(bytes)) : 0
	return unitFormat(locale, 'byte', 0, 'long').format(safe)
}
/** Whole-number share of the quota in use, clamped to 0-100 (a non-positive quota counts as empty). */
export function quotaPercent(used: number, quota: number): number {
	if (quota > 0 && used > 0) return Math.min(100, Math.round((used / quota) * 100))
	return 0
}
/** From 90 % of the quota an account is "near" its limit, from 100 % it is full. */
export function quotaLevel(percent: number): 'ok' | 'near' | 'full' {
	if (percent >= 100) return 'full'
	return percent >= 90 ? 'near' : 'ok'
}
