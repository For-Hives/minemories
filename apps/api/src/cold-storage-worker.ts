import { COLD_WORKER_LEASE_MS, type ColdStorageCatalog, type ColdStorageWork } from './cold-storage-catalog'
import type { TierCopy } from './tier-locations'

export interface ColdStorageProvider {
	/** May request an asynchronous restore. False means retry later; never publish a partial restore. */
	prepare(work: ColdStorageWork, copy: TierCopy, signal: AbortSignal): Promise<boolean>
	/** Return only after the provider acknowledged the copy AND verified its size and storage class. */
	copy(work: ColdStorageWork, copy: TierCopy, signal: AbortSignal): Promise<void>
}

/** Explicitly constructed by configured providers only; no cloud calls or scheduling on import. */
export class ColdStorageWorker {
	private active: Promise<void> | null = null
	private controller: AbortController | null = null
	private stopped = false
	constructor(
		private readonly catalog: ColdStorageCatalog,
		private readonly provider: ColdStorageProvider,
		private readonly now = Date.now,
		private readonly heartbeatMs = 60_000
	) {}

	maintain(): Promise<void> {
		if (this.stopped) return Promise.resolve()
		this.active ??= this.run()
			.catch(() => {
				console.error('[cold-storage] maintenance failed; durable work remains in SQLite')
			})
			.finally(() => {
				this.active = null
			})
		return this.active
	}

	async stop(): Promise<void> {
		this.stopped = true
		this.controller?.abort(new Error('Cold storage worker stopped'))
		await this.active
	}

	private async run(): Promise<void> {
		const work = this.catalog.claimNext(this.now())
		if (!work) return
		const controller = new AbortController()
		this.controller = controller
		// Bound a provider attempt independently of lease renewals; ownership is rechecked before publication.
		const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(COLD_WORKER_LEASE_MS / 2)])
		const heartbeat = setInterval(() => {
			try {
				this.catalog.renew(work, this.now())
			} catch {
				controller.abort(new Error('Cold storage worker lost its lease'))
			}
		}, this.heartbeatMs)
		let target: TierCopy | undefined
		let copyStarted = false
		try {
			target = this.catalog.reserveCopy(work, this.now())
			const ready = await this.provider.prepare(work, target, signal)
			signal.throwIfAborted()
			if (!ready) {
				this.catalog.discardCopy(work, target.physicalKey, this.now())
				this.catalog.fail(work, this.now())
				return
			}
			// Recheck ownership immediately before remote mutation, including after a long restore poll.
			this.catalog.renew(work, this.now())
			copyStarted = true
			await this.provider.copy(work, target, signal)
			signal.throwIfAborted()
			if (!this.catalog.finish(work, target.physicalKey, this.now())) throw new Error('Stale copy acknowledgement')
		} catch {
			// A timed-out provider can still complete the copy. Keep its unique target out of use until orphan grace.
			if (target) this.catalog.discardCopy(work, target.physicalKey, this.now(), copyStarted)
			this.catalog.fail(work, this.now())
		} finally {
			clearInterval(heartbeat)
			this.controller = null
		}
	}
}
