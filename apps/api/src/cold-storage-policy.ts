import type { Database } from 'bun:sqlite'
import { managedMemoryKey } from './storage-references'

const positiveInteger = /^\d+$/

const DAY_MS = 24 * 60 * 60 * 1000
export const MAX_COLD_CANDIDATES = 1000

export function coldStorageInactiveDays(value = '90'): number {
	const days = Number(value)
	if (!(positiveInteger.test(value) && Number.isInteger(days)) || days < 60 || days > 90)
		throw new Error('COLD_STORAGE_INACTIVE_DAYS must be an integer from 60 to 90.')
	return days
}

export interface ColdCandidate {
	objectKey: string
	userId: string
	size: number
	references: number
	lastActivityAt: number
}

/** A preview is not a transition claim: eligibility must be checked again inside the archive transaction. */
export function coldStorageCandidates(
	database: Database,
	days: number,
	now = Date.now(),
	limit = 100
): ColdCandidate[] {
	coldStorageInactiveDays(String(days))
	if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid archive policy time.')
	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_COLD_CANDIDATES)
		throw new Error('Archive preview limit must be between 1 and 1000.')
	const rows = database
		.query(`WITH capture_objects AS (
		 SELECT m.object_key,m.id,m.user_id,m.size,m.deleted_at,1 AS owner_valid,
		 MAX(m.created_at,COALESCE(m.last_opened_at,m.created_at)) AS activity
		 FROM memories m WHERE NOT EXISTS(SELECT 1 FROM timelapse_frames f WHERE f.memory_id=m.id)
		 UNION ALL
		 SELECT c.object_key,m.id,m.user_id,c.size,m.deleted_at,c.user_id=m.user_id AS owner_valid,
		 MAX(m.created_at,COALESCE(m.last_opened_at,m.created_at)) AS activity
		 FROM timelapse_chunks c JOIN timelapse_refs r ON r.object_key=c.object_key
		 JOIN memories m ON m.id=r.memory_id WHERE c.state='ready'
		 ), candidates AS (
		 SELECT object_key,MIN(user_id) AS userId,MAX(size) AS size,
		 COUNT(DISTINCT id) AS "references",MAX(activity) AS lastActivityAt
		 FROM capture_objects GROUP BY object_key
		 HAVING COUNT(DISTINCT user_id)=1 AND MIN(owner_valid)=1 AND SUM(deleted_at IS NOT NULL)=0
		 AND MIN(activity)>=0 AND MAX(activity)<=?
		 ) SELECT object_key AS objectKey,userId,size,"references",lastActivityAt FROM candidates c
		 WHERE NOT EXISTS(SELECT 1 FROM object_deletions d WHERE d.object_key=c.object_key)
		 AND NOT EXISTS(SELECT 1 FROM timelapse_leases l WHERE l.original_key=c.object_key AND l.expires_at>?)
		 AND NOT EXISTS(SELECT 1 FROM timelapse_pending_refs p JOIN timelapse_leases l ON l.id=p.lease_id
		 WHERE p.object_key=c.object_key AND l.expires_at>?)
		 AND NOT EXISTS(SELECT 1 FROM timelapse_reader_refs r JOIN timelapse_readers v ON v.id=r.reader_id
		 WHERE r.object_key=c.object_key AND v.expires_at>?)
		 ORDER BY lastActivityAt,object_key LIMIT ?`)
		.all(now - days * DAY_MS, now, now, now, limit) as ColdCandidate[]
	return rows.filter(row => managedMemoryKey(row.objectKey)?.owner === row.userId)
}
