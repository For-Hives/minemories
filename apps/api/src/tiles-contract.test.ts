import { describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import {
	MAX_TILE_BYTES,
	MAX_TILE_INDEX,
	MAX_TILES,
	TILE_FORMAT,
	tileList,
	tileManifest,
	tileSummary,
} from '@minemories/api-contract'
import { buildTileBundle } from './test-support/tile-bundle-fixture'

type Spec = { x: number; z: number; size?: number; sha256?: string }

function manifestOf(specs: Spec[], tileChunks = 8) {
	let offset = 0
	return {
		format: TILE_FORMAT,
		tileChunks,
		tiles: specs.map(({ x, z, size = 20, sha256 = 'a'.repeat(64) }) => {
			const tile = { x, z, file: `x${x}_z${z}.glb`, offset, size, sha256, quads: 1 }
			offset += size
			return tile
		}),
	}
}

const validSpecs: Spec[] = [
	{ x: -1, z: 0 },
	{ x: 0, z: -3 },
	{ x: 0, z: 0 },
	{ x: 0, z: 1, size: 24 },
]

function tileAt(manifest: ReturnType<typeof manifestOf>, index: number) {
	const tile = manifest.tiles[index]
	if (!tile) throw new Error(`Missing tile ${index}`)
	return tile
}

function mutate(mutator: (manifest: ReturnType<typeof manifestOf>) => void) {
	const manifest = manifestOf(validSpecs)
	mutator(manifest)
	return manifest
}

describe('tile manifest contract', () => {
	test('accepts a manifest produced for a valid bundle', () => {
		const { manifest } = buildTileBundle([
			{ x: 0, z: 0 },
			{ x: -1, z: 2, quads: 4 },
		])
		expect(tileManifest.safeParse(manifest).success).toBe(true)
		expect(tileManifest.safeParse(manifestOf(validSpecs)).success).toBe(true)
	})

	test('rejects wrong format, out-of-range tileChunks and unknown keys', () => {
		expect(tileManifest.safeParse(mutate(m => (m.format = 'other' as typeof TILE_FORMAT))).success).toBe(false)
		expect(tileManifest.safeParse(manifestOf(validSpecs, 0)).success).toBe(false)
		expect(tileManifest.safeParse(manifestOf(validSpecs, 17)).success).toBe(false)
		expect(tileManifest.safeParse({ ...manifestOf(validSpecs), extra: true }).success).toBe(false)
	})

	test('rejects a file name that does not match the tile index', () => {
		expect(tileManifest.safeParse(mutate(m => (tileAt(m, 0).file = 'bad.glb'))).success).toBe(false)
	})

	test('rejects sizes that are not a multiple of 4 or are out of bounds', () => {
		expect(tileManifest.safeParse(manifestOf([{ x: 0, z: 0, size: 21 }])).success).toBe(false)
		expect(tileManifest.safeParse(manifestOf([{ x: 0, z: 0, size: 16 }])).success).toBe(false)
		expect(tileManifest.safeParse(manifestOf([{ x: 0, z: 0, size: MAX_TILE_BYTES + 4 }])).success).toBe(false)
	})

	test('rejects unsorted and duplicate tiles', () => {
		expect(
			tileManifest.safeParse(
				manifestOf([
					{ x: 0, z: 1 },
					{ x: 0, z: 0 },
				])
			).success
		).toBe(false)
		expect(
			tileManifest.safeParse(
				manifestOf([
					{ x: 1, z: 0 },
					{ x: 0, z: 5 },
				])
			).success
		).toBe(false)
		expect(
			tileManifest.safeParse(
				manifestOf([
					{ x: 0, z: 0 },
					{ x: 0, z: 0 },
				])
			).success
		).toBe(false)
	})

	test('rejects wrong offsets', () => {
		expect(tileManifest.safeParse(mutate(m => (tileAt(m, 1).offset += 4))).success).toBe(false)
		expect(tileManifest.safeParse(mutate(m => (tileAt(m, 0).offset = 4))).success).toBe(false)
	})

	test('bounds the tile count and indices', () => {
		const many = Array.from({ length: MAX_TILES + 1 }, (_, x) => ({ x, z: 0 }))
		expect(tileManifest.safeParse(manifestOf(many)).success).toBe(false)
		expect(tileManifest.safeParse(manifestOf(many.slice(0, MAX_TILES))).success).toBe(true)
		expect(tileManifest.safeParse(manifestOf([]))).toMatchObject({ success: false })
		expect(tileManifest.safeParse(manifestOf([{ x: MAX_TILE_INDEX + 1, z: 0 }])).success).toBe(false)
		expect(tileManifest.safeParse(manifestOf([{ x: -MAX_TILE_INDEX - 1, z: 0 }])).success).toBe(false)
		expect(tileManifest.safeParse(manifestOf([{ x: MAX_TILE_INDEX, z: -MAX_TILE_INDEX }])).success).toBe(true)
	})

	test('rejects malformed digests', () => {
		expect(tileManifest.safeParse(mutate(m => (tileAt(m, 0).sha256 = 'A'.repeat(64)))).success).toBe(false)
		expect(tileManifest.safeParse(mutate(m => (tileAt(m, 0).sha256 = 'a'.repeat(63)))).success).toBe(false)
	})

	test('accepts a list summary and rejects invalid list fields', () => {
		const summary = { x: 3, z: -4, size: 128, sha256: 'b'.repeat(64), quads: 10 }
		expect(tileSummary.safeParse(summary).success).toBe(true)
		const list = { memoryId: randomUUID(), tileChunks: 8, tiles: [summary] }
		expect(tileList.safeParse(list).success).toBe(true)
		expect(tileList.safeParse({ ...list, memoryId: 'not-a-uuid' }).success).toBe(false)
		expect(tileList.safeParse({ ...list, tileChunks: 0 }).success).toBe(false)
	})
})
