import type { Database } from 'bun:sqlite'
import { ACCOUNT_STORAGE_BYTES } from './configuration'

export function accountStorageUsage(database: Database, userId: string): number {
	const row = database
		.query(`SELECT COALESCE(SUM(size), 0) AS bytes FROM (
			SELECT size FROM memories WHERE user_id = ?
			UNION ALL SELECT size FROM mod_uploads WHERE user_id = ? AND completed = 0
			UNION ALL SELECT size FROM object_deletions WHERE user_id = ?
		)`)
		.get(userId, userId, userId) as { bytes: number }
	return row.bytes
}

export function accountStorageFits(database: Database, userId: string, size: number): boolean {
	const used = accountStorageUsage(database, userId)
	return (
		Number.isSafeInteger(used) &&
		used >= 0 &&
		Number.isSafeInteger(size) &&
		size >= 0 &&
		size <= ACCOUNT_STORAGE_BYTES - used
	)
}
