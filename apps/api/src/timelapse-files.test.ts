import { expect, test } from 'bun:test'
import { once } from 'node:events'
import { writeFile } from 'node:fs/promises'
import { readAll, temporalFixture } from './test-support/timelapse-fixture'
import { TIMELAPSE_LEASE_MS } from './timelapse-catalog'
import { MAX_TIMELAPSE_CHUNK } from './timelapse-chunks'

test('real filesystem frames survive original deletion and restart, with bounded writes and reused chunks', async () => {
	const f = await temporalFixture()
	try {
		const originalWrite = f.objects.write,
			writes: number[] = []
		f.objects.write = async (key, data, signal) => {
			writes.push(data.length)
			await originalWrite(key, data, signal)
		}
		const first = await f.add(),
			files = f.files()
		f.db.query('INSERT INTO object_deletions(object_key,created_at) VALUES (?,0)').run(first.key)
		expect(await files.convert(first.id)).toBe(true)
		expect(f.db.query('SELECT user_id,size FROM object_deletions WHERE object_key=?').get(first.key)).toEqual({
			user_id: 'owner',
			size: f.data.length,
		})
		expect(writes.length).toBeGreaterThan(1)
		expect(Math.max(...writes)).toBeLessThanOrEqual(MAX_TIMELAPSE_CHUNK)
		expect(await files.convert(first.id)).toBe(false) // Cleanup debt blocks another staging allocation.
		await f.drain()
		await expect(f.raw(first.key)).rejects.toThrow()
		const next = await f.add(),
			previous = writes.length
		expect(await files.convert(next.id)).toBe(true)
		expect(writes.length).toBe(previous)
		await f.drain()
		f.restart()
		expect(await readAll(await f.files().read(f.key(first.id)))).toEqual(f.data)
		expect(await readAll(await f.files().read(f.key(next.id)))).toEqual(f.data)
		expect(f.db.query('SELECT COUNT(*) AS count FROM timelapse_readers').get()).toEqual({ count: 0 })
		expect(await f.files().convert(first.id)).toBe(false)
	} finally {
		await f.close()
	}
})

test('legacy frames keep their raw reader and invalid identities never start conversion', async () => {
	const f = await temporalFixture()
	try {
		const old = await f.add({ worldName: 'legacy' }),
			files = f.files()
		expect(await files.convert(old.id)).toBe(false)
		expect(await files.convert('missing')).toBe(false)
		expect(await readAll(await files.read(old.key))).toEqual(f.data)
		const invalid = await f.add({ worldId: 'a'.repeat(64) })
		expect(await files.convert(invalid.id)).toBe(false)
		f.db.query('UPDATE memories SET metadata_json=NULL WHERE id=?').run(old.id)
		expect(await files.convert(old.id)).toBe(false)
	} finally {
		await f.close()
	}
})

test('failed writes leave the original intact and create durable cleanup intents for partially stored pieces', async () => {
	const f = await temporalFixture()
	try {
		const first = await f.add(),
			write = f.objects.write
		f.objects.write = async (key, data, signal) => {
			await write(key, data, signal)
			throw new Error('ack lost')
		}
		await expect(f.files().convert(first.id)).rejects.toThrow('ack lost')
		expect(f.key(first.id)).toBe(first.key)
		expect(await f.raw(first.key)).toEqual(f.data)
		expect(f.db.query('SELECT COUNT(*) AS count FROM timelapse_leases').get()).toEqual({ count: 0 })
		expect(f.db.query('SELECT COUNT(*) AS count FROM object_deletions').get()).toEqual({ count: 1 })
		await f.drain()
		f.objects.write = write
		expect(await f.files().convert(first.id)).toBe(true)
	} finally {
		await f.close()
	}
})

test('reused corrupt pieces prevent publication; corrupt or oversized pieces never complete a download', async () => {
	const f = await temporalFixture()
	try {
		const first = await f.add(),
			files = f.files()
		await files.convert(first.id)
		await f.drain()
		const key = f.key(first.id),
			manifest = f.catalog().manifest(key)
		if (!manifest?.parts[0]) throw new Error('Missing first part')
		const part = manifest.parts[0]
		await writeFile(f.local(part.objectKey), Buffer.alloc(part.size, 0))
		const second = await f.add()
		await expect(files.convert(second.id)).rejects.toThrow('integrity')
		expect(f.key(second.id)).toBe(second.key)
		await expect(readAll(await files.read(key))).rejects.toThrow('integrity')
		await writeFile(f.local(part.objectKey), Buffer.alloc(part.size + 1))
		await expect(readAll(await files.read(key))).rejects.toThrow('exceeds')
		await writeFile(f.local(part.objectKey), Buffer.alloc(1))
		await expect(readAll(await files.read(key))).rejects.toThrow('integrity')
	} finally {
		await f.close()
	}
})

