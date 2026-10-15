import { expect, test } from 'bun:test'
import { migrateCaptureAccess } from './capture-access'
import { CaptureStorage } from './capture-storage'
import { CaptureArchivedError } from './object-tiers'
import { temporalFixture } from './test-support/timelapse-fixture'

function mark(f: Awaited<ReturnType<typeof temporalFixture>>, key: string, state: string, requested = 0) {
	f.db
		.query(`INSERT INTO object_tiers(object_key,state,operation_id,updated_at,restore_requested)
	 VALUES (?,?,'operation',0,?) ON CONFLICT(object_key) DO UPDATE SET state=excluded.state,restore_requested=excluded.restore_requested`)
		.run(key, state, requested)
}

test('original availability is private metadata and disabled restoration never changes storage or opening history', async () => {
	const f = await temporalFixture()
	try {
		migrateCaptureAccess(f.db)
		const memory = await f.add({}),
			service = new CaptureStorage(f.db)
		expect(service.status(() => memory.key)).toEqual({
			state: 'ready',
			readyObjects: 1,
			totalObjects: 1,
			restorationAvailable: false,
			retryAfterSeconds: null,
		})
		mark(f, memory.key, 'cold')
		expect(service.status(() => memory.key)).toMatchObject({ state: 'cold', readyObjects: 0 })
		expect(() => service.status(() => memory.key, true)).toThrow('not enabled')
		expect(f.db.query('SELECT state FROM object_tiers').get()).toEqual({ state: 'cold' })
		expect(f.db.query('SELECT last_opened_at FROM memories').get()).toEqual({ last_opened_at: null })
		expect(() => service.status(() => null, true)).toThrow('Not Found')
		expect(() => service.status(() => 'missing')).toThrow('Not Found')
	} finally {
		await f.close()
	}
})

test('deduplicated restoration includes every distinct physical part atomically and reports progress without admitting partial readers', async () => {
	const f = await temporalFixture()
	try {
		migrateCaptureAccess(f.db)
		const memory = await f.add()
		await f.files().convert(memory.id)
		const key = f.key(memory.id),
			manifest = f.catalog().manifest(key)
		if (!manifest) throw new Error('Missing manifest')
		const keys = [...new Set(manifest.parts.map(part => part.objectKey))]
		expect(keys.length).toBeGreaterThan(1)
		expect(keys.length).toBeLessThan(manifest.parts.length)
		const first = keys[0],
			second = keys[1]
		if (!(first && second)) throw new Error('Missing parts')
		const service = new CaptureStorage(f.db, true)
		mark(f, first, 'archiving')
		mark(f, second, 'cold')
		expect(service.status(() => key)).toMatchObject({
			state: 'archiving',
			totalObjects: keys.length,
			readyObjects: keys.length - 2,
			restorationAvailable: true,
			retryAfterSeconds: 5,
		})
		const requested = service.status(() => key, true, 100)
		expect(requested.state).toBe('restoring')
		expect(f.db.query('SELECT state,restore_requested FROM object_tiers ORDER BY state').all()).toEqual([
			{ state: 'archiving', restore_requested: 1 },
			{ state: 'restoring', restore_requested: 0 },
		])
		const before = f.db.serialize()
		expect(service.status(() => key, true, 200)).toEqual(requested)
		expect(f.db.serialize()).toEqual(before)
		await expect(f.files().read(key)).rejects.toThrow(CaptureArchivedError)
		expect(f.db.query('SELECT * FROM timelapse_readers').all()).toEqual([])
		mark(f, first, 'hot')
		expect(service.status(() => key)).toMatchObject({ state: 'restoring', readyObjects: keys.length - 1 })
		mark(f, second, 'hot')
		expect(service.status(() => key, true)).toMatchObject({
			state: 'ready',
			readyObjects: keys.length,
			retryAfterSeconds: null,
		})
		expect(f.db.query('SELECT last_opened_at FROM memories').get()).toEqual({ last_opened_at: null })
	} finally {
		await f.close()
	}
})

test('a shared cold part changes availability of every referencing capture and revoked access cannot request work', async () => {
	const f = await temporalFixture()
	try {
		const first = await f.add(),
			second = await f.add()
		expect(await f.files().convert(first.id)).toBe(true)
		await f.drain()
		expect(await f.files().convert(second.id)).toBe(true)
		const key = f.key(first.id),
			other = f.key(second.id),
			manifest = f.catalog().manifest(key)
		const otherParts = new Set(
			f
				.catalog()
				.manifest(other)
				?.parts.map(part => part.objectKey)
		)
		const part = manifest?.parts.find(part => otherParts.has(part.objectKey))
		if (!part) throw new Error('Missing part')
		mark(f, part.objectKey, 'cold')
		const service = new CaptureStorage(f.db, true)
		expect(service.status(() => other).state).toBe('cold')
		expect(() => service.status(() => null, true)).toThrow('Not Found')
		expect(service.status(() => other).state).toBe('cold')
		service.status(() => key, true)
		expect(service.status(() => other).state).toBe('restoring')
	} finally {
		await f.close()
	}
})
