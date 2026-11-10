/** A dynamic import that remembers its module once it has arrived. */
export interface PageChunk<M> {
	/** Starts (or joins) the download. A failure is not remembered: the next call tries again. */
	load: () => Promise<M>
	/** The module once loaded, `undefined` before. */
	loaded: () => M | undefined
}

export function pageChunk<M>(importer: () => Promise<M>): PageChunk<M> {
	let module: M | undefined
	let pending: Promise<M> | undefined
	return {
		load() {
			pending ??= importer().then(
				value => {
					module = value
					return value
				},
				(error: unknown) => {
					pending = undefined
					throw error
				}
			)
			return pending
		},
		loaded: () => module,
	}
}

/**
 * The loader `React.lazy` takes for one export of a chunk. Once the chunk is loaded it answers synchronously, so the lazy
 * page renders without suspending. A native promise always waits a microtask, and React cannot wait for it during a
 * synchronous render: a prerendered page whose Suspense boundary receives such an update before hydrating (the session
 * store, for one) would swap its HTML for the empty fallback, then back, and the page would jump.
 */
export function lazyExport<M, T>(chunk: PageChunk<M>, pick: (module: M) => T): () => Promise<{ default: T }> {
	return () => {
		const module = chunk.loaded()
		if (module === undefined) return chunk.load().then(value => ({ default: pick(value) }))
		const result = { default: pick(module) }
		const settled = {
			// biome-ignore lint/suspicious/noThenProperty: a thenable that calls back at once is the point: React.lazy reads it synchronously.
			then(resolve: (value: { default: T }) => unknown) {
				resolve(result)
				return settled
			},
		}
		return settled as unknown as Promise<{ default: T }>
	}
}
