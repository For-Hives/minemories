import { expect, test } from 'bun:test'
import { captureTimeKey, WORLD_EVOLUTION_FRAMES } from '@minemories/api-contract'
import { parseMetadata } from './memory-metadata'
import { minimalGlb } from './test-support/glb-fixture'
import { frameMetadata, temporalFixture } from './test-support/timelapse-fixture'
import { migrateTimelapseIndex, TimelapseIndex } from './timelapse-index'

const payload = minimalGlb(),
	base = '2026-10-15T01:00:00'
function options(memoryId: string, anchorId?: string) {
	return { memoryId, ...(anchorId ? { anchorId } : {}), direction: 'around' as const }
}

test('UTC ordering retains sub-millisecond precision, equivalent spellings and rejects unsupported timestamps', () => {
	const whole = captureTimeKey(`${base}Z`)
	expect(whole).not.toBeNull()
	expect(captureTimeKey(`${base}.000000000Z`)).toBe(whole)
	expect(captureTimeKey('2026-10-15T01:00Z')).toBeNull()
	expect(String(captureTimeKey(`${base}.123456788Z`)) < String(captureTimeKey(`${base}.123456789Z`))).toBe(true)
	expect(captureTimeKey('invalid')).toBeNull()
	expect(
		parseMetadata(JSON.stringify({ captureStartedAt: `${base}.123456789Z`, captureFinishedAt: `${base}.123456788Z` }))
	).toBeNull()
})

test('around footprints tolerate changed depth while dimensions, worlds, owners, modes and selections stay separate', async () => {
	const f = await temporalFixture()
	try {
		const index = new TimelapseIndex(f.db),
			first = await f.add(frameMetadata, payload)
		const deeper = await f.add(
			{
				...frameMetadata,
				captureBounds: { ...frameMetadata.captureBounds, minY: -4 },
				captureOrigin: { x: 1, y: -1, z: 1 },
			},
			payload
		)
		const different = await Promise.all(
			[
				{ ...frameMetadata, dimension: 'minecraft:the_nether' },
				{ ...frameMetadata, worldId: 'c'.repeat(64) },
				{ ...frameMetadata, zoneId: 'd'.repeat(64) },
				{ ...frameMetadata, captureMode: 'selection' },
				{
					...frameMetadata,
					captureBounds: { ...frameMetadata.captureBounds, minX: 2, maxX: 4 },
					captureOrigin: { x: 3, y: 1, z: 1 },
				},
			].map(metadata => f.add(metadata, payload))
		)
		const other = await f.add(frameMetadata, payload)
		f.db.query("UPDATE memories SET user_id='other' WHERE id=?").run(other.id)
		expect(index.backfill()).toBe(8)
		const series = index.frames('owner', options(first.id))
		expect(series.totalFrames).toBe(2)
		expect(series.frames.every(frame => frame.timeSource === 'upload' && frame.at === '1970-01-01T00:00:00.000Z')).toBe(
			true
		)
		expect(new Set(series.frames.map(frame => frame.id))).toEqual(new Set([first.id, deeper.id]))
		for (const isolated of different)
			expect(index.frames('owner', options(isolated.id)).seriesId).not.toBe(series.seriesId)
		expect(index.frames('other', options(other.id)).seriesId).not.toBe(series.seriesId)
		expect(() => index.frames('owner', options(other.id))).toThrow()
		expect(() => index.frames('owner', options(first.id, different[0]?.id))).toThrow()
	} finally {
		await f.close()
	}
})

test('exact selection corners participate in the identity even when a client reuses its zone hash', async () => {
	const f = await temporalFixture()
	try {
		const index = new TimelapseIndex(f.db)
		const first = await f.add({ ...frameMetadata, captureMode: 'selection' }, payload)
		const next = await f.add(
			{
				...frameMetadata,
				captureMode: 'selection',
				captureBounds: { ...frameMetadata.captureBounds, minY: -4 },
				captureOrigin: { x: 1, y: -1, z: 1 },
			},
			payload
		)
		index.backfill()
		expect(index.frames('owner', options(first.id)).seriesId).not.toBe(index.frames('owner', options(next.id)).seriesId)
	} finally {
		await f.close()
	}
})

