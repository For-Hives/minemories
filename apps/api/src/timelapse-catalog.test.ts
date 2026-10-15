import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ObjectDeletionQueue } from './object-deletions'
import { ObjectReferences } from './storage-references'
import { migrateTimelapse, TIMELAPSE_LEASE_MS, TimelapseCatalog } from './timelapse-catalog'
import { MIN_TIMELAPSE_CHUNK } from './timelapse-chunks'

const a = 'a'.repeat(64),
	b = 'b'.repeat(64),
	frameHash = 'f'.repeat(64)
const firstSize = MIN_TIMELAPSE_CHUNK,
	size = firstSize + 7
function fixture(path = ':memory:') {
	const db = new Database(path)
	db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
	 CREATE TABLE memories(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,object_key TEXT UNIQUE,size INTEGER,deleted_at INTEGER);
	 CREATE TABLE object_deletions(object_key TEXT PRIMARY KEY,created_at INTEGER,attempts INTEGER DEFAULT 0,
	 next_attempt_at INTEGER DEFAULT 0,user_id TEXT,size INTEGER,discard_upload INTEGER DEFAULT 0);`)
	migrateTimelapse(db)
	return { db, catalog: new TimelapseCatalog(db) }
}
function memory(db: Database, id: string, owner = 'owner', bytes = size) {
	db.query('INSERT INTO memories VALUES (?,?,?,?,NULL)').run(id, owner, `${owner}/${id}.glb`, bytes)
}
function required<T>(value: T | null): T {
	if (value === null) throw new Error('Missing conversion lease')
	return value
}
function parts(catalog: TimelapseCatalog, lease: string, now = 0) {
	const first = catalog.claim(lease, a, firstSize, now)
	if (first.upload) catalog.stored(lease, first.objectKey, now)
	const last = catalog.claim(lease, b, 7, now)
	if (last.upload) catalog.stored(lease, last.objectKey, now)
	return [first, last] as const
}

test('publication atomically swaps only durable frames and preserves shared chunks through trash and purge', async () => {
	const { db, catalog } = fixture()
	try {
		memory(db, 'first')
		memory(db, 'second')
		const lease = required(catalog.begin('first', 0))
		expect(catalog.begin('second', 0)).toBeNull()
		const claims = parts(catalog, lease.id)
		expect(claims.map(p => p.upload)).toEqual([true, true])
		expect(db.query('SELECT object_key FROM memories WHERE id=?').get('first')).toEqual({
			object_key: 'owner/first.glb',
		})
		const virtual = catalog.publish(lease.id, frameHash, 1)
		expect(catalog.manifest('owner/first.glb')).toBeNull()
		expect(catalog.manifest(virtual)).toEqual({
			size,
			sha256: frameHash,
			parts: [
				{ objectKey: claims[0].objectKey, size: firstSize, sha256: a },
				{ objectKey: claims[1].objectKey, size: 7, sha256: b },
			],
		})
		expect(db.query('SELECT object_key,size,user_id,discard_upload FROM object_deletions').get()).toEqual({
			object_key: 'owner/first.glb',
			size,
			user_id: 'owner',
			discard_upload: 1,
		})
		expect(catalog.begin('first', 2)).toBeNull()
		const other = required(catalog.begin('second', 2))
		expect(parts(catalog, other.id, 2).map(p => p.upload)).toEqual([false, false])
		catalog.publish(other.id, frameHash, 3)
		db.exec("UPDATE memories SET deleted_at=4 WHERE id='first'")
		expect(catalog.collect(5)).toBe(0)
		db.exec("DELETE FROM memories WHERE id='first'")
		expect(catalog.collect(6)).toBe(0)
		db.exec("DELETE FROM memories WHERE id='second'")
		expect(catalog.collect(7)).toBe(2)
		const removed: string[] = []
		await new ObjectDeletionQueue(db, key => {
			removed.push(key)
			return Promise.resolve()
		}).drain(undefined, 8)
		expect(removed.sort()).toEqual(['owner/first.glb', 'owner/second.glb', ...claims.map(p => p.objectKey)].sort())
		expect(catalog.collect(9)).toBe(0)
	} finally {
		db.close()
	}
})

test('ready and pending objects protect against both deletion paths and reconciliation; owners never share chunks', async () => {
	const { db, catalog } = fixture()
	try {
		memory(db, 'first')
		memory(db, 'other', 'other')
		const lease = required(catalog.begin('first', 0)),
			claims = parts(catalog, lease.id)
		const references = new ObjectReferences(db)
		expect(references.knownOwner('owner')).toBe(true)
		for (const claim of claims) expect(references.isReferenced(claim.objectKey)).toBe(true)
		const key = claims[0].objectKey
		db.query('INSERT INTO object_deletions(object_key,created_at) VALUES (?,0)').run(key)
		const deleted: string[] = []
		const queue = new ObjectDeletionQueue(db, k => {
			deleted.push(k)
			return Promise.resolve()
		})
		await queue.drain(key, 0)
		await queue.drain(undefined, 0)
		expect(deleted).toEqual([])
		expect(() => catalog.publish(lease.id, frameHash, 0)).toThrow('not durable')
		db.query('DELETE FROM object_deletions WHERE object_key=?').run(key)
		catalog.publish(lease.id, frameHash, 0)
		const other = required(catalog.begin('other', 1))
		const next = parts(catalog, other.id, 1)
		expect(next.map(p => p.upload)).toEqual([true, true])
		expect(next[0].objectKey).not.toBe(key)
		catalog.publish(other.id, frameHash, 1)
	} finally {
		db.close()
	}
})

test('expired or abandoned writers cannot publish, resurrect a chunk, or reuse a key being deleted', () => {
	const { db, catalog } = fixture()
	try {
		memory(db, 'first')
		memory(db, 'second')
		const lease = required(catalog.begin('first', 0))
		const claim = catalog.claim(lease.id, a, firstSize, 0)
		const references = new ObjectReferences(db)
		expect(references.isReferenced(claim.objectKey)).toBe(true)
		catalog.renew(lease.id, 10)
		expect(catalog.collect(TIMELAPSE_LEASE_MS)).toBe(0)
		expect(catalog.collect(TIMELAPSE_LEASE_MS + 10)).toBe(1)
		expect(references.isReferenced(claim.objectKey)).toBe(false)
		expect(() => catalog.stored(lease.id, claim.objectKey, TIMELAPSE_LEASE_MS + 10)).toThrow('expired')
		expect(() => catalog.renew(lease.id, TIMELAPSE_LEASE_MS + 10)).toThrow('expired')
		expect(() => catalog.publish(lease.id, frameHash, TIMELAPSE_LEASE_MS + 10)).toThrow('expired')
		const second = required(catalog.begin('second', TIMELAPSE_LEASE_MS + 11))
		const next = catalog.claim(second.id, a, firstSize, TIMELAPSE_LEASE_MS + 11)
		expect(next.upload).toBe(true)
		expect(next.objectKey).not.toBe(claim.objectKey)
		catalog.abandon(second.id)
		catalog.abandon(second.id)
		expect(catalog.collect(TIMELAPSE_LEASE_MS + 12)).toBe(1)
		expect(db.query('SELECT object_key FROM memories ORDER BY id').all()).toEqual([
			{ object_key: 'owner/first.glb' },
			{ object_key: 'owner/second.glb' },
		])
	} finally {
		db.close()
	}
})

test('bad digests, size mismatches, unacknowledged chunks and changed sources cannot replace the original', () => {
	const { db, catalog } = fixture()
	try {
		memory(db, 'first')
		expect(catalog.begin('missing', 0)).toBeNull()
		const lease = required(catalog.begin('first', 0))
		for (const [hash, bytes] of [
			['invalid', 1],
			[a, 0],
			[a, 256 * 1024 + 1],
			[a, 1.5],
		] as const)
			expect(() => catalog.claim(lease.id, hash, bytes, 0)).toThrow('Invalid timelapse chunk')
		expect(() => catalog.publish(lease.id, 'bad', 0)).toThrow('digest')
		expect(() => catalog.publish(lease.id, frameHash, 0)).toThrow('manifest size')
		const claim = catalog.claim(lease.id, a, firstSize, 0)
		expect(() => catalog.publish(lease.id, frameHash, 0)).toThrow('not durable')
		expect(() => catalog.stored(lease.id, 'missing', 0)).toThrow('acknowledgement')
		catalog.stored(lease.id, claim.objectKey, 0)
		expect(() => catalog.claim(lease.id, a, firstSize + 1, 0)).toThrow('Conflicting')
		expect(() => catalog.publish(lease.id, frameHash, 0)).toThrow('manifest size')
		const last = catalog.claim(lease.id, b, 7, 0)
		catalog.stored(lease.id, last.objectKey, 0)
		db.exec("UPDATE memories SET deleted_at=1 WHERE id='first'")
		expect(() => catalog.publish(lease.id, frameHash, 0)).toThrow('source changed')
		expect(db.query('SELECT * FROM timelapse_frames').all()).toEqual([])
		expect(db.query('SELECT * FROM object_deletions').all()).toEqual([])
		db.exec("UPDATE memories SET deleted_at=NULL WHERE id='first'")
		const virtual = catalog.publish(lease.id, frameHash, 1)
		db.exec('DELETE FROM timelapse_refs WHERE ordinal=0')
		expect(() => catalog.manifest(virtual)).toThrow('manifest size')
	} finally {
		db.close()
	}
})

test('a conflicting deletion claim or foreign pending writer cannot be adopted; small middle chunks are invalid', () => {
	const { db, catalog } = fixture()
	try {
		memory(db, 'first', 'owner', 14)
		const lease = required(catalog.begin('first', 0))
		const claim = catalog.claim(lease.id, a, 7, 0)
		db.query("UPDATE timelapse_chunks SET lease_id='other' WHERE object_key=?").run(claim.objectKey)
		expect(() => catalog.claim(lease.id, a, 7, 0)).toThrow('Conflicting')
		db.query('UPDATE timelapse_chunks SET lease_id=? WHERE object_key=?').run(lease.id, claim.objectKey)
		catalog.stored(lease.id, claim.objectKey, 0)
		db.query('INSERT INTO object_deletions(object_key,created_at) VALUES (?,0)').run(claim.objectKey)
		expect(() => catalog.claim(lease.id, a, 7, 0)).toThrow('deletion claim')
		db.query('DELETE FROM object_deletions WHERE object_key=?').run(claim.objectKey)
		catalog.claim(lease.id, a, 7, 0)
		expect(() => catalog.publish(lease.id, frameHash, 0)).toThrow('boundary')
	} finally {
		db.close()
	}
})

test('leases and references survive independent SQLite connections and process restart', () => {
	const dir = mkdtempSync(join(tmpdir(), 'timelapse-catalog-')),
		path = join(dir, 'db.sqlite')
	let { db, catalog } = fixture(path)
	try {
		memory(db, 'first')
		memory(db, 'second')
		const lease = required(catalog.begin('first', 0)),
			claims = parts(catalog, lease.id)
		const concurrent = new Database(path)
		try {
			concurrent.exec('PRAGMA foreign_keys=ON')
			const second = new TimelapseCatalog(concurrent)
			expect(second.begin('second', 0)).toBeNull()
			expect(second.collect(TIMELAPSE_LEASE_MS - 1)).toBe(0)
		} finally {
			concurrent.close()
		}
		db.close()
		db = new Database(path)
		db.exec('PRAGMA foreign_keys=ON')
		migrateTimelapse(db)
		catalog = new TimelapseCatalog(db)
		const key = catalog.publish(lease.id, frameHash, 1)
		expect(catalog.manifest(key)?.parts.map(p => p.objectKey)).toEqual(claims.map(p => p.objectKey))
	} finally {
		db.close()
		rmSync(dir, { recursive: true, force: true })
	}
})

test('a reader pins the snapshot after purge and releases it on close or crash expiry', () => {
	const { db, catalog } = fixture()
	try {
		memory(db, 'first')
		const lease = required(catalog.begin('first', 0))
		parts(catalog, lease.id)
		const key = catalog.publish(lease.id, frameHash, 0)
		expect(catalog.open('raw-key', 0)).toBeNull()
		const reader = required(catalog.open(key, 0)),
			other = required(catalog.open(key, 0))
		expect(reader.manifest.size).toBe(size)
		db.exec("DELETE FROM memories WHERE id='first'")
		expect(catalog.collect(1)).toBe(0)
		catalog.closeReader(reader.id)
		catalog.closeReader(reader.id)
		catalog.renewReader(other.id, 10)
		expect(catalog.collect(TIMELAPSE_LEASE_MS)).toBe(0)
		expect(catalog.collect(TIMELAPSE_LEASE_MS + 10)).toBe(2)
		expect(() => catalog.renewReader(other.id, TIMELAPSE_LEASE_MS + 10)).toThrow('reader lease expired')
	} finally {
		db.close()
	}
})

test('reader reservations enforce both per-owner and global bounds', () => {
	const { db, catalog } = fixture()
	try {
		for (let owner = 0; owner < 9; owner++) {
			const id = `m${owner}`
			memory(db, id, `owner${owner}`, 7)
			const lease = required(catalog.begin(id, 0)),
				claim = catalog.claim(lease.id, b, 7, 0)
			catalog.stored(lease.id, claim.objectKey, 0)
			const key = catalog.publish(lease.id, frameHash, 0)
			if (owner < 8) {
				for (let reader = 0; reader < 8; reader++) expect(catalog.open(key, 0)).not.toBeNull()
			}
			expect(() => catalog.open(key, 0)).toThrow('Too many active')
		}
		catalog.collect(TIMELAPSE_LEASE_MS)
		expect(db.query('SELECT COUNT(*) AS count FROM timelapse_readers').get()).toEqual({ count: 0 })
	} finally {
		db.close()
	}
})

test('late writes keep a fresh cleanup job during an in-flight deletion and after tombstone collection', async () => {
	const { db, catalog } = fixture()
	try {
		memory(db, 'first')
		const lease = required(catalog.begin('first', 0)),
			claim = catalog.claim(lease.id, b, 7, 0)
		expect(catalog.discardWrite(claim.objectKey, 'owner', 7, 0)).toBe(false)
		for (const [key, owner, bytes] of [
			['../bad', 'owner', 7],
			[claim.objectKey, 'other', 7],
			[claim.objectKey, 'owner', 0],
		] as const)
			expect(() => catalog.discardWrite(key, owner, bytes, 0)).toThrow('cleanup claim')
		catalog.abandon(lease.id)
		catalog.collect(1)
		let finish: (() => void) | undefined
		const objects = new Set([claim.objectKey])
		const deleting = new ObjectDeletionQueue(db, key => {
			objects.delete(key)
			return new Promise<void>(resolve => {
				finish = resolve
			})
		})
		const pending = deleting.drain(claim.objectKey, 1)
		objects.add(claim.objectKey)
		expect(catalog.discardWrite(claim.objectKey, 'owner', 7, 2)).toBe(true)
		finish?.()
		await pending
		expect(db.query('SELECT 1 FROM object_deletions WHERE object_key=?').get(claim.objectKey)).not.toBeNull()
		await new ObjectDeletionQueue(db, key => {
			objects.delete(key)
			return Promise.resolve()
		}).drain(claim.objectKey, 2)
		catalog.collect(3)
		expect(db.query('SELECT 1 FROM timelapse_chunks WHERE object_key=?').get(claim.objectKey)).toBeNull()
		objects.add(claim.objectKey)
		expect(catalog.discardWrite(claim.objectKey, 'owner', 7, 4)).toBe(true)
		await new ObjectDeletionQueue(db, key => {
			objects.delete(key)
			return Promise.resolve()
		}).drain(claim.objectKey, 4)
		expect(objects.size).toBe(0)
	} finally {
		db.close()
	}
})

test('existing 200 MiB catalogs preserve leases and references while raising limits', () => {
	const { db } = fixture()
	const sql = db
		.query(
			"SELECT name,sql FROM sqlite_master WHERE name IN ('timelapse_leases','timelapse_pending_refs','timelapse_refs')"
		)
		.all() as { name: string; sql: string }[]
	db.exec('DROP TABLE timelapse_pending_refs; DROP TABLE timelapse_refs; DROP TABLE timelapse_leases;')
	for (const row of sql.sort((a, b) => Number(b.name === 'timelapse_leases') - Number(a.name === 'timelapse_leases'))) {
		db.exec(row.sql.replaceAll('471859200', '209715200').replaceAll('28800', '12800'))
	}
	memory(db, 'large', 'owner', 450 * 1024 * 1024)
	memory(db, 'published', 'owner', 20)
	db.exec("INSERT INTO timelapse_leases VALUES ('lease',1,'small','owner','owner/small.glb',20,100);")
	db.exec(`INSERT INTO timelapse_chunks VALUES ('owner/chunk.glb','owner','${a}',20,'ready',NULL);
 INSERT INTO timelapse_pending_refs VALUES ('lease',0,'owner/chunk.glb');
 INSERT INTO timelapse_frames VALUES ('published','owner/published.glb',20,'${frameHash}');
 INSERT INTO timelapse_refs VALUES ('published',0,'owner/chunk.glb');`)
	migrateTimelapse(db)
	migrateTimelapse(db)
	expect(db.query('SELECT object_key FROM timelapse_pending_refs').get()).toEqual({ object_key: 'owner/chunk.glb' })
	expect(db.query('SELECT object_key FROM timelapse_refs').get()).toEqual({ object_key: 'owner/chunk.glb' })
	db.exec(
		"INSERT INTO timelapse_pending_refs VALUES ('lease',28799,'owner/chunk.glb'); DELETE FROM timelapse_pending_refs; DELETE FROM timelapse_leases;"
	)
	expect(new TimelapseCatalog(db).begin('large', 0)?.size).toBe(471859200)
	expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
	db.close()
})
