import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { compressGlb } from '@minemories/api-contract/glb-meshopt'
import { MeshoptEncoder } from 'meshoptimizer'

export const MAX_DERIVED_SOURCE_BYTES = 64 * 1024 * 1024
const CACHE_BYTES = 128 * 1024 * 1024
const CACHE_TTL_MS = 10 * 60 * 1000
/** At most one compression runs and two wait; any further request is served the original. */
const MAX_PENDING = 3

export interface VariantOptions {
	compress: (glb: Uint8Array) => Promise<Uint8Array | null>
	now: () => number
	maxSourceBytes: number
	cacheBytes: number
	ttlMs: number
}

interface Entry {
	bytes: Uint8Array | null
	expires: number
}

/**
 * Meshopt transport variant of a capture, computed on request from the stored original and kept only in a
 * small in-memory cache. Nothing durable is written: no quota, no deletion to propagate, and a deleted capture
 * disappears from the cache with its time to live. The original is always served when anything goes wrong.
 */
export function createVariantService(options: VariantOptions) {
	const cache = new Map<string, Entry>()
	let cached = 0
	let pending = 0
	let queue: Promise<unknown> = Promise.resolve()

	function forget(key: string) {
		const entry = cache.get(key)
		if (!entry) return
		cached -= entry.bytes?.byteLength ?? 0
		cache.delete(key)
	}
	function remember(key: string, bytes: Uint8Array | null) {
		forget(key)
		const size = bytes?.byteLength ?? 0
		if (size > options.cacheBytes) return
		for (const [oldest] of cache) {
			if (cached + size <= options.cacheBytes) break
			forget(oldest)
		}
		cache.set(key, { bytes, expires: options.now() + options.ttlMs })
		cached += size
	}
	async function derive(original: Uint8Array): Promise<Uint8Array | null> {
		const key = createHash('sha256').update(original).digest('hex')
		const known = cache.get(key)
		if (known && known.expires > options.now()) return known.bytes
		if (known) forget(key)
		if (pending >= MAX_PENDING) return null
		pending++
		const run = queue.then(() => options.compress(original)).catch(() => null)
		queue = run
		try {
			const bytes = await run
			remember(key, bytes)
			return bytes
		} finally {
			pending--
		}
	}

	/** `variant` is the raw query value; anything but `meshopt` returns the stream untouched. */
	return async function variantCapture(variant: string | undefined, contents: Readable) {
		if (variant !== 'meshopt') return { body: contents, headers: {} as Record<string, string> }
		const chunks: Buffer[] = []
		let size = 0
		const iterator = contents[Symbol.asyncIterator]()
		for (;;) {
			// biome-ignore lint/performance/noAwaitInLoops: a stream is consumed chunk by chunk, in order.
			const step = await iterator.next()
			if (step.done) break
			const chunk = Buffer.from(step.value as Uint8Array)
			chunks.push(chunk)
			size += chunk.byteLength
			if (size > options.maxSourceBytes) {
				const rest = Readable.from(
					(async function* () {
						yield* chunks
						for (;;) {
							// biome-ignore lint/performance/noAwaitInLoops: the rest of the stream is forwarded in order.
							const more = await iterator.next()
							if (more.done) return
							yield more.value
						}
					})()
				)
				rest.once('close', () => contents.destroy())
				return { body: rest, headers: {} as Record<string, string> }
			}
		}
		const original = Buffer.concat(chunks)
		const derived = await derive(original)
		if (!derived) return { body: Readable.from([original]), headers: {} as Record<string, string> }
		return { body: Readable.from([derived]), headers: { 'X-Minemories-Variant': 'meshopt' } }
	}
}

async function compressWithMeshopt(glb: Uint8Array): Promise<Uint8Array | null> {
	await MeshoptEncoder.ready
	return compressGlb(glb, MeshoptEncoder)
}

export const variantCapture = createVariantService({
	compress: compressWithMeshopt,
	now: Date.now,
	maxSourceBytes: MAX_DERIVED_SOURCE_BYTES,
	cacheBytes: CACHE_BYTES,
	ttlMs: CACHE_TTL_MS,
})
