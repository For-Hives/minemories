import { expect, test } from 'bun:test'
import { migrateCaptureAccess, recordCaptureOpening } from './capture-access'
import { coldStorageCandidates, coldStorageInactiveDays } from './cold-storage-policy'
import { temporalFixture } from './test-support/timelapse-fixture'

const DAY = 86_400_000

test('inactive policy rejects ambiguous settings and uses creation before the first actual opening', async () => {
	expect(coldStorageInactiveDays()).toBe(90)
	expect(coldStorageInactiveDays('60')).toBe(60)
	for (const value of ['59', '91', '60.1', ' 60', '6e1', '', 'NaN'])
		expect(() => coldStorageInactiveDays(value)).toThrow('60 to 90')
	const f = await temporalFixture()
	try {
		migrateCaptureAccess(f.db)
		const legacy = await f.add({}),
			now = 100 * DAY
		f.db.query('UPDATE memories SET created_at=? WHERE id=?').run(10 * DAY, legacy.id)
		expect(coldStorageCandidates(f.db, 90, now - 1)).toEqual([])
		expect(coldStorageCandidates(f.db, 90, now)).toEqual([
			{ objectKey: legacy.key, userId: 'owner', size: f.data.length, references: 1, lastActivityAt: 10 * DAY },
		])
		recordCaptureOpening(f.db, legacy.key, now)
		expect(coldStorageCandidates(f.db, 90, now)).toEqual([])
		expect(coldStorageCandidates(f.db, 60, now + 60 * DAY)).toHaveLength(1)
		for (const bad of [0, -1, 1.5, 1001]) expect(() => coldStorageCandidates(f.db, 90, now, bad)).toThrow('limit')
		for (const bad of [-1, Number.NaN, Number.MAX_SAFE_INTEGER + 1])
			expect(() => coldStorageCandidates(f.db, 90, bad)).toThrow('time')
		expect(() => coldStorageCandidates(f.db, 59, now)).toThrow('60 to 90')
	} finally {
		await f.close()
	}
})

test('deduplicated blocks require all references to be inactive and remain protected by readers and pending conversions', async () => {
	const f = await temporalFixture()
	try {
		migrateCaptureAccess(f.db)
		const first = await f.add(),
			second = await f.add(),
			now = 100 * DAY
		expect(await f.files().convert(first.id)).toBe(true)
		await f.drain()
		expect(await f.files().convert(second.id)).toBe(true)
		const candidates = () => coldStorageCandidates(f.db, 90, now)
		const baseline = candidates()
		expect(baseline.length).toBeGreaterThan(0)
		expect(baseline.every(row => row.references === 2)).toBe(true)
		expect(baseline.reduce((sum, row) => sum + row.size, 0)).toBeLessThan(f.data.length)
		expect(f.db.query("SELECT SUM(size) AS bytes FROM timelapse_chunks WHERE state='ready'").get()).toEqual({
			bytes: baseline.reduce((sum, row) => sum + row.size, 0),
		})
		expect(baseline.some(row => row.objectKey === f.key(first.id))).toBe(false)
		recordCaptureOpening(f.db, f.key(second.id), 50 * DAY)
		expect(candidates()).toEqual([])
		f.db.query('UPDATE memories SET last_opened_at=NULL,deleted_at=1 WHERE id=?').run(second.id)
		expect(candidates()).toEqual([])
		f.db.query('DELETE FROM memories WHERE id=?').run(second.id)
		expect(candidates().every(row => row.references === 1)).toBe(true)
		const catalog = f.catalog(),
			reader = catalog.open(f.key(first.id), now)
		if (!reader) throw new Error('Missing reader')
		expect(candidates()).toEqual([])
		catalog.closeReader(reader.id)
		const third = await f.add()
		f.db.query('UPDATE memories SET created_at=? WHERE id=?').run(now, third.id)
		const lease = catalog.begin(third.id, now)
		if (!lease) throw new Error('Missing conversion lease')
		const part = reader.manifest.parts[0]
		if (!part) throw new Error('Missing part')
		const claim = catalog.claim(lease.id, part.sha256, part.size, now)
		expect(claim.upload).toBe(false)
		expect(candidates().some(row => row.objectKey === claim.objectKey)).toBe(false)
		catalog.abandon(lease.id)
		expect(candidates().some(row => row.objectKey === claim.objectKey)).toBe(true)
		f.restart()
		expect(candidates()).toEqual(baseline.map(row => ({ ...row, references: 1 })))
		f.db.query('INSERT INTO object_deletions(object_key,created_at) VALUES (?,?)').run(part.objectKey, now)
		expect(candidates().some(row => row.objectKey === part.objectKey)).toBe(false)
		f.db.exec("UPDATE timelapse_chunks SET user_id='wrong-owner'")
		expect(candidates()).toEqual([])
	} finally {
		await f.close()
	}
})

test('active conversion protects an original, and corrupt owner keys are never proposed', async () => {
	const f = await temporalFixture()
	try {
		migrateCaptureAccess(f.db)
		const memory = await f.add(),
			now = 100 * DAY,
			catalog = f.catalog(),
			lease = catalog.begin(memory.id, now)
		if (!lease) throw new Error('Missing conversion lease')
		expect(coldStorageCandidates(f.db, 90, now)).toEqual([])
		expect(coldStorageCandidates(f.db, 90, lease.expires_at)).toHaveLength(1)
		catalog.abandon(lease.id)
		expect(coldStorageCandidates(f.db, 90, now)).toHaveLength(1)
		f.db.query('UPDATE memories SET object_key=? WHERE id=?').run(`other/${memory.id}.glb`, memory.id)
		expect(coldStorageCandidates(f.db, 90, now)).toEqual([])
	} finally {
		await f.close()
	}
})
