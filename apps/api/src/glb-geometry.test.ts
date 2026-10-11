import { expect, test } from 'bun:test'
import { embeddedGltfJson, isSelfContainedGlb } from '@minemories/api-contract/glb'
import { MAX_GLB_PRIMITIVES } from '../../../packages/api-contract/src/glb-geometry'
import {
	MAX_GLB_ACCESSOR_ELEMENTS,
	MAX_GLB_DRAW_ELEMENTS,
	MAX_GLB_ENTRIES,
	MAX_GLB_GEOMETRY_BYTES,
} from '../../../packages/api-contract/src/glb-layout'
import { MAX_GLB_NODE_DEPTH, MAX_GLB_NODES } from '../../../packages/api-contract/src/glb-scenes'
import { minimalGlb } from './test-support/glb-fixture'

// biome-ignore lint/suspicious/noExplicitAny: fixtures deliberately replace nested glTF fields with malformed JSON of any type.
type MutableJson = Record<string, any>

function scene() {
	return {
		asset: { version: '2.0' },
		buffers: [{ byteLength: 256 }],
		bufferViews: [
			{ buffer: 0, byteLength: 36, byteOffset: 0, target: 34962 },
			{ buffer: 0, byteLength: 6, byteOffset: 36, target: 34963 },
		],
		accessors: [
			{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
			{ bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
		],
		meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
		nodes: [{ mesh: 0 }],
		scenes: [{ nodes: [0] }],
		scene: 0,
	}
}
function accepts(document: unknown) {
	return isSelfContainedGlb(minimalGlb(Buffer.alloc(256), document))
}
function json(document: unknown) {
	return embeddedGltfJson(Buffer.from(JSON.stringify(document)), 256)
}
function invalid(mutator: (document: MutableJson) => void) {
	const document = scene()
	mutator(document)
	expect(accepts(document)).toBe(false)
}

test('accepts bounded indexed, unindexed, interleaved, quantized and sparse geometry', () => {
	expect(accepts(scene())).toBe(true)
	const plain: MutableJson = scene()
	delete plain.meshes[0].primitives[0].indices
	expect(accepts(plain)).toBe(true)
	const interleaved: MutableJson = scene()
	interleaved.bufferViews[0].byteStride = 24
	interleaved.bufferViews[0].byteLength = 72
	interleaved.accessors.push({ ...interleaved.accessors[0], byteOffset: 12 })
	interleaved.meshes[0].primitives[0].attributes.NORMAL = 2
	expect(accepts(interleaved)).toBe(true)
	const quantized: MutableJson = scene()
	quantized.extensionsUsed = ['KHR_mesh_quantization']
	quantized.bufferViews[0].byteStride = 8
	quantized.accessors[0].componentType = 5122
	expect(accepts(quantized)).toBe(true)
	delete quantized.extensionsUsed
	expect(accepts(quantized)).toBe(false)
	const sparse: MutableJson = scene()
	delete sparse.accessors[0].bufferView
	sparse.bufferViews.push({ buffer: 0, byteOffset: 48, byteLength: 1 }, { buffer: 0, byteOffset: 52, byteLength: 12 })
	sparse.accessors[0].sparse = { count: 1, indices: { bufferView: 2, componentType: 5121 }, values: { bufferView: 3 } }
	expect(accepts(sparse)).toBe(true)
})

test('rejects missing arrays, invalid references, ranges, strides and resource count overflow', () => {
	for (const key of ['buffers', 'bufferViews', 'accessors', 'meshes', 'materials', 'nodes', 'scenes', 'images']) {
		for (const value of [null, {}, [null], [[]], [1]])
			invalid(d => {
				d[key] = value
			})
	}
	for (const value of [-1, 0.5, '0', null, 2, Number.MAX_SAFE_INTEGER]) {
		invalid(d => {
			d.bufferViews[0].buffer = value
		})
		invalid(d => {
			d.accessors[0].bufferView = value
		})
	}
	for (const [property, values] of Object.entries({
		byteLength: [0, -1, 1.5, '36', null, 257],
		byteOffset: [-1, 1.5, '0', null, 240],
		byteStride: [0, 3, 6, 256, 40, '12', null],
		target: [0, '34962', null],
	})) {
		for (const value of values)
			invalid(d => {
				d.bufferViews[0][property] = value
			})
	}
	invalid(d => {
		d.bufferViews[0].extensions = { EXT_meshopt_compression: {} }
	})
	invalid(d => {
		d.bufferViews = Array.from({ length: MAX_GLB_ENTRIES + 1 }, () => ({ buffer: 0, byteLength: 4 }))
	})
	invalid(d => {
		d.images = [{ bufferView: 99, mimeType: 'image/png' }]
	})
	invalid(d => {
		d.images = [{ bufferView: 0, mimeType: 'image/png' }]
	})
	const image: MutableJson = scene()
	image.bufferViews.push({ buffer: 0, byteOffset: 64, byteLength: 4 })
	image.images = [{ bufferView: 2, mimeType: 'image/png' }]
	expect(accepts(image)).toBe(true)
})

test('accessor layout enforces count, type, alignment, bounds and normalized component rules', () => {
	const fields = {
		count: [0, -1, 1.5, '3', null, 4, Number.MAX_SAFE_INTEGER],
		type: ['VEC5', null, 1],
		componentType: [5124, '5126', null],
		byteOffset: [-1, 1, 1.5, '0', null, 4],
		normalized: [null, 'false', true],
		min: [[], [0, 0], [0, 0, 2], [0, 0, 1e100], ['0', 0, 0]],
		max: [[0, 0], [0, -1, 0], null],
	}
	for (const [property, values] of Object.entries(fields))
		for (const value of values)
			invalid(d => {
				d.accessors[0][property] = value
			})
	invalid(d => {
		d.bufferViews[0].byteOffset = 2
	})
	invalid(d => {
		d.bufferViews[0].byteStride = 8
	})
	invalid(d => {
		delete d.accessors[0].bufferView
		d.accessors[0].byteOffset = 4
	})
	for (const componentType of [5120, 5121, 5122, 5123, 5125]) {
		const document: MutableJson = scene()
		document.accessors = [{ componentType, count: 1, type: 'SCALAR', min: [0], max: [1] }]
		delete document.meshes
		delete document.nodes
		delete document.scenes
		delete document.scene
		expect(accepts(document)).toBe(true)
		document.accessors[0].min = [-1]
		expect(accepts(document)).toBe(componentType === 5120 || componentType === 5122)
		document.accessors[0].max = [4294967296]
		expect(accepts(document)).toBe(false)
	}
})

test('matrix padding and sparse index/value ranges are checked without reading the BIN', () => {
	for (const [type, componentType, length] of [
		['MAT2', 5121, 8],
		['MAT3', 5121, 12],
		['MAT3', 5123, 24],
		['MAT4', 5126, 64],
	] as const) {
		const document: MutableJson = scene()
		document.bufferViews[0] = { buffer: 0, byteLength: length }
		document.accessors = [{ bufferView: 0, componentType, count: 1, type }]
		delete document.meshes
		delete document.nodes
		delete document.scenes
		delete document.scene
		expect(accepts(document)).toBe(true)
		document.bufferViews[0].byteLength = length - 1
		expect(accepts(document)).toBe(false)
	}
	const document: MutableJson = scene()
	delete document.accessors[0].bufferView
	document.bufferViews.push({ buffer: 0, byteOffset: 48, byteLength: 1 }, { buffer: 0, byteOffset: 52, byteLength: 12 })
	document.accessors[0].sparse = {
		count: 1,
		indices: { bufferView: 2, componentType: 5121 },
		values: { bufferView: 3 },
	}
	for (const [key, value] of [
		['count', 0],
		['count', 4],
		['indices', null],
		['values', null],
	] as const) {
		const mutated = structuredClone(document)
		mutated.accessors[0].sparse[key] = value
		expect(accepts(mutated)).toBe(false)
	}
	for (const key of ['indices', 'values'])
		for (const property of ['bufferView', 'byteOffset']) {
			const mutated = structuredClone(document)
			mutated.accessors[0].sparse[key][property] = -1
			expect(accepts(mutated)).toBe(false)
		}
	for (const property of ['target', 'byteStride']) {
		const mutated = structuredClone(document)
		mutated.bufferViews[2][property] = property === 'target' ? 34963 : 4
		expect(accepts(mutated)).toBe(false)
	}
	document.accessors[0].sparse.indices.componentType = 5126
	expect(accepts(document)).toBe(false)
})

test('mesh primitives validate attribute counts, references, shapes, topology and morph targets', () => {
	for (const attributes of [
		null,
		{},
		[],
		{ POSITION: 99 },
		{ POSITION: '0' },
		{ POSITION: 0, NORMAL: 1 },
		{ POSITION: 0, TEXCOORD_01: 0 },
		{ POSITION: 0, JOINTS_0: 0 },
	])
		invalid(d => {
			d.meshes[0].primitives[0].attributes = attributes
		})
	for (const field of ['min', 'max'])
		invalid(d => {
			delete d.accessors[0][field]
		})
	for (const indices of [99, '1', null, 0])
		invalid(d => {
			d.meshes[0].primitives[0].indices = indices
		})
	for (const mode of [-1, 7, 1.5, '4', null, 1])
		invalid(d => {
			d.meshes[0].primitives[0].mode = mode
		})
	for (const mode of [0, 2, 3, 4, 5, 6]) {
		const document: MutableJson = scene()
		document.meshes[0].primitives[0].mode = mode
		expect(accepts(document)).toBe(true)
	}
	invalid(d => {
		d.meshes[0].primitives = []
	})
	invalid(d => {
		d.meshes[0].primitives[0].material = 0
	})
	invalid(d => {
		d.meshes[0].primitives[0].extensions = { KHR_draco_mesh_compression: {} }
	})
	for (const targets of [
		null,
		[{}],
		[{ POSITION: 99 }],
		[{ JOINTS_0: 0 }],
		Array.from({ length: 65 }, () => ({ POSITION: 0 })),
	])
		invalid(d => {
			d.meshes[0].primitives[0].targets = targets
		})
	const morph: MutableJson = scene()
	morph.meshes[0].primitives[0].targets = [{ POSITION: 0, NORMAL: 0 }]
	expect(accepts(morph)).toBe(true)
	invalid(d => {
		d.meshes[0].primitives[0].attributes = { POSITION: 0, NORMAL: 0 }
		d.accessors.push({ ...d.accessors[0] })
		d.meshes[0].primitives[0].attributes.NORMAL = 2
	})
})

test('zero-filled and sparse accessors cannot bypass decoded geometry budgets', () => {
	const document: MutableJson = {
		asset: { version: '2.0' },
		accessors: [{ componentType: 5126, count: MAX_GLB_ACCESSOR_ELEMENTS, type: 'SCALAR' }],
	}
	expect(json(document)).toBe(true)
	document.accessors[0].count += 1
	expect(json(document)).toBe(false)
	document.accessors = [{ componentType: 5126, count: MAX_GLB_GEOMETRY_BYTES / 64, type: 'MAT4' }]
	expect(json(document)).toBe(true)
	document.accessors[0].count += 1
	expect(json(document)).toBe(false)
	document.accessors = [
		{ componentType: 5126, count: MAX_GLB_GEOMETRY_BYTES / 128, type: 'MAT4' },
		{ componentType: 5126, count: MAX_GLB_GEOMETRY_BYTES / 128, type: 'MAT4' },
	]
	expect(json(document)).toBe(true)
	document.accessors[1].count += 1
	expect(json(document)).toBe(false)
})

test('reused meshes, primitives and GPU instances are included in draw budgets', () => {
	const document: MutableJson = scene()
	document.accessors = [{ componentType: 5126, count: 12_000_000, type: 'VEC3', min: [0, 0, 0], max: [0, 0, 0] }]
	delete document.meshes[0].primitives[0].indices
	expect(accepts(document)).toBe(true)
	document.nodes = [{ mesh: 0 }, { mesh: 0 }, { mesh: 0 }]
	expect(accepts(document)).toBe(false)
	document.nodes = [{ mesh: 0 }]
	document.meshes[0].primitives = Array.from({ length: MAX_GLB_PRIMITIVES + 1 }, () => ({
		attributes: { POSITION: 0 },
	}))
	expect(accepts(document)).toBe(false)
	const instanced: MutableJson = scene()
	instanced.accessors.push({ componentType: 5126, count: Math.floor(MAX_GLB_DRAW_ELEMENTS / 3), type: 'SCALAR' })
	instanced.nodes[0].extensions = { EXT_mesh_gpu_instancing: { attributes: { _ID: 2 } } }
	expect(accepts(instanced)).toBe(true)
	instanced.accessors[2].count += 1
	expect(accepts(instanced)).toBe(false)
	instanced.accessors[2].count = 3
	instanced.nodes[0].extensions.EXT_mesh_gpu_instancing.attributes = { TRANSLATION: 2 }
	expect(accepts(instanced)).toBe(false)
	instanced.accessors[2].type = 'VEC3'
	expect(accepts(instanced)).toBe(true)
	instanced.nodes[0].extensions.EXT_mesh_gpu_instancing.attributes.SCALE = 1
	expect(accepts(instanced)).toBe(false)
})

test('scene graph rejects cycles, multiple parents, deep chains and invalid transforms/references', () => {
	for (const nodes of [
		[{ children: [0] }],
		[{ children: [1] }, { children: [0] }],
		[{ children: [2] }, { children: [2] }, {}],
		[{ children: [1, 1] }, {}],
		[{ mesh: 99 }],
		[{ translation: [0, 0] }],
		[{ scale: [1, 1, '1'] }],
		[{ rotation: [0, 0, 0, 1e100] }],
		[{ matrix: Array(16).fill(0), translation: [0, 0, 0] }],
	])
		invalid(d => {
			d.nodes = nodes
		})
	for (const field of ['children', 'translation', 'rotation', 'scale', 'matrix'])
		invalid(d => {
			d.nodes[0][field] = null
		})
	invalid(d => {
		d.scene = 1
	})
	invalid(d => {
		d.scenes[0].nodes = [1]
	})
	invalid(d => {
		d.nodes = [{ children: [1] }, {}]
		d.scenes[0].nodes = [1]
	})
	const document: MutableJson = {
		asset: { version: '2.0' },
		nodes: Array.from({ length: MAX_GLB_NODE_DEPTH }, (_, i) =>
			i === MAX_GLB_NODE_DEPTH - 1 ? {} : { children: [i + 1] }
		),
	}
	expect(json(document)).toBe(true)
	document.nodes.at(-1).children = [MAX_GLB_NODE_DEPTH]
	document.nodes.push({})
	expect(json(document)).toBe(false)
	document.nodes = Array.from({ length: MAX_GLB_NODES }, () => ({}))
	expect(json(document)).toBe(true)
	document.nodes.push({})
	expect(json(document)).toBe(false)
})

test('inline buffer lengths match actual base64 data rather than trusting declared lengths', () => {
	for (const [uri, byteLength] of [
		['AAAA', 3],
		['AA==', 1],
		['AAA=', 2],
		['AA', 1],
		['AAA', 2],
	] as const) {
		const buffer = { uri: `data:application/octet-stream;base64,${uri}`, byteLength }
		const document = { asset: { version: '2.0' }, buffers: [buffer] }
		expect(json(document)).toBe(true)
		buffer.byteLength += 1
		expect(json(document)).toBe(false)
	}
	for (const uri of ['A', 'AAA==', 'A=', '===='])
		expect(
			json({
				asset: { version: '2.0' },
				buffers: [{ uri: `data:application/octet-stream;base64,${uri}`, byteLength: 1 }],
			})
		).toBe(false)
})

test('vertex semantics preserve normal, UV, tangent, color and skin layouts', () => {
	const d: MutableJson = scene()
	d.bufferViews.push(
		{ buffer: 0, byteOffset: 48, byteLength: 36 },
		{ buffer: 0, byteOffset: 84, byteLength: 24 },
		{ buffer: 0, byteOffset: 108, byteLength: 48 },
		{ buffer: 0, byteOffset: 156, byteLength: 12, byteStride: 4 },
		{ buffer: 0, byteOffset: 168, byteLength: 48 }
	)
	d.accessors.push(
		{ bufferView: 2, componentType: 5126, count: 3, type: 'VEC3' },
		{ bufferView: 3, componentType: 5126, count: 3, type: 'VEC2' },
		{ bufferView: 4, componentType: 5126, count: 3, type: 'VEC4' },
		{ bufferView: 5, componentType: 5121, count: 3, type: 'VEC4' },
		{ bufferView: 6, componentType: 5126, count: 3, type: 'VEC4' }
	)
	d.meshes[0].primitives[0].attributes = {
		POSITION: 0,
		NORMAL: 2,
		TEXCOORD_0: 3,
		TANGENT: 4,
		COLOR_0: 4,
		JOINTS_0: 5,
		WEIGHTS_0: 6,
		_CUSTOM: 3,
	}
	expect(accepts(d)).toBe(true)
	d.accessors[3].componentType = 5123
	d.accessors[3].normalized = true
	d.bufferViews[3].byteStride = 4
	expect(accepts(d)).toBe(true)
	for (const [name, index] of [
		['TANGENT', 2],
		['COLOR_0', 3],
		['TEXCOORD_0', 4],
		['WEIGHTS_0', 2],
		['JOINTS_0', 4],
		['NORMAL', 4],
		['CUSTOM', 3],
		['TEXCOORD_2', 3],
	] as const) {
		const mutated = structuredClone(d)
		mutated.meshes[0].primitives[0].attributes[name] = index
		expect(accepts(mutated)).toBe(false)
	}
	const missing = structuredClone(d)
	delete missing.meshes[0].primitives[0].attributes.WEIGHTS_0
	expect(accepts(missing)).toBe(false)
	const mismatch = structuredClone(d)
	mismatch.accessors[2].count = 2
	expect(accepts(mismatch)).toBe(false)
})

test('a view cannot mix images, indices and vertices or hide unstrided attribute aliases in another primitive', () => {
	const mixed: MutableJson = scene()
	delete mixed.bufferViews[0].target
	mixed.images = [{ bufferView: 0, mimeType: 'image/png' }]
	expect(accepts(mixed)).toBe(false)
	delete mixed.images
	mixed.accessors[1].bufferView = 0
	expect(accepts(mixed)).toBe(false)
	const shared: MutableJson = scene()
	shared.accessors.push({ ...shared.accessors[0] })
	shared.meshes[0].primitives.push({ attributes: { POSITION: 2 }, indices: 1 })
	expect(accepts(shared)).toBe(false)
	shared.bufferViews[0].byteStride = 12
	expect(accepts(shared)).toBe(true)
})
