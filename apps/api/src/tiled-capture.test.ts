import { expect, test } from 'bun:test'
import { validateSelfContainedGlb } from '@minemories/api-contract/glb'
import { mergeGlbTiles } from '@minemories/api-contract/glb-merge'
import { minimalGlb } from './test-support/glb-fixture'
import { pngImage } from './test-support/image-fixture'
import { sha256Hex } from './test-support/tile-bundle-fixture'
import { frameMetadata } from './test-support/timelapse-fixture'
import { TILE_INTEGRITY_ERROR, type TileReader } from './tile-downloads'
import type { TileAssembly, TileLocation } from './tile-index'
import { AssemblyTooLarge, assembleTiledCapture, captureOriginOf, MAX_ASSEMBLED_TILE_BYTES } from './tiled-capture'

/** Tile GLB with one named node, so merged node counts show the tile contents too. */
function partGlb(name: string): Buffer {
	return minimalGlb(Buffer.alloc(16, 7), {
		asset: { version: '2.0' },
		buffers: [{ byteLength: 16 }],
		scene: 0,
		scenes: [{ nodes: [0] }],
		nodes: [{ name }],
	})
}

function fixture(input: Array<{ x: number; z: number; glb: Buffer }>, tileChunks = 8) {
	const sorted = [...input].sort((a, b) => a.x - b.x || a.z - b.z)
	const store = Buffer.concat(sorted.map(tile => tile.glb))
	let offset = 0
	const tiles = sorted.map(tile => {
		const entry = { x: tile.x, z: tile.z, offset, size: tile.glb.length, sha256: sha256Hex(tile.glb) }
		offset += tile.glb.length
		return entry
	})
	const assembly: TileAssembly = { memoryId: 'memory', tileChunks, tiles, objectKey: 'owner/a.glb', metadataJson: null }
	const reads: Array<[string, number, number]> = []
	const files: TileReader = {
		readRange: async (key, start, length) => {
			reads.push([key, start, length])
			return store.subarray(start, start + length)
		},
	}
	const locate = (x: number, z: number): TileLocation | null => {
		const tile = tiles.find(candidate => candidate.x === x && candidate.z === z)
		return tile ? { objectKey: 'owner/a.glb', offset: tile.offset, size: tile.size, sha256: tile.sha256 } : null
	}
	return { assembly, files, locate, reads, signal: new AbortController().signal }
}

function jsonOf(glb: Uint8Array): { nodes: Array<{ name?: string; translation?: number[] }> } {
	const bytes = Buffer.from(glb)
	const length = bytes.readUInt32LE(12)
	return JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'))
}

const tiles = [
	{ x: 0, z: 0, glb: partGlb('origin') },
	{ x: -1, z: 2, glb: partGlb('west') },
	{ x: 1, z: -1, glb: partGlb('east') },
]

test('assembled capture is one valid GLB with tile wrappers in (x, z) order', async () => {
	const f = fixture(tiles)
	const merged = await assembleTiledCapture({
		files: f.files,
		locate: f.locate,
		assembly: f.assembly,
		origin: { x: 0, y: 0, z: 0 },
		signal: f.signal,
	})
	expect(await validateSelfContainedGlb(merged)).toBe(true)
	const wrappers = jsonOf(merged).nodes.filter(node => node.name?.startsWith('tile-'))
	expect(wrappers).toHaveLength(3)
	const names = jsonOf(merged).nodes.map(node => node.name)
	expect(names).toContain('origin')
	expect(names).toContain('west')
	expect(names).toContain('east')
	expect(f.reads.map(read => read[1])).toEqual(f.assembly.tiles.map(tile => tile.offset))
})

test('each tile is translated by its block position and the capture origin', async () => {
	const f = fixture(tiles, 8)
	const merged = await assembleTiledCapture({
		files: f.files,
		locate: f.locate,
		assembly: f.assembly,
		origin: { x: 5, y: 64, z: -3 },
		signal: f.signal,
	})
	const translations = jsonOf(merged)
		.nodes.filter(node => node.name?.startsWith('tile-'))
		.map(node => node.translation)
	// tileBlocks = 16 * 8 = 128, so tile (x, z) starts at (x * 128, z * 128) before the origin shift.
	// Manifest order is (x, z): (-1, 2), (0, 0), (1, -1).
	expect(translations).toEqual([
		[-128 - 5, -64, 256 + 3],
		[0 - 5, -64, 0 + 3],
		[128 - 5, -64, -128 + 3],
	])
})

