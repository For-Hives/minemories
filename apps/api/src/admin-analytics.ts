import type { Database } from 'bun:sqlite'
import type { AdminAnalytics } from '@minemories/api-contract'
import type { AdminRoles } from './admin-roles'
import type { RequestCounters } from './request-counters'

const MINUTE = 60_000
const DAY = 86_400_000
const WEEK = 7 * DAY
const COHORTS = 8
const LISTED = 10
/** Weeks start on Monday (UTC): an epoch week starts on a Thursday, so shift by three days. */
const MONDAY_SHIFT = 3 * DAY
const SESSION_TIME = "CASE WHEN typeof(createdAt)='text' THEN unixepoch(createdAt)*1000 ELSE createdAt END"
const NAMESPACE = /^minecraft:/
const MB = 1_000_000
const SIZE_LIMITS = [5 * MB, 20 * MB, 50 * MB, 100 * MB, 250 * MB]
const FIRST_CAPTURE_LIMITS = [5 * MINUTE, 30 * MINUTE, 120 * MINUTE, DAY, 7 * DAY]
/** A server is named only once at least this many accounts captured it. */
const MIN_SERVER_ACCOUNTS = 2

/** Index of the first limit the value is below; the last bucket when it is above them all. */
export const bucketOf = (value: number, limits: readonly number[]) => {
	const index = limits.findIndex(limit => value < limit)
	return index === -1 ? limits.length : index
}
export const median = (values: readonly number[]): number | null => {
	if (values.length === 0) return null
	const sorted = [...values].sort((a, b) => a - b)
	const middle = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 1
		? (sorted[middle] as number)
		: ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
}
/** Lorenz curve (cumulative byte share at each tenth of the accounts, smallest first), the share held by the top tenth, and the Gini index. */
export function concentration(bytes: readonly number[]): AdminAnalytics['concentration'] {
	const sorted = [...bytes].sort((a, b) => a - b)
	const total = sorted.reduce((sum, value) => sum + value, 0)
	const share = (fraction: number) => {
		if (total === 0) return fraction
		const taken = Math.round(sorted.length * fraction)
		return sorted.slice(0, taken).reduce((sum, value) => sum + value, 0) / total
	}
	const lorenz = Array.from({ length: 10 }, (_, index) => share((index + 1) / 10))
	const gini = total === 0 ? 0 : 1 - (lorenz.reduce((sum, value) => sum + value, 0) * 2 - 1) / 10
	const top = sorted.slice(sorted.length - Math.max(1, Math.ceil(sorted.length / 10)))
	const topTenShare = total === 0 ? 0 : top.reduce((sum, value) => sum + value, 0) / total
	return {
		accounts: sorted.length,
		topTenShare,
		gini: Math.min(1, Math.max(0, gini)),
		lorenz,
	}
}

const tableExists = (database: Database, name: string) =>
	database.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name) !== null
const num = (value: unknown) => Number(value ?? 0)

