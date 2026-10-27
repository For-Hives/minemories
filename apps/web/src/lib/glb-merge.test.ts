import { validateSelfContainedGlb } from '@minemories/api-contract/glb'
import { describe, expect, it } from 'vitest'
import { exportFileName, GlbMergeError, type GlbTilePart, mergeGlbTiles } from './glb-merge'

const PNG = Uint8Array.from(
	atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
	character => character.charCodeAt(0)
)
const MAX_JSON = 4 * 1024 * 1024
const ZERO = { x: 0, y: 0, z: 0 }

// Fixtures and glTF read-back are loosely typed JSON on purpose.
// biome-ignore lint/suspicious/noExplicitAny: test-only JSON documents
type Doc = Record<string, any>
type Tile = { bin: Uint8Array; json: Doc }
const CHUNK_HEADER = 8
type TileOptions = { lights?: boolean; material?: string; targets?: boolean; seed?: number }

const align4 = (length: number) => Math.ceil(length / 4) * 4

function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0))
	let offset = 0
	for (const part of parts) {
		out.set(part, offset)
		offset += part.byteLength
	}
	return out
}

function tileDocument(options: TileOptions = {}): Tile {
	const seed = options.seed ?? 0
	const positions = new Float32Array([seed, 0, 0, seed + 1, 0, 0, seed, 0, 1])
	const indices = new Uint16Array([0, 1, 2])
	const bin = concat([new Uint8Array(positions.buffer), new Uint8Array(indices.buffer), PNG])
	const lit = options.lights === true
	const nodes: Doc[] = [{ mesh: 0 }]
	if (lit) nodes.push({ translation: [0, 1, 0], extensions: { KHR_lights_punctual: { light: 0 } } })
	nodes.push({ children: lit ? [0, 1] : [0] })
	const primitive: Doc = { attributes: { POSITION: 0 }, indices: 1, material: 0, mode: 4 }
	if (options.targets) primitive.targets = [{ POSITION: 0 }]
	const json: Doc = {
		asset: { version: '2.0' },
		scene: 0,
		scenes: [{ nodes: [nodes.length - 1] }],
		nodes,
		meshes: [{ primitives: [primitive] }],
		materials: [
			{
				name: options.material ?? 'stone',
				pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
				emissiveTexture: { index: 0 },
			},
		],
		textures: [{ sampler: 0, source: 0 }],
		images: [{ bufferView: 2, mimeType: 'image/png' }],
		samplers: [{ magFilter: 9728, minFilter: 9728, wrapS: 10497, wrapT: 10497 }],
		accessors: [
			{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [seed, 0, 0], max: [seed + 1, 0, 1] },
			{ bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
		],
		bufferViews: [
			{ buffer: 0, byteOffset: 0, byteLength: 36 },
			{ buffer: 0, byteOffset: 36, byteLength: 6 },
			{ buffer: 0, byteOffset: 42, byteLength: PNG.byteLength },
		],
		buffers: [{ byteLength: bin.byteLength }],
	}
	if (lit) {
		json.extensionsUsed = ['KHR_lights_punctual']
		json.extensions = { KHR_lights_punctual: { lights: [{ type: 'point', color: [1, 1, 1], intensity: 10 }] } }
	}
	return { bin, json }
}

/** Misaligned 6-byte buffer, no mesh, no scene key: exercises the defaults. */
function oddTile(text = 'abcdef'): Tile {
	const bin = new TextEncoder().encode(text)
	return {
		bin,
		json: {
			asset: { version: '2.0' },
			scenes: [{ nodes: [0] }],
			nodes: [{}],
			bufferViews: [{ buffer: 0, byteLength: bin.byteLength }],
			buffers: [{ byteLength: bin.byteLength }],
		},
	}
}

function container(jsonText: string, bin?: Uint8Array): Uint8Array {
	const json = new TextEncoder().encode(jsonText)
	const jsonLength = align4(json.byteLength)
	const binChunk = bin === undefined ? 0 : CHUNK_HEADER + align4(bin.byteLength)
	const output = new Uint8Array(20 + jsonLength + binChunk)
	output.fill(0x20, 20, 20 + jsonLength)
	const view = new DataView(output.buffer)
	view.setUint32(0, 0x46546c67, true)
	view.setUint32(4, 2, true)
	view.setUint32(8, output.byteLength, true)
	view.setUint32(12, jsonLength, true)
	view.setUint32(16, 0x4e4f534a, true)
	output.set(json, 20)
	if (bin) {
		const start = 20 + jsonLength
		view.setUint32(start, align4(bin.byteLength), true)
		view.setUint32(start + 4, 0x004e4942, true)
		output.set(bin, start + CHUNK_HEADER)
	}
	return output
}

function tileGlb(tile: Tile): Uint8Array {
	return container(JSON.stringify(tile.json), tile.bin)
}

function patchUint32(bytes: Uint8Array, offset: number, value: number): Uint8Array {
	const out = bytes.slice()
	new DataView(out.buffer).setUint32(offset, value, true)
	return out
}

function withTrailingBytes(bytes: Uint8Array, extra: number): Uint8Array {
	const out = new Uint8Array(bytes.byteLength + extra)
	out.set(bytes)
	new DataView(out.buffer).setUint32(8, out.byteLength, true)
	return out
}

function parts(...data: Uint8Array[]): GlbTilePart[] {
	return data.map(bytesOf => ({ data: bytesOf, translation: ZERO }))
}

function merge(...data: Uint8Array[]): Uint8Array {
	return mergeGlbTiles(parts(...data))
}

type Output = { bin: Uint8Array; json: Doc }

/** Reads back a GLB produced by the merge. Test-only: no validation. */
function readGlb(bytes: Uint8Array): Output {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const jsonLength = view.getUint32(12, true)
	const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)))
	const binStart = 20 + jsonLength
	const binLength = view.getUint32(binStart, true)
	return { bin: bytes.subarray(binStart + 8, binStart + 8 + binLength), json }
}

