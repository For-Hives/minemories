import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { migrateCaptureAccess } from './capture-access'
import { CaptureReaders } from './capture-readers'
import {
	COLD_WORKER_LEASE_MS,
	ColdStorageCatalog,
	type ColdStorageWork,
	RESTORE_READ_GRACE_MS,
} from './cold-storage-catalog'
import { coldStorageCandidates } from './cold-storage-policy'
import { ObjectDeletionQueue } from './object-deletions'
import { CaptureArchivedError } from './object-tiers'
import { readAll, temporalFixture } from './test-support/timelapse-fixture'
import { TieredObjects } from './tiered-objects'

const NOW = 100 * 86_400_000
function required(work: ColdStorageWork | null): ColdStorageWork {
	if (!work) throw new Error('Missing work')
	return work
}

async function publish(
	f: Awaited<ReturnType<typeof temporalFixture>>,
	catalog: ColdStorageCatalog,
	work: ColdStorageWork,
	now: number
) {
	const target = catalog.reserveCopy(work, now)
	await f.objects.write(target.physicalKey, await f.raw(target.sourceKey), new AbortController().signal)
	return catalog.finish(work, target.physicalKey, now)
}

test('archive claims recheck the exact object and atomically exclude readers from another SQLite connection', async () => {
	const f = await temporalFixture()
	try {
		migrateCaptureAccess(f.db)
		const capture = await f.add(),
			catalog = new ColdStorageCatalog(f.db)
		f.db.transaction(() => {
			const insert = f.db.query('INSERT INTO memories(id,user_id,object_key,size) VALUES (?,?,?,1)')
			for (let i = 0; i < 1001; i++) {
				const id = randomUUID()
				insert.run(id, 'owner', `owner/${id}.glb`)
			}
			f.db.query('UPDATE memories SET created_at=1 WHERE id=?').run(capture.id)
		})()
		const other = new Database(f.db.filename, { readwrite: true, create: false })
		try {
			const readers = new CaptureReaders(other),
				lease = readers.open(capture.key, NOW)
			expect(catalog.beginArchive(capture.key, 90, NOW)).toBe(false)
			readers.close(lease)
			expect(catalog.beginArchive(capture.key, 90, NOW)).toBe(true)
			expect(catalog.beginArchive(capture.key, 90, NOW)).toBe(false)
			expect(() => readers.open(capture.key, NOW)).toThrow(CaptureArchivedError)
			await expect(f.files().read(capture.key)).rejects.toThrow(CaptureArchivedError)
			await expect(f.files().convert(capture.id)).rejects.toThrow(CaptureArchivedError)
			expect(other.query('SELECT * FROM capture_readers').all()).toEqual([])
			expect(other.query('SELECT * FROM timelapse_leases').all()).toEqual([])
		} finally {
			other.close()
		}
		const work = required(catalog.claimNext(NOW))
		catalog.renew(work, NOW + 1)
		expect(catalog.requestRestore([capture.key], NOW + 2)).toBe(1)
		expect(catalog.requestRestore([capture.key], NOW + 3)).toBe(0)
		expect(catalog.claimNext(NOW + 3)).toBeNull()
		expect(await publish(f, catalog, work, NOW + 3)).toBe(true)
		expect(catalog.finish(work, 'stale-copy', NOW + 4)).toBe(false)
		const restore = required(catalog.claimNext(NOW + 4))
		expect(restore.state).toBe('restoring')
		expect(restore.operationId).not.toBe(work.operationId)
		await expect(f.files().read(capture.key)).rejects.toThrow(CaptureArchivedError)
		expect(await publish(f, catalog, restore, NOW + 5)).toBe(true)
		expect(await readAll(await f.files().read(capture.key))).toEqual(f.data)
		expect(catalog.beginArchive(capture.key, 90, NOW + 5)).toBe(false)
		expect(catalog.beginArchive(capture.key, 90, NOW + 5 + RESTORE_READ_GRACE_MS)).toBe(true)
	} finally {
		await f.close()
	}
})

test('uncertain operations survive restart and worker expiry; stale acknowledgements cannot publish availability', async () => {
	const f = await temporalFixture()
	try {
		migrateCaptureAccess(f.db)
		const capture = await f.add({})
		let catalog = new ColdStorageCatalog(f.db)
		expect(catalog.beginArchive(capture.key, 90, NOW)).toBe(true)
		const initial = required(catalog.claimNext(NOW))
		expect(catalog.fail(initial, NOW)).toBe(true)
		expect(catalog.fail(initial, NOW)).toBe(false)
		f.restart()
		catalog = new ColdStorageCatalog(f.db)
		expect(catalog.claimNext(NOW + 59_999)).toBeNull()
		const retry = required(catalog.claimNext(NOW + 60_000)),
			later = NOW + 60_000 + COLD_WORKER_LEASE_MS,
			replacement = required(catalog.claimNext(later))
		expect(retry.attempts).toBe(1)
		expect(replacement.operationId).toBe(initial.operationId)
		expect(replacement.workerId).not.toBe(retry.workerId)
		expect(catalog.finish(retry, 'stale-copy', later)).toBe(false)
		expect(catalog.fail(retry, later)).toBe(false)
		expect(() => catalog.renew(retry, later)).toThrow('expired')
		await expect(f.files().read(capture.key)).rejects.toThrow(CaptureArchivedError)
		expect(await publish(f, catalog, replacement, later)).toBe(true)
		expect(f.db.query('SELECT state FROM object_tiers WHERE object_key=?').get(capture.key)).toEqual({ state: 'cold' })
		expect(catalog.requestRestore([capture.key], later)).toBe(1)
		let now = later
		for (let i = 0; i < 8; i++) {
			const work = required(catalog.claimNext(now))
			expect(catalog.fail(work, now)).toBe(true)
			const row = f.db.query('SELECT next_attempt_at FROM object_tiers').get() as { next_attempt_at: number }
			expect(row.next_attempt_at - now).toBe(Math.min(3_600_000, 60_000 * 2 ** i))
			now = row.next_attempt_at
		}
		expect(catalog.requestRestore([capture.key], now)).toBe(0)
		expect(await publish(f, catalog, required(catalog.claimNext(now)), now)).toBe(true)
		expect(catalog.requestRestore([capture.key, 'unknown'], now)).toBe(0)
	} finally {
		await f.close()
	}
})

