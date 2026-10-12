import type { Database } from 'bun:sqlite'
import { ObjectReferences } from './storage-references'

export function migrateObjectDeletionClaims(database: Database): void {
	database.transaction(() => {
		const columns = database.query('PRAGMA table_info(object_deletions)').all() as Array<{ name: string }>
		for (const [name, definition] of [
			['user_id', 'user_id TEXT'],
			['size', 'size INTEGER'],
			['discard_upload', 'discard_upload INTEGER NOT NULL DEFAULT 0'],
		]) {
			if (!columns.some(column => column.name === name)) {
				database.exec(`ALTER TABLE object_deletions ADD COLUMN ${definition}`)
			}
		}
		database.exec('CREATE INDEX IF NOT EXISTS object_deletions_user_id_idx ON object_deletions(user_id)')
	})()
}

interface Deletion {
	object_key: string
	attempts: number
	discard_upload: number
}

export class ObjectDeletionQueue {
	private running = false
	private readonly held = new Set<string>()
	private readonly references: ObjectReferences

	constructor(
		private readonly database: Database,
		private readonly remove: (key: string, discardUpload: boolean) => Promise<void>
	) {
		this.references = new ObjectReferences(database)
	}

	hold(objectKey: string): () => void {
		this.held.add(objectKey)
		return () => this.held.delete(objectKey)
	}

	async maintain(now = Date.now()): Promise<void> {
		try {
			await this.drain(undefined, now)
		} catch {
			console.error('[object-deletions] queue pass failed; pending jobs remain in SQLite')
		}
	}

	async drain(objectKey?: string, now = Date.now()): Promise<void> {
		if (this.running) return
		this.running = true
		try {
			const rows =
				objectKey === undefined
					? this.database
							.query(`SELECT object_key FROM object_deletions WHERE next_attempt_at <= ?
								AND (${this.references.unreferencedSql}) ORDER BY created_at LIMIT 100`)
							.all(now)
					: this.database
							.query('SELECT object_key FROM object_deletions WHERE object_key = ? AND next_attempt_at <= ?')
							.all(objectKey, now)
			for (const row of rows as Array<{ object_key: string }>) {
				// biome-ignore lint/performance/noAwaitInLoops: one bounded batch avoids flooding an unavailable object store.
				await this.attempt(row.object_key, now)
			}
		} finally {
			this.running = false
		}
	}

	private async attempt(objectKey: string, now: number): Promise<void> {
		if (this.held.has(objectKey) || this.references.isReferenced(objectKey)) return
		const row = this.database
			.query(
				'SELECT object_key, attempts, discard_upload FROM object_deletions WHERE object_key = ? AND next_attempt_at <= ?'
			)
			.get(objectKey, now) as Deletion | null
		if (!row) return
		try {
			await this.remove(row.object_key, row.discard_upload === 1)
			this.database.query('DELETE FROM object_deletions WHERE object_key = ?').run(row.object_key)
		} catch {
			const delay = Math.min(3_600_000, 60_000 * 2 ** Math.min(row.attempts, 6))
			this.database
				.query('UPDATE object_deletions SET attempts = attempts + 1, next_attempt_at = ? WHERE object_key = ?')
				.run(now + delay, row.object_key)
		}
	}
}
