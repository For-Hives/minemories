import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { Readable } from 'node:stream'
import type { InventoryObject, InventoryUpload, StorageInspection, StorageInventory } from './storage-inventory'
import { ORPHAN_GRACE_MS } from './storage-reconciliation'
import {
	collectReconciliationPlan,
	MAX_RECONCILIATION_BYTES,
	MAX_RECONCILIATION_ITEMS,
} from './storage-reconciliation-plan'

const key = 'owner/11111111-1111-4111-8111-111111111111.glb'
const object = { key, size: 42, modified: 0, etag: 'original' }
class FixtureInventory implements StorageInventory {
	constructor(
		readonly rows: InventoryObject[] = [],
		readonly parts: InventoryUpload[] = []
	) {}
	identity(): Promise<string> {
		return Promise.resolve('a'.repeat(64))
	}
	objects(): AsyncIterable<InventoryObject> {
		return Readable.from(this.rows)
	}
	uploads(): AsyncIterable<InventoryUpload> {
		return Readable.from(this.parts)
	}
	inspect(): Promise<StorageInspection> {
		return Promise.reject(new Error('Planning must not read individual objects'))
	}
}
function fixtureDatabase() {
	const database = new Database(':memory:')
	database.exec(`CREATE TABLE devices (user_id TEXT); INSERT INTO devices VALUES ('owner');
		CREATE TABLE object_deletions (object_key TEXT PRIMARY KEY, user_id TEXT, size INTEGER, discard_upload INTEGER);
		CREATE TABLE memories (object_key TEXT, user_id TEXT);`)
	return database
}
const options = { databasePath: ':memory:', now: 2 * ORPHAN_GRACE_MS }

test('planning merges complete objects, multipart attempts and missing legacy jobs without changing SQLite', async () => {
	const database = fixtureDatabase()
	try {
		database.query('INSERT INTO object_deletions VALUES (?, NULL, NULL, 0)').run(key)
		database.query('INSERT INTO object_deletions VALUES (?, NULL, NULL, 0)').run(key.replace('1111.glb', '2222.glb'))
		const inventory = new FixtureInventory([object], [{ key, id: 'abandoned', created: 0 }])
		const plan = await collectReconciliationPlan(database, inventory, options)
		expect(plan).toMatchObject({ version: 1, databasePath: ':memory:', prefix: '', storageId: 'a'.repeat(64) })
		expect(plan.entries).toHaveLength(2)
		expect(plan.entries[0]?.proposal).toMatchObject({ action: 'repair', owner: 'owner', size: 42, discardUpload: true })
		expect(plan.entries[1]?.proposal).toMatchObject({ action: 'repair', size: 0 })
		expect(database.query('SELECT user_id, size FROM object_deletions').all()).toEqual([
			{ user_id: null, size: null },
			{ user_id: null, size: null },
		])
		database.query('INSERT INTO memories VALUES (?, ?)').run(key, 'owner')
		const protectedPlan = await collectReconciliationPlan(database, inventory, options)
		expect(protectedPlan.entries[0]?.proposal.reason).toBe('referenced_deletion_conflict')
	} finally {
		database.close()
	}
})

test('owner prefixes are exact scopes; empty inventories do not become deletion plans for other owners', async () => {
	const database = fixtureDatabase()
	try {
		database.query('INSERT INTO object_deletions VALUES (?, NULL, NULL, 0)').run(key)
		const empty = await collectReconciliationPlan(database, new FixtureInventory(), { ...options, prefix: 'other/' })
		expect(empty.entries).toEqual([])
		await expect(
			collectReconciliationPlan(database, new FixtureInventory([object]), { ...options, prefix: 'other/' })
		).rejects.toThrow('escaped')
		for (const prefix of ['../', 'owner', 'owner/path/', '%owner/']) {
			// biome-ignore lint/performance/noAwaitInLoops: Exercise each invalid scope separately.
			await expect(collectReconciliationPlan(database, new FixtureInventory(), { ...options, prefix })).rejects.toThrow(
				'namespace'
			)
		}
		await expect(
			collectReconciliationPlan(database, new FixtureInventory(), { ...options, now: Number.NaN })
		).rejects.toThrow('time')
	} finally {
		database.close()
	}
})

test('duplicate metadata cannot produce an apparently complete plan', async () => {
	const database = fixtureDatabase()
	try {
		await expect(collectReconciliationPlan(database, new FixtureInventory([object, object]), options)).rejects.toThrow(
			'Duplicate object'
		)
		const upload = { key, id: 'same', created: 0 }
		await expect(
			collectReconciliationPlan(database, new FixtureInventory([], [upload, upload]), options)
		).rejects.toThrow('Duplicate multipart')
	} finally {
		database.close()
	}
})

test('metadata work and final plan size stay bounded even for many uploads on one key', async () => {
	const database = fixtureDatabase()
	try {
		const parts = Array.from({ length: MAX_RECONCILIATION_ITEMS + 1 }, (_, index) => ({
			key,
			id: String(index),
			created: 0,
		}))
		await expect(collectReconciliationPlan(database, new FixtureInventory([], parts), options)).rejects.toThrow(
			'limits'
		)
		const huge = { ...object, etag: 'x'.repeat(MAX_RECONCILIATION_BYTES + 1) }
		await expect(collectReconciliationPlan(database, new FixtureInventory([huge]), options)).rejects.toThrow('limits')
	} finally {
		database.close()
	}
})