test('a pinned download survives purge and cancellation before first read closes the reservation', async () => {
	const f = await temporalFixture()
	try {
		const first = await f.add(),
			files = f.files()
		await files.convert(first.id)
		await f.drain()
		const key = f.key(first.id),
			cancelled = await files.read(key)
		cancelled.destroy()
		await once(cancelled, 'close')
		expect(f.db.query('SELECT COUNT(*) AS count FROM timelapse_readers').get()).toEqual({ count: 0 })
		const active = await files.read(key)
		f.db.query('DELETE FROM memories WHERE id=?').run(first.id)
		expect(f.catalog().collect(0)).toBe(0)
		expect(await readAll(active)).toEqual(f.data)
		expect(f.catalog().collect(0)).toBeGreaterThan(0)
		await f.drain()
	} finally {
		await f.close()
	}
})

test('aborted downloads release reservations and reject callers with either error or non-error reasons', async () => {
	const f = await temporalFixture()
	try {
		const first = await f.add(),
			files = f.files()
		await files.convert(first.id)
		const controller = new AbortController()
		controller.abort(new Error('before opening'))
		await expect(files.read(f.key(first.id), controller.signal)).rejects.toThrow('before opening')
		await Promise.all(
			[new Error('cancelled'), 'cancelled'].map(async reason => {
				const next = new AbortController(),
					body = await files.read(f.key(first.id), next.signal)
				const result = readAll(body)
				next.abort(reason)
				await expect(result).rejects.toThrow()
			})
		)
		expect(f.db.query('SELECT COUNT(*) AS count FROM timelapse_readers').get()).toEqual({ count: 0 })
	} finally {
		await f.close()
	}
})

test('stalled readers time out and lost renewal leases abort active streams', async () => {
	const f = await temporalFixture()
	try {
		const first = await f.add()
		await f.files().convert(first.id)
		let now = 0
		const files = f.files({ now: () => now, heartbeatMs: 1 })
		const stalled = await files.read(f.key(first.id))
		const closed = new Promise<void>(resolve => stalled.once('close', resolve))
		const error = once(stalled, 'error')
		now = TIMELAPSE_LEASE_MS
		expect((await error)[0]).toBeInstanceOf(Error)
		await closed
		now = 0
		const missing = await files.read(f.key(first.id)),
			failure = once(missing, 'error'),
			missingClosed = new Promise<void>(resolve => missing.once('close', resolve))
		f.db.exec('DELETE FROM timelapse_readers')
		expect((await failure)[0]).toBeInstanceOf(Error)
		await missingClosed
	} finally {
		await f.close()
	}
})

test('frame digest failures are detected before emitting a complete GLB', async () => {
	const f = await temporalFixture()
	try {
		const first = await f.add(),
			files = f.files()
		await files.convert(first.id)
		f.db.exec("UPDATE timelapse_frames SET sha256='invalid'")
		await expect(readAll(await files.read(f.key(first.id)))).rejects.toThrow('frame failed')
	} finally {
		await f.close()
	}
})

test('active writers and readers renew their leases while providers complete bounded requests', async () => {
	const f = await temporalFixture()
	try {
		const first = await f.add()
		f.catalog().begin(first.id, 0)
		expect(await f.files().convert(first.id)).toBe(false)
		f.db.exec('DELETE FROM timelapse_leases')
		let now = 0
		const write = f.objects.write,
			read = f.objects.read
		f.objects.write = async (key, data, signal) => {
			now = 1000
			await new Promise(resolve => setTimeout(resolve, 5))
			expect(f.db.query('SELECT expires_at FROM timelapse_leases').get()).toEqual({
				expires_at: 1000 + TIMELAPSE_LEASE_MS,
			})
			await write(key, data, signal)
		}
		const files = f.files({ now: () => now, heartbeatMs: 1 })
		expect(await files.convert(first.id)).toBe(true)
		f.objects.read = async (key, signal) => {
			now = 2000
			await new Promise(resolve => setTimeout(resolve, 5))
			expect(f.db.query('SELECT expires_at FROM timelapse_readers').get()).toEqual({
				expires_at: 2000 + TIMELAPSE_LEASE_MS,
			})
			return read(key, signal)
		}
		expect(await readAll(await files.read(f.key(first.id)))).toEqual(f.data)
	} finally {
		await f.close()
	}
})
