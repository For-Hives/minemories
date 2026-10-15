import type { TemporalFrame } from '@minemories/api-contract'

/** One active fetch/parse and one replaceable pending selection, irrespective of scrubbing speed. */
export class TemporalLoader {
	private pending: TemporalFrame | null = null
	private active: AbortController | null = null
	private disposed = false

	constructor(
		private readonly load: (frame: TemporalFrame, signal: AbortSignal) => Promise<void>,
		private readonly ready: (frame: TemporalFrame) => void,
		private readonly failed: (error: unknown) => void,
		private readonly busy: (value: boolean) => void
	) {}

	select(frame: TemporalFrame): void {
		if (this.disposed) return
		this.pending = frame
		if (this.active) this.active.abort()
		else void this.drain()
	}

	dispose(): void {
		this.disposed = true
		this.pending = null
		this.active?.abort()
	}

	private async drain(): Promise<void> {
		this.busy(true)
		while (this.pending && !this.disposed) {
			const frame = this.pending
			this.pending = null
			const controller = new AbortController()
			this.active = controller
			try {
				// biome-ignore lint/performance/noAwaitInLoops: sequential parsing bounds CPU/GPU memory; parallel loads are forbidden here.
				await this.load(frame, controller.signal)
				if (!controller.signal.aborted) this.ready(frame)
			} catch (error) {
				if (!controller.signal.aborted) this.failed(error)
			}
		}
		this.active = null
		if (!this.disposed) this.busy(false)
	}
}
