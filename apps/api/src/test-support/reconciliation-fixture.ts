import { Database } from 'bun:sqlite'
import { Readable } from 'node:stream'
import type { InventoryObject, InventoryUpload, StorageInspection, StorageInventory } from '../storage-inventory'
import { ORPHAN_GRACE_MS } from '../storage-reconciliation'
import { collectReconciliationPlan } from '../storage-reconciliation-plan'

export const reconciliationKey = 'owner/11111111-1111-4111-8111-111111111111.glb'
export const reconciliationNow = 2 * ORPHAN_GRACE_MS
export function reconciliationDatabase(path = ':memory:') {
	const database = new Database(path, { create: true })
	database.exec(`CREATE TABLE devices (user_id TEXT); INSERT INTO devices VALUES ('owner');
		CREATE TABLE memories (object_key TEXT, user_id TEXT);
		CREATE TABLE mod_uploads (id TEXT PRIMARY KEY, user_id TEXT, completed INTEGER);
		CREATE TABLE object_deletions (object_key TEXT PRIMARY KEY, created_at INTEGER NOT NULL,
			attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
			user_id TEXT, size INTEGER, discard_upload INTEGER NOT NULL DEFAULT 0);`)
	return database
}
export class ReconciliationInventory implements StorageInventory {
	readonly rows = new Map<string, InventoryObject>()
	parts: InventoryUpload[] = []
	storageId = 'a'.repeat(64)
	beforeInspect: ((key: string) => void) | undefined
	constructor() {
		this.rows.set(reconciliationKey, { key: reconciliationKey, size: 42, modified: 0, etag: 'original' })
	}
	identity(): Promise<string> {
		return Promise.resolve(this.storageId)
	}
	objects(): AsyncIterable<InventoryObject> {
		return Readable.from(this.rows.values())
	}
	uploads(): AsyncIterable<InventoryUpload> {
		return Readable.from(this.parts)
	}
	inspect(key: string): Promise<StorageInspection> {
		this.beforeInspect?.(key)
		return Promise.resolve({ object: this.rows.get(key) ?? null, uploads: this.parts.filter(part => part.key === key) })
	}
}
export function reconciliationPlan(database: Database, inventory = new ReconciliationInventory()) {
	return collectReconciliationPlan(database, inventory, { databasePath: database.filename, now: reconciliationNow })
}
