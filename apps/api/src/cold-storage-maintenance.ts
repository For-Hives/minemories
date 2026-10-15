import type { Database } from 'bun:sqlite'
import { ColdStorageCatalog } from './cold-storage-catalog'
import { coldStorageCandidates, coldStorageInactiveDays } from './cold-storage-policy'
import { type ColdStorageProvider, ColdStorageWorker } from './cold-storage-worker'
import { TierGarbage } from './tier-garbage'

/** One global copy at a time; pending restores and retries finish before selecting another inactive object. */
export class ColdStorageMaintenance {
	private active: Promise<void> | null = null
	private stopped = false
	private readonly worker: ColdStorageWorker
	private readonly garbage: TierGarbage
	constructor(
		private readonly database: Database,
		provider: ColdStorageProvider,
		removePhysical: (key: string) => Promise<void>,
		private readonly days: number,
		private readonly now = Date.now
	) {
		coldStorageInactiveDays(String(days))
		this.worker = new ColdStorageWorker(new ColdStorageCatalog(database), provider, now)
		this.garbage = new TierGarbage(database, removePhysical, now)
	}
	maintain(): Promise<void> {
		if (this.stopped) return Promise.resolve()
		this.active ??= this.run()
			.catch(() => {
				console.error('[cold-storage] scheduling failed; durable work remains in SQLite')
			})
			.finally(() => {
				this.active = null
			})
		return this.active
	}
	async stop(): Promise<void> {
		this.stopped = true
		await Promise.all([this.worker.stop(), this.garbage.stop()])
		await this.active
	}
	private async run(): Promise<void> {
		await this.garbage.maintain()
		if (this.stopped) return
		this.database
			.transaction(() => {
				const pending = this.database
					.query(`SELECT 1 FROM object_tiers WHERE state IN ('archiving','restoring')
				 UNION ALL SELECT 1 FROM object_tier_garbage LIMIT 1`)
					.get()
				if (pending) return
				const candidate = coldStorageCandidates(this.database, this.days, this.now(), 1)[0]
				if (candidate) new ColdStorageCatalog(this.database).beginArchive(candidate.objectKey, this.days, this.now())
			})
			.immediate()
		if (!this.stopped) await this.worker.maintain()
	}
}