test('all shared chunks are checked before a stream opens, and cold deduplication cannot publish new references', async () => {
	const f = await temporalFixture()
	try {
		migrateCaptureAccess(f.db)
		const first = await f.add(),
			second = await f.add()
		expect(await f.files().convert(first.id)).toBe(true)
		await f.drain()
		expect(await f.files().convert(second.id)).toBe(true)
		await f.drain()
		const catalog = new ColdStorageCatalog(f.db),
			candidate = coldStorageCandidates(f.db, 90, NOW)[0]
		if (!candidate) throw new Error('No shared chunk')
		const reader = f.catalog().open(f.key(first.id), NOW)
		if (!reader) throw new Error('No manifest')
		expect(catalog.beginArchive(candidate.objectKey, 90, NOW)).toBe(false)
		f.catalog().closeReader(reader.id)
		expect(catalog.beginArchive(candidate.objectKey, 90, NOW)).toBe(true)
		expect(() => f.catalog().open(f.key(first.id), NOW)).toThrow(CaptureArchivedError)
		expect(() => f.catalog().open(f.key(second.id), NOW)).toThrow(CaptureArchivedError)
		expect(f.db.query('SELECT * FROM timelapse_readers').all()).toEqual([])
		const third = await f.add(),
			lease = f.catalog().begin(third.id, NOW)
		if (!lease) throw new Error('No conversion')
		const part = reader.manifest.parts.find(part => part.objectKey === candidate.objectKey)
		if (!part) throw new Error('No matching part')
		expect(() => f.catalog().claim(lease.id, part.sha256, part.size, NOW)).toThrow(CaptureArchivedError)
		expect(f.db.query('SELECT * FROM timelapse_pending_refs').all()).toEqual([])
		f.catalog().abandon(lease.id)
	} finally {
		await f.close()
	}
})

test('deletion waits for uncertain tier work and removes tier metadata only after confirmed object removal', async () => {
	const f = await temporalFixture()
	try {
		migrateCaptureAccess(f.db)
		const capture = await f.add({}),
			catalog = new ColdStorageCatalog(f.db),
			removed: string[] = []
		expect(catalog.beginArchive(capture.key, 90, NOW)).toBe(true)
		const work = required(catalog.claimNext(NOW))
		f.db.query('DELETE FROM memories WHERE id=?').run(capture.id)
		f.db.query('INSERT INTO object_deletions(object_key,created_at) VALUES (?,?)').run(capture.key, NOW)
		const queue = new ObjectDeletionQueue(f.db, async key => {
			await new TieredObjects(f.db, f.objects, k => rm(f.local(k), { force: true })).remove(key)
			removed.push(key)
		})
		await queue.drain(capture.key, NOW)
		await queue.drain(undefined, NOW)
		expect(removed).toEqual([])
		expect(await f.raw(capture.key)).toEqual(f.data)
		expect(await publish(f, catalog, work, NOW)).toBe(true)
		await queue.drain(undefined, NOW)
		expect(removed).toEqual([capture.key])
		await expect(f.raw(capture.key)).rejects.toThrow()
		expect(f.db.query('SELECT * FROM object_tiers').all()).toEqual([])
	} finally {
		await f.close()
	}
})

test('restoration work takes priority over another archive and hot objects do not create restore jobs', async () => {
	const f = await temporalFixture()
	try {
		migrateCaptureAccess(f.db)
		const first = await f.add({}),
			second = await f.add({}),
			catalog = new ColdStorageCatalog(f.db)
		expect(catalog.beginArchive(first.key, 90, NOW)).toBe(true)
		expect(await publish(f, catalog, required(catalog.claimNext(NOW)), NOW)).toBe(true)
		expect(catalog.beginArchive(second.key, 90, NOW)).toBe(true)
		expect(catalog.requestRestore([first.key], NOW + 1)).toBe(1)
		const restore = required(catalog.claimNext(NOW + 1))
		expect(restore.objectKey).toBe(first.key)
		expect(restore.state).toBe('restoring')
		expect(catalog.claimNext(NOW + 1)).toBeNull()
		expect(await publish(f, catalog, restore, NOW + 1)).toBe(true)
		expect(catalog.requestRestore([first.key], NOW + 2)).toBe(0)
		const archive = required(catalog.claimNext(NOW + 2))
		expect(archive.objectKey).toBe(second.key)
		expect(await publish(f, catalog, archive, NOW + 2)).toBe(true)
		expect(catalog.claimNext(NOW + 3)).toBeNull()
	} finally {
		await f.close()
	}
})
