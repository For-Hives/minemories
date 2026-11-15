import { expect, test } from 'vitest'
import {
	areaPath,
	busiestSlot,
	bytesPerDay,
	DAY,
	dailyBuckets,
	delta,
	HOUR,
	type HourlyPoint,
	hasHistory,
	heatmap,
	lastHours,
	linePath,
	previousHours,
	projectBytes,
	sumPoints,
} from './admin-insight'

const point = (at: number, uploads = 0, extra: Partial<HourlyPoint> = {}): HourlyPoint => ({
	at,
	signups: 0,
	uploads,
	uploadedBytes: uploads * 1000,
	coverage: 'full',
	...extra,
})
// 2026-11-02 is a Monday (UTC).
const monday = Date.UTC(2026, 10, 2)

test('windows keep the last hours and the hours just before', () => {
	const series = [1, 2, 3, 4, 5, 6]
	expect(lastHours(series, 2)).toEqual([5, 6])
	expect(lastHours(series, 10)).toEqual(series)
	expect(previousHours(series, 2)).toEqual([3, 4])
	expect(previousHours(series, 4)).toEqual([1, 2])
	expect(previousHours(series, 10)).toEqual([])
})

test('sums and history', () => {
	const points = [point(0, 2, { signups: 1 }), point(HOUR, 3)]
	expect(sumPoints(points)).toEqual({ signups: 1, uploads: 5, uploadedBytes: 5000 })
	expect(sumPoints([])).toEqual({ signups: 0, uploads: 0, uploadedBytes: 0 })
	expect(hasHistory(points)).toBe(true)
	expect(hasHistory([])).toBe(false)
	expect(hasHistory([...points, point(2 * HOUR, 0, { coverage: 'none' })])).toBe(false)
	expect(hasHistory([point(0, 0, { coverage: 'partial' })])).toBe(true)
})

test('delta compares with the previous value', () => {
	expect(delta(5, 0)).toBeNull()
	expect(delta(5, -1)).toBeNull()
	expect(delta(112, 100)).toEqual({ direction: 'up', percent: 12 })
	expect(delta(50, 100)).toEqual({ direction: 'down', percent: 50 })
	expect(delta(7, 7)).toEqual({ direction: 'flat', percent: 0 })
	expect(delta(100.04, 100)).toEqual({ direction: 'flat', percent: 0 })
})

test('hourly points group into UTC days, oldest first', () => {
	const days = dailyBuckets([
		point(monday + DAY + HOUR, 2, { signups: 1 }),
		point(monday + 5 * HOUR, 1),
		point(monday + 6 * HOUR, 4, { signups: 2 }),
	])
	expect(days).toEqual([
		{ at: monday, signups: 2, uploads: 5, uploadedBytes: 5000 },
		{ at: monday + DAY, signups: 1, uploads: 2, uploadedBytes: 2000 },
	])
	expect(dailyBuckets([])).toEqual([])
})

test('the heatmap puts uploads on weekday rows (Monday first) and 2-hour slots, scaled 0 to 5', () => {
	const map = heatmap([
		point(monday + 3 * HOUR, 10), // Monday, slot 1
		point(monday + DAY * 6 + 23 * HOUR, 2), // Sunday, slot 11
		point(monday + 4 * HOUR, 1),
	])
	expect(map.levels).toHaveLength(7)
	expect(map.levels[0]).toHaveLength(12)
	expect(map.levels[0]?.[1]).toBe(5)
	expect(map.levels[0]?.[2]).toBe(1)
	expect(map.levels[6]?.[11]).toBe(1)
	expect(map.levels[3]?.every(level => level === 0)).toBe(true)
	expect(map.max).toBe(10)
	expect(map.total).toBe(13)
	expect(busiestSlot(map)).toEqual({ weekday: 1, slot: 1 })
	const sunday = heatmap([point(monday + DAY * 6 + 23 * HOUR, 2)])
	expect(busiestSlot(sunday)).toEqual({ weekday: 0, slot: 11 })
	const empty = heatmap([])
	expect(empty).toEqual({ levels: empty.levels, max: 0, total: 0 })
	expect(empty.levels.flat().every(level => level === 0)).toBe(true)
	expect(busiestSlot(empty)).toBeNull()
})

