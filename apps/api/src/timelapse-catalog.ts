import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import { migrateObjectDeletionClaims } from './object-deletions'
import { managedMemoryKey } from './storage-references'
import { MAX_TIMELAPSE_CHUNK, MIN_TIMELAPSE_CHUNK } from './timelapse-chunks'
import { MAX_UPLOAD_BYTES } from './upload-files'

export const TIMELAPSE_LEASE_MS = 15 * 60_000
export const MAX_TIMELAPSE_REFS = Math.ceil(MAX_UPLOAD_BYTES / MIN_TIMELAPSE_CHUNK)
const digest = /^[a-f0-9]{64}$/
interface Lease {
	id: string
	memory_id: string
	user_id: string
	original_key: string
	size: number
	expires_at: number
}
interface Chunk {
	object_key: string
	size: number
	state: 'pending' | 'ready' | 'deleting'
	lease_id: string | null
}
export interface FramePart {
	objectKey: string
	size: number
	sha256: string
}
export interface FrameManifest {
	size: number
	sha256: string
	parts: FramePart[]
}

export function migrateTimelapse(database: Database) {
	migrateObjectDeletionClaims(database)
	database.exec(`
	 CREATE TABLE IF NOT EXISTS timelapse_leases (
	  id TEXT PRIMARY KEY, slot INTEGER NOT NULL DEFAULT 1 UNIQUE CHECK(slot = 1),
	  memory_id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, original_key TEXT NOT NULL,
	  size INTEGER NOT NULL CHECK(size > 0 AND size <= ${MAX_UPLOAD_BYTES}), expires_at INTEGER NOT NULL
	 );
	 CREATE TABLE IF NOT EXISTS timelapse_chunks (
	  object_key TEXT PRIMARY KEY, user_id TEXT NOT NULL, sha256 TEXT NOT NULL,
	  size INTEGER NOT NULL CHECK(size > 0 AND size <= ${MAX_TIMELAPSE_CHUNK}),
	  state TEXT NOT NULL CHECK(state IN ('pending','ready','deleting')), lease_id TEXT
	 );
	 CREATE UNIQUE INDEX IF NOT EXISTS timelapse_live_hash ON timelapse_chunks(user_id,sha256) WHERE state != 'deleting';
	 CREATE TABLE IF NOT EXISTS timelapse_pending_refs (
	  lease_id TEXT NOT NULL REFERENCES timelapse_leases(id) ON DELETE CASCADE,
	  ordinal INTEGER NOT NULL CHECK(ordinal >= 0 AND ordinal < ${MAX_TIMELAPSE_REFS}),
	  object_key TEXT NOT NULL REFERENCES timelapse_chunks(object_key), PRIMARY KEY(lease_id,ordinal)
	 );
	 CREATE INDEX IF NOT EXISTS timelapse_pending_objects ON timelapse_pending_refs(object_key);
	 CREATE TABLE IF NOT EXISTS timelapse_frames (
	  memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
	  object_key TEXT NOT NULL UNIQUE, size INTEGER NOT NULL, sha256 TEXT NOT NULL
	 );
	 CREATE TABLE IF NOT EXISTS timelapse_refs (
	  memory_id TEXT NOT NULL REFERENCES timelapse_frames(memory_id) ON DELETE CASCADE,
	  ordinal INTEGER NOT NULL CHECK(ordinal >= 0 AND ordinal < ${MAX_TIMELAPSE_REFS}),
	  object_key TEXT NOT NULL REFERENCES timelapse_chunks(object_key), PRIMARY KEY(memory_id,ordinal)
	 );
	 CREATE INDEX IF NOT EXISTS timelapse_ref_objects ON timelapse_refs(object_key);
	 CREATE TABLE IF NOT EXISTS timelapse_readers (
	  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL
	 );
	 CREATE TABLE IF NOT EXISTS timelapse_reader_refs (
	  reader_id TEXT NOT NULL REFERENCES timelapse_readers(id) ON DELETE CASCADE,
	  ordinal INTEGER NOT NULL, object_key TEXT NOT NULL REFERENCES timelapse_chunks(object_key),
	  PRIMARY KEY(reader_id,ordinal)
	 );
	 CREATE INDEX IF NOT EXISTS timelapse_reader_objects ON timelapse_reader_refs(object_key);
	 CREATE TABLE IF NOT EXISTS timelapse_work (
	  memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
	  attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL
	 );
	`)
}

