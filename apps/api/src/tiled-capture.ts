import { validateSelfContainedGlb } from '@minemories/api-contract/glb'
import { GlbMergeError, type GlbTilePart, mergeGlbTiles } from '@minemories/api-contract/glb-merge'
import { parseMetadata } from './memory-metadata'
import { readAuthorizedTile, type TileReader } from './tile-downloads'
import type { TileAssembly, TileLocation } from './tile-index'

export const MAX_ASSEMBLED_TILE_BYTES = 128 * 1024 * 1024
const CHUNK_BLOCKS = 16

export class AssemblyTooLarge extends Error {}

/** Merge a tiled capture into one self-contained GLB, reading one authorised tile at a time. */
export async function assembleTiledCapture(options: {
	files: TileReader
	locate: (x: number, z: number) => TileLocation | null
	assembly: TileAssembly
	origin: { x: number; y: number; z: number }
	signal: AbortSignal
}): Promise<Buffer> {
	const { assembly, files, locate, origin, signal } = options
	const declared = assembly.tiles.reduce((total, tile) => total + tile.size, 0)
	if (declared > MAX_ASSEMBLED_TILE_BYTES) throw new AssemblyTooLarge('Tiled capture is too large to assemble')
	const tileBlocks = CHUNK_BLOCKS * assembly.tileChunks
	const parts: GlbTilePart[] = []
	for (const tile of assembly.tiles) {
		signal.throwIfAborted()
		// biome-ignore lint/performance/noAwaitInLoops: one tile in memory at a time bounds the assembly.
		const data = await readAuthorizedTile(files, () => locate(tile.x, tile.z), signal)
		if (!data) throw new Error('Tile unavailable')
		parts.push({
			data,
			translation: { x: tile.x * tileBlocks - origin.x, y: -origin.y, z: tile.z * tileBlocks - origin.z },
		})
	}
	const merged = mergeTiles(parts)
	if (!(await validateSelfContainedGlb(merged))) throw new Error('Assembled capture is not a valid GLB')
	return Buffer.from(merged.buffer, merged.byteOffset, merged.byteLength)
}

function mergeTiles(parts: GlbTilePart[]): Uint8Array {
	try {
		return mergeGlbTiles(parts)
	} catch (error) {
		if (error instanceof GlbMergeError) throw new Error('Assembled capture is not a valid GLB')
		throw error
	}
}

/** Capture centre from the stored metadata; `{0,0,0}` when it is missing or invalid. */
export function captureOriginOf(metadataJson: string | null): { x: number; y: number; z: number } {
	return parseMetadata(metadataJson ?? undefined)?.captureOrigin ?? { x: 0, y: 0, z: 0 }
}