test('line and area paths scale to the box', () => {
	expect(linePath([], 100, 40, 10)).toBe('')
	expect(areaPath([], 100, 40, 10)).toBe('')
	expect(linePath([0, 10], 100, 40, 10)).toBe('M0.0 38.0L100.0 2.0')
	expect(linePath([5], 100, 40, 10)).toBe('M0.0 20.0')
	expect(linePath([3, 3], 100, 40, 0)).toBe('M0.0 38.0L100.0 38.0')
	expect(areaPath([0, 10], 100, 40, 10)).toBe('M0.0 38.0L100.0 2.0L100 40L0 40Z')
})

test('growth per day and projection', () => {
	expect(bytesPerDay([])).toBe(0)
	expect(bytesPerDay([point(0, 0, { coverage: 'none' })])).toBe(0)
	expect(bytesPerDay([point(0, 1), point(HOUR, 3), point(2 * HOUR, 9, { coverage: 'none' })])).toBe(48_000)
	expect(projectBytes(1000, 100, 3)).toBe(1300)
})

test('version shares compare an error with the installed fleet', async () => {
	const { versionShares } = await import('./admin-insight')
	const fleet = [
		{ version: '0.39', devices: 30 },
		{ version: '0.38', devices: 70 },
	]
	expect(versionShares([], fleet)).toEqual([])
	const shares = versionShares(['0.39', '0.39', '0.39', '0.38', '0.37'], fleet)
	expect(shares.map(row => row.version)).toEqual(['0.39', '0.37', '0.38'])
	expect(shares[0]).toEqual({ version: '0.39', share: 0.6, fleetShare: 0.3, ratio: 2 })
	expect(shares[1]).toEqual({ version: '0.37', share: 0.2, fleetShare: 0, ratio: null })
	expect(versionShares(['x'], [])[0]).toEqual({ version: 'x', share: 1, fleetShare: 0, ratio: null })
})

test('age is written in the largest whole unit', async () => {
	const { ageLabel } = await import('./admin-insight')
	const now = Date.UTC(2026, 10, 15, 12)
	expect(ageLabel(new Date(now - 5 * 60_000).toISOString(), now, 'en')).toBe('5 minutes ago')
	expect(ageLabel(new Date(now - 3 * 3_600_000).toISOString(), now, 'en')).toBe('3 hours ago')
	expect(ageLabel(new Date(now - 2 * 86_400_000).toISOString(), now, 'en')).toBe('2 days ago')
	expect(ageLabel(new Date(now + 60_000).toISOString(), now, 'en')).toBe('this minute')
})

test('a period view compares with the period before when it has history', async () => {
	const { periodView } = await import('./admin-insight')
	const series = Array.from({ length: 96 }, (_, hour) => point(monday + hour * HOUR, 1, { signups: hour % 2 }))
	const day = periodView(series, 24, true)
	expect(day.hourly).toBe(true)
	expect(day.shown).toHaveLength(24)
	expect(day.totals.uploads).toBe(24)
	expect(day.before.uploads).toBe(24)
	expect(day.comparable).toBe(true)
	expect(day.earlier).toHaveLength(24)
	const days = periodView(series, 48, true)
	expect(days.hourly).toBe(false)
	expect(days.shown).toHaveLength(2)
	expect(days.earlier).toEqual([24, 24])
	expect(periodView(series, 48, false).earlier).toBeNull()
	const untracked = periodView([point(monday, 1, { coverage: 'none' }), ...series.slice(1)], 48, true)
	expect(untracked.comparable).toBe(false)
	expect(periodView(series, 96, true).comparable).toBe(false)
})

test('neighbour stays inside the list', async () => {
	const { neighbour } = await import('./admin-insight')
	const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
	expect(neighbour(items, 'b', 1)?.id).toBe('c')
	expect(neighbour(items, 'c', 1)?.id).toBe('c')
	expect(neighbour(items, 'a', -1)?.id).toBe('a')
	expect(neighbour(items, null, 1)?.id).toBe('a')
	expect(neighbour([], 'a', 1)).toBeUndefined()
})

test('moderation keys', async () => {
	const { decisionKey } = await import('./admin-insight')
	expect([decisionKey('a'), decisionKey('R'), decisionKey('j'), decisionKey('k'), decisionKey('x')]).toEqual([
		'approved',
		'rejected',
		'next',
		'previous',
		null,
	])
})
