import * as z from 'zod'

export const TILE_FORMAT = 'minemories-tiles-v1'
export const TILE_BUNDLE_MAGIC = 'MMTB'
export const TILE_BUNDLE_VERSION = 1
export const MAX_TILES = 1024
export const MAX_TILE_BYTES = 64 * 1024 * 1024
export const MAX_TILE_INDEX = 2_000_000
export const MAX_TILE_MANIFEST_BYTES = 1024 * 1024

const tileIndex = z.number().int().min(-MAX_TILE_INDEX).max(MAX_TILE_INDEX)
const tileChunks = z.number().int().min(1).max(16)

const tileEntryBase = z.strictObject({
	x: tileIndex,
	z: tileIndex,
	file: z.string(),
	offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
	size: z.number().int().min(20).max(MAX_TILE_BYTES),
	sha256: z.string().regex(/^[a-f0-9]{64}$/),
	quads: z.number().int().min(1).max(5_000_000),
})

export const tileEntry = tileEntryBase
	.refine(tile => tile.file === `x${tile.x}_z${tile.z}.glb`, {
		message: 'File name must match the tile index',
		path: ['file'],
	})
	.refine(tile => tile.size % 4 === 0, { message: 'Tile size must be a multiple of 4', path: ['size'] })

export const tileSummary = tileEntryBase.pick({ x: true, z: true, size: true, sha256: true, quads: true })

function orderedContiguous(tiles: TileEntry[]): boolean {
	let offset = 0
	return tiles.every((tile, index) => {
		const previous = index > 0 ? tiles[index - 1] : undefined
		const ordered = !previous || previous.x < tile.x || (previous.x === tile.x && previous.z < tile.z)
		const contiguous = tile.offset === offset
		offset += tile.size
		return ordered && contiguous
	})
}

export const tileManifest = z
	.strictObject({
		format: z.literal(TILE_FORMAT),
		tileChunks,
		tiles: z.array(tileEntry).min(1).max(MAX_TILES),
	})
	.refine(manifest => orderedContiguous(manifest.tiles), {
		message: 'Tiles must be strictly ascending by (x, z) with contiguous offsets',
		path: ['tiles'],
	})

export const tileList = z.object({
	memoryId: z.string().uuid(),
	tileChunks,
	tiles: z.array(tileSummary).max(MAX_TILES),
})

export type TileEntry = z.infer<typeof tileEntry>
export type TileManifest = z.infer<typeof tileManifest>
export type TileList = z.infer<typeof tileList>
