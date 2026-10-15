import { expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { ObjectDeletionQueue } from './object-deletions'
import { temporalFixture } from './test-support/timelapse-fixture'
import { TimelapseMaintenance } from './timelapse-maintenance'

function worker(f: Awaited<ReturnType<typeof temporalFixture>>, now = () => 0) {
	return new TimelapseMaintenance(
		f.db,
		f.files({ now, heartbeatMs: 30_000 }),
		new ObjectDeletionQueue(f.db, async key => rm(f.local(key), { force: true })),
		now
	)
}
function count(f: Awaited<ReturnType<typeof temporalFixture>>) {
	return f.db.query('SELECT COUNT(*) AS count FROM timelapse_frames').get()
}

test('each maintenance pass converts at most one actual frame, skips legacy metadata and drains prior cleanup', async () => {
	const f = await temporalFixture()
	try {
		await f.add({ worldName: 'legacy' })
		const bad = await f.add()
		f.db.query("UPDATE memories SET metadata_json='invalid json' WHERE id=?").run(bad.id)
		await f.add()
		await f.add()
		const task = worker(f)
		await Promise.all([task.maintain(), task.maintain()])
		expect(count(f)).toEqual({ count: 1 })
		await task.maintain()
		expect(count(f)).toEqual({ count: 2 })
		await task.maintain()
		expect(count(f)).toEqual({ count: 2 })
		await task.stop()
		await f.add()
		await task.maintain()
		expect(count(f)).toEqual({ count: 2 })
	} finally {
		await f.close()
	}
})

test('retry times and exponential backoff survive a database restart without losing the original', async () => {
	const f = await temporalFixture()
	try {
		const first = await f.add(),
			write = f.objects.write
		f.objects.write = async () => {
			throw new Error('provider unavailable')
		}
		let now = 0,
			task = worker(f, () => now)
		await task.maintain()
		expect(f.db.query('SELECT attempts,next_attempt_at FROM timelapse_work').get()).toEqual({
			attempts: 1,
			next_attempt_at: 60_000,
		})
		await task.maintain()
		expect(count(f)).toEqual({ count: 0 })
		await task.stop()
		f.restart()
		now = 60_000
		task = worker(f, () => now)
		await task.maintain()
		expect(f.db.query('SELECT attempts,next_attempt_at FROM timelapse_work').get()).toEqual({
			attempts: 2,
			next_attempt_at: 180_000,
		})
		expect(await f.raw(first.key)).toEqual(f.data)
		f.objects.write = write
		now = 179_999
		await task.maintain()
		expect(count(f)).toEqual({ count: 0 })
		now = 180_000
		await task.maintain()
		expect(count(f)).toEqual({ count: 1 })
		expect(f.db.query('SELECT * FROM timelapse_work').all()).toEqual([])
		await task.stop()
	} finally {
		await f.close()
	}
})

test('shutdown aborts an active provider request and waits until cleanup intent is durable', async () => {
	const f = await temporalFixture()
	try {
		const first = await f.add()
		let started: () => void = () => {}
		const seen = new Promise<void>(resolve => {
			started = resolve
		})
		f.objects.write = async (_key, _data, signal) =>
			new Promise<void>((_resolve, reject) => {
				signal.addEventListener('abort', () => reject(signal.reason), { once: true })
				started()
			})
		const task = worker(f),
			running = task.maintain()
		await seen
		expect(task.maintain()).toBe(running)
		await task.stop()
		await running
		expect(await f.raw(first.key)).toEqual(f.data)
		expect(f.db.query('SELECT COUNT(*) AS count FROM object_deletions').get()).toEqual({ count: 1 })
		expect(f.db.query('SELECT * FROM timelapse_leases').all()).toEqual([])
	} finally {
		await f.close()
	}
})

test('invalid tagged candidates get a bounded retry without starving valid snapshots', async () => {
	const f = await temporalFixture()
	try {
		const bad = await f.add({ worldId: 'bad' })
		f.db.query('UPDATE memories SET created_at=-1 WHERE id=?').run(bad.id)
		await f.add()
		const task = worker(f)
		await task.maintain()
		expect(count(f)).toEqual({ count: 0 })
		await task.maintain()
		expect(count(f)).toEqual({ count: 1 })
		await task.stop()
	} finally {
		await f.close()
	}
})

test('an unavailable SQLite maintenance pass is contained', async () => {
	const f = await temporalFixture()
	try {
		const task = worker(f)
		f.db.exec('DROP TABLE timelapse_work')
		await task.maintain()
		await task.stop()
	} finally {
		await f.close()
	}
})
