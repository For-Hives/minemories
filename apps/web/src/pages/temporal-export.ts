import type { TemporalFrame, TileList } from '@minemories/api-contract'
import { validateSelfContainedGlb } from '@minemories/api-contract/glb'
import { apiClient } from '../api-client'
import { exportFileName, type GlbTilePart, mergeGlbTiles } from '../lib/glb-merge'
import { streamTiles, tileTranslation } from '../lib/tiles'
import { fetchTemporalFile } from './temporal-files'
import { firstTileGate } from './temporal-tiled'
import { fetchTemporalTile } from './temporal-tiles'

const MAX_EXPORT_BYTES = 450 * 1024 * 1024

export type FrameExportOptions = {
	frame: TemporalFrame
	signal: AbortSignal
	restore<T>(run: () => Promise<T>): Promise<T>
	onProgress(done: number, total: number): void
	listTiles?: (memoryId: string, signal: AbortSignal) => Promise<TileList>
	fetchTile?: typeof fetchTemporalTile
	fetchFile?: typeof fetchTemporalFile
}

type PlacedPart = GlbTilePart & { x: number; z: number }

export async function exportFrameGlb(options: FrameExportOptions): Promise<{ blob: Blob; fileName: string }> {
	const { frame, signal, restore } = options
	const fileName = exportFileName(frame.name, frame.at)
	if (!frame.tileCount) {
		const file = await restore(() => (options.fetchFile ?? fetchTemporalFile)(frame, signal))
		return { blob: file, fileName }
	}
	const list = await (options.listTiles ?? listTiles)(frame.id, signal)
	signal.throwIfAborted()
	const total = list.tiles.reduce((sum, tile) => sum + tile.size, 0)
	if (total > MAX_EXPORT_BYTES) throw new Error('The merged capture is too large to export as one file')
	const parts = await collectParts(options, frame, list)
	const merged = mergeGlbTiles(parts)
	parts.length = 0
	if (!(await validateSelfContainedGlb(merged))) throw new Error('The exported capture is not a valid GLB')
	return { blob: new Blob([merged as Uint8Array<ArrayBuffer>], { type: 'model/gltf-binary' }), fileName }
}

async function collectParts(options: FrameExportOptions, frame: TemporalFrame, list: TileList): Promise<PlacedPart[]> {
	const parts: PlacedPart[] = []
	await streamTiles({
		plan: { fetch: list.tiles, remove: [], keep: 0 },
		tileChunks: list.tileChunks,
		focus: { x: frame.origin.x, z: frame.origin.z },
		fetchTile: firstTileGate(frame, options.fetchTile ?? fetchTemporalTile, options.restore),
		applyTile: (tile, data) => {
			const translation = tileTranslation(list.tileChunks, tile, frame.origin)
			parts.push({ x: tile.x, z: tile.z, data: new Uint8Array(data), translation })
			return Promise.resolve()
		},
		removeTile: () => undefined,
		onProgress: options.onProgress,
		signal: options.signal,
	})
	return parts.sort((a, b) => a.x - b.x || a.z - b.z)
}

export function saveBlob(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = fileName
	document.body.append(link)
	link.click()
	link.remove()
	globalThis.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function listTiles(memoryId: string, signal: AbortSignal): Promise<TileList> {
	return apiClient.timelapse.tiles({ memoryId }, { signal })
}