/** Bytes that an accessor (or image) points at, through its bufferView. */
function viewBytes(output: Output, view: number): Uint8Array {
	const { byteOffset, byteLength } = output.json.bufferViews[view]
	return output.bin.subarray(byteOffset, byteOffset + byteLength)
}

function accessorBytes(output: Output, accessor: number): Uint8Array {
	return viewBytes(output, output.json.accessors[accessor].bufferView)
}

function expectBytes(actual: Uint8Array, expected: Uint8Array): void {
	expect(Array.from(actual)).toEqual(Array.from(expected))
}

describe('mergeGlbTiles', () => {
	it('merges tiles into one self-contained GLB', async () => {
		const merged = merge(tileGlb(tileDocument()), tileGlb(tileDocument({ seed: 10, lights: true })))
		expect(await validateSelfContainedGlb(merged)).toBe(true)
		const view = new DataView(merged.buffer, merged.byteOffset, merged.byteLength)
		expect(view.getUint32(8, true)).toBe(merged.byteLength)
		expect(merged.byteLength % 4).toBe(0)
	})

	it('sums every array and remaps each index to the original bytes', () => {
		const first = tileDocument({ seed: 0 })
		const second = tileDocument({ seed: 10, lights: true })
		const output = readGlb(merge(tileGlb(first), tileGlb(second)))
		for (const key of ['accessors', 'bufferViews', 'images', 'textures', 'materials', 'meshes', 'samplers']) {
			expect(output.json[key]).toHaveLength(first.json[key].length + second.json[key].length)
		}
		// Nodes: each tile keeps its nodes and adds one parent node.
		expect(output.json.nodes).toHaveLength(first.json.nodes.length + second.json.nodes.length + 2)

		const accessorBase = first.json.accessors.length
		expectBytes(accessorBytes(output, accessorBase), accessorBytes(readGlb(tileGlb(second)), 0))
		expectBytes(accessorBytes(output, accessorBase + 1), accessorBytes(readGlb(tileGlb(second)), 1))
		const imageView = output.json.images[1].bufferView
		expectBytes(viewBytes(output, imageView), PNG)
		expect(output.json.bufferViews[output.json.accessors[accessorBase].bufferView].buffer).toBe(0)
	})

	it('remaps material, texture, mesh and node references of the second tile', () => {
		const output = readGlb(merge(tileGlb(tileDocument()), tileGlb(tileDocument({ seed: 10, lights: true }))))
		const { json } = output
		expect(json.textures[1]).toEqual({ sampler: 1, source: 1 })
		expect(json.materials[1].pbrMetallicRoughness.baseColorTexture).toEqual({ index: 1 })
		expect(json.materials[1].emissiveTexture).toEqual({ index: 1 })
		expect(json.meshes[1].primitives[0]).toMatchObject({
			attributes: { POSITION: 2 },
			indices: 3,
			material: 1,
		})
		// Tile 1 nodes: 0 mesh, 1 group. Parent at index 2. Tile 2 nodes start at 3.
		expect(json.nodes[3]).toEqual({ mesh: 1 })
		expect(json.nodes[4]).toEqual({ translation: [0, 1, 0], extensions: { KHR_lights_punctual: { light: 0 } } })
		expect(json.nodes[5]).toEqual({ children: [3, 4] })
		expect(json.nodes[3].mesh).toBe(1)
	})

	it('gives each tile a parent node with its translation and scene nodes', () => {
		const data = [
			{ data: tileGlb(tileDocument()), translation: { x: 128, y: 0, z: -128 } },
			{ data: tileGlb(tileDocument({ seed: 10 })), translation: { x: 0.5, y: 2, z: 256 } },
		]
		const { json } = readGlb(mergeGlbTiles(data))
		expect(json.nodes[2]).toEqual({ name: 'tile-0', translation: [128, 0, -128], children: [1] })
		expect(json.nodes[5]).toEqual({ name: 'tile-1', translation: [0.5, 2, 256], children: [4] })
		expect(json.scenes).toEqual([{ nodes: [2, 5] }])
		expect(json.scene).toBe(0)
		expect(json.asset).toEqual({ version: '2.0', generator: 'Minemories' })
		expect(json.buffers).toEqual([{ byteLength: readGlb(mergeGlbTiles(data)).bin.byteLength }])
	})

	it('remaps light indices across lit and plain tiles and declares the extension only with lights', () => {
		const output = readGlb(
			merge(
				tileGlb(tileDocument({ lights: true })),
				tileGlb(tileDocument({ seed: 5 })),
				tileGlb(tileDocument({ seed: 10, lights: true }))
			)
		)
		const lightNodes = output.json.nodes.filter((node: Doc) => node.extensions?.KHR_lights_punctual !== undefined)
		expect(lightNodes.map((node: Doc) => (node.extensions as Doc).KHR_lights_punctual)).toEqual([
			{ light: 0 },
			{ light: 1 },
		])
		expect(output.json.extensionsUsed).toEqual(['KHR_lights_punctual'])
		expect(output.json.extensions.KHR_lights_punctual.lights).toHaveLength(2)
	})

	it('omits lights, extensions and empty arrays when no tile has them', () => {
		const output = readGlb(merge(tileGlb(tileDocument()), tileGlb(tileDocument({ seed: 3 }))))
		expect(output.json.extensionsUsed).toBeUndefined()
		expect(output.json.extensions).toBeUndefined()
		const bare = readGlb(merge(tileGlb(oddTile()), tileGlb(oddTile('ghijkl'))))
		expect(bare.json.meshes).toBeUndefined()
		expect(bare.json.materials).toBeUndefined()
		expect(bare.json.accessors).toBeUndefined()
		expect(bare.json.extensionsUsed).toBeUndefined()
	})

	it('pads misaligned buffers to four bytes and keeps offsets consistent', () => {
		const first = oddTile('abcdef')
		const output = readGlb(merge(tileGlb(first), tileGlb(oddTile('ghijkl')), tileGlb(tileDocument())))
		expect(output.bin.byteLength % 4).toBe(0)
		// Second odd tile starts after the padded 8 bytes of the first one.
		expectBytes(output.bin.subarray(8, 14), new TextEncoder().encode('ghijkl'))
		expect(output.json.bufferViews[0]).toEqual({ buffer: 0, byteLength: 6, byteOffset: 0 })
		expect(output.json.bufferViews[1]).toEqual({ buffer: 0, byteLength: 6, byteOffset: 8 })
		// Third tile begins at 16 (two padded odd tiles).
		expect(output.json.bufferViews[2].byteOffset).toBe(16)
		expect(output.json.buffers[0].byteLength).toBe(output.bin.byteLength)
		expect(output.json.nodes[0]).toEqual({})
	})

	it('remaps morph targets and does not mutate the inputs', () => {
		const first = tileDocument({ seed: 1 })
		const second = tileDocument({ seed: 2, targets: true })
		const firstBytes = tileGlb(first)
		const secondBytes = tileGlb(second)
		const before = [firstBytes.slice(), secondBytes.slice()]
		const translation = { x: 1, y: 2, z: 3 }
		const data = [
			{ data: firstBytes, translation },
			{ data: secondBytes, translation: { ...translation } },
		]
		const output = readGlb(mergeGlbTiles(data))
		expect(output.json.meshes[1].primitives[0].targets).toEqual([{ POSITION: 2 }])
		expect(firstBytes).toEqual(before[0])
		expect(secondBytes).toEqual(before[1])
		expect(translation).toEqual({ x: 1, y: 2, z: 3 })
		expect(output.json.nodes[2].translation).toEqual([1, 2, 3])
	})

	it('keeps texture references nested in pbrMetallicRoughness and top-level material fields', () => {
		const tile = tileDocument({ seed: 4 })
		tile.json.materials = [
			{
				pbrMetallicRoughness: { metallicRoughnessTexture: { index: 0 }, baseColorFactor: [1, 1, 1, 1] },
				normalTexture: { index: 0, scale: 2 },
				name: 'plain',
			},
		]
		const output = readGlb(merge(tileGlb(tileDocument()), tileGlb(tile)))
		expect(output.json.materials[1]).toEqual({
			pbrMetallicRoughness: { metallicRoughnessTexture: { index: 1 }, baseColorFactor: [1, 1, 1, 1] },
			normalTexture: { index: 1, scale: 2 },
			name: 'plain',
		})
	})

	it('reads a material without pbrMetallicRoughness unchanged', () => {
		const tile = tileDocument({ seed: 6 })
		tile.json.materials = [{ name: 'unlit', doubleSided: true }]
		const output = readGlb(merge(tileGlb(tileDocument()), tileGlb(tile)))
		expect(output.json.materials[1]).toEqual({ name: 'unlit', doubleSided: true })
	})

	it('keeps the sampler-less texture and the image without bufferView intact', () => {
		const tile = tileDocument({ seed: 7 })
		tile.json.textures = [{ source: 0 }]
		tile.json.images = [{ uri: 'data:image/png;base64,AA==', mimeType: 'image/png' }]
		const output = readGlb(merge(tileGlb(tileDocument()), tileGlb(tile)))
		expect(output.json.textures[1]).toEqual({ source: 1 })
		expect(output.json.images[1]).toEqual({ uri: 'data:image/png;base64,AA==', mimeType: 'image/png' })
	})

	it('keeps a node without children or light extension as it was', () => {
		const tile = tileDocument({ seed: 8 })
		tile.json.nodes = [{ mesh: 0, name: 'plain' }]
		tile.json.scenes = [{ nodes: [0] }]
		tile.json.extensions = { EXT_other: {} }
		const output = readGlb(merge(tileGlb(tileDocument()), tileGlb(tile)))
		expect(output.json.nodes[3]).toEqual({ mesh: 1, name: 'plain' })
		expect(output.json.extensionsUsed).toBeUndefined()
	})

	it('gives a parent node no children when the scene lists no nodes', () => {
		const tile = tileDocument({ seed: 2 })
		tile.json.scenes = [{}]
		const { json } = readGlb(merge(tileGlb(tile)))
		expect(json.nodes[2]).toEqual({ name: 'tile-0', translation: [0, 0, 0], children: [] })
	})

	it('accepts a light node whose extension lacks a light index', () => {
		const tile = tileDocument({ seed: 9 })
		tile.json.nodes = [{ extensions: { KHR_lights_punctual: {} } }]
		tile.json.scenes = [{ nodes: [0] }]
		const output = readGlb(merge(tileGlb(tile)))
		expect(output.json.nodes[0].extensions).toEqual({ KHR_lights_punctual: {} })
	})

	it('is deterministic for the same input', () => {
		const data = parts(tileGlb(tileDocument()), tileGlb(tileDocument({ seed: 1 })))
		expectBytes(mergeGlbTiles(data), mergeGlbTiles(data))
	})

	it('accepts a single tile', async () => {
		const merged = merge(tileGlb(tileDocument({ lights: true })))
		expect(await validateSelfContainedGlb(merged)).toBe(true)
	})
})