/** SQLite publication and ownership only; the caller must acknowledge durable chunk writes before publishing. */
export class TimelapseCatalog {
	constructor(private readonly database: Database) {}

	begin(memoryId: string, now = Date.now()): Lease | null {
		return this.database
			.transaction(() => {
				if (this.database.query('SELECT 1 FROM timelapse_leases').get()) return null
				const source = this.database
					.query(`SELECT id, user_id, object_key, size FROM memories WHERE id = ? AND deleted_at IS NULL
				 AND NOT EXISTS (SELECT 1 FROM timelapse_frames WHERE memory_id = memories.id)`)
					.get(memoryId) as { id: string; user_id: string; object_key: string; size: number } | null
				if (!source) return null
				const lease: Lease = {
					id: randomUUID(),
					memory_id: source.id,
					user_id: source.user_id,
					original_key: source.object_key,
					size: source.size,
					expires_at: now + TIMELAPSE_LEASE_MS,
				}
				this.database
					.query(`INSERT INTO timelapse_leases
			 (id,memory_id,user_id,original_key,size,expires_at) VALUES (?,?,?,?,?,?)`)
					.run(lease.id, lease.memory_id, lease.user_id, lease.original_key, lease.size, lease.expires_at)
				return lease
			})
			.immediate()
	}

	renew(id: string, now = Date.now()): void {
		const result = this.database
			.query('UPDATE timelapse_leases SET expires_at = ? WHERE id = ? AND expires_at > ?')
			.run(now + TIMELAPSE_LEASE_MS, id, now)
		if (!result.changes) throw new Error('Timelapse conversion lease expired')
	}

	private lease(id: string, now: number): Lease {
		const row = this.database
			.query('SELECT * FROM timelapse_leases WHERE id = ? AND expires_at > ?')
			.get(id, now) as Lease | null
		if (!row) throw new Error('Timelapse conversion lease expired')
		return row
	}

	claim(id: string, sha256: string, size: number, now = Date.now()): { objectKey: string; upload: boolean } {
		if (!(digest.test(sha256) && Number.isInteger(size)) || size < 1 || size > MAX_TIMELAPSE_CHUNK)
			throw new Error('Invalid timelapse chunk')
		return this.database
			.transaction(() => {
				const lease = this.lease(id, now)
				let chunk = this.database
					.query("SELECT * FROM timelapse_chunks WHERE user_id = ? AND sha256 = ? AND state != 'deleting'")
					.get(lease.user_id, sha256) as Chunk | null
				if (chunk && (chunk.size !== size || (chunk.state === 'pending' && chunk.lease_id !== id)))
					throw new Error('Conflicting timelapse chunk')
				if (chunk && this.database.query('SELECT 1 FROM object_deletions WHERE object_key = ?').get(chunk.object_key))
					throw new Error('Timelapse chunk has a deletion claim')
				if (!chunk) {
					chunk = { object_key: `${lease.user_id}/${randomUUID()}.glb`, size, state: 'pending', lease_id: id }
					this.database
						.query('INSERT INTO timelapse_chunks VALUES (?,?,?,?,?,?)')
						.run(chunk.object_key, lease.user_id, sha256, size, chunk.state, id)
				}
				const { ordinal } = this.database
					.query('SELECT COUNT(*) AS ordinal FROM timelapse_pending_refs WHERE lease_id = ?')
					.get(id) as { ordinal: number }
				this.database.query('INSERT INTO timelapse_pending_refs VALUES (?,?,?)').run(id, ordinal, chunk.object_key)
				return { objectKey: chunk.object_key, upload: chunk.state === 'pending' }
			})
			.immediate()
	}

	stored(id: string, objectKey: string, now = Date.now()): void {
		this.database
			.transaction(() => {
				this.lease(id, now)
				const update = this.database
					.query(
						"UPDATE timelapse_chunks SET state = 'ready' WHERE object_key = ? AND lease_id = ? AND state = 'pending'"
					)
					.run(objectKey, id)
				if (!update.changes) throw new Error('Invalid timelapse chunk acknowledgement')
			})
			.immediate()
	}

