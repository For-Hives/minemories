export type FrameStatus = 'waiting' | 'loading' | 'ready' | 'archived' | 'failed' | 'skipped'

export interface LoadBudget {
	maxFrames: number
	maxBytes: number
}

export const DEFAULT_WORLD_BUDGET: LoadBudget = { maxFrames: 256, maxBytes: 768 * 1024 * 1024 }

/** Keeps the most recent captures that fit the budget: the present state of the world matters most. */
export function plannedFrames(sizes: readonly number[], budget: LoadBudget = DEFAULT_WORLD_BUDGET): boolean[] {
	const planned = sizes.map(() => false)
	let frames = 0,
		bytes = 0
	for (let position = sizes.length - 1; position >= 0; position--) {
		const size = sizes[position] as number
		if (frames >= budget.maxFrames || bytes + size > budget.maxBytes) break
		planned[position] = true
		frames++
		bytes += size
	}
	return planned
}

export class RestorationNeeded extends Error {}

export interface WorldLoaderOptions<F> {
	concurrency: number
	download(frame: F, signal: AbortSignal): Promise<File>
	attach(frame: F, position: number, file: File, signal: AbortSignal): Promise<void>
	onStatus(position: number, status: FrameStatus): void
}

/**
 * Downloads oldest first with bounded concurrency, then attaches captures one at a time so parsing never
 * competes with itself on the main thread. Cancellation stops every pending download and attachment.
 */
export class WorldLoader<F> {
	private readonly controller = new AbortController()
	private readonly queue: number[] = []
	private active = 0
	private attaching: Promise<void> = Promise.resolve()

	constructor(
		private readonly frames: readonly F[],
		planned: readonly boolean[],
		private readonly options: WorldLoaderOptions<F>
	) {
		for (const [position, wanted] of planned.entries()) {
			if (wanted) this.queue.push(position)
			options.onStatus(position, wanted ? 'waiting' : 'skipped')
		}
	}

	start(): void {
		while (this.active < this.options.concurrency && this.queue.length > 0 && !this.controller.signal.aborted)
			this.run(this.queue.shift() as number)
	}

	retry(position: number): void {
		if (this.controller.signal.aborted || !this.frames[position]) return
		this.options.onStatus(position, 'waiting')
		this.queue.unshift(position)
		this.start()
	}

	dispose(): void {
		this.controller.abort()
		this.queue.length = 0
	}

	private run(position: number): void {
		const signal = this.controller.signal,
			frame = this.frames[position] as F
		this.active++
		this.options.onStatus(position, 'loading')
		void this.options
			.download(frame, signal)
			.then(file => this.attach(frame, position, file, signal))
			.then(
				() => this.report(position, 'ready'),
				error => this.report(position, error instanceof RestorationNeeded ? 'archived' : 'failed')
			)
			.finally(() => {
				this.active--
				this.start()
			})
	}

	private attach(frame: F, position: number, file: File, signal: AbortSignal): Promise<void> {
		const attached = this.attaching.then(() => {
			signal.throwIfAborted()
			return this.options.attach(frame, position, file, signal)
		})
		this.attaching = attached.catch(() => undefined)
		return attached
	}

	private report(position: number, status: FrameStatus): void {
		if (!this.controller.signal.aborted) this.options.onStatus(position, status)
	}
}