test('capture start precedes upload date and nanosecond ties are ordered by memory id', async () => {
	const f = await temporalFixture()
	try {
		const index = new TimelapseIndex(f.db)
		const rows = await Promise.all(
			[`${base}.123456789Z`, `${base}.123456788Z`, `${base}.123456789Z`].map(captureStartedAt =>
				f.add(
					{ ...frameMetadata, captureStartedAt, captureFinishedAt: `${base}.9Z`, capturedAt: `${base}.9Z` },
					payload
				)
			)
		)
		index.backfill()
		const [first, earlier, last] = rows
		if (!(first && earlier && last)) throw new Error('Missing frame')
		const page = index.frames('owner', options(first.id))
		const tie = [first.id, last.id].sort()
		expect(page.frames.map(row => row.id)).toEqual([earlier.id, ...tie])
		expect(page.frames.every(row => row.timeSource === 'capture')).toBe(true)
		expect(page.frames[0]?.at).toBe(`${base}.123456788Z`)
	} finally {
		await f.close()
	}
})

test('bounded bidirectional windows resume around an existing state and never invent missing captures', async () => {
	const f = await temporalFixture()
	try {
		const index = new TimelapseIndex(f.db)
		const rows = await Promise.all(
			Array.from({ length: 300 }, async (_, number) => {
				const frame = await f.add(
					{ ...frameMetadata, capturedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, number)).toISOString() },
					payload
				)
				index.put(frame.id)
				return frame
			})
		)
		const middle = rows[150]
		if (!middle) throw new Error('Missing middle frame')
		const page = index.frames('owner', options(middle.id))
		expect(page.frames).toHaveLength(128)
		expect(page.totalFrames).toBe(300)
		expect(page.hasPrevious).toBe(true)
		expect(page.hasNext).toBe(true)
		expect(page.frames.map(frame => frame.id)).toEqual(rows.slice(87, 215).map(row => row.id))
		const oldest = page.frames[0],
			newest = page.frames.at(-1)
		if (!(oldest && newest)) throw new Error('Missing page boundaries')
		const earlier = index.frames('owner', { ...options(middle.id, oldest.id), direction: 'before' })
		expect(earlier.frames.map(row => row.id)).toEqual(rows.slice(0, 87).map(row => row.id))
		expect(earlier.hasPrevious).toBe(false)
		expect(earlier.hasNext).toBe(true)
		const later = index.frames('owner', { ...options(middle.id, newest.id), direction: 'after' })
		expect(later.frames.map(row => row.id)).toEqual(rows.slice(215).map(row => row.id))
		expect(later.hasNext).toBe(false)
		expect(later.hasPrevious).toBe(true)
		const last = rows.at(-1)
		if (!last) throw new Error('Missing last frame')
		expect(index.frames('owner', { ...options(middle.id, last.id), direction: 'after' }).frames).toEqual([])
	} finally {
		await f.close()
	}
})

test('soft deletion, restore, renamed captures and purge follow current owner state without losing ordering', async () => {
	const f = await temporalFixture()
	try {
		const index = new TimelapseIndex(f.db),
			first = await f.add(frameMetadata, payload),
			second = await f.add(frameMetadata, payload)
		index.backfill()
		f.db.query('UPDATE memories SET name=? WHERE id=?').run('Renamed', first.id)
		expect(index.frames('owner', options(first.id)).frames.find(frame => frame.id === first.id)?.name).toBe('Renamed')
		f.db.query('UPDATE memories SET deleted_at=1 WHERE id=?').run(second.id)
		expect(index.frames('owner', options(first.id)).totalFrames).toBe(1)
		expect(() => index.frames('owner', options(second.id))).toThrow()
		f.db.query('UPDATE memories SET deleted_at=NULL WHERE id=?').run(second.id)
		expect(index.frames('owner', options(first.id)).totalFrames).toBe(2)
		f.db.query('DELETE FROM memories WHERE id=?').run(second.id)
		expect(index.frames('owner', options(first.id)).totalFrames).toBe(1)
		expect(f.db.query('SELECT COUNT(*) AS count FROM timelapse_index').get()).toEqual({ count: 1 })
	} finally {
		await f.close()
	}
})

