import { Database } from 'bun:sqlite'
import { afterAll, expect, test } from 'bun:test'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyReconciliationPlan } from './reconciliation-apply'
import {
	ReconciliationInventory,
	reconciliationDatabase,
	reconciliationKey,
	reconciliationNow,
	reconciliationPlan,
} from './test-support/reconciliation-fixture'

const root = await mkdtemp(join(tmpdir(), 'minemories-apply-'))
afterAll(() => rm(root, { recursive: true, force: true }))
let sequence = 0
function options(database: Database) {
	return {
		databasePath: database.filename,
		backupPath: join(root, `${sequence++}.sqlite`),
		apiStopped: true,
		now: reconciliationNow,
	}
}

test('application snapshots SQLite privately, queues exact observed orphans and is replayable', async () => {
	const database = reconciliationDatabase()
	try {
		const inventory = new ReconciliationInventory()
		const plan = await reconciliationPlan(database, inventory)
		const settings = options(database)
		expect(await applyReconciliationPlan(database, inventory, plan, settings)).toMatchObject({ queued: 1, repaired: 0 })
		expect(database.query('SELECT user_id, size, discard_upload FROM object_deletions').get()).toEqual({
			user_id: 'owner',
			size: 42,
			discard_upload: 1,
		})
		expect((await stat(settings.backupPath)).mode & 0o777).toBe(0o600)
		const restored = new Database(settings.backupPath, { readonly: true })
		try {
			expect(restored.query('SELECT * FROM object_deletions').all()).toEqual([])
		} finally {
			restored.close()
		}
		expect(await applyReconciliationPlan(database, inventory, plan, options(database))).toMatchObject({
			queued: 0,
			skipped: 1,
		})
		await expect(applyReconciliationPlan(database, inventory, plan, settings)).rejects.toThrow()
	} finally {
		database.close()
	}
})

test('backfills preserve retry dates and attempts, including unknown original multipart sizes', async () => {
	const database = reconciliationDatabase()
	try {
		database
			.query('INSERT INTO object_deletions (object_key, created_at, attempts, next_attempt_at) VALUES (?, 10, 3, 1000)')
			.run(reconciliationKey)
		const inventory = new ReconciliationInventory()
		const plan = await reconciliationPlan(database, inventory)
		expect(await applyReconciliationPlan(database, inventory, plan, options(database))).toMatchObject({
			repaired: 1,
			queued: 0,
		})
		expect(
			database.query('SELECT created_at, attempts, next_attempt_at, user_id, size FROM object_deletions').get()
		).toEqual({ created_at: 10, attempts: 3, next_attempt_at: 1000, user_id: 'owner', size: 42 })
		database.query('UPDATE object_deletions SET user_id = NULL, size = NULL').run()
		inventory.rows.clear()
		inventory.parts = [{ key: reconciliationKey, id: 'abandoned', created: 0 }]
		const parts = await reconciliationPlan(database, inventory)
		expect(await applyReconciliationPlan(database, inventory, parts, options(database))).toMatchObject({ repaired: 1 })
		expect(database.query('SELECT size, discard_upload FROM object_deletions').get()).toEqual({
			size: null,
			discard_upload: 1,
		})
	} finally {
		database.close()
	}
})

test('HTTP second precision accepts an unchanged Garage version but still rejects a later modification', async () => {
	const database = reconciliationDatabase()
	try {
		const inventory = new ReconciliationInventory()
		const object = inventory.rows.get(reconciliationKey)
		if (!object) throw new Error('Missing fixture')
		inventory.rows.set(reconciliationKey, { ...object, modified: 825 })
		const plan = await reconciliationPlan(database, inventory)
		inventory.rows.set(reconciliationKey, object)
		expect(await applyReconciliationPlan(database, inventory, plan, options(database))).toMatchObject({ queued: 1 })
		database.exec('DELETE FROM object_deletions')
		inventory.rows.set(reconciliationKey, { ...object, modified: 1000 })
		expect(await applyReconciliationPlan(database, inventory, plan, options(database))).toMatchObject({
			queued: 0,
			skipped: 1,
		})
	} finally {
		database.close()
	}
})

