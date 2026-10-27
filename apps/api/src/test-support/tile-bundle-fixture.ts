import { createHash } from 'node:crypto'
import { TILE_BUNDLE_MAGIC, TILE_BUNDLE_VERSION, TILE_FORMAT, type TileManifest } from '@minemories/api-contract'
import { minimalGlb } from './glb-fixture'

type TileInput = { x: number; z: number; glb?: Buffer; quads?: number }

export function tileGlb(seed: number): Buffer {
	const binary = Buffer.from(Array.from({ length: 64 }, (_, index) => (seed * 31 + index * 7) & 0xff))
	return minimalGlb(binary, { asset: { version: '2.0' }, buffers: [{ byteLength: binary.length }] })
}

export function sha256Hex(bytes: Buffer): string {
	return createHash('sha256').update(bytes).digest('hex')
}

/** Assemble header, space-padded manifest text and data without validating anything. */
export function packTileBundle(manifest: string, data: Buffer): Buffer {
	const json = Buffer.from(manifest)
	const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20)
	json.copy(padded)
	const header = Buffer.alloc(12)
	header.write(TILE_BUNDLE_MAGIC, 0, 'ascii')
	header.writeUInt32LE(TILE_BUNDLE_VERSION, 4)
	header.writeUInt32LE(padded.length, 8)
	return Buffer.concat([header, padded, data])
}

export function buildTileBundle(
	tiles: TileInput[],
	options: { tileChunks?: number } = {}
): { bytes: Buffer; manifest: TileManifest; sha256: string } {
	const entries = tiles
		.map((tile, index) => ({ ...tile, glb: tile.glb ?? tileGlb(index) }))
		.sort((a, b) => a.x - b.x || a.z - b.z)
	let offset = 0
	const manifestTiles = entries.map(tile => {
		const entry = {
			x: tile.x,
			z: tile.z,
			file: `x${tile.x}_z${tile.z}.glb`,
			offset,
			size: tile.glb.length,
			sha256: sha256Hex(tile.glb),
			quads: tile.quads ?? 1,
		}
		offset += tile.glb.length
		return entry
	})
	const manifest: TileManifest = {
		format: TILE_FORMAT,
		tileChunks: options.tileChunks ?? 8,
		tiles: manifestTiles,
	}
	const bytes = packTileBundle(JSON.stringify(manifest), Buffer.concat(entries.map(tile => tile.glb)))
	return { bytes, manifest, sha256: sha256Hex(bytes) }
}