test('legacy and malformed imports remain ordinary memories and invalid backfills cannot starve newer captures', async () => {
	const f = await temporalFixture()
	try {
		const index = new TimelapseIndex(f.db),
			bad = await f.add({ worldId: 'bad' }, payload)
		f.db.query('UPDATE memories SET created_at=-1 WHERE id=?').run(bad.id)
		await f.add({ worldName: 'legacy' }, payload)
		const valid = await Promise.all(Array.from({ length: 25 }, () => f.add(frameMetadata, payload)))
		expect(index.backfill()).toBe(19)
		expect(index.backfill()).toBe(6)
		expect(index.backfill()).toBe(0)
		expect(() => index.frames('owner', options(bad.id))).toThrow('no temporal identity')
		expect(index.put('missing')).toBe(false)
		f.db.query('UPDATE memories SET metadata_json=?,created_at=0 WHERE id=?').run(JSON.stringify(frameMetadata), bad.id)
		expect(index.put(bad.id)).toBe(true)
		const first = valid[0]
		if (!first) throw new Error('Missing valid frame')
		expect(index.frames('owner', options(first.id)).totalFrames).toBe(26)
		f.restart()
		migrateTimelapseIndex(f.db)
		expect(new TimelapseIndex(f.db).frames('owner', options(first.id)).totalFrames).toBe(26)
	} finally {
		await f.close()
	}
})

test('invalid size, unsupported dates and malformed JSON are rejected rather than assigned a misleading capture time', async () => {
	const f = await temporalFixture()
	try {
		const index = new TimelapseIndex(f.db),
			first = await f.add(frameMetadata, payload)
		for (const created of [-1, 8_640_000_000_000_001, 253_402_300_800_000]) {
			f.db.query('UPDATE memories SET created_at=? WHERE id=?').run(created, first.id)
			expect(index.put(first.id)).toBe(false)
		}
		f.db.query('UPDATE memories SET created_at=0,size=0 WHERE id=?').run(first.id)
		expect(index.put(first.id)).toBe(false)
		f.db.query("UPDATE memories SET size=48,metadata_json='bad' WHERE id=?").run(first.id)
		expect(index.put(first.id)).toBe(false)
		f.db.query('UPDATE memories SET metadata_json=NULL WHERE id=?').run(first.id)
		expect(index.put(first.id)).toBe(false)
	} finally {
		await f.close()
	}
})

test('ambiguous legacy remote identities stay out of series while explicit session and namespace scopes remain distinct', async () => {
	const f = await temporalFixture()
	try {
		const index = new TimelapseIndex(f.db),
			remote = { ...frameMetadata, serverName: 'Remote', seed: null }
		const old = await f.add(remote, payload)
		expect(parseMetadata(JSON.stringify(remote))).not.toBeNull()
		expect(index.put(old.id)).toBe(false)
		await expect(Promise.resolve().then(() => index.frames('owner', options(old.id)))).rejects.toThrow(
			'no temporal identity'
		)
		const session = await f.add({ ...remote, worldScope: 'session' }, payload),
			persistent = await f.add({ ...remote, worldScope: 'namespace' }, payload)
		index.backfill()
		const a = index.frames('owner', options(session.id)),
			b = index.frames('owner', options(persistent.id))
		expect(a.scope).toBe('session')
		expect(b.scope).toBe('namespace')
		expect(a.seriesId).not.toBe(b.seriesId)
		expect(parseMetadata(JSON.stringify({ ...remote, worldScope: 'invalid' }))).toBeNull()
		expect(parseMetadata(JSON.stringify({ worldScope: 'session' }))).toBeNull()
		expect(await f.files().convert(old.id)).toBe(true)
	} finally {
		await f.close()
	}
})

test('the scope migration rebuilds derived caches once and never removes original memories', async () => {
	const f = await temporalFixture()
	try {
		const index = new TimelapseIndex(f.db),
			local = await f.add(frameMetadata, payload),
			remote = await f.add({ ...frameMetadata, serverName: 'Old remote' }, payload)
		index.put(local.id)
		f.db
			.query('INSERT INTO timelapse_index (memory_id,user_id,series_key,time_key,capture_json) VALUES (?,?,?,?,?)')
			.run(remote.id, 'owner', 'old', 'old', '{}')
		f.db.exec('UPDATE timelapse_index_version SET version=1')
		migrateTimelapseIndex(f.db)
		expect(f.db.query('SELECT COUNT(*) AS count FROM memories').get()).toEqual({ count: 2 })
		expect(f.db.query('SELECT COUNT(*) AS count FROM timelapse_index').get()).toEqual({ count: 0 })
		expect(index.frames('owner', options(local.id)).scope).toBe('world')
		expect(() => index.frames('owner', options(remote.id))).toThrow('no temporal identity')
		migrateTimelapseIndex(f.db)
		expect(f.db.query('SELECT COUNT(*) AS count FROM timelapse_index').get()).toEqual({ count: 1 })
	} finally {
		await f.close()
	}
})

