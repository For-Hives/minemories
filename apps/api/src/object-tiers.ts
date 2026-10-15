import type { Database } from 'bun:sqlite'

export type ObjectTierState = 'hot' | 'archiving' | 'cold' | 'restoring'

export function migrateObjectTiers(database: Database): void {
	database.exec(`CREATE TABLE IF NOT EXISTS object_tiers (
	 object_key TEXT PRIMARY KEY,state TEXT NOT NULL CHECK(state IN ('hot','archiving','cold','restoring')),
	 operation_id TEXT NOT NULL,restore_requested INTEGER NOT NULL DEFAULT 0 CHECK(restore_requested IN (0,1)),
	 worker_id TEXT,worker_expires_at INTEGER NOT NULL DEFAULT 0,
	 attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL DEFAULT 0,
	 hot_until INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL
	 );
	 CREATE INDEX IF NOT EXISTS object_tiers_work ON object_tiers(state,next_attempt_at,worker_expires_at);`)
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
