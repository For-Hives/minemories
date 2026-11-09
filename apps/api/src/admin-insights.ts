import type { Database } from 'bun:sqlite'
import type { AdminInsights } from '@minemories/api-contract'
import type { AdminRoles } from './admin-roles'

const DAY = 86_400_000
export const ACTIVITY_WINDOW_DAYS = 30
const LISTED = 8
/** One login counts 1, one uploaded snapshot 3, a paired device seen in the window 2. */
const UPLOAD_WEIGHT = 3
const DEVICE_WEIGHT = 2
const HIGH_SCORE = 15
const MEDIUM_SCORE = 6
/** Session creation time is stored as milliseconds or as an ISO string depending on the adapter. */
const SESSION_TIME = "CASE WHEN typeof(createdAt)='text' THEN unixepoch(createdAt)*1000 ELSE createdAt END"

type Count = { version: string; devices: number }
const tableExists = (database: Database, name: string) =>
	database.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name) !== null

function tally(values: Array<string | null>): Count[] {
	const counts = new Map<string, number>()
	for (const value of values) counts.set(value ?? 'unknown', (counts.get(value ?? 'unknown') ?? 0) + 1)
	return [...counts]
		.map(([version, devices]) => ({ version, devices }))
		.sort((a, b) => b.devices - a.devices || a.version.localeCompare(b.version))
		.slice(0, LISTED)
}
export function activityLevel(score: number): 'high' | 'medium' | 'low' {
	if (score >= HIGH_SCORE) return 'high'
	return score >= MEDIUM_SCORE ? 'medium' : 'low'
}
/** Read-only reporting over data the service already holds; nothing is tracked for it and no object is read. */
export class AdminInsightsReader {
	constructor(
		private readonly database: Database,
		private readonly roles: AdminRoles
	) {}
	read(actorId: string | null, now = Date.now()): AdminInsights {
		this.roles.require(actorId)
		return {
			windowDays: ACTIVITY_WINDOW_DAYS,
			versions: this.versions(),
			shares: this.shares(),
			activity: this.activity(now - ACTIVITY_WINDOW_DAYS * DAY),
		}
	}
	/** Latest consented diagnostic report of each device: the only place the mod reports its versions. */
	private versions(): AdminInsights['versions'] {
		const rows = tableExists(this.database, 'diagnostic_reports')
			? (this.database
					.query(`WITH latest AS (SELECT report_json,ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY received_at DESC,rowid DESC) AS rank
   FROM diagnostic_reports)
   SELECT json_extract(report_json,'$.versions.minecraft') AS minecraft,json_extract(report_json,'$.versions.loader') AS loader,
   json_extract(report_json,'$.versions.mod') AS mod FROM latest WHERE rank=1 AND json_extract(report_json,'$.source')='mod'`)
					.all() as Array<{ minecraft: string | null; loader: string | null; mod: string | null }>)
			: []
		return {
			reportingDevices: rows.length,
			minecraft: tally(rows.map(row => row.minecraft)),
			loader: tally(rows.map(row => row.loader)),
			mod: tally(rows.map(row => row.mod)),
		}
	}
	private shares(): AdminInsights['shares'] {
		const totals = this.database
			.query(`SELECT COUNT(*) AS links,COALESCE(SUM(revoked_at IS NULL),0) AS activeLinks,COALESCE(SUM(revoked_at IS NOT NULL),0) AS revokedLinks,
   COALESCE(SUM(scope='world'),0) AS worldLinks,COALESCE(SUM(open_count>0),0) AS openedLinks,COALESCE(SUM(open_count),0) AS opens
   FROM share_links`)
			.get() as Omit<AdminInsights['shares'], 'top'>
		const top = this.database
			.query(`SELECT m.name AS name,u.name AS owner,s.scope AS scope,s.open_count AS opens,s.last_opened_at AS lastOpenedAt,s.revoked_at IS NOT NULL AS revoked
   FROM share_links s JOIN memories m ON m.id=s.memory_id LEFT JOIN user u ON u.id=s.user_id
   WHERE s.open_count>0 ORDER BY s.open_count DESC,s.last_opened_at DESC LIMIT ?`)
			.all(LISTED) as Array<Omit<AdminInsights['shares']['top'][number], 'revoked'> & { revoked: number }>
		return { ...totals, top: top.map(row => ({ ...row, revoked: Boolean(row.revoked) })) }
	}
	private activity(since: number): AdminInsights['activity'] {
		const rows = this.database
			.query(`WITH logins AS (SELECT userId AS user_id,COUNT(*) AS n,MAX(ts) AS last FROM (SELECT userId,${SESSION_TIME} AS ts FROM session)
    WHERE ts>=? GROUP BY userId),
   uploads AS (SELECT user_id,COUNT(*) AS n,MAX(created_at) AS last FROM memories WHERE created_at>=? GROUP BY user_id),
   seen AS (SELECT user_id,MAX(last_seen_at) AS last FROM devices WHERE last_seen_at>=? GROUP BY user_id),
   scored AS (SELECT u.id,u.name,u.email,COALESCE(l.n,0) AS logins,COALESCE(up.n,0) AS uploads,
    COALESCE(l.n,0)+COALESCE(up.n,0)*${UPLOAD_WEIGHT}+CASE WHEN s.last IS NULL THEN 0 ELSE ${DEVICE_WEIGHT} END AS score,
    MAX(COALESCE(l.last,0),COALESCE(up.last,0),COALESCE(s.last,0)) AS lastActiveAt
    FROM user u LEFT JOIN logins l ON l.user_id=u.id LEFT JOIN uploads up ON up.user_id=u.id LEFT JOIN seen s ON s.user_id=u.id)
   SELECT *,(SELECT COUNT(*) FROM scored WHERE score>0) AS activeUsers FROM scored WHERE score>0 ORDER BY score DESC,lastActiveAt DESC,id LIMIT 25`)
			.all(since, since, since) as Array<{
			id: string
			name: string
			email: string
			logins: number
			uploads: number
			score: number
			lastActiveAt: number
			activeUsers: number
		}>
		return {
			activeUsers: rows[0]?.activeUsers ?? 0,
			users: rows.map(({ activeUsers: _total, ...row }) => ({ ...row, level: activityLevel(row.score) })),
		}
	}
}