	publish(id: string, sha256: string, now = Date.now()): string {
		if (!digest.test(sha256)) throw new Error('Invalid timelapse frame digest')
		return this.database
			.transaction(() => {
				const lease = this.lease(id, now)
				const parts = this.pendingParts(id)
				requireParts(parts, lease.size)
				const objectKey = `${lease.user_id}/${randomUUID()}.glb`
				const update = this.database
					.query(`UPDATE memories SET object_key = ? WHERE id = ? AND user_id = ?
			 AND object_key = ? AND size = ? AND deleted_at IS NULL`)
					.run(objectKey, lease.memory_id, lease.user_id, lease.original_key, lease.size)
				if (!update.changes) throw new Error('Timelapse source changed during conversion')
				this.database
					.query('INSERT INTO timelapse_frames VALUES (?,?,?,?)')
					.run(lease.memory_id, objectKey, lease.size, sha256)
				this.database
					.query(
						'INSERT INTO timelapse_refs SELECT ?,ordinal,object_key FROM timelapse_pending_refs WHERE lease_id = ?'
					)
					.run(lease.memory_id, id)
				this.enqueue(lease.original_key, lease.user_id, lease.size, now)
				this.database.query('DELETE FROM timelapse_leases WHERE id = ?').run(id)
				return objectKey
			})
			.immediate()
	}

	private pendingParts(id: string): FramePart[] {
		const unready = this.database
			.query(`SELECT 1 FROM timelapse_pending_refs p JOIN timelapse_chunks c USING(object_key)
		 WHERE p.lease_id = ? AND (c.state != 'ready' OR EXISTS (SELECT 1 FROM object_deletions d WHERE d.object_key = c.object_key)) LIMIT 1`)
			.get(id)
		if (unready) throw new Error('Timelapse chunks are not durable')
		return this.database
			.query(`SELECT c.object_key AS objectKey,c.size,c.sha256 FROM timelapse_pending_refs p
		 JOIN timelapse_chunks c USING(object_key) WHERE p.lease_id = ? ORDER BY p.ordinal`)
			.all(id) as FramePart[]
	}

	manifest(objectKey: string): FrameManifest | null {
		const frame = this.database
			.query('SELECT memory_id,size,sha256 FROM timelapse_frames WHERE object_key = ?')
			.get(objectKey) as { memory_id: string; size: number; sha256: string } | null
		if (!frame) return null
		const parts = this.database
			.query(`SELECT c.object_key AS objectKey,c.size,c.sha256 FROM timelapse_refs r
		 JOIN timelapse_chunks c USING(object_key) WHERE r.memory_id = ? ORDER BY r.ordinal`)
			.all(frame.memory_id) as FramePart[]
		requireParts(parts, frame.size)
		return { size: frame.size, sha256: frame.sha256, parts }
	}

	open(objectKey: string, now = Date.now()): { id: string; manifest: FrameManifest } | null {
		return this.database
			.transaction(() => {
				const manifest = this.manifest(objectKey)
				if (!manifest) return null
				const frame = this.database
					.query(`SELECT f.memory_id,m.user_id FROM timelapse_frames f
			 JOIN memories m ON m.id=f.memory_id WHERE f.object_key=?`)
					.get(objectKey) as { memory_id: string; user_id: string }
				const count = this.database
					.query(`SELECT COUNT(*) AS total,
			 COALESCE(SUM(user_id=?),0) AS owned FROM timelapse_readers WHERE expires_at>?`)
					.get(frame.user_id, now) as { total: number; owned: number }
				if (count.total >= 64 || count.owned >= 8) throw new Error('Too many active timelapse readers')
				const id = randomUUID()
				this.database
					.query('INSERT INTO timelapse_readers VALUES (?,?,?)')
					.run(id, frame.user_id, now + TIMELAPSE_LEASE_MS)
				this.database
					.query('INSERT INTO timelapse_reader_refs SELECT ?,ordinal,object_key FROM timelapse_refs WHERE memory_id=?')
					.run(id, frame.memory_id)
				return { id, manifest }
			})
			.immediate()
	}

