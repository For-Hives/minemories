import { Database } from 'bun:sqlite'
import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateObjectDeletionClaims, ObjectDeletionQueue } from './object-deletions'

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

test('migration preserves old deletion jobs, their retries and new claim metadata across restarts', () => {
	const old = new Database(':memory:')
	try {
		old.exec(`CREATE TABLE object_deletions (object_key TEXT PRIMARY KEY, created_at INTEGER NOT NULL,
			attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0);
			INSERT INTO object_deletions VALUES ('old/job.glb', 10, 3, 1000);`)
		migrateObjectDeletionClaims(old)
		expect(old.query('SELECT * FROM object_deletions').get()).toEqual({
			object_key: 'old/job.glb',
			created_at: 10,
			attempts: 3,
			next_attempt_at: 1000,
			user_id: null,
			size: null,
			discard_upload: 0,
			generation: '',
		})
		old.query('UPDATE object_deletions SET user_id = ?, size = ?, discard_upload = 1').run('old', 1234)
		migrateObjectDeletionClaims(old)
		expect(old.query('SELECT user_id, size, discard_upload, attempts FROM object_deletions').get()).toEqual({
			user_id: 'old',
			size: 1234,
			discard_upload: 1,
			attempts: 3,
		})
	} finally {
		old.close()
	}
})

test('an upload holds its cleanup intent until release and a new queue resumes an abandoned intent', async () => {
	const key = 'owner/legacy-held.glb'
	database.query('INSERT INTO object_deletions (object_key, created_at, discard_upload) VALUES (?, 0, 1)').run(key)
	const removed: Array<[string, boolean]> = []
	const queue = new ObjectDeletionQueue(database, (objectKey, discardUpload) => {
		removed.push([objectKey, discardUpload])
		return Promise.resolve()
	})
	const release = queue.hold(key)
	await queue.drain(key, 0)
	expect(removed).toEqual([])
	expect(database.query('SELECT attempts FROM object_deletions WHERE object_key = ?').get(key)).toEqual({ attempts: 0 })
	release()
	release()
	await queue.drain(key, 0)
	expect(removed).toEqual([[key, true]])
	enqueue(key)
	queue.hold(key)
	await new ObjectDeletionQueue(database, () => Promise.resolve()).drain(key, 0)
	expect(database.query('SELECT object_key FROM object_deletions WHERE object_key = ?').get(key)).toBeNull()
})

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
	const waiting = queue.drain('owner/second.glb', 0)
	expect(waiting).toBe(running)
	expect(calls).toBe(1)
	release?.()
	await running
	await waiting
	expect(database.query('SELECT object_key FROM object_deletions').all()).toEqual([{ object_key: 'owner/second.glb' }])
	const second = queue.drain(undefined, 0)
	release?.()
	await second
	expect(calls).toBe(2)
})

test('a stale batch cannot remove a held upload that committed while an earlier deletion was awaiting storage', async () => {
	enqueue('owner/slow-cleanup.glb')
	enqueue('owner/just-published.glb')
	let finishSlow: (() => void) | undefined
	const removed: string[] = []
	const queue = new ObjectDeletionQueue(database, key => {
		removed.push(key)
		return new Promise<void>(resolve => {
			finishSlow = resolve
		})
	})
	const release = queue.hold('owner/just-published.glb')
	const pending = queue.drain(undefined, 0)
	database.query('DELETE FROM object_deletions WHERE object_key = ?').run('owner/just-published.glb')
	release()
	finishSlow?.()
	await pending
	expect(removed).toEqual(['owner/slow-cleanup.glb'])
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

test.each([false, true])(
	'a refreshed deletion intent survives completion of an older request (failed=%s)',
	async failed => {
		const key = `owner/generation-${failed}.glb`
		database.query("INSERT INTO object_deletions(object_key,created_at,generation) VALUES (?,0,'old')").run(key)
		let finish: (() => void) | undefined
		const queue = new ObjectDeletionQueue(
			database,
			() =>
				new Promise<void>((resolve, reject) => {
					finish = () => {
						if (failed) reject(new Error('old request failed'))
						else resolve()
					}
				})
		)
		const pending = queue.drain(key, 0)
		// Simulate another process consuming the old job, then a late PUT recreating its cleanup intent.
		database.query('DELETE FROM object_deletions WHERE object_key=?').run(key)
		database.query("INSERT INTO object_deletions(object_key,created_at,generation) VALUES (?,1,'fresh')").run(key)
		finish?.()
		await pending
		expect(
			database.query('SELECT generation,attempts,next_attempt_at FROM object_deletions WHERE object_key=?').get(key)
		).toEqual({ generation: 'fresh', attempts: 0, next_attempt_at: 0 })
		await new ObjectDeletionQueue(database, () => Promise.resolve()).drain(key, 1)
		expect(database.query('SELECT 1 FROM object_deletions WHERE object_key=?').get(key)).toBeNull()
	}
)

test('concurrent drains await one provider acknowledgement and shutdown leaves unstarted cleanup durable', async () => {
	const first = 'owner/shutdown-first.glb',
		second = 'owner/shutdown-second.glb'
	enqueue(first)
	enqueue(second)
	database.query('UPDATE object_deletions SET created_at=1 WHERE object_key=?').run(second)
	const entered = Promise.withResolvers<void>(),
		release = Promise.withResolvers<void>(),
		removed: string[] = []
	const queue = new ObjectDeletionQueue(database, async key => {
		removed.push(key)
		entered.resolve()
		await release.promise
	})
	const pass = queue.drain(undefined, 0)
	await entered.promise
	expect(queue.drain(second, 0)).toBe(pass)
	let stopped = false
	const stop = queue.stop().then(() => {
		stopped = true
	})
	await Promise.resolve()
	expect(stopped).toBe(false)
	expect(database.query('SELECT object_key FROM object_deletions WHERE object_key=?').get(first)).not.toBeNull()
	release.resolve()
	await stop
	await pass
	expect(removed).toHaveLength(1)
	expect(database.query('SELECT object_key FROM object_deletions WHERE object_key=?').get(second)).not.toBeNull()
	await queue.maintain(0)
	expect(removed).toHaveLength(1)
	await new ObjectDeletionQueue(database, async key => {
		removed.push(key)
	}).drain(second, 0)
	expect(removed).toHaveLength(2)
})

test('shutdown waits for failed provider cleanup to persist its retry, then permits SQLite to close', async () => {
	const db = new Database(':memory:')
	db.exec(`CREATE TABLE memories(object_key TEXT); CREATE TABLE object_deletions(object_key TEXT PRIMARY KEY,created_at INTEGER,attempts INTEGER DEFAULT 0,next_attempt_at INTEGER DEFAULT 0);
	 INSERT INTO object_deletions(object_key,created_at) VALUES ('owner/failed-stop.glb',0)`)
	const entered = Promise.withResolvers<void>(),
		release = Promise.withResolvers<void>()
	const queue = new ObjectDeletionQueue(db, async () => {
		entered.resolve()
		await release.promise
		throw new Error('Storage offline')
	})
	const pass = queue.maintain(0)
	await entered.promise
	const stop = queue.stop()
	release.resolve()
	await stop
	await pass
	expect(db.query('SELECT attempts,next_attempt_at FROM object_deletions').get()).toEqual({
		attempts: 1,
		next_attempt_at: 60_000,
	})
	db.close()
	await queue.stop()
	await queue.drain()
})
