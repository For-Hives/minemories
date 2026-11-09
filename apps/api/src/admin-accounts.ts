import type { Database } from 'bun:sqlite'
import { ORPCError } from '@orpc/server'
import type { AdminRoles } from './admin-roles'

const tableExists = (database: Database, name: string) =>
	database.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name) !== null

/** Administrator-initiated account deletion; stored objects leave through the durable object deletion queue. */
export class AdminAccounts {
	constructor(
		private readonly database: Database,
		private readonly roles: AdminRoles
	) {
		database.exec(`CREATE TABLE IF NOT EXISTS admin_account_deletions (
		 id INTEGER PRIMARY KEY,actor_id TEXT NOT NULL,target_id TEXT NOT NULL,target_name TEXT,deleted_at INTEGER NOT NULL)`)
	}
	deleteUser(actorId: string | null, userId: string, now = Date.now()): { ok: true } {
		const actor = this.roles.require(actorId)
		return this.database
			.transaction(() => {
				this.roles.require(actor)
				const target = this.database.query('SELECT id,name FROM user WHERE id=?').get(userId) as {
					id: string
					name: string
				} | null
				if (!target) throw new ORPCError('NOT_FOUND')
				if (target.id === actor) throw new ORPCError('CONFLICT', { message: 'SELF_DELETE' })
				if (this.roles.allowed(target.id)) throw new ORPCError('CONFLICT', { message: 'ADMIN_ACCOUNT' })
				this.release(target.id, now)
				this.database
					.query('INSERT INTO admin_account_deletions(actor_id,target_id,target_name,deleted_at) VALUES (?,?,?,?)')
					.run(actor, target.id, target.name, now)
				this.database.query('DELETE FROM user WHERE id=?').run(target.id)
				return { ok: true as const }
			})
			.immediate()
	}
	/** Queues every object of the account for deletion, then drops the rows that would otherwise outlive it. */
	private release(userId: string, now: number) {
		const queue = (sql: string) =>
			this.database
				.query(`INSERT OR IGNORE INTO object_deletions(object_key,created_at,user_id,size) ${sql}`)
				.run(now, userId)
		queue('SELECT object_key,?,user_id,size FROM memories WHERE user_id=?')
		if (tableExists(this.database, 'timelapse_frames'))
			queue(
				'SELECT f.object_key,?,m.user_id,f.size FROM timelapse_frames f JOIN memories m ON m.id=f.memory_id WHERE m.user_id=?'
			)
		const run = (sql: string) => this.database.query(sql).run(userId)
		for (const table of ['timelapse_leases', 'timelapse_readers', 'capture_readers', 'mod_uploads', 'pairing_codes'])
			if (tableExists(this.database, table)) run(`DELETE FROM ${table} WHERE user_id=?`)
		run('DELETE FROM memories WHERE user_id=?')
		if (tableExists(this.database, 'timelapse_chunks')) {
			queue('SELECT object_key,?,user_id,size FROM timelapse_chunks WHERE user_id=?')
			run('DELETE FROM timelapse_chunks WHERE user_id=?')
		}
		run('DELETE FROM devices WHERE user_id=?')
	}
}