describe('rejects invalid input', () => {
	it('rejects empty input', () => {
		expect(() => mergeGlbTiles([])).toThrow(GlbMergeError)
	})

	it('rejects a non-finite or non-numeric translation', () => {
		const data = tileGlb(tileDocument())
		for (const translation of [
			{ x: Number.NaN, y: 0, z: 0 },
			{ x: 0, y: Number.POSITIVE_INFINITY, z: 0 },
			{ x: 0, y: 0, z: '1' as unknown as number },
		]) {
			expect(() => mergeGlbTiles([{ data, translation }])).toThrow(GlbMergeError)
		}
	})

	it.each([
		['too short for a header', new Uint8Array(12)],
		['bad magic', patchUint32(tileGlb(tileDocument()), 0, 0x12345678)],
		['bad version', patchUint32(tileGlb(tileDocument()), 4, 1)],
		['wrong declared length', patchUint32(tileGlb(tileDocument()), 8, 999)],
		['first chunk not JSON', patchUint32(tileGlb(tileDocument()), 16, 0x1234)],
		['JSON length not a multiple of four', patchUint32(container('{}'), 12, 3)],
		['JSON chunk beyond the file', patchUint32(tileGlb(tileDocument()), 12, 0x0fffffc)],
		[
			'unknown second chunk',
			patchUint32(tileGlb(tileDocument()), 20 + align4(readJsonLength(tileDocument())) + 4, 0x1),
		],
		['BIN chunk truncated', patchUint32(tileGlb(tileDocument()), 20 + readJsonLength(tileDocument()), 4096)],
		['only four bytes after JSON', withTrailingBytes(container('{}'), 4)],
		['extra bytes after the BIN chunk', withTrailingBytes(tileGlb(tileDocument()), 4)],
		['missing BIN chunk', container(JSON.stringify(tileDocument().json))],
		['external uri', tileGlb({ ...tileDocument(), json: withBufferUri(tileDocument().json) })],
		[
			'two buffers',
			tileGlb({
				...tileDocument(),
				json: { ...tileDocument().json, buffers: [{ byteLength: 42 }, { byteLength: 67 }] },
			}),
		],
		['no buffers', tileGlb({ ...tileDocument(), json: { ...tileDocument().json, buffers: [] } })],
		['buffer larger than its BIN', tileGlb({ ...tileDocument(), json: bufferLength(tileDocument().json, 9999) })],
		['negative buffer length', tileGlb({ ...tileDocument(), json: bufferLength(tileDocument().json, -1) })],
		['invalid JSON', container('{"asset": ', new Uint8Array(4))],
		['JSON that is not an object', container('[]', new Uint8Array(4))],
		['JSON that is a primitive', container('7', new Uint8Array(4))],
		['bufferView past its buffer', tileGlb(badView())],
		['negative bufferView offset', tileGlb(badView(-4))],
		['bufferView with invalid length', tileGlb(badView(0, 'x'))],
		['sparse accessor', tileGlb(sparseAccessor())],
		['accessor with invalid bufferView', tileGlb(badAccessorView())],
		['invalid scene index', tileGlb(badScene(3))],
		['negative scene index', tileGlb(badScene(-1))],
		['mesh primitives not an array', tileGlb(badPrimitives())],
		['attributes not an object', tileGlb(badAttributes())],
		['node children not an array', tileGlb(badChildren())],
		['material texture index negative', tileGlb(badMaterial())],
		['objects in a top-level list', tileGlb(badList())],
	])('rejects a tile with %s', (_name, data) => {
		expect(() => merge(data)).toThrow(GlbMergeError)
	})

	it('rejects a merged JSON above the size limit', () => {
		const huge = tileDocument({ material: 'a'.repeat(MAX_JSON) })
		expect(() => merge(tileGlb(huge))).toThrow('The merged capture is too large to export as one file')
	})
})

