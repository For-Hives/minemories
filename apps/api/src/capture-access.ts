import type { Database } from 'bun:sqlite'

export function migrateCaptureAccess(database: Database): void {
	const columns = database.query('PRAGMA table_info(memories)').all() as Array<{ name: string }>
	if (!columns.some(column => column.name === 'last_opened_at')) {
		database.exec('ALTER TABLE memories ADD COLUMN last_opened_at INTEGER')
	}
}

/** Logical capture identity survives conversion to a deduplicated timelapse manifest. */
export function recordCaptureOpening(database: Database, objectKey: string | null, now = Date.now()): void {
	database
		.query(`UPDATE memories SET last_opened_at = MAX(COALESCE(last_opened_at, created_at), ?)
		 WHERE object_key = ? AND deleted_at IS NULL`)
		.run(now, objectKey)
}
