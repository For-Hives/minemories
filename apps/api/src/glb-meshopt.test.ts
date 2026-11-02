import { expect, test } from 'bun:test'
import { validateSelfContainedGlb } from '@minemories/api-contract/glb'
import { compressGlb, expandGlb, MAX_EXPANDED_BYTES } from '@minemories/api-contract/glb-meshopt'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready])

// biome-ignore lint/suspicious/noExplicitAny: tests mutate arbitrary parts of a parsed glTF document.
type Mutable = Record<string, any>
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/HxoAAAAASUVORK5CYII='
const encoder = MeshoptEncoder
const decoder = MeshoptDecoder

function container(json: Record<string, unknown>, bin: Uint8Array): Uint8Array {
	const text = new TextEncoder().encode(JSON.stringify(json))
	const jsonLength = (text.length + 3) & ~3
	const binLength = (bin.length + 3) & ~3
	const out = new Uint8Array(28 + jsonLength + binLength)
	const view = new DataView(out.buffer)
	view.setUint32(0, 0x46546c67, true)
	view.setUint32(4, 2, true)
	view.setUint32(8, out.length, true)
	view.setUint32(12, jsonLength, true)
	view.setUint32(16, 0x4e4f534a, true)
	out.set(text, 20)
	out.fill(0x20, 20 + text.length, 20 + jsonLength)
	view.setUint32(20 + jsonLength, binLength, true)
	view.setUint32(24 + jsonLength, 0x004e4942, true)
	out.set(bin, 28 + jsonLength)
	return out
}

const INDEX_BYTES = { 5121: 1, 5123: 2, 5125: 4 } as const

function putIndex(view: DataView, at: number, size: 1 | 2 | 4, value: number) {
	if (size === 1) view.setUint8(at, value)
	else if (size === 2) view.setUint16(at, value, true)
	else view.setUint32(at, value, true)
}

function geometry(quads: number, size: 1 | 2 | 4) {
	const vertices = quads * 4
	const positions = new Int16Array(vertices * 4)
	const uvs = new Uint16Array(vertices * 2)
	const normals = new Int8Array(vertices * 4)
	const indices = new Uint8Array(quads * 6 * size)
	const indexView = new DataView(indices.buffer)
	for (let quad = 0; quad < quads; quad++) {
		for (let corner = 0; corner < 4; corner++) {
			const vertex = quad * 4 + corner
			positions.set([quad * 16 + (corner % 2) * 16, (corner >> 1) * 16, 0, 0], vertex * 4)
			uvs.set([(corner % 2) * 65535, (corner >> 1) * 65535], vertex * 2)
			normals.set([0, 0, 127, 0], vertex * 4)
		}
		for (const [slot, corner] of [0, 1, 2, 0, 2, 3].entries())
			putIndex(indexView, (quad * 6 + slot) * size, size, quad * 4 + corner)
	}
	return { positions, normals, uvs, indices }
}

/** A grid of quads: int16 positions with stride 8, uint16 UVs, int8 normals, u8/u16/u32 indices and an image. */
function sample(quads: number, indexType: 5121 | 5123 | 5125 = 5123) {
	const vertices = quads * 4
	const { positions, normals, uvs, indices } = geometry(quads, INDEX_BYTES[indexType])
	const image = Uint8Array.from(atob(PNG), character => character.charCodeAt(0))
	const chunks = [
		new Uint8Array(positions.buffer),
		new Uint8Array(normals.buffer),
		new Uint8Array(uvs.buffer),
		indices,
		image,
	]
	const strides = [8, 4, 4]
	const targets = [34962, 34962, 34962, 34963]
	const views: Record<string, unknown>[] = []
	const bin: number[] = []
	for (const [index, chunk] of chunks.entries()) {
		while (bin.length % 4 !== 0) bin.push(0)
		views.push({
			buffer: 0,
			byteOffset: bin.length,
			byteLength: chunk.length,
			byteStride: strides[index],
			target: targets[index],
		})
		bin.push(...chunk)
	}
	const json = {
		asset: { version: '2.0' },
		scene: 0,
		scenes: [{ nodes: [0] }],
		nodes: [{ mesh: 0 }],
		meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
		materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
		textures: [{ source: 0 }],
		images: [{ bufferView: 4, mimeType: 'image/png' }],
		accessors: [
			{ bufferView: 0, componentType: 5122, count: vertices, type: 'VEC3', min: [0, 0, 0], max: [quads * 16, 16, 0] },
			{ bufferView: 1, componentType: 5120, count: vertices, type: 'VEC3', normalized: true },
			{ bufferView: 2, componentType: 5123, count: vertices, type: 'VEC2', normalized: true },
			{ bufferView: 3, componentType: indexType, count: quads * 6, type: 'SCALAR' },
		],
		bufferViews: views,
		buffers: [{ byteLength: bin.length }],
		extensionsUsed: ['KHR_mesh_quantization'],
		extensionsRequired: ['KHR_mesh_quantization'],
	}
	return { glb: container(json, new Uint8Array(bin)), json }
}