test('one world gathers every zone and mode of a world and dimension, oldest first, without other owners or worlds', async () => {
	const f = await temporalFixture()
	try {
		const index = new TimelapseIndex(f.db)
		const at = (second: number) => ({
			captureStartedAt: `${base}.${second}Z`,
			captureFinishedAt: `${base}.9Z`,
		})
		const newest = await f.add({ ...frameMetadata, ...at(5) }, payload)
		const other = await f.add(
			{
				...frameMetadata,
				...at(3),
				zoneId: 'd'.repeat(64),
				captureBounds: { ...frameMetadata.captureBounds, minX: 2, maxX: 4 },
				captureOrigin: { x: 3, y: 1, z: 1 },
			},
			payload
		)
		const selection = await f.add({ ...frameMetadata, ...at(1), captureMode: 'selection' }, payload)
		await f.add({ ...frameMetadata, ...at(2), dimension: 'minecraft:the_nether' }, payload)
		await f.add({ ...frameMetadata, ...at(2), worldId: 'c'.repeat(64) }, payload)
		await f.add({ ...frameMetadata, ...at(2), worldScope: 'session' }, payload)
		const foreign = await f.add({ ...frameMetadata, ...at(4) }, payload)
		f.db.query("UPDATE memories SET user_id='other' WHERE id=?").run(foreign.id)
		const rejected = await f.add({ ...frameMetadata, ...at(4), captureOrigin: { x: 9, y: 9, z: 9 } }, payload)
		const world = index.world('owner', newest.id)
		expect(world.frames.map(frame => frame.id)).toEqual([selection.id, other.id, newest.id])
		expect(world).toMatchObject({ totalFrames: 3, truncated: false, scope: 'world', dimension: 'minecraft:overworld' })
		expect(world.totalBytes).toBe(payload.length * 3)
		expect(index.world('owner', selection.id).worldKey).toBe(world.worldKey)
		expect(f.db.query('SELECT 1 FROM timelapse_index_rejected WHERE memory_id=?').get(rejected.id)).not.toBeNull()
		expect(() => index.world('owner', foreign.id)).toThrow()
		expect(index.world('other', foreign.id).worldKey).not.toBe(world.worldKey)
	} finally {
		await f.close()
	}
})

test('a large world returns its most recent frames and reports the truncation', async () => {
	const f = await temporalFixture()
	try {
		const index = new TimelapseIndex(f.db)
		const ids: string[] = []
		for (let second = 0; second < WORLD_EVOLUTION_FRAMES + 2; second++) {
			const captureStartedAt = new Date(Date.UTC(2026, 9, 15, 1, 0, second)).toISOString()
			// biome-ignore lint/performance/noAwaitInLoops: frames are inserted in a deterministic order.
			ids.push((await f.add({ ...frameMetadata, captureStartedAt }, payload)).id)
		}
		const world = index.world('owner', ids[0] as string)
		expect(world.totalFrames).toBe(WORLD_EVOLUTION_FRAMES + 2)
		expect(world.truncated).toBe(true)
		expect(world.frames.map(frame => frame.id)).toEqual(ids.slice(2))
	} finally {
		await f.close()
	}
})

test('an index created before world keys gains the column and is rebuilt', async () => {
	const f = await temporalFixture()
	try {
		const memory = await f.add(frameMetadata, payload)
		f.db.exec(`DROP TABLE timelapse_index;CREATE TABLE timelapse_index (
		 memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
		 user_id TEXT NOT NULL,series_key TEXT NOT NULL,time_key TEXT NOT NULL,capture_json TEXT NOT NULL);
		 UPDATE timelapse_index_version SET version=2`)
		f.db
			.query('INSERT INTO timelapse_index (memory_id,user_id,series_key,time_key,capture_json) VALUES (?,?,?,?,?)')
			.run(memory.id, 'owner', 'old', 'old', '{}')
		migrateTimelapseIndex(f.db)
		expect(f.db.query('SELECT COUNT(*) AS count FROM timelapse_index').get()).toEqual({ count: 0 })
		expect(new TimelapseIndex(f.db).world('owner', memory.id).frames.map(frame => frame.id)).toEqual([memory.id])
	} finally {
		await f.close()
	}
})
