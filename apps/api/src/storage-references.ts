import type { Database, Statement } from 'bun:sqlite'

const managedKey = /^([a-z0-9_-]{1,128})\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.glb$/i

export function managedMemoryKey(key: string): { owner: string; id: string } | null {
	const parts = managedKey.exec(key)
	return parts ? { owner: parts[1] as string, id: parts[2] as string } : null
}

export class ObjectReferences {
	readonly unreferencedSql: string
	private readonly memories: Statement | null
	private readonly uploads: Statement | null
	private readonly chunks: Statement | null
	private readonly readers: Statement | null
	private readonly expireReaders: Statement | null
	private readonly owners: Statement[]
	constructor(database: Database) {
		const tables = new Set(
			(database.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(
				row => row.name
			)
		)
		this.memories = tables.has('memories')
			? database.query('SELECT 1 FROM memories WHERE object_key = ? LIMIT 1')
			: null
		this.uploads = tables.has('mod_uploads')
			? database.query('SELECT 1 FROM mod_uploads WHERE id = ? AND user_id = ? AND completed = 0 LIMIT 1')
			: null
		this.chunks = tables.has('timelapse_chunks')
			? database.query("SELECT 1 FROM timelapse_chunks WHERE object_key = ? AND state != 'deleting' LIMIT 1")
			: null
		this.readers = tables.has('capture_readers')
			? database.query('SELECT 1 FROM capture_readers WHERE object_key=? LIMIT 1')
			: null
		this.expireReaders = tables.has('capture_readers')
			? database.query('DELETE FROM capture_readers WHERE expires_at<=?')
			: null
		this.unreferencedSql =
			[
				tables.has('capture_readers')
					? 'NOT EXISTS (SELECT 1 FROM capture_readers WHERE object_key=object_deletions.object_key)'
					: '',
				tables.has('memories')
					? 'NOT EXISTS (SELECT 1 FROM memories WHERE object_key = object_deletions.object_key)'
					: '',
				tables.has('mod_uploads')
					? `NOT EXISTS (SELECT 1 FROM mod_uploads WHERE completed = 0
						AND id = substr(object_deletions.object_key, instr(object_deletions.object_key, '/') + 1,
							length(object_deletions.object_key) - instr(object_deletions.object_key, '/') - 4)
						AND user_id = substr(object_deletions.object_key, 1, instr(object_deletions.object_key, '/') - 1))`
					: '',
				tables.has('timelapse_chunks')
					? "NOT EXISTS (SELECT 1 FROM timelapse_chunks WHERE object_key = object_deletions.object_key AND state != 'deleting')"
					: '',
			]
				.filter(Boolean)
				.join(' AND ') || '1'
		this.owners = [
			['user', 'id'],
			['devices', 'user_id'],
			['memories', 'user_id'],
			['mod_uploads', 'user_id'],
			['timelapse_chunks', 'user_id'],
		]
			.filter(([table]) => tables.has(table as string))
			.map(([table, column]) => database.query(`SELECT 1 FROM "${table}" WHERE "${column}" = ? LIMIT 1`))
	}
	knownOwner(owner: string): boolean {
		return this.owners.some(statement => Boolean(statement.get(owner)))
	}
	collectExpiredReaders(now: number): void {
		this.expireReaders?.run(now)
	}
	isReferenced(key: string): boolean {
		if (this.memories?.get(key) || this.chunks?.get(key) || this.readers?.get(key)) return true
		const slash = key.lastIndexOf('/')
		if (slash < 1 || !key.endsWith('.glb')) return false
		return Boolean(this.uploads?.get(key.slice(slash + 1, -4), key.slice(0, slash)))
	}
}