function parts(glb: Uint8Array) {
	const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
	const jsonLength = view.getUint32(12, true)
	const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as Record<string, unknown>
	const binLength = view.getUint32(20 + jsonLength, true)
	return { json, bin: glb.subarray(28 + jsonLength, 28 + jsonLength + binLength) }
}

function accessorBytes(glb: Uint8Array, accessorIndex: number): Uint8Array {
	const { json, bin } = parts(glb)
	const accessor = (json.accessors as Record<string, number>[])[accessorIndex] as Record<string, number>
	const view = (json.bufferViews as Record<string, number>[])[accessor.bufferView as number] as Record<string, number>
	return bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + (view.byteLength as number))
}

test('the synthetic sample is itself a valid GLB', async () => {
	expect(await validateSelfContainedGlb(sample(300).glb)).toBe(true)
})

test('vertex and index data survive compression bit for bit, and the expanded file is a valid GLB', async () => {
	const sizes = [5123, 5125] as const
	for (const type of sizes) {
		const { glb } = sample(300, type)
		const compressed = compressGlb(glb, encoder)
		expect(compressed).not.toBeNull()
		expect(compressed?.byteLength ?? 0).toBeLessThan(glb.byteLength / 2)
		const expanded = expandGlb(compressed as Uint8Array, decoder)
		expect(expanded).not.toBeNull()
		for (const accessor of [0, 1, 2, 3]) {
			expect(Array.from(accessorBytes(expanded as Uint8Array, accessor))).toEqual(
				Array.from(accessorBytes(glb, accessor))
			)
		}
		// biome-ignore lint/performance/noAwaitInLoops: two iterations, each independent of the other.
		expect(await validateSelfContainedGlb(expanded as Uint8Array)).toBe(true)
		const json = parts(expanded as Uint8Array).json
		expect(JSON.stringify(json)).not.toContain('EXT_meshopt_compression')
		expect(json.extensionsRequired).toEqual(['KHR_mesh_quantization'])
	}
})

test('8-bit indices are widened to 16 bits and decode to the same triangles', () => {
	const { glb } = sample(40, 5121)
	const compressed = compressGlb(glb, encoder) as Uint8Array
	const expanded = expandGlb(compressed, decoder) as Uint8Array
	const wide = accessorBytes(expanded, 3)
	const original = accessorBytes(glb, 3)
	expect(wide.length).toBe(original.length * 2)
	const view = new DataView(wide.buffer, wide.byteOffset, wide.byteLength)
	for (const [index, value] of original.entries()) expect(view.getUint16(index * 2, true)).toBe(value)
	expect((parts(expanded).json.accessors as Record<string, number>[])[3]?.componentType).toBe(5123)
})

test('the compressed file declares the extension as required, with an empty fallback buffer and no stored fallback', () => {
	const compressed = compressGlb(sample(100).glb, encoder) as Uint8Array
	const { json } = parts(compressed)
	expect(json.extensionsRequired).toContain('EXT_meshopt_compression')
	const buffers = json.buffers as Record<string, unknown>[]
	expect(buffers).toHaveLength(2)
	expect(buffers[1]).toMatchObject({ extensions: { EXT_meshopt_compression: { fallback: true } } })
	expect(buffers[1]?.uri).toBeUndefined()
	const views = json.bufferViews as Record<string, unknown>[]
	expect(views[3]?.byteStride).toBeUndefined()
	expect(views[0]).toMatchObject({
		byteStride: 8,
		extensions: { EXT_meshopt_compression: { mode: 'ATTRIBUTES', byteStride: 8 } },
	})
	expect(views[4]?.extensions).toBeUndefined()
})

