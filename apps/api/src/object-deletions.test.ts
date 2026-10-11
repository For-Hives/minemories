import { Database } from 'bun:sqlite'
import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ObjectDeletionQueue } from './object-deletions'

const directory = mkdtempSync(join(tmpdir(), 'minemories-deletions-'))
const path = join(directory, 'db.sqlite')
process.env.DATABASE_PATH = path
let database = (await import('./database')).database
afterAll(() => {
	database.close()
	rmSync(directory, { recursive: true, force: true })
})
function enqueue(key: string) {
	database.query('INSERT INTO object_deletions (object_key, created_at) VALUES (?, 0)').run(key)
}

test('failed deletions persist across a new database connection and respect exponential backoff', async () => {
	enqueue('owner/retry.glb')
	let attempts = 0
	const unavailable = new ObjectDeletionQueue(database, () => {
		attempts += 1
		return Promise.reject(new Error('offline'))
	})
	await unavailable.drain('owner/retry.glb', 1000)
	expect(database.query('SELECT attempts, next_attempt_at FROM object_deletions').get()).toEqual({
		attempts: 1,
		next_attempt_at: 61_000,
	})
	await unavailable.drain(undefined, 60_999)
	expect(attempts).toBe(1)
	await unavailable.drain(undefined, 61_000)
	expect(attempts).toBe(2)
	expect(database.query('SELECT next_attempt_at FROM object_deletions').get()).toEqual({ next_attempt_at: 181_000 })
	database.query('UPDATE object_deletions SET attempts = 100, next_attempt_at = 0').run()
	await unavailable.drain(undefined, 200_000)
	expect(database.query('SELECT next_attempt_at FROM object_deletions').get()).toEqual({ next_attempt_at: 3_800_000 })
	database.close()
	database = new Database(path)
	const removed: string[] = []
	await new ObjectDeletionQueue(database, key => {
		removed.push(key)
		return Promise.resolve()
	}).drain(undefined, 3_800_000)
	expect(removed).toEqual(['owner/retry.glb'])
	expect(database.query('SELECT * FROM object_deletions').all()).toEqual([])
})

test('a running pass cannot overlap another pass and leaves newly queued work for the next pass', async () => {
	enqueue('owner/first.glb')
	let release: (() => void) | undefined
	let calls = 0
	const queue = new ObjectDeletionQueue(database, () => {
		calls += 1
		return new Promise<void>(resolve => {
			release = resolve
		})
	})
	const running = queue.drain(undefined, 0)
	enqueue('owner/second.glb')
	await queue.drain('owner/second.glb', 0)
	expect(calls).toBe(1)
	release?.()
	await running
	expect(database.query('SELECT object_key FROM object_deletions').all()).toEqual([{ object_key: 'owner/second.glb' }])
	const second = queue.drain(undefined, 0)
	release?.()
	await second
	expect(calls).toBe(2)
})

test('a background pass processes at most one hundred objects', async () => {
	for (let index = 0; index < 101; index += 1) enqueue(`owner/batch-${index}.glb`)
	const queue = new ObjectDeletionQueue(database, () => Promise.resolve())
	await queue.drain(undefined, 0)
	expect(database.query('SELECT COUNT(*) AS count FROM object_deletions').get()).toEqual({ count: 1 })
	await queue.drain(undefined, 0)
	expect(database.query('SELECT COUNT(*) AS count FROM object_deletions').get()).toEqual({ count: 0 })
})

test('a failed SQLite pass does not stop later maintenance', async () => {
	enqueue('owner/database-recovery.glb')
	const queue = new ObjectDeletionQueue(database, () => Promise.resolve())
	database.exec('ALTER TABLE object_deletions RENAME TO unavailable_queue')
	try {
		await expect(queue.maintain(0)).resolves.toBeUndefined()
	} finally {
		database.exec('ALTER TABLE unavailable_queue RENAME TO object_deletions')
	}
	await queue.maintain(0)
	expect(database.query('SELECT COUNT(*) AS count FROM object_deletions').get()).toEqual({ count: 0 })
})
