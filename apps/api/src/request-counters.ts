import type { Database } from 'bun:sqlite'
import { modTargetId } from '@minemories/api-contract'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const KEEP_MS = 70 * DAY
export type CounterKind = 'download' | 'api' | 'api_error' | 'pairing'
const API_GROUPS = new Set(['rpc', 'auth', 'mod', 'public', 'memories', 'downloads', 'github', 'roadmap'])

export type Classified = { kind: CounterKind; key: string }[]

/**
 * What one finished request counts as. Only fixed labels are ever stored (an API group, a pairing outcome, a mod target id):
 * never a path, a query, a token, an address or an account.
 */
export function classify(method: string, path: string, status: number): Classified {
	const [first, second, third] = path.split('/').filter(Boolean)
	if (first === 'downloads') {
		if (method === 'GET' && status === 200 && second && third && modTargetId.safeParse(second).success)
			return [{ kind: 'download', key: second }]
		return []
	}
	if (first === 'api' && second === 'mod' && third === 'pair') {
		if (status === 200) return [{ kind: 'pairing', key: 'done' }]
		if (status === 429) return [{ kind: 'pairing', key: 'limited' }]
		return [{ kind: 'pairing', key: 'rejected' }]
	}
	const group = first === 'api' ? (second ?? '') : (first ?? '')
	if (!API_GROUPS.has(group)) return []
	return [{ kind: 'api', key: group }, ...(status >= 500 ? [{ kind: 'api_error' as const, key: group }] : [])]
}

export type TrafficSummary = {
	trackingStartedAt: number
	downloads: Array<{ target: string; count: number }>
	api: Array<{ route: string; requests: number; serverErrors: number; meanMs: number }>
	pairing: { done: number; rejected: number; limited: number }
}

/** Hourly request counters in SQLite: totals only, so the service can tell what is used and what fails without storing who did what. */
export class RequestCounters {
	private readonly upsert
	private lastPrune = 0
	constructor(
		private readonly database: Database,
		private readonly now: () => number = Date.now
	) {
		database.exec(`CREATE TABLE IF NOT EXISTS request_counters(hour INTEGER NOT NULL,kind TEXT NOT NULL,key TEXT NOT NULL,
 count INTEGER NOT NULL DEFAULT 0,duration_ms INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(hour,kind,key));
 CREATE TABLE IF NOT EXISTS request_counters_meta(id INTEGER PRIMARY KEY CHECK(id=1),started_at INTEGER NOT NULL);`)
		database.query('INSERT OR IGNORE INTO request_counters_meta VALUES (1,?)').run(this.now())
		this.upsert = database.query(`INSERT INTO request_counters(hour,kind,key,count,duration_ms) VALUES (?,?,?,1,?)
 ON CONFLICT(hour,kind,key) DO UPDATE SET count=count+1,duration_ms=duration_ms+excluded.duration_ms`)
	}
	record(method: string, path: string, status: number, durationMs: number): void {
		const entries = classify(method, path, status)
		if (entries.length === 0) return
		const time = this.now()
		const hour = Math.floor(time / HOUR) * HOUR
		for (const entry of entries)
			this.upsert.run(hour, entry.kind, entry.key, entry.kind === 'api' ? Math.round(durationMs) : 0)
		if (time - this.lastPrune >= HOUR) {
			this.lastPrune = time
			this.database.query('DELETE FROM request_counters WHERE hour<?').run(time - KEEP_MS)
		}
	}
	/** Downloads of the last 30 days by mod target; API groups and pairing outcomes of the last 24 hours. */
	summary(): TrafficSummary {
		const time = this.now()
		const rows = (kind: CounterKind, since: number) =>
			this.database
				.query(
					'SELECT key,SUM(count) AS count,SUM(duration_ms) AS duration FROM request_counters WHERE kind=? AND hour>=? GROUP BY key'
				)
				.all(kind, since) as Array<{ key: string; count: number; duration: number }>
		const day = time - DAY
		const errors = new Map(rows('api_error', day).map(row => [row.key, row.count]))
		const pairing = new Map(rows('pairing', day).map(row => [row.key, row.count]))
		const started = this.database.query('SELECT started_at FROM request_counters_meta WHERE id=1').get() as {
			started_at: number
		}
		return {
			trackingStartedAt: started.started_at,
			downloads: rows('download', time - 30 * DAY)
				.map(row => ({ target: row.key, count: row.count }))
				.sort((a, b) => b.count - a.count || a.target.localeCompare(b.target)),
			api: rows('api', day)
				.map(row => ({
					route: row.key,
					requests: row.count,
					serverErrors: errors.get(row.key) ?? 0,
					meanMs: Math.round(row.duration / row.count),
				}))
				.sort((a, b) => b.requests - a.requests || a.route.localeCompare(b.route)),
			pairing: {
				done: pairing.get('done') ?? 0,
				rejected: pairing.get('rejected') ?? 0,
				limited: pairing.get('limited') ?? 0,
			},
		}
	}
}
