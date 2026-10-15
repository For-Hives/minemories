import { expect, test } from 'bun:test'
import { once } from 'node:events'
import { Readable } from 'node:stream'
import { CAPTURE_READER_LEASE_MS } from './capture-readers'
import { readAll, temporalFixture } from './test-support/timelapse-fixture'

test('an original download survives conversion and queued cleanup, then releases its physical object', async () => {
	const f = await temporalFixture()
	try {
		const capture = await f.add(),
			files = f.files(),
			body = await files.read(capture.key)
		expect(await files.convert(capture.id)).toBe(true)
		await f.drain()
		expect(await f.raw(capture.key)).toEqual(f.data)
		expect(await readAll(body)).toEqual(f.data)
		expect(f.db.query('SELECT COUNT(*) AS count FROM capture_readers').get()).toEqual({ count: 0 })
		await f.drain()
		await expect(f.raw(capture.key)).rejects.toThrow()
		expect(await readAll(await files.read(f.key(capture.id)))).toEqual(f.data)
	} finally {
		await f.close()
	}
})

test('original cancellation covers pending provider requests, unread bodies and aborts during open', async () => {
	const f = await temporalFixture()
	try {
		const capture = await f.add({}),
			files = f.files(),
			originalRead = f.objects.read,
			parent = new AbortController()
		let started: () => void = () => {}
		const seen = new Promise<void>(resolve => {
			started = resolve
		})
		f.objects.read = async (_key, signal) =>
			new Promise<Readable>((_resolve, reject) => {
				signal.addEventListener('abort', () => reject(signal.reason), { once: true })
				started()
			})
		const pending = files.read(capture.key, parent.signal)
		await seen
		expect(f.db.query('SELECT COUNT(*) AS count FROM capture_readers').get()).toEqual({ count: 1 })
		parent.abort(new Error('caller cancelled'))
		await expect(pending).rejects.toThrow('caller cancelled')
		expect(f.db.query('SELECT COUNT(*) AS count FROM capture_readers').get()).toEqual({ count: 0 })
		f.objects.read = originalRead
		const unread = await files.read(capture.key),
			closed = once(unread, 'close')
		unread.destroy()
		await closed
		expect(f.db.query('SELECT COUNT(*) AS count FROM capture_readers').get()).toEqual({ count: 0 })
		const cancelled = new AbortController(),
			source = Readable.from([f.data])
		f.objects.read = async () => {
			cancelled.abort()
			return source
		}
		await expect(files.read(capture.key, cancelled.signal)).rejects.toThrow()
		expect(source.destroyed).toBe(true)
	} finally {
		await f.close()
	}
})

test('original leases renew while active, but timeout and lost leases abort without leaving readers', async () => {
	const f = await temporalFixture()
	try {
		const capture = await f.add({})
		let now = 0
		const files = f.files({ now: () => now, heartbeatMs: 1 }),
			body = await files.read(capture.key),
			failure = once(body, 'error')
		now = CAPTURE_READER_LEASE_MS
		expect((await failure)[0]).toBeInstanceOf(Error)
		await new Promise(resolve => setImmediate(resolve))
		expect(f.db.query('SELECT COUNT(*) AS count FROM capture_readers').get()).toEqual({ count: 0 })
		const lost = await files.read(capture.key),
			lostFailure = once(lost, 'error')
		f.db.exec('DELETE FROM capture_readers')
		expect(String((await lostFailure)[0])).toContain('expired')
		const active = await files.read(capture.key)
		now++
		await Bun.sleep(10)
		expect(f.db.query('SELECT expires_at FROM capture_readers').get()).toEqual({
			expires_at: now + CAPTURE_READER_LEASE_MS,
		})
		expect(await readAll(active)).toEqual(f.data)
		const cancelled = new AbortController(),
			symbol = Symbol('cancelled'),
			cancelBody = await files.read(capture.key, cancelled.signal),
			cancelFailure = once(cancelBody, 'error')
		cancelled.abort(symbol)
		expect(String((await cancelFailure)[0])).toContain('Capture read aborted')
	} finally {
		await f.close()
	}
})

test('provider stream failure before the caller consumes bytes closes the original reader', async () => {
	const f = await temporalFixture()
	try {
		const capture = await f.add({}),
			source = new Readable({ read() {} })
		f.objects.read = async () => source
		const body = await f.files().read(capture.key),
			failed = once(body, 'error')
		source.destroy(new Error('provider stream failed'))
		expect(String((await failed)[0])).toContain('provider stream failed')
		await new Promise(resolve => setImmediate(resolve))
		expect(f.db.query('SELECT COUNT(*) AS count FROM capture_readers').get()).toEqual({ count: 0 })
	} finally {
		await f.close()
	}
})
