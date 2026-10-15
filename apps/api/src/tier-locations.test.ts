import { Database } from 'bun:sqlite'
import { expect, spyOn, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { migrateCaptureAccess } from './capture-access'
import { COLD_WORKER_LEASE_MS, ColdStorageCatalog, type ColdStorageWork } from './cold-storage-catalog'
import { ObjectDeletionQueue } from './object-deletions'
import { migrateObjectTiers } from './object-tiers'
import { accountStorageUsage } from './storage-quota'
import { classifyStorageCandidate, ORPHAN_GRACE_MS } from './storage-reconciliation'
import { managedMemoryKey, ObjectReferences } from './storage-references'
import { readAll, temporalFixture } from './test-support/timelapse-fixture'
import { TierGarbage } from './tier-garbage'
import { TierLocations } from './tier-locations'
import { TieredObjects } from './tiered-objects'

const NOW = 100 * 86_400_000
function required(work: ColdStorageWork | null): ColdStorageWork {
	if (!work) throw new Error('Missing worker')
	return work
}
async function copy(
	f: Awaited<ReturnType<typeof temporalFixture>>,
	catalog: ColdStorageCatalog,
	work: ColdStorageWork,
	now: number
) {
	const target = catalog.reserveCopy(work, now)
	await f.objects.write(target.physicalKey, await f.raw(target.sourceKey), new AbortController().signal)
	return target
}

test('physical generations preserve logical reads, quota and references while retired and late copies are reclaimed', async () => {
	const f = await temporalFixture()
	try {
		migrateCaptureAccess(f.db)
		f.db.exec('CREATE TABLE mod_uploads(user_id TEXT,id TEXT,size INTEGER,completed INTEGER)')
		const memory = await f.add({}),
			catalog = new ColdStorageCatalog(f.db),
			locations = new TierLocations(f.db)
		expect(accountStorageUsage(f.db, 'owner')).toBe(f.data.length)
		expect(catalog.beginArchive(memory.key, 90, NOW)).toBe(true)
		const archive = required(catalog.claimNext(NOW)),
			cold = await copy(f, catalog, archive, NOW)
		expect(catalog.reserveCopy(archive, NOW)).toEqual(cold)
		expect(managedMemoryKey(cold.physicalKey)?.owner).toBe('owner')
		expect(cold.physicalKey).toContain('/tiers/')
		expect(locations.physicalInUse(cold.physicalKey)).toBe(true)
		expect(new ObjectReferences(f.db).isReferenced(cold.physicalKey)).toBe(true)
		expect(catalog.finish(archive, 'unreserved', NOW)).toBe(false)
		expect(() => locations.publish(archive, 'missing', NOW)).toThrow('acknowledgement')
		expect(catalog.finish(archive, cold.physicalKey, NOW)).toBe(true)
		expect(catalog.discardCopy(archive, cold.physicalKey, NOW)).toBe(false)
		expect(() => catalog.reserveCopy(archive, NOW)).toThrow('expired')
		expect(locations.resolve(memory.key)).toBe(cold.physicalKey)
		expect(locations.physicalInUse(memory.key)).toBe(false)
		const garbage = new TierGarbage(
			f.db,
			key => rm(f.local(key), { force: true }),
			() => NOW
		)
		await garbage.maintain()
		await expect(f.raw(memory.key)).rejects.toThrow()
		expect(await f.raw(cold.physicalKey)).toEqual(f.data)
		expect(accountStorageUsage(f.db, 'owner')).toBe(f.data.length)
		catalog.requestRestore([memory.key], NOW + 1)
		const restore = required(catalog.claimNext(NOW + 1)),
			hot = await copy(f, catalog, restore, NOW + 1)
		expect(hot.sourceKey).toBe(cold.physicalKey)
		expect(hot.physicalKey).not.toBe(cold.physicalKey)
		expect(catalog.finish(restore, hot.physicalKey, NOW + 1)).toBe(true)
		expect(new ObjectReferences(f.db).isReferenced(hot.physicalKey)).toBe(true)
		await new TierGarbage(
			f.db,
			key => rm(f.local(key), { force: true }),
			() => NOW + 1
		).maintain()
		await expect(f.raw(cold.physicalKey)).rejects.toThrow()
		// A remote archive request may finish after its former physical generation was retired.
		await f.objects.write(cold.physicalKey, Buffer.alloc(f.data.length, 99), new AbortController().signal)
		expect(catalog.finish(archive, cold.physicalKey, NOW + 2)).toBe(false)
		expect(await readAll(await f.files().read(memory.key))).toEqual(f.data)
		const references = new ObjectReferences(f.db)
		expect(
			classifyStorageCandidate(
				references,
				{
					key: cold.physicalKey,
					object: { key: cold.physicalKey, size: f.data.length, modified: 0, etag: 'late' },
					uploads: [],
					job: null,
				},
				NOW + ORPHAN_GRACE_MS
			).action
		).toBe('queue')
		const tiered = new TieredObjects(f.db, f.objects, key => rm(f.local(key), { force: true }))
		await expect(tiered.write(memory.key, f.data, new AbortController().signal)).rejects.toThrow('immutable')
		await expect(tiered.write(hot.physicalKey, f.data, new AbortController().signal)).rejects.toThrow('immutable')
		f.db.query('INSERT INTO object_deletions(object_key,created_at) VALUES (?,?)').run(cold.physicalKey, NOW)
		await new ObjectDeletionQueue(f.db, key => tiered.remove(key)).drain(cold.physicalKey, NOW)
		expect(await readAll(await f.files().read(memory.key))).toEqual(f.data)
		f.db.query('DELETE FROM memories WHERE id=?').run(memory.id)
		f.db
			.query('INSERT INTO object_deletions(object_key,created_at,user_id,size) VALUES (?,?,?,?)')
			.run(memory.key, NOW, 'owner', f.data.length)
		await new ObjectDeletionQueue(f.db, key => tiered.remove(key)).drain(memory.key, NOW)
		await expect(f.raw(hot.physicalKey)).rejects.toThrow()
		expect(locations.resolve(memory.key)).toBe(memory.key)
		expect(accountStorageUsage(f.db, 'owner')).toBe(0)
	} finally {
		await f.close()
	}
})

test('a crashed copy gets a different target after takeover; uncertain originals remain intact until publication', async () => {
	const f = await temporalFixture()
	try {
		migrateCaptureAccess(f.db)
		const memory = await f.add({})
		let catalog = new ColdStorageCatalog(f.db)
		catalog.beginArchive(memory.key, 90, NOW)
		const old = required(catalog.claimNext(NOW)),
			pending = catalog.reserveCopy(old, NOW)
		f.restart()
		catalog = new ColdStorageCatalog(f.db)
		const nextTime = NOW + COLD_WORKER_LEASE_MS,
			next = required(catalog.claimNext(nextTime)),
			target = await copy(f, catalog, next, nextTime)
		expect(target.physicalKey).not.toBe(pending.physicalKey)
		expect(await f.raw(memory.key)).toEqual(f.data)
		expect(catalog.finish(next, target.physicalKey, nextTime)).toBe(true)
		await f.objects.write(pending.physicalKey, f.data, new AbortController().signal)
		expect(catalog.finish(old, pending.physicalKey, nextTime)).toBe(false)
		expect(catalog.discardCopy(old, pending.physicalKey, nextTime)).toBe(false)
		await new TierGarbage(
			f.db,
			key => rm(f.local(key), { force: true }),
			() => nextTime
		).maintain()
		expect(await f.raw(pending.physicalKey)).toEqual(f.data)
		await new TierGarbage(
			f.db,
			key => rm(f.local(key), { force: true }),
			() => nextTime + ORPHAN_GRACE_MS
		).maintain()
		await expect(f.raw(pending.physicalKey)).rejects.toThrow()
		expect(await f.raw(target.physicalKey)).toEqual(f.data)
	} finally {
		await f.close()
	}
})

test('uncertain-copy cleanup survives outages and restart and respects active physical references', async () => {
	const f = await temporalFixture()
	try {
		migrateCaptureAccess(f.db)
		const memory = await f.add({}),
			catalog = new ColdStorageCatalog(f.db)
		catalog.beginArchive(memory.key, 90, NOW)
		const work = required(catalog.claimNext(NOW)),
			target = await copy(f, catalog, work, NOW)
		expect(catalog.discardCopy(work, target.physicalKey, NOW, true)).toBe(true)
		expect(catalog.discardCopy(work, target.physicalKey, NOW)).toBe(false)
		let now = NOW
		const failed = new TierGarbage(
			f.db,
			async () => {
				throw new Error('offline')
			},
			() => now
		)
		await failed.maintain()
		expect(f.db.query('SELECT attempts FROM object_tier_garbage').get()).toEqual({ attempts: 0 })
		now += ORPHAN_GRACE_MS
		await failed.maintain()
		expect(f.db.query('SELECT attempts,next_attempt_at FROM object_tier_garbage').get()).toEqual({
			attempts: 1,
			next_attempt_at: now + 60_000,
		})
		f.restart()
		now += 60_000
		const success = new TierGarbage(
			f.db,
			key => rm(f.local(key), { force: true }),
			() => now
		)
		await success.maintain()
		await expect(f.raw(target.physicalKey)).rejects.toThrow()
		expect(await f.raw(memory.key)).toEqual(f.data)
		// A queued physical deletion must not remove a still-published location or a pending copy.
		f.db.query('INSERT INTO object_tier_locations VALUES (?,?)').run(memory.key, 'owner/tiers/live.glb')
		f.db
			.query('INSERT INTO object_tier_garbage(physical_key,object_key,generation,next_attempt_at) VALUES (?,?,?,0)')
			.run('owner/tiers/live.glb', memory.key, 'live')
		const remove = spyOn({ async remove(_key: string) {} }, 'remove')
		await new TierGarbage(f.db, remove, () => now).maintain()
		expect(remove).not.toHaveBeenCalled()
	} finally {
		await f.close()
	}
})

test('older tier catalog schemas migrate without discarding pending states', () => {
	const db = new Database(':memory:')
	try {
		db.exec(`CREATE TABLE object_tiers(object_key TEXT PRIMARY KEY,state TEXT,operation_id TEXT,restore_requested INTEGER,
		worker_id TEXT,worker_expires_at INTEGER,attempts INTEGER,next_attempt_at INTEGER,hot_until INTEGER,updated_at INTEGER);
		INSERT INTO object_tiers VALUES ('legacy','archiving','operation',0,NULL,0,1,42,0,0)`)
		migrateObjectTiers(db)
		migrateObjectTiers(db)
		expect(db.query('SELECT state,operation_id,user_id,size FROM object_tiers').get()).toEqual({
			state: 'archiving',
			operation_id: 'operation',
			user_id: '',
			size: 0,
		})
	} finally {
		db.close()
	}
})

test('physical cleanup serializes concurrent passes, waits for shutdown and contains database failures', async () => {
	const f = await temporalFixture()
	try {
		migrateCaptureAccess(f.db)
		const memory = await f.add({}),
			catalog = new ColdStorageCatalog(f.db)
		catalog.beginArchive(memory.key, 90, NOW)
		const work = required(catalog.claimNext(NOW)),
			target = await copy(f, catalog, work, NOW)
		expect(catalog.finish(work, target.physicalKey, NOW)).toBe(true)
		let entered: () => void = () => {},
			release: () => void = () => {}
		const seen = new Promise<void>(resolve => {
				entered = resolve
			}),
			wait = new Promise<void>(resolve => {
				release = resolve
			})
		const gc = new TierGarbage(
			f.db,
			async key => {
				entered()
				await wait
				await rm(f.local(key), { force: true })
			},
			() => NOW
		)
		const running = gc.maintain()
		await seen
		expect(gc.maintain()).toBe(running)
		let stoppingDone = false
		const stopped = gc.stop().then(() => {
			stoppingDone = true
		})
		await gc.maintain()
		expect(stoppingDone).toBe(false)
		release()
		await stopped
		expect(stoppingDone).toBe(true)
		await expect(f.raw(memory.key)).rejects.toThrow()
		expect(await f.raw(target.physicalKey)).toEqual(f.data)
	} finally {
		await f.close()
	}
	const db = new Database(':memory:')
	db.close()
	const log = spyOn(console, 'error').mockImplementation(() => {})
	try {
		await new TierGarbage(
			db,
			async () => {},
			() => NOW
		).maintain()
		expect(log).toHaveBeenCalledWith(expect.stringContaining('durable work remains'))
	} finally {
		log.mockRestore()
	}
})
