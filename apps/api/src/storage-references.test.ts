import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { ObjectDeletionQueue } from './object-deletions'
import { managedMemoryKey, ObjectReferences } from './storage-references'

const id = '11111111-1111-4111-8111-111111111111'
const key = `owner/${id}.glb`

test('reference checks preserve all memories, incomplete sessions and known historical owners', () => {
	const database = new Database(':memory:')
	try {
		database.exec(`CREATE TABLE memories (object_key TEXT, user_id TEXT);
			CREATE TABLE devices (user_id TEXT);
			CREATE TABLE mod_uploads (id TEXT, user_id TEXT, completed INTEGER);
			CREATE TABLE user (id TEXT);
			INSERT INTO devices VALUES ('revoked-device-owner');
			INSERT INTO user VALUES ('unpaired-account');
			INSERT INTO memories VALUES ('legacy/arbitrary-name', 'old-owner');`)
		database.query('INSERT INTO mod_uploads VALUES (?, ?, 0)').run(id, 'owner')
		const references = new ObjectReferences(database)
		for (const owner of ['revoked-device-owner', 'unpaired-account', 'old-owner', 'owner'])
			expect(references.knownOwner(owner)).toBe(true)
		expect(references.knownOwner('unknown')).toBe(false)
		expect(references.isReferenced('legacy/arbitrary-name')).toBe(true)
		expect(references.isReferenced(key)).toBe(true)
		expect(references.isReferenced(`other/${id}.glb`)).toBe(false)
		expect(references.isReferenced(`${key}.other`)).toBe(false)
		expect(references.isReferenced('unqualified.glb')).toBe(false)
		database.exec('UPDATE mod_uploads SET completed = 1')
		expect(references.isReferenced(key)).toBe(false)
	} finally {
		database.close()
	}
})

test('only canonical generated keys are eligible for automatic orphan classification', () => {
	expect(managedMemoryKey(key)).toEqual({ owner: 'owner', id })
	expect(managedMemoryKey(key.toUpperCase().replace('.GLB', '.glb'))).not.toBeNull()
	for (const unknown of [
		`../${id}.glb`,
		`/owner/${id}.glb`,
		'owner/capture.glb',
		`owner/path/${id}.glb`,
		`${key}.backup`,
	])
		expect(managedMemoryKey(unknown)).toBeNull()
	const empty = new Database(':memory:')
	try {
		const references = new ObjectReferences(empty)
		expect(references.knownOwner('owner')).toBe(false)
		expect(references.isReferenced(key)).toBe(false)
	} finally {
		empty.close()
	}
})

test('a historical deletion conflict never removes a referenced object or consumes retries', async () => {
	const database = new Database(':memory:')
	try {
		database.exec(`CREATE TABLE memories (object_key TEXT, user_id TEXT);
			CREATE TABLE mod_uploads (id TEXT, user_id TEXT, completed INTEGER);
			CREATE TABLE object_deletions (object_key TEXT PRIMARY KEY, created_at INTEGER,
				attempts INTEGER, next_attempt_at INTEGER, discard_upload INTEGER);`)
		database.query('INSERT INTO object_deletions VALUES (?, 0, 3, 0, 1)').run(key)
		database.query('INSERT INTO memories VALUES (?, ?)').run(key, 'owner')
		const removed: string[] = []
		const queue = new ObjectDeletionQueue(database, objectKey => {
			removed.push(objectKey)
			return Promise.resolve()
		})
		await queue.drain(key, 1000)
		database.exec('DELETE FROM memories')
		database.query('INSERT INTO mod_uploads VALUES (?, ?, 0)').run(id, 'owner')
		await queue.drain(key, 1000)
		expect(removed).toEqual([])
		expect(database.query('SELECT attempts, next_attempt_at FROM object_deletions').get()).toEqual({
			attempts: 3,
			next_attempt_at: 0,
		})
		database.exec('UPDATE mod_uploads SET completed = 1')
		await queue.drain(key, 1000)
		expect(removed).toEqual([key])
		expect(database.query('SELECT * FROM object_deletions').all()).toEqual([])
	} finally {
		database.close()
	}
})

test('more than one hundred old reference conflicts do not starve a later orphan cleanup', async () => {
	const database = new Database(':memory:')
	try {
		database.exec(`CREATE TABLE memories (object_key TEXT, user_id TEXT);
			CREATE TABLE mod_uploads (id TEXT PRIMARY KEY, user_id TEXT, completed INTEGER);
			CREATE TABLE object_deletions (object_key TEXT PRIMARY KEY, created_at INTEGER,
				attempts INTEGER, next_attempt_at INTEGER, discard_upload INTEGER);`)
		for (let index = 0; index < 150; index++) {
			const id = `conflict-${index}`
			const conflict = `owner/${id}.glb`
			database.query('INSERT INTO object_deletions VALUES (?, 0, 0, 0, 1)').run(conflict)
			if (index % 2) database.query('INSERT INTO memories VALUES (?, ?)').run(conflict, 'owner')
			else database.query('INSERT INTO mod_uploads VALUES (?, ?, 0)').run(id, 'owner')
		}
		database.query('INSERT INTO object_deletions VALUES (?, 1, 0, 0, 1)').run(key)
		const removed: string[] = []
		await new ObjectDeletionQueue(database, key => {
			removed.push(key)
			return Promise.resolve()
		}).drain(undefined, 1000)
		expect(removed).toEqual([key])
		expect(database.query('SELECT COUNT(*) AS count FROM object_deletions').get()).toEqual({ count: 150 })
	} finally {
		database.close()
	}
})
