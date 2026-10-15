import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { migrateCaptureAccess } from './capture-access'
import { CAPTURE_READER_LEASE_MS, CaptureReaders, migrateCaptureReaders } from './capture-readers'
import { coldStorageCandidates } from './cold-storage-policy'
import { ObjectDeletionQueue } from './object-deletions'
import { temporalFixture } from './test-support/timelapse-fixture'

test('original readers persist across connections and block archive preview and deletion until close or expiry', async () => {
	const f = await temporalFixture()
	try {
		migrateCaptureAccess(f.db)
		migrateCaptureReaders(f.db)
		const memory = await f.add({}),
			now = 100 * 86_400_000,
			readers = new CaptureReaders(f.db),
			id = readers.open(memory.key, now)
		const connection = new Database(f.db.filename, { readwrite: true, create: false })
		try {
			expect(coldStorageCandidates(connection, 90, now)).toEqual([])
			new CaptureReaders(connection).renew(id, now + 100)
		} finally {
			connection.close()
		}
		readers.close(id)
		expect(coldStorageCandidates(f.db, 90, now)).toHaveLength(1)
		const active = readers.open(memory.key, now)
		f.db.query('DELETE FROM memories WHERE id=?').run(memory.id)
		f.db.query('INSERT INTO object_deletions(object_key,created_at) VALUES (?,?)').run(memory.key, now)
		const removed: string[] = [],
			queue = new ObjectDeletionQueue(f.db, async key => {
				removed.push(key)
			})
		await queue.drain(memory.key, now)
		await queue.drain(undefined, now)
		expect(removed).toEqual([])
		f.restart()
		await new ObjectDeletionQueue(f.db, async key => {
			removed.push(key)
		}).drain(undefined, now)
		expect(removed).toEqual([])
		await new ObjectDeletionQueue(f.db, async key => {
			removed.push(key)
		}).drain(undefined, now + CAPTURE_READER_LEASE_MS)
		expect(removed).toEqual([memory.key])
		expect(() => new CaptureReaders(f.db).renew(active, now + CAPTURE_READER_LEASE_MS)).toThrow('expired')
	} finally {
		await f.close()
	}
})

test('reader budgets are owner scoped and global, and expired leases cannot be revived', () => {
	const db = new Database(':memory:')
	try {
		migrateCaptureReaders(db)
		db.exec('CREATE TABLE memories(object_key TEXT,user_id TEXT,deleted_at INTEGER)')
		const readers = new CaptureReaders(db),
			key = `owner/${randomUUID()}.glb`
		const addKey = (owner: string) => {
			const objectKey = `${owner}/${randomUUID()}.glb`
			db.query('INSERT INTO memories VALUES (?,?,NULL)').run(objectKey, owner)
			return objectKey
		}
		db.query('INSERT INTO memories VALUES (?,?,NULL)').run(key, 'owner')
		expect(() => readers.open('../secret', 0)).toThrow('key')
		for (let i = 0; i < 8; i++) readers.open(key, 0)
		expect(() => readers.open(key, 0)).toThrow('Too many')
		for (let i = 0; i < 56; i++) readers.open(addKey(`other${i}`), 0)
		expect(() => readers.open(addKey('another'), 0)).toThrow('Too many')
		const id = readers.open(key, CAPTURE_READER_LEASE_MS)
		expect(db.query('SELECT COUNT(*) AS count FROM capture_readers').get()).toEqual({ count: 1 })
		expect(() => readers.renew(id, 2 * CAPTURE_READER_LEASE_MS)).toThrow('expired')
		readers.close(id)
		readers.close(id)
	} finally {
		db.close()
	}
})
