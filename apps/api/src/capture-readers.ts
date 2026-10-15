import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import { assertObjectsHot, migrateObjectTiers } from './object-tiers'

export const CAPTURE_READER_LEASE_MS = 15 * 60_000

export function migrateCaptureReaders(database: Database): void {
	migrateObjectTiers(database)
	database.exec(`CREATE TABLE IF NOT EXISTS capture_readers (
	 id TEXT PRIMARY KEY,object_key TEXT NOT NULL,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL
	 );
	 CREATE INDEX IF NOT EXISTS capture_readers_object ON capture_readers(object_key);
	 CREATE INDEX IF NOT EXISTS capture_readers_expiry ON capture_readers(expires_at);
	 CREATE INDEX IF NOT EXISTS capture_readers_owner ON capture_readers(user_id,expires_at);`)
}

/** Persist original-file readers too; chunked captures already have timelapse reader leases. */
export class CaptureReaders {
	constructor(private readonly database: Database) {}

	open(objectKey: string, now = Date.now()): string {
		return this.database
			.transaction(() => {
				const memory = this.database.query('SELECT user_id FROM memories WHERE object_key=?').get(objectKey) as {
					user_id: string
				} | null
				if (!memory) throw new Error('Capture reader key is no longer referenced')
				assertObjectsHot(this.database, [objectKey])
				this.database.query('DELETE FROM capture_readers WHERE expires_at<=?').run(now)
				const count = this.database
					.query('SELECT COUNT(*) AS total,COALESCE(SUM(user_id=?),0) AS owned FROM capture_readers')
					.get(memory.user_id) as { total: number; owned: number }
				if (count.total >= 64 || count.owned >= 8) throw new Error('Too many active capture readers')
				const id = randomUUID()
				this.database
					.query('INSERT INTO capture_readers VALUES (?,?,?,?)')
					.run(id, objectKey, memory.user_id, now + CAPTURE_READER_LEASE_MS)
				return id
			})
			.immediate()
	}

	renew(id: string, now = Date.now()): void {
		const updated = this.database
			.query('UPDATE capture_readers SET expires_at=? WHERE id=? AND expires_at>?')
			.run(now + CAPTURE_READER_LEASE_MS, id, now)
		if (!updated.changes) throw new Error('Capture reader lease expired')
	}

	close(id: string): void {
		this.database.query('DELETE FROM capture_readers WHERE id=?').run(id)
	}
}
