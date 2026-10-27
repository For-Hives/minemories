import { createHash } from 'node:crypto'
import type { TileLocation } from './tile-index'

export const TILE_INTEGRITY_ERROR = 'Tile failed integrity validation'

export type TileReader = {
	readRange(objectKey: string, start: number, length: number, signal?: AbortSignal): Promise<Buffer>
}

/** Resolve the tile again around its range read; a converted object may move bytes under another key. */
export async function readAuthorizedTile(
	files: TileReader,
	locate: () => TileLocation | null,
	signal: AbortSignal
): Promise<Buffer | null> {
	const first = locate()
	if (!first) return null
	let used = first
	let bytes: Buffer
	try {
		bytes = await files.readRange(first.objectKey, first.offset, first.size, signal)
	} catch (error) {
		const current = locate()
		if (!current) return null
		if (current.objectKey === first.objectKey) throw error
		used = current
		bytes = await files.readRange(current.objectKey, current.offset, current.size, signal)
	}
	if (!locate()) return null
	if (createHash('sha256').update(bytes).digest('hex') !== used.sha256) throw new Error(TILE_INTEGRITY_ERROR)
	return bytes
}