/** Read-only figures crossed from existing tables for the Growth and Worlds pages; nothing is tracked for them. */
export class AdminAnalyticsReader {
	constructor(
		private readonly database: Database,
		private readonly roles: AdminRoles,
		private readonly counters: RequestCounters
	) {}
	read(actorId: string | null, now = Date.now()): AdminAnalytics {
		this.roles.require(actorId)
		return {
			funnel: this.funnel(),
			firstCapture: this.firstCapture(),
			cohorts: this.cohorts(now),
			concentration: this.concentration(),
			worlds: this.worlds(),
			publication: this.publication(),
			traffic: this.counters.summary(),
		}
	}
	private count(sql: string): number {
		return num((this.database.query(sql).get() as { n: number } | null)?.n)
	}
	private funnel(): AdminAnalytics['funnel'] {
		return {
			accounts: this.count('SELECT COUNT(*) AS n FROM user'),
			verified: this.count('SELECT COUNT(*) AS n FROM user WHERE emailVerified=1'),
			paired: this.count('SELECT COUNT(DISTINCT user_id) AS n FROM devices'),
			captured: this.count('SELECT COUNT(DISTINCT user_id) AS n FROM memories'),
			shared: this.count('SELECT COUNT(DISTINCT user_id) AS n FROM share_links'),
			submitted: tableExists(this.database, 'public_publications')
				? this.count('SELECT COUNT(DISTINCT user_id) AS n FROM public_publications')
				: 0,
		}
	}
	private firstCapture(): AdminAnalytics['firstCapture'] {
		const rows = this.database
			.query(`SELECT (SELECT MIN(m.created_at) FROM memories m WHERE m.user_id=d.user_id AND m.created_at>=d.t)-d.t AS delta
 FROM (SELECT user_id,MIN(created_at) AS t FROM devices GROUP BY user_id) d`)
			.all() as Array<{ delta: number | null }>
		const deltas = rows.flatMap(row => (row.delta === null ? [] : [row.delta]))
		const buckets = Array.from({ length: 6 }, () => 0)
		for (const delta of deltas)
			buckets[bucketOf(delta, FIRST_CAPTURE_LIMITS)] = (buckets[bucketOf(delta, FIRST_CAPTURE_LIMITS)] as number) + 1
		const middle = median(deltas)
		return { buckets, samples: deltas.length, medianMinutes: middle === null ? null : Math.round(middle / MINUTE) }
	}
	private cohorts(now: number): AdminAnalytics['cohorts'] {
		const week = (time: number) => Math.floor((time + MONDAY_SHIFT) / WEEK)
		const current = week(now)
		const first = current - (COHORTS - 1)
		const since = first * WEEK - MONDAY_SHIFT
		const users = this.database.query('SELECT id,createdAt FROM user WHERE createdAt>=?').all(since) as Array<{
			id: string
			createdAt: number
		}>
		const events = this.database
			.query(`WITH ev AS (SELECT userId AS u,${SESSION_TIME} AS ts FROM session UNION ALL SELECT user_id,created_at FROM memories
 UNION ALL SELECT user_id,last_seen_at FROM devices WHERE last_seen_at IS NOT NULL)
 SELECT u,CAST((ts+${MONDAY_SHIFT})/${WEEK} AS INTEGER) AS wk FROM ev WHERE ts>=? GROUP BY u,wk`)
			.all(since) as Array<{ u: string; wk: number }>
		const joined = new Map(users.map(user => [user.id, week(user.createdAt)]))
		const cohorts = Array.from({ length: COHORTS }, (_, index) => {
			const start = first + index
			const size = users.filter(user => week(user.createdAt) === start).length
			const active = Array.from({ length: current - start + 1 }, (_, offset) => (offset === 0 ? size : 0))
			return { weekStart: start * WEEK - MONDAY_SHIFT, size, active, start }
		})
		for (const event of events) {
			const cohort = cohorts[(joined.get(event.u) ?? -1) - first]
			const offset = event.wk - (joined.get(event.u) as number)
			if (cohort && offset >= 1) cohort.active[offset] = (cohort.active[offset] as number) + 1
		}
		return cohorts.map(({ start: _start, ...cohort }) => cohort)
	}
	private concentration(): AdminAnalytics['concentration'] {
		const rows = this.database
			.query(
				`SELECT COALESCE(SUM(m.size),0) AS bytes FROM user u LEFT JOIN memories m ON m.user_id=u.id AND m.deleted_at IS NULL GROUP BY u.id`
			)
			.all() as Array<{ bytes: number }>
		return concentration(rows.map(row => row.bytes))
	}
	private worlds(): AdminAnalytics['worlds'] {
		const live = 'FROM memories WHERE deleted_at IS NULL'
		const meta = (field: string) => `json_extract(metadata_json,'$.${field}')`
		const named = (field: string, limit: number) =>
			this.database
				.query(
					`SELECT ${meta(field)} AS label,COUNT(*) AS n ${live} AND ${meta(field)} IS NOT NULL GROUP BY label ORDER BY n DESC,label LIMIT ${limit}`
				)
				.all() as Array<{ label: string; n: number }>
		const totals = this.database
			.query(`SELECT COUNT(*) AS captures,COALESCE(SUM(${meta('biome')} IS NOT NULL),0) AS withBiome,
 COALESCE(SUM(COALESCE(${meta('serverName')},'')<>''),0) AS onServer ${live}`)
			.get() as { captures: number; withBiome: number; onServer: number }
		const servers = this.database
			.query(`SELECT ${meta('serverName')} AS label,COUNT(*) AS captures,COUNT(DISTINCT user_id) AS accounts ${live}
 AND COALESCE(${meta('serverName')},'')<>'' GROUP BY label`)
			.all() as Array<{ label: string; captures: number; accounts: number }>
		const sizes = (this.database.query(`SELECT size ${live} ORDER BY size`).all() as Array<{ size: number }>).map(
			row => row.size
		)
		const buckets = Array.from({ length: 6 }, () => 0)
		for (const size of sizes)
			buckets[bucketOf(size, SIZE_LIMITS)] = (buckets[bucketOf(size, SIZE_LIMITS)] as number) + 1
		return {
			captures: num(totals.captures),
			withBiome: num(totals.withBiome),
			biomes: named('biome', LISTED).map(row => ({ name: row.label, count: num(row.n) })),
			dimensions: named('dimension', LISTED).map(row => ({
				name: row.label.replace(NAMESPACE, ''),
				count: num(row.n),
			})),
			onServer: num(totals.onServer),
			singleplayer: num(totals.captures) - num(totals.onServer),
			distinctServers: servers.length,
			topServers: servers
				.filter(server => server.accounts >= MIN_SERVER_ACCOUNTS)
				.map(server => ({ name: server.label, captures: server.captures, accounts: server.accounts }))
				.sort((a, b) => b.captures - a.captures || a.name.localeCompare(b.name))
				.slice(0, 5),
			sizes: buckets,
			medianBytes: median(sizes) ?? 0,
		}
	}
	private publication(): AdminAnalytics['publication'] {
		const publications = tableExists(this.database, 'public_publications')
		return {
			captures: this.count('SELECT COUNT(*) AS n FROM memories WHERE deleted_at IS NULL'),
			shared: this.count(
				'SELECT COUNT(DISTINCT s.memory_id) AS n FROM share_links s JOIN memories m ON m.id=s.memory_id WHERE m.deleted_at IS NULL'
			),
			submitted: publications ? this.count('SELECT COUNT(*) AS n FROM public_publications') : 0,
			approved: publications ? this.count("SELECT COUNT(*) AS n FROM public_publications WHERE state='approved'") : 0,
			voted: publications ? this.count('SELECT COUNT(DISTINCT publication_id) AS n FROM public_votes') : 0,
			wellVoted: publications
				? this.count(
						'SELECT COUNT(*) AS n FROM (SELECT publication_id FROM public_votes GROUP BY publication_id HAVING COUNT(*)>=5)'
					)
				: 0,
		}
	}
}
