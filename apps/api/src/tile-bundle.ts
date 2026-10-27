import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { type FileHandle, open } from 'node:fs/promises'
import {
	MAX_TILE_MANIFEST_BYTES,
	TILE_BUNDLE_MAGIC,
	TILE_BUNDLE_VERSION,
	type TileManifest,
	tileManifest,
} from '@minemories/api-contract'
import { validateGlbRange } from './upload-files'

export type TileBundleLayout = { manifest: TileManifest; dataOffset: number }

const HEADER_BYTES = 12

export function isTileBundle(head: Buffer): boolean {
	return head.length >= 4 && head.toString('ascii', 0, 4) === TILE_BUNDLE_MAGIC
}

/** Validate a `.mmtiles` bundle: header, manifest, every tile GLB and both SHA-256 digests. */
export async function validateTileBundle(path: string, size: number, sha256: string): Promise<TileBundleLayout | null> {
	const file = await open(path, 'r')
	try {
		if ((await file.stat()).size !== size || size % 4 !== 0 || size < HEADER_BYTES) return null
		const head = await readAt(file, 0, HEADER_BYTES)
		const length = head === null ? null : manifestLength(head, size)
		if (length === null) return null
		const manifest = await readManifest(file, length)
		const dataOffset = HEADER_BYTES + length
		if (manifest === null || dataOffset + totalTileBytes(manifest) !== size) return null
		if (!(await validTiles(file, path, dataOffset, manifest))) return null
		return (await sha256Range(path, 0, size)) === sha256 ? { manifest, dataOffset } : null
	} finally {
		await file.close()
	}
}

function manifestLength(head: Buffer, size: number): number | null {
	if (!isTileBundle(head) || head.readUInt32LE(4) !== TILE_BUNDLE_VERSION) return null
	const length = head.readUInt32LE(8)
	if (length === 0 || length % 4 !== 0 || length > MAX_TILE_MANIFEST_BYTES || HEADER_BYTES + length > size) return null
	return length
}

async function readAt(file: FileHandle, position: number, length: number): Promise<Buffer | null> {
	const bytes = Buffer.alloc(length)
	const { bytesRead } = await file.read(bytes, 0, length, position)
	return bytesRead === length ? bytes : null
}

async function readManifest(file: FileHandle, length: number): Promise<TileManifest | null> {
	const bytes = await readAt(file, HEADER_BYTES, length)
	if (bytes === null) return null
	let json: unknown
	try {
		json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
	} catch {
		return null
	}
	const parsed = tileManifest.safeParse(json)
	return parsed.success ? parsed.data : null
}

function totalTileBytes(manifest: TileManifest): number {
	return manifest.tiles.reduce((sum, tile) => sum + tile.size, 0)
}

async function validTiles(
	file: FileHandle,
	path: string,
	dataOffset: number,
	manifest: TileManifest
): Promise<boolean> {
	for (const tile of manifest.tiles) {
		const start = dataOffset + tile.offset
		// biome-ignore lint/performance/noAwaitInLoops: each tile is validated against the shared file handle in order.
		if (!(await validateGlbRange(file, start, tile.size))) return false
		if ((await sha256Range(path, start, tile.size)) !== tile.sha256) return false
	}
	return true
}

async function sha256Range(path: string, start: number, length: number): Promise<string> {
	const hash = createHash('sha256')
	for await (const chunk of createReadStream(path, { start, end: start + length - 1 })) hash.update(chunk)
	return hash.digest('hex')
}
