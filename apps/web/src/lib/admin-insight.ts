/** Pure figures behind the administration console: windows of the hourly series, deltas, daily buckets, the weekly heatmap and chart paths. */

export const HOUR = 3_600_000
export const DAY = 24 * HOUR

export type HourlyPoint = {
	at: number
	signups: number
	uploads: number
	uploadedBytes: number
	coverage: 'none' | 'partial' | 'full'
}
export type Totals = { signups: number; uploads: number; uploadedBytes: number }

/** The last `hours` points of the series (the series ends at the current hour). */
export const lastHours = <T>(series: readonly T[], hours: number): T[] =>
	series.slice(Math.max(0, series.length - hours))

/** The `hours` points just before the last `hours` ones: the period to compare with. */
export function previousHours<T>(series: readonly T[], hours: number): T[] {
	const end = Math.max(0, series.length - hours)
	return series.slice(Math.max(0, end - hours), end)
}

export const sumPoints = (points: readonly HourlyPoint[]): Totals =>
	points.reduce(
		(sum, point) => ({
			signups: sum.signups + point.signups,
			uploads: sum.uploads + point.uploads,
			uploadedBytes: sum.uploadedBytes + point.uploadedBytes,
		}),
		{ signups: 0, uploads: 0, uploadedBytes: 0 }
	)

/** Tracking started at some point: hours before it carry no history, so a comparison with them says nothing. */
export const hasHistory = (points: readonly HourlyPoint[]) =>
	points.length > 0 && points.every(point => point.coverage !== 'none')

export type Delta = { direction: 'up' | 'down' | 'flat'; percent: number } | null

/** Relative change in percent; null when there is nothing to compare with (no previous value). */
export function delta(current: number, previous: number): Delta {
	if (previous <= 0) return null
	const percent = Math.round(((current - previous) / previous) * 1000) / 10
	if (percent === 0) return { direction: 'flat', percent: 0 }
	return { direction: percent > 0 ? 'up' : 'down', percent: Math.abs(percent) }
}

export type DayBucket = Totals & { at: number }

/** Hourly points grouped by UTC day, oldest first. */
export function dailyBuckets(points: readonly HourlyPoint[]): DayBucket[] {
	const days = new Map<number, DayBucket>()
	for (const point of points) {
		const at = Math.floor(point.at / DAY) * DAY
		const day = days.get(at) ?? { at, signups: 0, uploads: 0, uploadedBytes: 0 }
		day.signups += point.signups
		day.uploads += point.uploads
		day.uploadedBytes += point.uploadedBytes
		days.set(at, day)
	}
	return [...days.values()].sort((a, b) => a.at - b.at)
}

/** Weekdays in the heatmap's row order, Monday first, as `Date#getUTCDay` numbers. */
export const HEATMAP_DAYS = [1, 2, 3, 4, 5, 6, 0] as const
export const HEATMAP_SLOTS = 12
export type Heatmap = { levels: number[][]; max: number; total: number }

/** Uploads by UTC weekday (Monday first) and 2-hour slot, each cell scaled to a level 0 (none) to 5 (busiest). */
export function heatmap(points: readonly HourlyPoint[]): Heatmap {
	const counts = HEATMAP_DAYS.map(() => Array.from({ length: HEATMAP_SLOTS }, () => 0))
	for (const point of points) {
		const date = new Date(point.at)
		const row = HEATMAP_DAYS.indexOf(date.getUTCDay() as (typeof HEATMAP_DAYS)[number])
		const row0 = counts[row] as number[]
		const slot = Math.floor(date.getUTCHours() / 2)
		row0[slot] = (row0[slot] as number) + point.uploads
	}
	const max = Math.max(0, ...counts.flat())
	const total = counts.flat().reduce((sum, value) => sum + value, 0)
	const levels = counts.map(row => row.map(value => (max === 0 ? 0 : Math.ceil((value / max) * 5))))
	return { levels, max, total }
}

/** Day, then 2-hour slot, of the busiest cell; null when nothing was uploaded. */
export function busiestSlot(map: Heatmap): { weekday: number; slot: number } | null {
	const row = map.levels.findIndex(levels => levels.includes(5))
	if (row < 0) return null
	return { weekday: HEATMAP_DAYS[row] as number, slot: (map.levels[row] as number[]).indexOf(5) }
}

/** `M x y L x y …` through `values`, scaled to `width` x `height` against `max` (the box keeps a 2 px margin). */
export function linePath(values: readonly number[], width: number, height: number, max: number): string {
	if (values.length === 0) return ''
	const step = values.length > 1 ? width / (values.length - 1) : 0
	return values
		.map((value, index) => {
			const y = height - 2 - (max > 0 ? value / max : 0) * (height - 4)
			return `${index === 0 ? 'M' : 'L'}${(index * step).toFixed(1)} ${y.toFixed(1)}`
		})
		.join('')
}
/** The same line closed down to the baseline, for an area fill. */
export function areaPath(values: readonly number[], width: number, height: number, max: number): string {
	const line = linePath(values, width, height, max)
	return line === '' ? '' : `${line}L${width} ${height}L0 ${height}Z`
}

