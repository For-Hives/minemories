import type { Database } from 'bun:sqlite'
import type { AdminJournalEntry } from '@minemories/api-contract'
import type { AdminRoles } from './admin-roles'

const LIMIT = 100
const tableExists = (database: Database, name: string) =>
	database.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name) !== null

/** Where each kind of action is written, as a SELECT of (at, area, action, actor, target); a table that does not exist yet adds nothing. */
const sources: ReadonlyArray<{ table: string; sql: string }> = [
	{
		table: 'admin_role_audit',
		sql: `SELECT a.created_at AS at,'roles' AS area,CASE a.role WHEN 'admin' THEN 'role_granted' ELSE 'role_removed' END AS action,
 ua.name AS actor,ut.name AS target FROM admin_role_audit a LEFT JOIN user ua ON ua.id=a.actor_id LEFT JOIN user ut ON ut.id=a.target_id`,
	},
	{
		table: 'admin_account_deletions',
		sql: `SELECT d.deleted_at,'deletions','account_deleted',ua.name,d.target_name FROM admin_account_deletions d LEFT JOIN user ua ON ua.id=d.actor_id`,
	},
	{
		table: 'public_publications',
		sql: `SELECT p.reviewed_at,'moderation','publication_'||p.state,u.name,p.title FROM public_publications p LEFT JOIN user u ON u.id=p.reviewed_by
 WHERE p.reviewed_at IS NOT NULL AND p.state IN ('approved','rejected')`,
	},
	{
		table: 'diagnostic_issues',
		sql: `SELECT i.updated_at,'health','issue_'||i.state,u.name,substr(i.fingerprint,1,8) FROM diagnostic_issues i LEFT JOIN user u ON u.id=i.updated_by
 WHERE i.updated_at IS NOT NULL`,
	},
	{
		table: 'role_storage_limits',
		sql: `SELECT l.updated_at,'quota','quota_set',u.name,l.role FROM role_storage_limits l LEFT JOIN user u ON u.id=l.updated_by`,
	},
]

/** Read-only merge of every action log the service keeps, newest first. */
export class AdminJournalReader {
	constructor(
		private readonly database: Database,
		private readonly roles: AdminRoles
	) {}
	read(actorId: string | null): AdminJournalEntry[] {
		this.roles.require(actorId)
		const parts = sources.filter(source => tableExists(this.database, source.table)).map(source => source.sql)
		if (parts.length === 0) return []
		return this.database
			.query(`SELECT * FROM (${parts.join(' UNION ALL ')}) ORDER BY at DESC LIMIT ${LIMIT}`)
			.all() as AdminJournalEntry[]
	}
}