function readJsonLength(tile: Tile): number {
	return align4(new TextEncoder().encode(JSON.stringify(tile.json)).byteLength)
}

function withBufferUri(json: Doc): Doc {
	return { ...json, buffers: [{ byteLength: 109, uri: 'external.bin' }] }
}

function bufferLength(json: Doc, byteLength: number): Doc {
	return { ...json, buffers: [{ byteLength }] }
}

function badView(byteOffset?: number, byteLength: unknown = 67): Tile {
	const tile = tileDocument()
	tile.json.bufferViews = [{ buffer: 0, byteOffset: byteOffset ?? 1000, byteLength }]
	tile.json.accessors = []
	tile.json.images = []
	tile.json.textures = []
	tile.json.materials = []
	tile.json.meshes = []
	tile.json.nodes = [{}]
	tile.json.scenes = [{ nodes: [0] }]
	return tile
}

function sparseAccessor(): Tile {
	const tile = tileDocument()
	tile.json.accessors = [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', sparse: { count: 0 } }]
	return tile
}

function badAccessorView(): Tile {
	const tile = tileDocument()
	tile.json.accessors = [{ bufferView: 'x', componentType: 5126, count: 3, type: 'VEC3' }]
	return tile
}

function badScene(scene: number): Tile {
	const tile = tileDocument()
	tile.json.scene = scene
	return tile
}

function badPrimitives(): Tile {
	const tile = tileDocument()
	tile.json.meshes = [{ primitives: 'nope' }]
	return tile
}

function badAttributes(): Tile {
	const tile = tileDocument()
	tile.json.meshes = [{ primitives: [{ attributes: [0], mode: 4 }] }]
	return tile
}

function badChildren(): Tile {
	const tile = tileDocument()
	tile.json.nodes = [{ children: 'x' }]
	return tile
}

function badMaterial(): Tile {
	const tile = tileDocument()
	tile.json.materials = [{ pbrMetallicRoughness: { baseColorTexture: { index: -1 } } }]
	return tile
}

function badList(): Tile {
	const tile = tileDocument()
	tile.json.textures = [1]
	return tile
}

describe('exportFileName', () => {
	const at = '2026-05-01T12:34:56Z'

	it('slugs the name and appends the UTC timestamp', () => {
		expect(exportFileName('Forest Base  #2!', at)).toBe('forest-base-2-20260501-123456.glb')
	})

	it('keeps only ASCII letters and digits, folding other runs to a dash', () => {
		expect(exportFileName('Forêt — Nord', at)).toBe('for-t-nord-20260501-123456.glb')
		expect(exportFileName('--Ma   Ville--', at)).toBe('ma-ville-20260501-123456.glb')
	})

	it('truncates the slug to 48 characters without a trailing dash', () => {
		expect(exportFileName('a'.repeat(60), at)).toBe(`${'a'.repeat(48)}-20260501-123456.glb`)
		expect(exportFileName(`${'a'.repeat(47)} b`, at)).toBe(`${'a'.repeat(47)}-20260501-123456.glb`)
	})

	it('falls back to capture for an empty or symbol-only name', () => {
		expect(exportFileName('', at)).toBe('capture-20260501-123456.glb')
		expect(exportFileName('!!! ---', at)).toBe('capture-20260501-123456.glb')
	})

	it('uses undated for an invalid date', () => {
		expect(exportFileName('base', 'not a date')).toBe('base-undated.glb')
	})

	it('converts an offset date to UTC and pads every field', () => {
		expect(exportFileName('base', '2026-05-01T02:30:00+02:00')).toBe('base-20260501-003000.glb')
		expect(exportFileName('base', '2026-01-02T03:04:05.678Z')).toBe('base-20260102-030405.glb')
	})
})
