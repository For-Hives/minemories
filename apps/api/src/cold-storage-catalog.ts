import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import { coldStorageCandidates } from './cold-storage-policy'

export const COLD_WORKER_LEASE_MS = 15 * 60_000
export const RESTORE_READ_GRACE_MS = 15 * 60_000

export interface ColdStorageWork {
	objectKey: string
	operationId: string
	workerId: string
	state: 'archiving' | 'restoring'
	attempts: number
}

/** Database intent and fencing only. A provider acknowledgement/reconciliation must precede finish(). */
export class ColdStorageCatalog {
	constructor(private readonly database: Database) {}

	beginArchive(objectKey: string, inactiveDays: number, now = Date.now()): boolean {
		return this.database
			.transaction(() => {
				if (!coldStorageCandidates(this.database, inactiveDays, now, 1, objectKey).length) return false
				this.database
					.query(`INSERT INTO object_tiers(object_key,state,operation_id,updated_at) VALUES (?,'archiving',?,?)
				 ON CONFLICT(object_key) DO UPDATE SET state='archiving',operation_id=excluded.operation_id,
				 restore_requested=0,worker_id=NULL,worker_expires_at=0,attempts=0,next_attempt_at=0,hot_until=0,updated_at=excluded.updated_at`)
					.run(objectKey, randomUUID(), now)
				return true
			})
			.immediate()
	}

	/** Restoration waits for confirmed archive completion; an expired worker alone never establishes availability. */
	requestRestore(keys: readonly string[], now = Date.now()): number {
		return this.database
			.query(`UPDATE object_tiers SET
		 state=CASE WHEN state='cold' THEN 'restoring' ELSE state END,
		 operation_id=CASE WHEN state='cold' THEN ? ELSE operation_id END,
		 restore_requested=CASE WHEN state='archiving' THEN 1 ELSE 0 END,
		 next_attempt_at=0,updated_at=?
		 WHERE object_key IN (SELECT value FROM json_each(?))
		 AND (state='cold' OR (state='archiving' AND restore_requested=0))`)
			.run(randomUUID(), now, JSON.stringify(keys)).changes
	}

	claimNext(now = Date.now()): ColdStorageWork | null {
		return this.database
			.transaction(() => {
				const row = this.database
					.query(`SELECT object_key AS objectKey,operation_id AS operationId,state,attempts FROM object_tiers
				 WHERE state IN ('archiving','restoring') AND next_attempt_at<=? AND worker_expires_at<=?
				 ORDER BY state='restoring' DESC,next_attempt_at,updated_at,object_key LIMIT 1`)
					.get(now, now) as Omit<ColdStorageWork, 'workerId'> | null
				if (!row) return null
				const workerId = randomUUID()
				this.database
					.query('UPDATE object_tiers SET worker_id=?,worker_expires_at=? WHERE object_key=?')
					.run(workerId, now + COLD_WORKER_LEASE_MS, row.objectKey)
				return { ...row, workerId }
			})
			.immediate()
	}

	renew(work: ColdStorageWork, now = Date.now()): void {
		const updated = this.database
			.query(`UPDATE object_tiers SET worker_expires_at=? WHERE object_key=? AND operation_id=? AND worker_id=?
		 AND state=? AND worker_expires_at>?`)
			.run(now + COLD_WORKER_LEASE_MS, work.objectKey, work.operationId, work.workerId, work.state, now)
		if (!updated.changes) throw new Error('Cold storage worker lease expired')
	}

	/** Timed-out or failed requests remain unreadable: the remote side may already have applied them. */
	fail(work: ColdStorageWork, now = Date.now()): boolean {
		const delay = Math.min(3_600_000, 60_000 * 2 ** Math.min(work.attempts, 6))
		return Boolean(
			this.database
				.query(`UPDATE object_tiers SET attempts=attempts+1,next_attempt_at=?,worker_id=NULL,worker_expires_at=0,
		 updated_at=? WHERE object_key=? AND operation_id=? AND worker_id=? AND state=? AND worker_expires_at>?`)
				.run(now + delay, now, work.objectKey, work.operationId, work.workerId, work.state, now).changes
		)
	}

	finish(work: ColdStorageWork, now = Date.now()): boolean {
		return Boolean(
			this.database
				.query(`UPDATE object_tiers SET
		 state=CASE WHEN state='restoring' THEN 'hot' WHEN restore_requested=1 THEN 'restoring' ELSE 'cold' END,
		 hot_until=CASE WHEN state='restoring' THEN ? ELSE hot_until END,
		 operation_id=?,restore_requested=0,worker_id=NULL,worker_expires_at=0,attempts=0,next_attempt_at=0,updated_at=?
		 WHERE object_key=? AND operation_id=? AND worker_id=? AND state=? AND worker_expires_at>?`)
				.run(
					now + RESTORE_READ_GRACE_MS,
					randomUUID(),
					now,
					work.objectKey,
					work.operationId,
					work.workerId,
					work.state,
					now
				).changes
		)
	}
}
