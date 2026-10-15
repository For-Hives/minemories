import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import { TierLocations } from './tier-locations'

const LEASE_MS = 15 * 60_000
interface GarbageWork {
	physical_key: string
	generation: string
	attempts: number
	workerId: string
}

/**
 * One retired physical generation per pass. The remover must DELETE the raw physical key:
 * resolving a retired original's logical key again would delete its replacement.
 */
export class TierGarbage {
	private active: Promise<void> | null = null
	private stopped = false
	constructor(
		private readonly database: Database,
		private readonly remove: (key: string) => Promise<void>,
		private readonly now = Date.now
	) {}

	maintain(): Promise<void> {
		if (this.stopped) return Promise.resolve()
		this.active ??= this.run()
			.catch(() => {
				console.error('[tier-garbage] maintenance failed; durable work remains in SQLite')
			})
			.finally(() => {
				this.active = null
			})
		return this.active
	}
	async stop(): Promise<void> {
		this.stopped = true
		await this.active
	}

	private claim(now: number): GarbageWork | null {
		return this.database
			.transaction(() => {
				const row = this.database
					.query(`SELECT physical_key,generation,attempts FROM object_tier_garbage g
			 WHERE next_attempt_at<=? AND worker_expires_at<=?
			 AND NOT EXISTS(SELECT 1 FROM object_tier_locations l WHERE l.physical_key=g.physical_key)
			 AND NOT EXISTS(SELECT 1 FROM object_tier_copies c WHERE c.physical_key=g.physical_key)
			 ORDER BY next_attempt_at,physical_key LIMIT 1`)
					.get(now, now) as Omit<GarbageWork, 'workerId'> | null
				if (!row) return null
				const workerId = randomUUID()
				this.database
					.query('UPDATE object_tier_garbage SET worker_id=?,worker_expires_at=? WHERE physical_key=?')
					.run(workerId, now + LEASE_MS, row.physical_key)
				return { ...row, workerId }
			})
			.immediate()
	}

	private async run(): Promise<void> {
		new TierLocations(this.database).collectExpired(this.now())
		const work = this.claim(this.now())
		if (!work) return
		if (new TierLocations(this.database).physicalInUse(work.physical_key)) return
		try {
			await this.remove(work.physical_key)
			this.database
				.query('DELETE FROM object_tier_garbage WHERE physical_key=? AND generation=? AND worker_id=?')
				.run(work.physical_key, work.generation, work.workerId)
		} catch {
			const delay = Math.min(3_600_000, 60_000 * 2 ** Math.min(work.attempts, 6))
			this.database
				.query(`UPDATE object_tier_garbage SET attempts=attempts+1,next_attempt_at=?,worker_id=NULL,worker_expires_at=0
			 WHERE physical_key=? AND generation=? AND worker_id=?`)
				.run(this.now() + delay, work.physical_key, work.generation, work.workerId)
		}
	}
}
