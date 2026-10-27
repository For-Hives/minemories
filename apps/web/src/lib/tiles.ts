import type { TileList } from '@minemories/api-contract'
import { capturePollDelay } from './capture-file'

export type TileSummary = TileList['tiles'][number]
export type TileVector = { x: number; y: number; z: number }
export type TilePlan = { fetch: TileSummary[]; remove: string[]; keep: number }

export const TILE_FETCH_CONCURRENCY = 4
export const TILE_PREFETCH_WINDOW = 8
export const TILE_RETRY_DELAYS_MS = [250, 750, 2000] as const

const CHUNK_BLOCKS = 16

export class RetryableTileError extends Error {}

export type TileStreamOptions = {
	plan: TilePlan
	tileChunks: number
	focus: { x: number; z: number }
	fetchTile(tile: TileSummary, signal: AbortSignal): Promise<ArrayBuffer>
	applyTile(tile: TileSummary, data: ArrayBuffer, signal: AbortSignal): Promise<void>
	removeTile(id: string): void
	onProgress?(done: number, total: number): void
	signal: AbortSignal
	concurrency?: number
	sleep?(ms: number, signal: AbortSignal): Promise<void>
}

type TileJob = { tile: TileSummary; data: Promise<ArrayBuffer> | null }
type TileAttempt = (tile: TileSummary, signal: AbortSignal) => Promise<ArrayBuffer>

const defaultSleep = (ms: number, signal: AbortSignal): Promise<void> => capturePollDelay(ms / 1000, signal)

export function tileId(x: number, z: number): string {
	return `${x}:${z}`
}

export function planTileUpdate(current: ReadonlyMap<string, string>, next: readonly TileSummary[]): TilePlan {
	const fetch: TileSummary[] = []
	const wanted = new Set<string>()
	let keep = 0
	for (const tile of next) {
		const id = tileId(tile.x, tile.z)
		wanted.add(id)
		if (current.get(id) === tile.sha256) keep += 1
		else fetch.push(tile)
	}
	const remove = [...current.keys()].filter(id => !wanted.has(id)).sort()
	return { fetch, remove, keep }
}

export function orderTiles(
	tiles: readonly TileSummary[],
	tileChunks: number,
	focus: { x: number; z: number }
): TileSummary[] {
	const tileBlocks = CHUNK_BLOCKS * tileChunks
	const distance = (tile: TileSummary): number => {
		const dx = (tile.x + 0.5) * tileBlocks - focus.x
		const dz = (tile.z + 0.5) * tileBlocks - focus.z
		return dx * dx + dz * dz
	}
	return [...tiles].sort((a, b) => distance(a) - distance(b) || a.x - b.x || a.z - b.z)
}

export function tileTranslation(tileChunks: number, tile: { x: number; z: number }, base: TileVector): TileVector {
	const tileBlocks = CHUNK_BLOCKS * tileChunks
	return { x: tile.x * tileBlocks - base.x, y: -base.y, z: tile.z * tileBlocks - base.z }
}

export async function verifyTileDigest(data: ArrayBuffer, sha256: string): Promise<boolean> {
	const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
	const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
	return hex === sha256
}

export async function streamTiles(options: TileStreamOptions): Promise<void> {
	options.signal.throwIfAborted()
	const tiles = orderTiles(options.plan.fetch, options.tileChunks, options.focus)
	const controller = new AbortController()
	const signal = AbortSignal.any([options.signal, controller.signal])
	const limit = createLimiter(options.concurrency ?? TILE_FETCH_CONCURRENCY)
	const sleep = options.sleep ?? defaultSleep
	const jobs = tiles.map((tile): TileJob => ({ tile, data: null }))
	const begin = (job: TileJob): Promise<ArrayBuffer> => {
		if (job.data) return job.data
		const data = limit(() => fetchWithRetry(job.tile, options.fetchTile, sleep, signal))
		// Failures are surfaced when the job is applied; this handler only prevents premature unhandled rejections.
		data.catch(() => undefined)
		job.data = data
		return data
	}
	if (jobs.length > 0) options.onProgress?.(0, jobs.length)
	try {
		await applyInOrder(jobs, begin, options, signal)
	} catch (error) {
		controller.abort(error)
		await Promise.allSettled(jobs.flatMap(job => (job.data ? [job.data] : [])))
		throw options.signal.aborted ? options.signal.reason : error
	}
	for (const id of options.plan.remove) options.removeTile(id)
}

async function applyInOrder(
	jobs: readonly TileJob[],
	begin: (job: TileJob) => Promise<ArrayBuffer>,
	options: TileStreamOptions,
	signal: AbortSignal
): Promise<void> {
	let applied = 0
	for (const [index, job] of jobs.entries()) {
		// Fetching runs a bounded window ahead of the applied tile so slow decoding cannot pile up buffers.
		for (const ahead of jobs.slice(index, index + TILE_PREFETCH_WINDOW)) begin(ahead)
		// biome-ignore lint/performance/noAwaitInLoops: tiles are applied strictly one at a time, in priority order.
		const data = await begin(job)
		options.signal.throwIfAborted()
		await options.applyTile(job.tile, data, signal)
		options.signal.throwIfAborted()
		applied += 1
		options.onProgress?.(applied, jobs.length)
	}
}

async function fetchWithRetry(
	tile: TileSummary,
	attempt: TileAttempt,
	sleep: (ms: number, signal: AbortSignal) => Promise<void>,
	signal: AbortSignal
): Promise<ArrayBuffer> {
	signal.throwIfAborted()
	for (const delay of TILE_RETRY_DELAYS_MS) {
		try {
			// biome-ignore lint/performance/noAwaitInLoops: retries of one tile are sequential by design.
			return await attempt(tile, signal)
		} catch (error) {
			if (!(error instanceof RetryableTileError)) throw error
			await sleep(delay, signal)
		}
	}
	return attempt(tile, signal)
}

// FIFO limiter: tasks start in the order they were submitted, and a freed slot goes to the oldest waiter.
function createLimiter(limit: number): (task: () => Promise<ArrayBuffer>) => Promise<ArrayBuffer> {
	let active = 0
	const waiting: (() => void)[] = []
	const acquire = (): Promise<void> => {
		if (active < limit) {
			active += 1
			return Promise.resolve()
		}
		return new Promise<void>(resolve => waiting.push(() => resolve()))
	}
	const release = (): void => {
		const next = waiting.shift()
		if (next) next()
		else active -= 1
	}
	return async task => {
		await acquire()
		try {
			return await task()
		} finally {
			release()
		}
	}
}
