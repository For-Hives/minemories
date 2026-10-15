import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import type { ColdStorageWork } from './cold-storage-catalog'
import { ORPHAN_GRACE_MS } from './storage-reconciliation'

export interface TierCopy {
	physicalKey: string
	sourceKey: string
	userId: string
	size: number
}

/** Immutable physical generations keep late storage writes away from the currently published file. */
export class TierLocations {
	constructor(private readonly database: Database) {}

	resolve(objectKey: string): string {
		const row = this.database
			.query('SELECT physical_key FROM object_tier_locations WHERE object_key=?')
			.get(objectKey) as { physical_key: string } | null
		return row?.physical_key ?? objectKey
	}

	reserve(work: ColdStorageWork, now: number): TierCopy {
		return this.database
			.transaction(() => {
				const active = this.database
					.query(`SELECT user_id,size FROM object_tiers WHERE object_key=? AND operation_id=?
			 AND worker_id=? AND state=? AND worker_expires_at>?`)
					.get(work.objectKey, work.operationId, work.workerId, work.state, now) as {
					user_id: string
					size: number
				} | null
				if (!active?.user_id || active.size < 1) throw new Error('Cold storage copy reservation expired')
				const previous = this.database
					.query(`SELECT physical_key AS physicalKey,source_key AS sourceKey,user_id AS userId,size
			 FROM object_tier_copies WHERE object_key=? AND worker_id=?`)
					.get(work.objectKey, work.workerId) as TierCopy | null
				if (previous) return previous
				const target: TierCopy = {
					physicalKey: `${active.user_id}/tiers/${randomUUID()}.glb`,
					sourceKey: this.resolve(work.objectKey),
					userId: active.user_id,
					size: active.size,
				}
				this.database
					.query('INSERT INTO object_tier_copies VALUES (?,?,?,?,?,?,?)')
					.run(
						target.physicalKey,
						work.objectKey,
						target.sourceKey,
						work.operationId,
						work.workerId,
						target.userId,
						target.size
					)
				return target
			})
			.immediate()
	}

	canPublish(work: ColdStorageWork, target: string, now: number): boolean {
		return Boolean(
			this.database
				.query(`SELECT 1 FROM object_tier_copies c JOIN object_tiers t USING(object_key)
		 LEFT JOIN object_tier_locations l USING(object_key) WHERE c.physical_key=? AND c.object_key=?
		 AND c.operation_id=? AND c.worker_id=? AND t.operation_id=c.operation_id AND t.worker_id=c.worker_id
		 AND t.state=? AND t.worker_expires_at>? AND c.source_key=COALESCE(l.physical_key,c.object_key)`)
				.get(target, work.objectKey, work.operationId, work.workerId, work.state, now)
		)
	}

	/** The caller holds the same immediate transaction as the tier-state acknowledgement. */
	publish(work: ColdStorageWork, target: string, now: number): void {
		const source = this.database
			.query(`DELETE FROM object_tier_copies WHERE physical_key=? AND object_key=?
		 AND operation_id=? AND worker_id=? RETURNING source_key`)
			.get(target, work.objectKey, work.operationId, work.workerId) as { source_key: string } | null
		if (!source) throw new Error('Missing cold storage copy acknowledgement')
		this.database
			.query(`INSERT INTO object_tier_locations VALUES (?,?) ON CONFLICT(object_key)
		 DO UPDATE SET physical_key=excluded.physical_key`)
			.run(work.objectKey, target)
		this.retire(source.source_key, work.objectKey, now)
	}

	discard(work: ColdStorageWork, target: string, now: number, uncertain = false): boolean {
		return this.database
			.transaction(() => {
				const deleted = this.database
					.query(`DELETE FROM object_tier_copies WHERE physical_key=? AND object_key=?
			 AND operation_id=? AND worker_id=?`)
					.run(target, work.objectKey, work.operationId, work.workerId)
				if (!deleted.changes) return false
				this.retire(target, work.objectKey, now + (uncertain ? ORPHAN_GRACE_MS : 0))
				return true
			})
			.immediate()
	}

	collectExpired(now: number): number {
		return this.database
			.transaction(() => {
				const rows = this.database
					.query(`SELECT c.physical_key,c.object_key FROM object_tier_copies c
			 LEFT JOIN object_tiers t USING(object_key) WHERE t.object_key IS NULL OR t.operation_id!=c.operation_id
			 OR t.worker_id IS NULL OR t.worker_id!=c.worker_id OR t.worker_expires_at<=? LIMIT 100`)
					.all(now) as Array<{ physical_key: string; object_key: string }>
				for (const row of rows) {
					this.database.query('DELETE FROM object_tier_copies WHERE physical_key=?').run(row.physical_key)
					this.retire(row.physical_key, row.object_key, now + ORPHAN_GRACE_MS)
				}
				return rows.length
			})
			.immediate()
	}

	physicalInUse(key: string): boolean {
		return Boolean(
			this.database
				.query(`SELECT 1 FROM object_tier_locations WHERE physical_key=?
		 UNION ALL SELECT 1 FROM object_tier_copies WHERE physical_key=? LIMIT 1`)
				.get(key, key)
		)
	}

	forget(objectKey: string, expectedPhysical: string): void {
		this.database
			.query('DELETE FROM object_tier_locations WHERE object_key=? AND physical_key=?')
			.run(objectKey, expectedPhysical)
	}

	private retire(key: string, objectKey: string, notBefore: number): void {
		this.database
			.query(`INSERT INTO object_tier_garbage(physical_key,object_key,generation,next_attempt_at) VALUES (?,?,?,?)
		 ON CONFLICT(physical_key) DO UPDATE SET generation=excluded.generation,next_attempt_at=excluded.next_attempt_at,
		 attempts=0,worker_id=NULL,worker_expires_at=0`)
			.run(key, objectKey, randomUUID(), notBefore)
	}
}