	renewReader(id: string, now = Date.now()): void {
		const result = this.database
			.query('UPDATE timelapse_readers SET expires_at=? WHERE id=? AND expires_at>?')
			.run(now + TIMELAPSE_LEASE_MS, id, now)
		if (!result.changes) throw new Error('Timelapse reader lease expired')
	}

	closeReader(id: string): void {
		this.database.query('DELETE FROM timelapse_readers WHERE id=?').run(id)
	}

	abandon(id: string): void {
		this.database.query('DELETE FROM timelapse_leases WHERE id = ?').run(id)
	}

	/** Tombstone first: a chunk being deleted can never receive new references or regain its old key. */
	collect(now = Date.now()): number {
		return this.database
			.transaction(() => {
				this.database.query('DELETE FROM timelapse_leases WHERE expires_at <= ?').run(now)
				this.database.query('DELETE FROM timelapse_readers WHERE expires_at <= ?').run(now)
				this.database
					.query(`DELETE FROM timelapse_chunks WHERE object_key IN (
			 SELECT object_key FROM timelapse_chunks c WHERE state='deleting'
			 AND NOT EXISTS (SELECT 1 FROM object_deletions d WHERE d.object_key=c.object_key) LIMIT 100)`)
					.run()
				const rows = this.database
					.query(`SELECT object_key,user_id,size FROM timelapse_chunks c WHERE state != 'deleting'
			 AND NOT EXISTS (SELECT 1 FROM timelapse_refs r WHERE r.object_key = c.object_key)
			 AND NOT EXISTS (SELECT 1 FROM timelapse_pending_refs p WHERE p.object_key = c.object_key)
			 AND NOT EXISTS (SELECT 1 FROM timelapse_reader_refs r WHERE r.object_key = c.object_key) LIMIT 100`)
					.all() as Array<{ object_key: string; user_id: string; size: number }>
				for (const row of rows) {
					this.database.query("UPDATE timelapse_chunks SET state = 'deleting' WHERE object_key = ?").run(row.object_key)
					this.enqueue(row.object_key, row.user_id, row.size, now)
				}
				return rows.length
			})
			.immediate()
	}

	/** A late PUT gets a fresh durable intent even if an earlier deletion already consumed its old job. */
	discardWrite(objectKey: string, userId: string, size: number, now = Date.now()): boolean {
		if (
			managedMemoryKey(objectKey)?.owner !== userId ||
			!Number.isInteger(size) ||
			size < 1 ||
			size > MAX_TIMELAPSE_CHUNK
		)
			throw new Error('Invalid timelapse cleanup claim')
		return this.database
			.transaction(() => {
				const referenced = this.database
					.query(`SELECT 1 FROM timelapse_refs WHERE object_key=?
			 UNION ALL SELECT 1 FROM timelapse_pending_refs WHERE object_key=?
			 UNION ALL SELECT 1 FROM timelapse_reader_refs WHERE object_key=? LIMIT 1`)
					.get(objectKey, objectKey, objectKey)
				if (referenced) return false
				this.database.query("UPDATE timelapse_chunks SET state='deleting' WHERE object_key=?").run(objectKey)
				this.enqueue(objectKey, userId, size, now)
				return true
			})
			.immediate()
	}

	private enqueue(key: string, userId: string, size: number, now: number) {
		this.database
			.query(`INSERT INTO object_deletions (object_key,created_at,user_id,size,discard_upload,generation)
		 VALUES (?,?,?,?,1,?) ON CONFLICT(object_key) DO UPDATE SET generation=excluded.generation,
		 next_attempt_at=0,attempts=0,discard_upload=1,
		 user_id=COALESCE(object_deletions.user_id,excluded.user_id),
		 size=COALESCE(object_deletions.size,excluded.size)`)
			.run(key, now, userId, size, randomUUID())
	}
}

function requireParts(parts: FramePart[], size: number) {
	if (!parts.length || parts.length > MAX_TIMELAPSE_REFS || parts.reduce((sum, part) => sum + part.size, 0) !== size)
		throw new Error('Invalid timelapse manifest size')
	if (parts.slice(0, -1).some(part => part.size < MIN_TIMELAPSE_CHUNK))
		throw new Error('Invalid timelapse chunk boundary')
}
