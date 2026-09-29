const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

function unit(value: number, name: string): string {
	return value === 1 ? `1 ${name} ago` : `${value} ${name}s ago`
}

export function formatRelativeDate(isoDate: string, now: number = Date.now()): string {
	const time = Date.parse(isoDate)
	if (Number.isNaN(time)) throw new RangeError('Date must be a valid ISO string')

	const elapsed = now - time
	if (elapsed < MINUTE_MS) return 'Just now'
	if (elapsed < HOUR_MS) return unit(Math.floor(elapsed / MINUTE_MS), 'minute')
	if (elapsed < DAY_MS) return unit(Math.floor(elapsed / HOUR_MS), 'hour')
	if (elapsed < MONTH_MS) return unit(Math.floor(elapsed / DAY_MS), 'day')
	if (elapsed < YEAR_MS) return unit(Math.floor(elapsed / MONTH_MS), 'month')
	return unit(Math.floor(elapsed / YEAR_MS), 'year')
}