test('a tile grid of non-default chunk size uses that block width', async () => {
	const f = fixture([{ x: 2, z: 0, glb: partGlb('only') }], 4)
	const merged = await assembleTiledCapture({
		files: f.files,
		locate: f.locate,
		assembly: f.assembly,
		origin: { x: 0, y: 0, z: 0 },
		signal: f.signal,
	})
	const [wrapper] = jsonOf(merged).nodes.filter(node => node.name?.startsWith('tile-'))
	expect(wrapper?.translation).toEqual([2 * 64, 0, 0])
})

test('an oversized capture is refused before any tile is read', async () => {
	const f = fixture(tiles)
	const half = Math.floor(MAX_ASSEMBLED_TILE_BYTES / 2) + 1
	const assembly = {
		...f.assembly,
		tiles: [
			{ x: 0, z: 0, offset: 0, size: half, sha256: 'a' },
			{ x: 1, z: 0, offset: 0, size: half, sha256: 'b' },
		],
	}
	const error = await assembleTiledCapture({
		files: f.files,
		locate: f.locate,
		assembly,
		origin: { x: 0, y: 0, z: 0 },
		signal: f.signal,
	}).catch(caught => caught)
	expect(error).toBeInstanceOf(AssemblyTooLarge)
	expect(f.reads).toEqual([])
})

test('a tile that is no longer authorised makes the assembly fail', async () => {
	const f = fixture(tiles)
	await expect(
		assembleTiledCapture({
			files: f.files,
			locate: () => null,
			assembly: f.assembly,
			origin: { x: 0, y: 0, z: 0 },
			signal: f.signal,
		})
	).rejects.toThrow('Tile unavailable')
	expect(f.reads).toEqual([])
})

test('a tile whose digest does not match fails with the integrity error', async () => {
	const f = fixture(tiles)
	const first = f.assembly.tiles[0]
	if (!first) throw new Error('Missing fixture tile')
	first.sha256 = 'f'.repeat(64)
	await expect(
		assembleTiledCapture({
			files: f.files,
			locate: f.locate,
			assembly: f.assembly,
			origin: { x: 0, y: 0, z: 0 },
			signal: f.signal,
		})
	).rejects.toThrow(TILE_INTEGRITY_ERROR)
})

test('an aborted request stops before reading the next tile', async () => {
	const f = fixture(tiles)
	const controller = new AbortController()
	controller.abort()
	await expect(
		assembleTiledCapture({
			files: f.files,
			locate: f.locate,
			assembly: f.assembly,
			origin: { x: 0, y: 0, z: 0 },
			signal: controller.signal,
		})
	).rejects.toThrow()
	expect(f.reads).toEqual([])
})

test('bytes that are not a GLB tile make the assembled capture invalid', async () => {
	const f = fixture([{ x: 0, z: 0, glb: Buffer.from('not a glb tile at all, padded out') }])
	await expect(
		assembleTiledCapture({
			files: f.files,
			locate: f.locate,
			assembly: f.assembly,
			origin: { x: 0, y: 0, z: 0 },
			signal: f.signal,
		})
	).rejects.toThrow('Assembled capture is not a valid GLB')
})

test('a merged document that is not self-contained is refused', async () => {
	const external = minimalGlb(Buffer.alloc(16, 7), {
		asset: { version: '2.0' },
		buffers: [{ byteLength: 16 }],
		images: [{ uri: 'https://private.test/file.png' }],
	})
	const f = fixture([{ x: 0, z: 0, glb: external }])
	await expect(
		assembleTiledCapture({
			files: f.files,
			locate: f.locate,
			assembly: f.assembly,
			origin: { x: 0, y: 0, z: 0 },
			signal: f.signal,
		})
	).rejects.toThrow('Assembled capture is not a valid GLB')
})

