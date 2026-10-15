import type { Database } from 'bun:sqlite'
import type { ObjectDeletionQueue } from './object-deletions'
import { TimelapseCatalog } from './timelapse-catalog'
import type { TimelapseFiles } from './timelapse-files'
import { TimelapseIndex } from './timelapse-index'

/** One candidate per pass, one global conversion lease, and durable retry times across restarts. */
export class TimelapseMaintenance {
	private active: Promise<void> | null = null
	private readonly shutdown = new AbortController()
	private readonly catalog: TimelapseCatalog
	constructor(
		private readonly database: Database,
		private readonly files: TimelapseFiles,
		private readonly deletions: ObjectDeletionQueue,
		private readonly now = Date.now
	) {
		this.catalog = new TimelapseCatalog(database)
	}
	maintain(): Promise<void> {
		if (this.shutdown.signal.aborted) return Promise.resolve()
		if (!this.active)
			this.active = this.run().finally(() => {
				this.active = null
			})
		return this.active
	}
	async stop(): Promise<void> {
		this.shutdown.abort()
		await this.active
	}
	private async run() {
		try {
			new TimelapseIndex(this.database).backfill()
			this.catalog.collect(this.now())
			await this.deletions.maintain(this.now())
			if (this.shutdown.signal.aborted) return
			const row = this.database
				.query(`SELECT m.id FROM memories m LEFT JOIN timelapse_work w ON w.memory_id=m.id
			 WHERE m.deleted_at IS NULL AND COALESCE(w.next_attempt_at,0)<=?
			 AND CASE WHEN json_valid(m.metadata_json) THEN json_type(m.metadata_json,'$.worldId')='text' ELSE 0 END
			 AND NOT EXISTS(SELECT 1 FROM timelapse_frames f WHERE f.memory_id=m.id)
			 ORDER BY COALESCE(w.next_attempt_at,0),m.created_at,m.id LIMIT 1`)
				.get(this.now()) as { id: string } | null
			if (row) await this.convert(row.id)
		} catch {
			console.error('[timelapse] maintenance failed; durable work remains in SQLite')
		}
	}
	private async convert(id: string) {
		const row = this.database
			.query(`INSERT INTO timelapse_work(memory_id,attempts,next_attempt_at) VALUES (?,1,?)
		 ON CONFLICT(memory_id) DO UPDATE SET attempts=attempts+1,next_attempt_at=excluded.next_attempt_at RETURNING attempts`)
			.get(id, this.now() + 60_000) as { attempts: number }
		try {
			if (await this.files.convert(id, this.shutdown.signal))
				this.database.query('DELETE FROM timelapse_work WHERE memory_id=?').run(id)
		} catch {
			const delay = Math.min(3_600_000, 60_000 * 2 ** Math.min(row.attempts - 1, 6))
			this.database.query('UPDATE timelapse_work SET next_attempt_at=? WHERE memory_id=?').run(this.now() + delay, id)
			if (!this.shutdown.signal.aborted) console.error('[timelapse] conversion incomplete; cleanup persists in SQLite')
		}
	}
}
