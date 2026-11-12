import type { Database } from 'bun:sqlite'
import type { AdminUserSort } from '@minemories/api-contract'
import { ORPCError } from '@orpc/server'
import { ACCOUNT_STORAGE_BYTES } from './configuration'
import { ACCOUNT_USAGE_SQL } from './storage-quota'

const wildcard = /[\\%_]/g
/** Fixed ORDER BY clauses: the requested sort only selects one, nothing from the request is interpolated. */
const orders = {
	registered_desc: 'u.createdAt DESC',
	registered_asc: 'u.createdAt ASC',
	storage_desc: 'COALESCE(g.usedBytes,0) DESC',
	storage_asc: 'COALESCE(g.usedBytes,0) ASC',
} as const
/** An account is "near" its quota from 90 %. */
const NEAR_QUOTA_PERCENT = 90
const filter = `(u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR u.id LIKE ? ESCAPE '\\')
 AND (?='all' OR (?='admin')=EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id))`
/**
 * Acting identity of the operator MCP endpoint (authenticated by `API_TOKEN`, not by an account). Real user ids come from
 * Better Auth sessions and can never take this value, so it only ever reaches these classes from `mcp.ts`.
 */
export const OPERATOR_ACTOR = 'operator:mcp'

export class AdminRoles {
	constructor(private readonly database: Database) {
		database.exec(`CREATE TABLE IF NOT EXISTS user_roles (user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE);
   CREATE TABLE IF NOT EXISTS admin_role_audit (id INTEGER PRIMARY KEY,actor_id TEXT,target_id TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('user','admin')),created_at INTEGER NOT NULL);`)
	}
	allowed(userId: string | null): boolean {
		return (
			userId === OPERATOR_ACTOR ||
			(userId !== null && this.database.query('SELECT 1 FROM user_roles WHERE user_id=?').get(userId) !== null)
		)
	}
	require(userId: string | null): string {
		if (!userId) throw new ORPCError('UNAUTHORIZED')
		if (!this.allowed(userId)) throw new ORPCError('FORBIDDEN')
		return userId
	}
	setRole(actorId: string, input: { userId: string; role: 'user' | 'admin' }, now = Date.now()) {
		return this.database
			.transaction(() => {
				this.require(actorId)
				if (!this.database.query('SELECT 1 FROM user WHERE id=?').get(input.userId)) throw new ORPCError('NOT_FOUND')
				const previous = this.allowed(input.userId)
				if (previous === (input.role === 'admin')) return { ok: true as const }
				if (
					input.role === 'user' &&
					(this.database.query('SELECT COUNT(*) AS n FROM user_roles').get() as { n: number }).n <= 1
				)
					throw new ORPCError('CONFLICT', { message: 'LAST_ADMIN' })
				if (input.role === 'admin') this.database.query('INSERT INTO user_roles VALUES (?)').run(input.userId)
				else this.database.query('DELETE FROM user_roles WHERE user_id=?').run(input.userId)
				this.database
					.query('INSERT INTO admin_role_audit(actor_id,target_id,role,created_at) VALUES (?,?,?,?)')
					.run(actorId, input.userId, input.role, now)
				return { ok: true as const }
			})
			.immediate()
	}
	bootstrap(email: string, now = Date.now()) {
		return this.database
			.transaction(() => {
				const target = this.database.query('SELECT id FROM user WHERE lower(email)=?').get(email.toLowerCase()) as {
					id: string
				} | null
				if (!target) throw new Error('Existing account not found; no administrator was created.')
				const inserted = this.database
					.query('INSERT OR IGNORE INTO user_roles VALUES (?) RETURNING user_id')
					.get(target.id)
				if (inserted)
					this.database
						.query("INSERT INTO admin_role_audit(actor_id,target_id,role,created_at) VALUES (NULL,?,'admin',?)")
						.run(target.id, now)
				return { ok: true as const }
			})
			.immediate()
	}
	/** Promotes an existing account by its identifier (not by e-mail, which another person could register first). */
	bootstrapById(userId: string, now = Date.now()) {
		return this.database
			.transaction(() => {
				if (!this.database.query('SELECT 1 FROM user WHERE id=?').get(userId)) return false
				const inserted = this.database
					.query('INSERT OR IGNORE INTO user_roles VALUES (?) RETURNING user_id')
					.get(userId)
				if (inserted)
					this.database
						.query("INSERT INTO admin_role_audit(actor_id,target_id,role,created_at) VALUES (NULL,?,'admin',?)")
						.run(userId, now)
				return Boolean(inserted)
			})
			.immediate()
	}
	users(
		actorId: string | null,
		input: {
			query: string
			role: 'all' | 'user' | 'admin'
			page: number
			sort?: AdminUserSort | undefined
		}
	) {
		this.require(actorId)
		const search = `%${input.query.replace(wildcard, '\\$&')}%`,
			values = [search, search, search, input.role, input.role]
		const total = (
			this.database.query(`SELECT COUNT(*) AS n FROM user u WHERE ${filter}`).get(...values) as { n: number }
		).n
		// One grouped usage query joined to the page (no per-account loop); only metadata leaves this method.
		const users = this.database
			.query(`WITH usage AS (${ACCOUNT_USAGE_SQL})
   SELECT u.id,u.name,u.email,u.emailVerified,u.createdAt,
   CASE WHEN EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id) THEN 'admin' ELSE 'user' END AS role,
   COALESCE(g.captures,0) AS captures,
   COALESCE(g.storedBytes,0) AS storedBytes,
   COALESCE(g.usedBytes,0) AS usedBytes,
   COALESCE(g.reservedBytes,0) AS reservedBytes,
   COALESCE(g.pendingDeletionBytes,0) AS pendingDeletionBytes,
   (SELECT COUNT(*) FROM devices d WHERE d.user_id=u.id AND d.revoked_at IS NULL) AS devices
   FROM user u LEFT JOIN usage g ON g.user_id=u.id WHERE ${filter} ORDER BY ${orders[input.sort ?? 'registered_desc']},u.id LIMIT 25 OFFSET ?`)
			.all(...values, (input.page - 1) * 25) as Array<{
			id: string
			name: string
			email: string
			emailVerified: number
			createdAt: number | string
			role: 'user' | 'admin'
			captures: number
			storedBytes: number
			usedBytes: number
			reservedBytes: number
			pendingDeletionBytes: number
			devices: number
		}>
		const overview = this.database
			.query(`WITH usage AS (${ACCOUNT_USAGE_SQL})
   SELECT COUNT(*) AS accounts,COALESCE(SUM(g.usedBytes),0) AS usedBytes,
   COALESCE(SUM(CASE WHEN COALESCE(g.usedBytes,0)*100>=?*${NEAR_QUOTA_PERCENT} THEN 1 ELSE 0 END),0) AS nearQuotaAccounts
   FROM user u LEFT JOIN usage g ON g.user_id=u.id`)
			.get(ACCOUNT_STORAGE_BYTES) as { accounts: number; usedBytes: number; nearQuotaAccounts: number }
		return {
			users: users.map(u => ({
				...u,
				emailVerified: Boolean(u.emailVerified),
				createdAt: typeof u.createdAt === 'number' ? u.createdAt : Date.parse(u.createdAt),
			})),
			total,
			page: input.page,
			pageSize: 25 as const,
			quotaBytes: ACCOUNT_STORAGE_BYTES,
			overview,
		}
	}
	audit(actorId: string | null) {
		this.require(actorId)
		return this.database
			.query(`SELECT a.id,a.created_at AS at,u.name AS actorName,t.name AS targetName,a.role
   FROM admin_role_audit a LEFT JOIN user u ON u.id=a.actor_id LEFT JOIN user t ON t.id=a.target_id ORDER BY a.id DESC LIMIT 50`)
			.all() as Array<{
			id: number
			at: number
			actorName: string | null
			targetName: string | null
			role: 'user' | 'admin'
		}>
	}
}