test('captureOriginOf reads the stored capture centre or falls back to zero', () => {
	expect(captureOriginOf(JSON.stringify(frameMetadata))).toEqual({ x: 1, y: 1, z: 1 })
	expect(captureOriginOf(null)).toEqual({ x: 0, y: 0, z: 0 })
	expect(captureOriginOf('{"captureOrigin":')).toEqual({ x: 0, y: 0, z: 0 })
	expect(captureOriginOf(JSON.stringify({ ...frameMetadata, captureOrigin: { x: 1, y: 1, z: 'far' } }))).toEqual({
		x: 0,
		y: 0,
		z: 0,
	})
})

/** Tile using every remapped feature: buffer views, accessors, image, sampler, texture, material, morph target, light. */
function richGlb(document: Record<string, unknown> = {}): Buffer {
	// One triangle: three zero positions, three u16 indices, then the PNG image.
	const bin = Buffer.concat([Buffer.alloc(36), Buffer.alloc(8), pngImage])
	return minimalGlb(bin, {
		asset: { version: '2.0' },
		buffers: [{ byteLength: bin.length }],
		bufferViews: [
			{ buffer: 0, byteOffset: 0, byteLength: 36 },
			{ buffer: 0, byteOffset: 36, byteLength: 6 },
			{ buffer: 0, byteOffset: 44, byteLength: pngImage.length },
		],
		accessors: [
			{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [0, 0, 0] },
			{ bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
		],
		images: [{ bufferView: 2, mimeType: 'image/png' }],
		samplers: [{}],
		textures: [{ source: 0, sampler: 0 }],
		materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
		meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0, targets: [{ POSITION: 0 }] }] }],
		nodes: [
			{ name: 'part', mesh: 0, children: [1] },
			{ name: 'lamp', extensions: { KHR_lights_punctual: { light: 0 } } },
		],
		extensions: { KHR_lights_punctual: { lights: [{ type: 'point' }] } },
		extensionsUsed: ['KHR_lights_punctual'],
		scene: 0,
		scenes: [{ nodes: [0] }],
		...document,
	})
}

test('tiles with textures, morph targets and lights merge into one self-contained document', async () => {
	const tiles = [
		{ x: 0, z: 0, glb: richGlb() },
		{ x: 1, z: 0, glb: richGlb() },
	]
	const f = fixture(tiles)
	const merged = await assembleTiledCapture({
		files: f.files,
		locate: f.locate,
		assembly: f.assembly,
		origin: { x: 0, y: 0, z: 0 },
		signal: f.signal,
	})
	expect(await validateSelfContainedGlb(merged)).toBe(true)
	const document = JSON.parse(
		Buffer.from(merged)
			.subarray(20, 20 + merged.readUInt32LE(12))
			.toString('utf8')
	)
	expect(document.textures).toHaveLength(2)
	expect(document.materials).toHaveLength(2)
	expect(document.extensions.KHR_lights_punctual.lights).toHaveLength(2)
	expect(document.meshes[1].primitives[0].material).toBe(1)
	expect(document.meshes[1].primitives[0].attributes.POSITION).toBe(2)
	expect(document.textures[1].source).toBe(1)
})

test('tiles that use sparse accessors or out-of-range buffer views are refused', async () => {
	const sparse = richGlb({
		accessors: [
			{
				bufferView: 0,
				componentType: 5126,
				count: 1,
				type: 'VEC3',
				sparse: { count: 1, indices: { bufferView: 1, componentType: 5123 }, values: { bufferView: 0 } },
			},
		],
	})
	const outOfRange = richGlb({ bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 1 << 20 }] })
	for (const glb of [sparse, outOfRange]) {
		const f = fixture([{ x: 0, z: 0, glb }])
		// biome-ignore lint/performance/noAwaitInLoops: each invalid tile is asserted on its own.
		await expect(
			assembleTiledCapture({
				files: f.files,
				locate: f.locate,
				assembly: f.assembly,
				origin: { x: 0, y: 0, z: 0 },
				signal: f.signal,
			})
		).rejects.toThrow('Assembled capture is not a valid GLB')
	}
})

test('the merge helper reports an empty tile list', () => {
	expect(() => mergeGlbTiles([])).toThrow('No GLB tiles to merge')
})
