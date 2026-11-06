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

/** Every row that counts against a quota: stored captures, unfinished upload reservations, pending deletions. */
const USAGE_ROWS = `SELECT user_id, size, 0 AS reserved, 0 AS deletion, 1 AS capture, size AS stored FROM memories
	UNION ALL SELECT user_id, size, size, 0, 0, 0 FROM mod_uploads WHERE completed = 0
	UNION ALL SELECT user_id, size,
		CASE WHEN discard_upload = 1 THEN size ELSE 0 END,
		CASE WHEN discard_upload = 0 THEN size ELSE 0 END, 0, 0
		FROM object_deletions`
/** One grouped row per account with any usage (same rules as `accountStorageSummary`); join it, never loop on it. */
export const ACCOUNT_USAGE_SQL = `SELECT user_id, SUM(size) AS usedBytes, SUM(reserved) AS reservedBytes,
	SUM(deletion) AS pendingDeletionBytes, SUM(capture) AS captures, SUM(stored) AS storedBytes
	FROM (${USAGE_ROWS}) GROUP BY user_id`

export function accountStorageSummary(database: Database, userId: string) {
	const row = database
		.query(`SELECT COALESCE(SUM(size), 0) AS usedBytes,
		COALESCE(SUM(reserved), 0) AS reservedBytes, COALESCE(SUM(deletion), 0) AS pendingDeletionBytes
		FROM (${USAGE_ROWS}) WHERE user_id = ?`)
		.get(userId) as { usedBytes: number; reservedBytes: number; pendingDeletionBytes: number }
	return {
		...row,
		limitBytes: ACCOUNT_STORAGE_BYTES,
		availableBytes: Math.max(0, ACCOUNT_STORAGE_BYTES - row.usedBytes),
	}
}
