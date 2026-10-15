import { expect, spyOn, test } from 'bun:test'
import { migrateCaptureAccess } from './capture-access'
import { COLD_WORKER_LEASE_MS, ColdStorageCatalog } from './cold-storage-catalog'
import { type ColdStorageProvider, ColdStorageWorker } from './cold-storage-worker'
import { ORPHAN_GRACE_MS } from './storage-reconciliation'
import { temporalFixture } from './test-support/timelapse-fixture'
import { TierLocations } from './tier-locations'

const NOW = 100 * 86_400_000
async function fixture() {
	const f = await temporalFixture()
	migrateCaptureAccess(f.db)
	const memory = await f.add({})
	const catalog = new ColdStorageCatalog(f.db)
	expect(catalog.beginArchive(memory.key, 90, NOW)).toBe(true)
	const provider: ColdStorageProvider = {
		prepare: async () => true,
		copy: async (_work, target, signal) => {
			await f.objects.write(target.physicalKey, await f.raw(target.sourceKey), signal)
		},
	}
	return { f, memory, catalog, provider }
}

test('worker publishes acknowledged generations and restores them, coalescing concurrent maintenance', async () => {
	const { f, memory, catalog, provider } = await fixture()
	try {
		const worker = new ColdStorageWorker(catalog, provider, () => NOW)
		const pass = worker.maintain()
		expect(worker.maintain()).toBe(pass)
		await pass
		const cold = new TierLocations(f.db).resolve(memory.key)
		expect(cold).not.toBe(memory.key)
		expect(await f.raw(cold)).toEqual(f.data)
		catalog.requestRestore([memory.key], NOW)
		await worker.maintain()
		expect(f.db.query('SELECT state FROM object_tiers').get()).toEqual({ state: 'hot' })
		await worker.maintain()
		await worker.stop()
		await worker.maintain()
	} finally {
		await f.close()
	}
})

test('pending provider restore retries without starting a copy and failures preserve the current source', async () => {
	const { f, memory, catalog, provider } = await fixture()
	try {
		let now = NOW
		provider.prepare = async () => false
		const copy = spyOn(provider, 'copy')
		const worker = new ColdStorageWorker(catalog, provider, () => now)
		await worker.maintain()
		expect(copy).not.toHaveBeenCalled()
		expect(f.db.query('SELECT attempts,next_attempt_at FROM object_tiers').get()).toEqual({
			attempts: 1,
			next_attempt_at: NOW + 60_000,
		})
		expect(new TierLocations(f.db).resolve(memory.key)).toBe(memory.key)
		now += 60_000
		provider.prepare = async () => {
			throw new Error('HEAD unavailable')
		}
		await worker.maintain()
		expect(copy).not.toHaveBeenCalled()
		expect(f.db.query('SELECT attempts FROM object_tiers').get()).toEqual({ attempts: 2 })
		await worker.stop()
	} finally {
		await f.close()
	}
})

test('lost copy replies are retired after orphan grace and can never publish a late completion', async () => {
	const { f, memory, catalog, provider } = await fixture()
	try {
		provider.copy = async (_work, target, signal) => {
			await f.objects.write(target.physicalKey, f.data, signal)
			throw new Error('Reply lost after remote write')
		}
		await new ColdStorageWorker(catalog, provider, () => NOW).maintain()
		expect(new TierLocations(f.db).resolve(memory.key)).toBe(memory.key)
		expect(f.db.query('SELECT state,attempts FROM object_tiers').get()).toEqual({ state: 'archiving', attempts: 1 })
		expect(f.db.query('SELECT next_attempt_at FROM object_tier_garbage').get()).toEqual({
			next_attempt_at: NOW + ORPHAN_GRACE_MS,
		})
	} finally {
		await f.close()
	}
})

test('shutdown aborts the provider and waits until its pending operation settles', async () => {
	const { f, catalog, provider } = await fixture()
	try {
		let entered!: () => void
		const started = new Promise<void>(resolve => {
			entered = resolve
		})
		provider.copy = async (_work, _copy, signal) => {
			entered()
			await new Promise<void>((_resolve, reject) =>
				signal.addEventListener('abort', () => reject(signal.reason), { once: true })
			)
		}
		const worker = new ColdStorageWorker(catalog, provider, () => NOW)
		const pass = worker.maintain()
		await started
		await worker.stop()
		await pass
		expect(f.db.query('SELECT attempts FROM object_tiers').get()).toEqual({ attempts: 1 })
	} finally {
		await f.close()
	}
})

test('heartbeat lease loss aborts a waiting provider and stale acknowledgements never publish', async () => {
	const { f, memory, catalog, provider } = await fixture()
	try {
		let now = NOW
		provider.prepare = async (_work, _copy, signal) => {
			now += COLD_WORKER_LEASE_MS
			await new Promise<void>((_resolve, reject) =>
				signal.addEventListener('abort', () => reject(signal.reason), { once: true })
			)
			return true
		}
		await new ColdStorageWorker(catalog, provider, () => now, 1).maintain()
		expect(new TierLocations(f.db).resolve(memory.key)).toBe(memory.key)
		provider.prepare = async () => true
		const finish = spyOn(catalog, 'finish').mockReturnValue(false)
		await new ColdStorageWorker(catalog, provider, () => now).maintain()
		expect(finish).toHaveBeenCalled()
		expect(new TierLocations(f.db).resolve(memory.key)).toBe(memory.key)
	} finally {
		await f.close()
	}
})

test('database errors are contained by maintenance without exposing private provider errors', async () => {
	const { f, catalog, provider } = await fixture()
	const log = spyOn(console, 'error').mockImplementation(() => {})
	try {
		const claim = spyOn(catalog, 'claimNext').mockImplementation(() => {
			throw new Error('private details')
		})
		await new ColdStorageWorker(catalog, provider).maintain()
		expect(log).toHaveBeenCalledWith('[cold-storage] maintenance failed; durable work remains in SQLite')
		claim.mockRestore()
	} finally {
		log.mockRestore()
		await f.close()
	}
})