test('modified metadata, new references and changed deletion claims are skipped before writes', async () => {
	const database = reconciliationDatabase()
	try {
		const inventory = new ReconciliationInventory()
		const plan = await reconciliationPlan(database, inventory)
		const object = inventory.rows.get(reconciliationKey)
		if (!object) throw new Error('Missing fixture')
		inventory.rows.set(reconciliationKey, { ...object, etag: 'changed' })
		expect(await applyReconciliationPlan(database, inventory, plan, options(database))).toMatchObject({
			skipped: 1,
			queued: 0,
		})
		inventory.rows.set(reconciliationKey, object)
		inventory.beforeInspect = () => {
			database.query('INSERT INTO memories VALUES (?, ?)').run(reconciliationKey, 'owner')
		}
		expect(await applyReconciliationPlan(database, inventory, plan, options(database))).toMatchObject({ skipped: 1 })
		inventory.beforeInspect = undefined
		database.exec('DELETE FROM memories')
		database
			.query('INSERT INTO object_deletions (object_key, created_at, user_id, size) VALUES (?, 0, ?, 42)')
			.run(reconciliationKey, 'owner')
		expect(await applyReconciliationPlan(database, inventory, plan, options(database))).toMatchObject({ skipped: 1 })
	} finally {
		database.close()
	}
})

test('actions excluded during review are never promoted and forged proposals cannot set claims', async () => {
	const database = reconciliationDatabase()
	try {
		const inventory = new ReconciliationInventory()
		database.query('INSERT INTO memories VALUES (?, ?)').run(reconciliationKey, 'owner')
		const protectedPlan = await reconciliationPlan(database, inventory)
		database.exec('DELETE FROM memories')
		expect(await applyReconciliationPlan(database, inventory, protectedPlan, options(database))).toMatchObject({
			ignored: 1,
			queued: 0,
		})
		const forged = await reconciliationPlan(database, inventory)
		if (!forged.entries[0]) throw new Error('Missing entry')
		forged.entries[0].proposal.owner = 'someone-else'
		expect(await applyReconciliationPlan(database, inventory, forged, options(database))).toMatchObject({ skipped: 1 })
	} finally {
		database.close()
	}
})

test('identity, time and shutdown checks precede backups; failures never apply an incomplete batch', async () => {
	const database = reconciliationDatabase()
	try {
		const inventory = new ReconciliationInventory()
		const plan = await reconciliationPlan(database, inventory)
		const settings = options(database)
		await expect(
			applyReconciliationPlan(database, inventory, plan, { ...settings, apiStopped: false })
		).rejects.toThrow('Stop the API')
		await expect(
			applyReconciliationPlan(database, inventory, plan, { ...settings, databasePath: 'another' })
		).rejects.toThrow('database')
		await expect(
			applyReconciliationPlan(database, inventory, plan, { ...settings, now: reconciliationNow - 1 })
		).rejects.toThrow('time')
		inventory.storageId = 'b'.repeat(64)
		await expect(applyReconciliationPlan(database, inventory, plan, settings)).rejects.toThrow('storage')
		await expect(stat(settings.backupPath)).rejects.toThrow()
		inventory.storageId = plan.storageId
		inventory.beforeInspect = () => {
			inventory.storageId = 'b'.repeat(64)
		}
		await expect(applyReconciliationPlan(database, inventory, plan, settings)).rejects.toThrow('changed')
		expect(database.query('SELECT * FROM object_deletions').all()).toEqual([])
	} finally {
		database.close()
	}
})

test('a failure on the second mutation rolls the whole plan back and retains its pre-write backup', async () => {
	const database = reconciliationDatabase()
	try {
		const inventory = new ReconciliationInventory()
		const second = reconciliationKey.replace('1111.glb', '2222.glb')
		inventory.rows.set(second, { key: second, size: 84, modified: 0, etag: 'second' })
		const plan = await reconciliationPlan(database, inventory)
		database.exec(`CREATE TRIGGER fail_reconciliation BEFORE INSERT ON object_deletions
			WHEN NEW.size = 84 BEGIN SELECT RAISE(ABORT, 'fixture failure'); END;`)
		const settings = options(database)
		await expect(applyReconciliationPlan(database, inventory, plan, settings)).rejects.toThrow('fixture failure')
		expect(database.query('SELECT * FROM object_deletions').all()).toEqual([])
		expect((await stat(settings.backupPath)).size).toBeGreaterThan(0)
	} finally {
		database.close()
	}
})