test('files that cannot or need not be compressed are left alone', () => {
	expect(compressGlb(new Uint8Array(10), encoder)).toBeNull()
	const bad = sample(10).glb.slice()
	bad[0] = 0
	expect(compressGlb(bad, encoder)).toBeNull()
	const compressed = compressGlb(sample(100).glb, encoder) as Uint8Array
	expect(compressGlb(compressed, encoder)).toBeNull()
	const { json, glb } = sample(100)
	// A vertex view shared by two accessors, a sparse accessor or an offset accessor is not touched.
	const shared = structuredClone(json) as Mutable
	shared.accessors.push({ ...shared.accessors[0] })
	shared.meshes[0].primitives.push({ attributes: { POSITION: 4 }, indices: 3 })
	const partial = parts(compressGlb(container(shared, parts(glb).bin), encoder) as Uint8Array).json
	const partialViews = partial.bufferViews as Record<string, unknown>[]
	expect(partialViews[0]?.extensions).toBeUndefined()
	expect(partialViews[3]?.extensions).toBeUndefined()
	expect(partialViews[1]?.extensions).toBeDefined()
	const offset = structuredClone(json) as Mutable
	offset.accessors[0].byteOffset = 4
	offset.accessors[1].sparse = {}
	offset.accessors[2].componentType = 5126
	offset.accessors[3].type = 'VEC2'
	const rejected = parts(compressGlb(container(offset, parts(glb).bin), encoder) as Uint8Array).json
	const rejectedViews = rejected.bufferViews as Record<string, unknown>[]
	expect([0, 1, 3].map(index => rejectedViews[index]?.extensions)).toEqual([undefined, undefined, undefined])
	const lines = structuredClone(json) as Mutable
	lines.meshes[0].primitives[0].mode = 1
	expect(compressGlb(container(lines, parts(glb).bin), encoder)).toBeNull()
	const tiny = sample(1)
	expect(compressGlb(tiny.glb, encoder)).toBeNull()
})

test('hostile or inconsistent compressed files expand to nothing instead of throwing', () => {
	const compressed = compressGlb(sample(100).glb, encoder) as Uint8Array
	expect(expandGlb(new Uint8Array(8), decoder)).toBeNull()
	expect(expandGlb(sample(10).glb, decoder)).toBeNull()
	const { json, bin } = parts(compressed)
	const mutate = (change: (value: Mutable) => void) => {
		const copy = structuredClone(json) as Mutable
		change(copy)
		return expandGlb(container(copy, bin), decoder)
	}
	expect(mutate(value => (value.bufferViews[0].extensions.EXT_meshopt_compression.count = 5))).toBeNull()
	expect(mutate(value => (value.bufferViews[0].extensions.EXT_meshopt_compression.byteLength = 1 << 30))).toBeNull()
	expect(mutate(value => (value.bufferViews[0].extensions.EXT_meshopt_compression.buffer = 1))).toBeNull()
	expect(mutate(value => (value.bufferViews[0].extensions.EXT_meshopt_compression.mode = 'TRANSPOSED'))).toBeNull()
	expect(mutate(value => (value.bufferViews[0].extensions.EXT_meshopt_compression.filter = 5))).toBeNull()
	expect(mutate(value => (value.bufferViews[0].extensions.EXT_meshopt_compression.byteOffset = 1.5))).toBeNull()
	expect(mutate(value => (value.buffers[1].uri = 'data:application/octet-stream;base64,AA=='))).toBeNull()
	expect(mutate(value => value.buffers.pop())).toBeNull()
	expect(mutate(value => (value.buffers[0].byteLength = bin.length + 100))).toBeNull()
	expect(mutate(value => (value.bufferViews[4].buffer = 1))).toBeNull()
	expect(mutate(value => (value.bufferViews[4].byteOffset = bin.length))).toBeNull()
	expect(mutate(value => (value.bufferViews[4].byteLength = 'x'))).toBeNull()
	expect(mutate(value => (value.bufferViews[0].byteLength = MAX_EXPANDED_BYTES + 4))).toBeNull()
	// A corrupted stream is rejected by the decoder, not by an exception reaching the caller.
	const corrupted = bin.slice()
	corrupted.fill(0xff)
	expect(expandGlb(container(json, corrupted), decoder)).toBeNull()
})

test('a derivative never reuses accessors across the extension: strides and targets survive for the validator', async () => {
	const compressed = compressGlb(sample(200).glb, encoder) as Uint8Array
	const expanded = expandGlb(compressed, decoder) as Uint8Array
	const views = parts(expanded).json.bufferViews as Record<string, unknown>[]
	expect(views.map(view => view.byteStride)).toEqual([8, 4, 4, undefined, undefined])
	expect(views.map(view => view.target)).toEqual([34962, 34962, 34962, 34963, undefined])
	expect(await validateSelfContainedGlb(expanded)).toBe(true)
})
