import type { TemporalFrame, TileList } from '@minemories/api-contract'
import { apiClient } from '../api-client'
import {
	planTileUpdate,
	RetryableTileError,
	streamTiles,
	type TileSummary,
	tileId,
	tileTranslation,
} from '../lib/tiles'
import type { ViewerScene } from '../viewer-scene'
import { fetchTemporalTile } from './temporal-tiles'

export type TiledViewer = Pick<ViewerScene, 'setTile' | 'removeTile' | 'tileIds' | 'frameTiles'>
export type TiledFrameOptions = {
	frame: TemporalFrame
	viewer: TiledViewer
	displayed: Map<string, string>
	base: { x: number; y: number; z: number }
	signal: AbortSignal
	restore<T>(run: () => Promise<T>): Promise<T>
	onProgress(done: number, total: number): void
	listTiles?: (memoryId: string, signal: AbortSignal) => Promise<TileList>
	fetchTile?: typeof fetchTemporalTile
}
type TileFetch = (frame: TemporalFrame, tile: TileSummary, signal: AbortSignal) => Promise<ArrayBuffer>

export async function showTiledFrame(options: TiledFrameOptions): Promise<void> {
	const { frame, viewer, displayed, base, signal } = options
	const list = await (options.listTiles ?? listTiles)(frame.id, signal)
	signal.throwIfAborted()
	const first = viewer.tileIds().length === 0
	// Tiles the viewer holds but this series no longer tracks are removed by the plan.
	for (const id of viewer.tileIds()) if (!displayed.has(id)) displayed.set(id, '')
	const plan = planTileUpdate(displayed, list.tiles)
	const frameView = { preserveView: false }
	let framed = false
	await streamTiles({
		plan,
		tileChunks: list.tileChunks,
		focus: { x: frame.origin.x, z: frame.origin.z },
		fetchTile: firstTileGate(frame, options.fetchTile ?? fetchTemporalTile, options.restore),
		applyTile: async (tile, data, tileSignal) => {
			const id = tileId(tile.x, tile.z)
			await viewer.setTile(id, data, { signal: tileSignal, translation: tileTranslation(list.tileChunks, tile, base) })
			displayed.set(id, tile.sha256)
			if (first && !framed) {
				framed = true
				viewer.frameTiles(frameView)
			}
		},
		removeTile: id => {
			viewer.removeTile(id)
			displayed.delete(id)
		},
		onProgress: options.onProgress,
		signal,
	})
	if (first && framed) viewer.frameTiles(frameView)
}

function listTiles(memoryId: string, signal: AbortSignal): Promise<TileList> {
	// Cumulative: tiles of zones captured earlier stay as they were last recorded.
	return apiClient.timelapse.tiles({ memoryId, cumulative: true }, { signal })
}

// The first tile goes through the restoration flow alone; the others start only once it has succeeded.
export function firstTileGate(frame: TemporalFrame, fetchTile: TileFetch, restore: TiledFrameOptions['restore']) {
	const ready = deferred()
	let first: TileSummary | null = null
	return (tile: TileSummary, signal: AbortSignal): Promise<ArrayBuffer> => {
		first ??= tile
		if (tile !== first) return untilReady(ready.promise, signal).then(() => fetchTile(frame, tile, signal))
		return restore(() => fetchTile(frame, tile, signal)).then(
			data => {
				ready.resolve()
				return data
			},
			(error: unknown) => {
				if (!(error instanceof RetryableTileError)) ready.reject(error)
				throw error
			}
		)
	}
}

async function untilReady(ready: Promise<void>, signal: AbortSignal): Promise<void> {
	signal.throwIfAborted()
	const aborted = new Promise<never>((_, reject) => {
		signal.addEventListener('abort', () => reject(signal.reason), { once: true })
	})
	await Promise.race([ready, aborted])
}

function deferred() {
	let resolve!: () => void
	let reject!: (error: unknown) => void
	const promise = new Promise<void>((done, fail) => {
		resolve = done
		reject = fail
	})
	promise.catch(() => undefined)
	return { promise, resolve, reject }
}
