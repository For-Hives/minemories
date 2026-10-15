import type { Database } from 'bun:sqlite'

export type ObjectTierState = 'hot' | 'archiving' | 'cold' | 'restoring'

export function migrateObjectTiers(database: Database): void {
	database.exec(`CREATE TABLE IF NOT EXISTS object_tiers (
	 object_key TEXT PRIMARY KEY,user_id TEXT NOT NULL DEFAULT '',size INTEGER NOT NULL DEFAULT 0,
	 state TEXT NOT NULL CHECK(state IN ('hot','archiving','cold','restoring')),
	 operation_id TEXT NOT NULL,restore_requested INTEGER NOT NULL DEFAULT 0 CHECK(restore_requested IN (0,1)),
	 worker_id TEXT,worker_expires_at INTEGER NOT NULL DEFAULT 0,
	 attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL DEFAULT 0,
	 hot_until INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL
	 );
	 CREATE INDEX IF NOT EXISTS object_tiers_work ON object_tiers(state,next_attempt_at,worker_expires_at);
	 CREATE TABLE IF NOT EXISTS object_tier_locations (
	 object_key TEXT PRIMARY KEY,physical_key TEXT NOT NULL UNIQUE
	 );
	 CREATE TABLE IF NOT EXISTS object_tier_copies (
	 physical_key TEXT PRIMARY KEY,object_key TEXT NOT NULL,source_key TEXT NOT NULL,
	 operation_id TEXT NOT NULL,worker_id TEXT NOT NULL,user_id TEXT NOT NULL,size INTEGER NOT NULL,
	 UNIQUE(object_key,worker_id)
	 );
	 CREATE INDEX IF NOT EXISTS object_tier_copy_work ON object_tier_copies(object_key,operation_id,worker_id);
	 CREATE TABLE IF NOT EXISTS object_tier_garbage (
	 physical_key TEXT PRIMARY KEY,object_key TEXT NOT NULL,generation TEXT NOT NULL,
	 next_attempt_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,worker_id TEXT,
	 worker_expires_at INTEGER NOT NULL DEFAULT 0
	 );
	 CREATE INDEX IF NOT EXISTS object_tier_garbage_due ON object_tier_garbage(next_attempt_at,worker_expires_at);`)
	const columns = database.query('PRAGMA table_info(object_tiers)').all() as Array<{ name: string }>
	for (const [name, definition] of [
		['user_id', "user_id TEXT NOT NULL DEFAULT ''"],
		['size', 'size INTEGER NOT NULL DEFAULT 0'],
	]) {
		if (!columns.some(column => column.name === name))
			database.exec(`ALTER TABLE object_tiers ADD COLUMN ${definition}`)
	}
}

export class CaptureArchivedError extends Error {
	constructor(readonly state: Exclude<ObjectTierState, 'hot'>) {
		super('Capture storage requires restoration before reading.')
		this.name = 'CaptureArchivedError'
	}
}

/** Must run in the same SQLite write transaction as acquiring the corresponding reader/conversion lease. */
export function assertObjectsHot(database: Database, keys: readonly string[]): void {
	const row = database
		.query(
			"SELECT state FROM object_tiers WHERE object_key IN (SELECT value FROM json_each(?)) AND state!='hot' LIMIT 1"
		)
		.get(JSON.stringify(keys)) as { state: Exclude<ObjectTierState, 'hot'> } | null
	if (row) throw new CaptureArchivedError(row.state)
}