/** Average bytes uploaded per day over the days that carry history; 0 without any. */
export function bytesPerDay(points: readonly HourlyPoint[]): number {
	const tracked = points.filter(point => point.coverage !== 'none')
	if (tracked.length === 0) return 0
	return (tracked.reduce((sum, point) => sum + point.uploadedBytes, 0) / tracked.length) * 24
}
/** Linear projection of the stored volume `days` ahead. */
export const projectBytes = (currentBytes: number, perDay: number, days: number) => currentBytes + perDay * days

export type VersionShare = { version: string; share: number; fleetShare: number; ratio: number | null }

/** How much of an error each version holds against how much of the installed fleet it is: a ratio well above 1 points at a regression. */
export function versionShares(
	versions: readonly string[],
	fleet: ReadonlyArray<{ version: string; devices: number }>
): VersionShare[] {
	const counts = new Map<string, number>()
	for (const version of versions) counts.set(version, (counts.get(version) ?? 0) + 1)
	const fleetTotal = fleet.reduce((sum, row) => sum + row.devices, 0)
	return [...counts]
		.map(([version, count]) => {
			const devices = fleet.find(row => row.version === version)?.devices ?? 0
			const fleetShare = fleetTotal > 0 ? devices / fleetTotal : 0
			const share = count / versions.length
			return { version, share, fleetShare, ratio: fleetShare > 0 ? share / fleetShare : null }
		})
		.sort((a, b) => b.share - a.share || a.version.localeCompare(b.version))
}

/** Time since an ISO date in the largest whole unit (minutes, hours or days), written for `locale`. */
export function ageLabel(iso: string, now: number, locale: string): string {
	const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
	const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
	if (minutes < 60) return format.format(-minutes, 'minute')
	if (minutes < 1440) return format.format(-Math.round(minutes / 60), 'hour')
	return format.format(-Math.round(minutes / 1440), 'day')
}

export type PeriodView = {
	/** Points to draw: hourly for a day, otherwise one per UTC day. */
	shown: Array<HourlyPoint | DayBucket>
	hourly: boolean
	totals: Totals
	before: Totals
	/** The previous period has tracked history and a comparison was asked for. */
	comparable: boolean
	/** Captures of the previous period, one per drawn point, for the dashed line. */
	earlier: number[] | null
}

/** The period (the last `hours` of the series) with the figures needed to draw it and to compare it with the period before. */
export function periodView(series: readonly HourlyPoint[], hours: number, compare: boolean): PeriodView {
	const current = lastHours(series, hours)
	const previous = previousHours(series, hours)
	const hourly = hours === 24
	const comparable = compare && hasHistory(previous)
	return {
		shown: hourly ? current : dailyBuckets(current),
		hourly,
		totals: sumPoints(current),
		before: sumPoints(previous),
		comparable,
		earlier: comparable ? (hourly ? previous : dailyBuckets(previous)).map(point => point.uploads) : null,
	}
}

/** The item `step` places after (or before, when negative) the one with `id`, kept inside the list; the first one when `id` is not in it. */
export function neighbour<T extends { id: string }>(
	items: readonly T[],
	id: string | null,
	step: number
): T | undefined {
	const index = items.findIndex(item => item.id === id)
	return items[Math.min(items.length - 1, Math.max(0, index + step))]
}

export type DecisionKey = 'approved' | 'rejected' | 'next' | 'previous'
/** What a moderation key does: A approves, R rejects, J and K move down and up the queue. */
export function decisionKey(key: string): DecisionKey | null {
	return ({ a: 'approved', r: 'rejected', j: 'next', k: 'previous' } as const)[key.toLowerCase() as 'a'] ?? null
}

export type Cohort = { weekStart: number; size: number; active: number[] }
export type RetentionRow = { weekStart: number; size: number; rates: number[] }

/** Each cohort's activity as shares of its size (0 to 1); an empty cohort has no rates to show. */
export const retentionRows = (cohorts: readonly Cohort[]): RetentionRow[] =>
	cohorts.map(cohort => ({
		weekStart: cohort.weekStart,
		size: cohort.size,
		rates: cohort.size === 0 ? [] : cohort.active.map(count => count / cohort.size),
	}))

/** Share of accounts still active `weeks` weeks after joining, over every cohort old enough to tell; null when none is. */
export function retentionAt(cohorts: readonly Cohort[], weeks: number): number | null {
	const old = cohorts.filter(cohort => cohort.size > 0 && cohort.active.length > weeks)
	const size = old.reduce((sum, cohort) => sum + cohort.size, 0)
	if (size === 0) return null
	return old.reduce((sum, cohort) => sum + (cohort.active[weeks] as number), 0) / size
}

/** Share of `part` in `whole`, 0 when there is no whole. */
export const shareOf = (part: number, whole: number) => (whole > 0 ? part / whole : 0)

/** The Lorenz curve as a path through (0, 0) and the ten cumulative shares, in a `width` x `height` box (the origin is bottom left). */
export function lorenzPath(lorenz: readonly number[], width: number, height: number): string {
	const points = [0, ...lorenz].map(
		(value, index) =>
			`${index === 0 ? 'M' : 'L'}${((index / lorenz.length) * width).toFixed(1)} ${(height - value * height).toFixed(1)}`
	)
	return points.join('')
}
