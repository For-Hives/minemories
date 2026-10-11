import type { Database } from 'bun:sqlite'
import { TRASH_RETENTION_MS } from '@minemories/api-contract'

const LEGACY_RETENTION_MS = 30 * 24 * 36_001_000

export function migrateTrashRetention(database: Database, now = Date.now()): void {
	const columns = database.query('PRAGMA table_info(memories)').all() as Array<{ name: string }>
	if (columns.some(column => column.name === 'purge_after')) return
	database.transaction(() => {
		database.exec('ALTER TABLE memories ADD COLUMN purge_after INTEGER')
		// Preserve the previous deadline and give overdue legacy captures at least thirty days to recover.
		database
			.query('UPDATE memories SET purge_after = MAX(deleted_at + ?, ?) WHERE deleted_at IS NOT NULL')
			.run(LEGACY_RETENTION_MS, now + TRASH_RETENTION_MS)
	})()
}
