import { expect, spyOn, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { migrateCaptureAccess } from './capture-access'
import { CaptureStorage } from './capture-storage'
import { ColdStorageMaintenance } from './cold-storage-maintenance'
import type { ColdStorageProvider } from './cold-storage-worker'
import { readAll, temporalFixture } from './test-support/timelapse-fixture'
import { TierLocations } from './tier-locations'

const NOW = 100 * 86_400_000
async function fixture() {
	const f = await temporalFixture()
	migrateCaptureAccess(f.db)
	const provider: ColdStorageProvider = {
		prepare: async () => true,
		copy: async (_work, copy, signal) => f.objects.write(copy.physicalKey, await f.raw(copy.sourceKey), signal),
	}
	return { f, provider, remove: (key: string) => rm(f.local(key), { force: true }) }
}

test('maintenance archives one eligible object per pass and restores on demand before selecting another capture', async () => {
	const { f, provider, remove } = await fixture()
	try {
		const first = await f.add({}),
			second = await f.add({}),
			service = new CaptureStorage(f.db, true)
		const maintenance = new ColdStorageMaintenance(f.db, provider, remove, 90, () => NOW)
		const pass = maintenance.maintain()
		expect(maintenance.maintain()).toBe(pass)
		await pass
		const rows = f.db.query("SELECT object_key FROM object_tiers WHERE state='cold'").all() as Array<{
			object_key: string
		}>
		expect(rows).toHaveLength(1)
		const archived = rows[0]?.object_key
		if (!archived) throw new Error('Missing archived object')
		const untouched = archived === first.key ? second.key : first.key
		expect(service.status(() => untouched).state).toBe('ready')
		service.status(() => archived, true, NOW)
		await maintenance.maintain()
		expect(service.status(() => archived).state).toBe('ready')
		expect(service.status(() => untouched).state).toBe('ready')
		expect(await readAll(await f.files().read(archived))).toEqual(f.data)
		await maintenance.maintain()
		expect(service.status(() => untouched).state).toBe('cold')
		await maintenance.stop()
		await maintenance.maintain()
	} finally {
		await f.close()
	}
})

test('provider outages keep durable retry and suppress new archive claims until existing work is resolved', async () => {
	const { f, provider, remove } = await fixture()
	try {
		await f.add({})
		await f.add({})
		let now = NOW
		const prepare = spyOn(provider, 'prepare').mockRejectedValue(new Error('private provider failure'))
		const maintenance = new ColdStorageMaintenance(f.db, provider, remove, 90, () => now)
		await maintenance.maintain()
		await maintenance.maintain()
		expect(prepare).toHaveBeenCalledTimes(1)
		expect(f.db.query('SELECT COUNT(*) AS total FROM object_tiers').get()).toEqual({ total: 1 })
		expect(f.db.query('SELECT state,attempts FROM object_tiers').get()).toEqual({ state: 'archiving', attempts: 1 })
		now += 60_000
		prepare.mockResolvedValue(true)
		await maintenance.maintain()
		expect(f.db.query('SELECT state FROM object_tiers').get()).toEqual({ state: 'cold' })
		await maintenance.stop()
	} finally {
		await f.close()
	}
})

test('shutdown waits for physical cleanup and never starts another archive afterward', async () => {
	const { f, provider, remove } = await fixture()
	let release = () => {}
	try {
		const memory = await f.add({}),
			entered = Promise.withResolvers<void>(),
			barrier = Promise.withResolvers<void>()
		const maintenance = new ColdStorageMaintenance(
			f.db,
			provider,
			async key => {
				entered.resolve()
				await barrier.promise
				await remove(key)
			},
			90,
			() => NOW
		)
		await maintenance.maintain()
		await f.add({})
		const cold = new TierLocations(f.db).resolve(memory.key)
		const pass = maintenance.maintain()
		await entered.promise
		release = () => barrier.resolve()
		let stopped = false
		const stop = maintenance.stop().then(() => {
			stopped = true
		})
		await Promise.resolve()
		expect(stopped).toBe(false)
		release()
		await stop
		await pass
		expect(f.db.query('SELECT COUNT(*) AS total FROM object_tiers').get()).toEqual({ total: 1 })
		expect(await f.raw(cold)).toEqual(f.data)
	} finally {
		release()
		await f.close()
	}
})

test('empty passes, invalid policy and database failures are contained without cloud mutations', async () => {
	const { f, provider, remove } = await fixture()
	const log = spyOn(console, 'error').mockImplementation(() => {})
	try {
		expect(() => new ColdStorageMaintenance(f.db, provider, remove, 59)).toThrow('60 to 90')
		const maintenance = new ColdStorageMaintenance(f.db, provider, remove, 90, () => NOW)
		await maintenance.maintain()
		f.db.exec('DROP TABLE memories')
		await maintenance.maintain()
		expect(log).toHaveBeenCalledWith('[cold-storage] scheduling failed; durable work remains in SQLite')
		await maintenance.stop()
	} finally {
		log.mockRestore()
		await f.close()
	}
})

test('cleanup outages pause new archives while explicit restores can still return an existing capture to hot storage', async () => {
	const { f, provider, remove } = await fixture()
	try {
		await f.add({})
		await f.add({})
		const failingRemove = spyOn({ remove }, 'remove').mockRejectedValue(new Error('cleanup unavailable'))
		const maintenance = new ColdStorageMaintenance(f.db, provider, failingRemove, 90, () => NOW)
		await maintenance.maintain()
		await maintenance.maintain()
		expect(f.db.query('SELECT COUNT(*) AS total FROM object_tiers').get()).toEqual({ total: 1 })
		const archived = f.db.query('SELECT object_key FROM object_tiers').get() as { object_key: string }
		const service = new CaptureStorage(f.db, true)
		service.status(() => archived.object_key, true, NOW)
		await maintenance.maintain()
		expect(service.status(() => archived.object_key).state).toBe('ready')
		expect(await readAll(await f.files().read(archived.object_key))).toEqual(f.data)
		expect(f.db.query('SELECT COUNT(*) AS total FROM object_tiers').get()).toEqual({ total: 1 })
		await maintenance.stop()
	} finally {
		await f.close()
	}
})
