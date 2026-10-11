import { expect, test } from 'bun:test'
import { validateSelfContainedGlb, validEmbeddedGltfValues } from '@minemories/api-contract/glb'
import { GLB_VALUE_WINDOW_BYTES } from '../../../packages/api-contract/src/glb-values'
import { minimalGlb } from './test-support/glb-fixture'

// biome-ignore lint/suspicious/noExplicitAny: Adversarial fixtures deliberately mutate nested glTF properties.
type Document = Record<string, any>

function triangle(): { document: Document; bytes: Buffer } {
	const bytes = Buffer.alloc(44)
	new Float32Array(bytes.buffer, bytes.byteOffset, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0])
	bytes.writeUInt16LE(0, 36)
	bytes.writeUInt16LE(1, 38)
	bytes.writeUInt16LE(2, 40)
	return {
		bytes,
		document: {
			asset: { version: '2.0' },
			buffers: [{ byteLength: bytes.length }],
			bufferViews: [
				{ buffer: 0, byteLength: 36 },
				{ buffer: 0, byteOffset: 36, byteLength: 6 },
			],
			accessors: [
				{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
				{ bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
			],
			meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
		},
	}
}
async function accepts(document: Document, bytes: Buffer) {
	return validateSelfContainedGlb(minimalGlb(bytes, document))
}

test('finite triangle values and float32-rounded declared bounds are accepted', async () => {
	const { document, bytes } = triangle()
	expect(await accepts(document, bytes)).toBe(true)
	bytes.writeFloatLE(1.2, 12)
	document.accessors[0].max[0] = 1.2
	expect(await accepts(document, bytes)).toBe(true)
	document.accessors[0].max[0] = 1.3
	expect(await accepts(document, bytes)).toBe(false)
	document.accessors[0].max[0] = 1.2
	document.accessors[0].min[0] = -1
	expect(await accepts(document, bytes)).toBe(false)
})

test('float attributes reject NaN and both infinities even without declared bounds', async () => {
	await Promise.all(
		[Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].map(async value => {
			const { document, bytes } = triangle()
			bytes.writeFloatLE(value, 16)
			expect(await accepts(document, bytes)).toBe(false)
			delete document.meshes
			delete document.accessors[0].min
			delete document.accessors[0].max
			expect(await accepts(document, bytes)).toBe(false)
		})
	)
})

test('indices are limited by every primitive that uses them and reject the reserved maximum', async () => {
	for (const componentType of [5121, 5123, 5125]) {
		const { document, bytes } = triangle()
		document.accessors[1].componentType = componentType
		const indexBytes = new Map([
			[5121, 1],
			[5123, 2],
			[5125, 4],
		]).get(componentType) as number
		const expanded = Buffer.alloc(48)
		bytes.copy(expanded, 0, 0, 36)
		document.buffers[0].byteLength = expanded.length
		document.bufferViews[1].byteLength = indexBytes * 3
		const index = new DataView(expanded.buffer, expanded.byteOffset + 36, 12)
		const write = (value: number) => {
			if (componentType === 5121) index.setUint8(0, value)
			else if (componentType === 5123) index.setUint16(0, value, true)
			else index.setUint32(0, value, true)
		}
		write(2)
		// biome-ignore lint/performance/noAwaitInLoops: Cover all three index representations.
		expect(await accepts(document, expanded)).toBe(true)
		write(3)
		expect(await accepts(document, expanded)).toBe(false)
		document.accessors[0] = { ...document.accessors[0], bufferView: undefined, count: 65536 }
		write(2 ** (indexBytes * 8) - 1)
		expect(await accepts(document, expanded)).toBe(false)
	}
	const { document, bytes } = triangle()
	document.accessors.push({ componentType: 5126, type: 'VEC3', count: 1, min: [0, 0, 0], max: [0, 0, 0] })
	document.meshes[0].primitives.push({ attributes: { POSITION: 2 }, indices: 1 })
	expect(await accepts(document, bytes)).toBe(false)
})

function sparseScene(count = 3, replacements = 2): { document: Document; bytes: Buffer; valueOffset: number } {
	const indexLength = replacements * 2
	const valueOffset = Math.ceil(indexLength / 4) * 4
	const bytes = Buffer.alloc(valueOffset + replacements * 12)
	for (let index = 0; index < replacements; index++) {
		bytes.writeUInt16LE(index, index * 2)
		bytes.writeFloatLE(index + 1, valueOffset + index * 12)
	}
	return {
		bytes,
		valueOffset,
		document: {
			asset: { version: '2.0' },
			buffers: [{ byteLength: bytes.length }],
			bufferViews: [
				{ buffer: 0, byteLength: indexLength },
				{ buffer: 0, byteOffset: valueOffset, byteLength: replacements * 12 },
			],
			accessors: [
				{
					componentType: 5126,
					type: 'VEC3',
					count,
					min: [0, 0, 0],
					max: [replacements, 0, 0],
					sparse: {
						count: replacements,
						indices: { bufferView: 0, componentType: 5123 },
						values: { bufferView: 1 },
					},
				},
			],
		},
	}
}

test('sparse values determine effective bounds with implicit zeros or a replaced base', async () => {
	const { document, bytes, valueOffset } = sparseScene()
	expect(await accepts(document, bytes)).toBe(true)
	const base = Buffer.alloc(bytes.length + 36)
	bytes.copy(base)
	new Float32Array(base.buffer, base.byteOffset + bytes.length, 9).fill(100)
	document.buffers[0].byteLength = base.length
	document.bufferViews.push({ buffer: 0, byteOffset: bytes.length, byteLength: 36 })
	document.accessors[0].bufferView = 2
	document.accessors[0].max = [100, 100, 100]
	document.accessors[0].min = [1, 0, 0]
	expect(await accepts(document, base)).toBe(true)
	base.writeFloatLE(Number.NaN, valueOffset)
	expect(await accepts(document, base)).toBe(false)
	const complete = sparseScene(2, 2)
	complete.document.accessors[0].min = [1, 0, 0]
	expect(await accepts(complete.document, complete.bytes)).toBe(true)
})

test('sparse indices must be strictly increasing, unique and inside the accessor', async () => {
	await Promise.all(
		[0, 3, 65535].map(async value => {
			const { document, bytes } = sparseScene()
			bytes.writeUInt16LE(value, 2)
			expect(await accepts(document, bytes)).toBe(false)
		})
	)
	const { document, bytes } = sparseScene()
	bytes.writeUInt16LE(1, 0)
	bytes.writeUInt16LE(0, 2)
	expect(await accepts(document, bytes)).toBe(false)
})

test('sparse indices also support tightly packed uint8 and uint32 representations', async () => {
	const small = sparseScene()
	small.document.accessors[0].sparse.indices.componentType = 5121
	small.document.bufferViews[0].byteLength = 2
	small.bytes[1] = 1
	expect(await accepts(small.document, small.bytes)).toBe(true)
	const wide = sparseScene()
	const expanded = Buffer.alloc(wide.bytes.length + 4)
	wide.bytes.copy(expanded, 8, 4)
	expanded.writeUInt32LE(1, 4)
	wide.document.accessors[0].sparse.indices.componentType = 5125
	wide.document.bufferViews[0].byteLength = 8
	wide.document.bufferViews[1].byteOffset = 8
	wide.document.buffers[0].byteLength = expanded.length
	expect(await accepts(wide.document, expanded)).toBe(true)
})

test('uint32 sparse indices stay within the read bound even when replacement elements are single bytes', async () => {
	const count = 70000
	const bytes = Buffer.alloc(count * 5)
	for (let index = 0; index < count; index++) bytes.writeUInt32LE(index, index * 4)
	bytes.fill(1, count * 4)
	const document = {
		asset: { version: '2.0' },
		buffers: [{ byteLength: bytes.length }],
		bufferViews: [
			{ buffer: 0, byteLength: count * 4 },
			{ buffer: 0, byteOffset: count * 4, byteLength: count },
		],
		accessors: [
			{
				componentType: 5121,
				type: 'SCALAR',
				count,
				min: [1],
				max: [1],
				sparse: { count, indices: { bufferView: 0, componentType: 5125 }, values: { bufferView: 1 } },
			},
		],
	}
	let largest = 0
	expect(
		await validEmbeddedGltfValues(
			Buffer.from(JSON.stringify(document)),
			bytes.length,
			async (_buffer, offset, length) => {
				largest = Math.max(largest, length)
				return bytes.subarray(offset, offset + length)
			}
		)
	).toBe(true)
	expect(largest).toBeLessThanOrEqual(GLB_VALUE_WINDOW_BYTES)
})

test('sparse and interleaved readers remain bounded across window boundaries and detect short reads', async () => {
	const { document, bytes } = sparseScene(6000, 6000)
	document.accessors[0].min = [1, 0, 0]
	let largest = 0
	let calls = 0
	const json = Buffer.from(JSON.stringify(document))
	const read = async (_buffer: number, offset: number, length: number) => {
		calls++
		largest = Math.max(largest, length)
		return bytes.subarray(offset, offset + length)
	}
	expect(await validEmbeddedGltfValues(json, bytes.length, read)).toBe(true)
	expect(calls).toBeGreaterThan(2)
	expect(largest).toBeLessThanOrEqual(GLB_VALUE_WINDOW_BYTES)
	const base = Buffer.concat([bytes, Buffer.alloc(6000 * 12)])
	const withBase = structuredClone(document)
	withBase.buffers[0].byteLength = base.length
	withBase.bufferViews.push({ buffer: 0, byteOffset: bytes.length, byteLength: 6000 * 12 })
	withBase.accessors[0].bufferView = 2
	expect(await accepts(withBase, base)).toBe(true)
	expect(await validEmbeddedGltfValues(Buffer.from(JSON.stringify(withBase)), base.length, async () => null)).toBe(
		false
	)
	expect(await validEmbeddedGltfValues(json, bytes.length, async () => Buffer.alloc(1))).toBe(false)
	bytes.writeUInt16LE(5460, 5461 * 2)
	expect(await validEmbeddedGltfValues(json, bytes.length, read)).toBe(false)
	const interleaved = triangle()
	const data = Buffer.alloc(72, 0xff)
	for (let vertex = 0; vertex < 3; vertex++) interleaved.bytes.copy(data, vertex * 24, vertex * 12, vertex * 12 + 12)
	interleaved.document.buffers[0].byteLength = data.length
	interleaved.document.bufferViews = [{ buffer: 0, byteLength: 72, byteStride: 24 }]
	interleaved.document.accessors.pop()
	delete interleaved.document.meshes[0].primitives[0].indices
	expect(await accepts(interleaved.document, data)).toBe(true)
})

test('integer normalized bounds use raw components and matrix column padding is ignored', async () => {
	for (const [componentType, bytes, min, max] of [
		[5120, Buffer.from([128, 127]), -128, 127],
		[5121, Buffer.from([0, 255]), 0, 255],
		[5122, Buffer.from([0, 128, 255, 127]), -32768, 32767],
		[5123, Buffer.from([0, 0, 255, 255]), 0, 65535],
	] as const) {
		const document = {
			asset: { version: '2.0' },
			buffers: [{ byteLength: bytes.length }],
			bufferViews: [{ buffer: 0, byteLength: bytes.length }],
			accessors: [{ bufferView: 0, componentType, type: 'SCALAR', count: 2, normalized: true, min: [min], max: [max] }],
		}
		// biome-ignore lint/performance/noAwaitInLoops: Cover signed and unsigned normalized integer types.
		expect(await accepts(document, bytes)).toBe(true)
	}
	const bytes = Buffer.from([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255])
	const document = {
		asset: { version: '2.0' },
		buffers: [{ byteLength: 12 }],
		bufferViews: [{ buffer: 0, byteLength: 12 }],
		accessors: [
			{
				bufferView: 0,
				componentType: 5121,
				type: 'MAT3',
				count: 1,
				min: [1, 2, 3, 4, 5, 6, 7, 8, 9],
				max: [1, 2, 3, 4, 5, 6, 7, 8, 9],
			},
		],
	}
	expect(await accepts(document, bytes)).toBe(true)
})

test('embedded data URI buffers are inspected and buffer byte offsets are preserved', async () => {
	const { document, bytes } = triangle()
	document.buffers[0].uri = `data:application/octet-stream;base64,${bytes.toString('base64')}`
	expect(await validateSelfContainedGlb(minimalGlb(undefined, document))).toBe(true)
	bytes.writeFloatLE(Number.POSITIVE_INFINITY, 0)
	document.buffers[0].uri = `data:application/octet-stream;base64,${bytes.toString('base64')}`
	expect(await validateSelfContainedGlb(minimalGlb(undefined, document))).toBe(false)
	const plain = triangle()
	const glb = minimalGlb(plain.bytes, plain.document)
	const backed = Buffer.concat([Buffer.alloc(7), glb, Buffer.alloc(7)])
	expect(await validateSelfContainedGlb(backed.subarray(7, 7 + glb.length))).toBe(true)
})

test('large in-memory validation yields to the event loop instead of starving loading feedback', async () => {
	const count = 30000
	const bytes = Buffer.alloc(count * 12)
	const document = {
		asset: { version: '2.0' },
		buffers: [{ byteLength: bytes.length }],
		bufferViews: [{ buffer: 0, byteLength: bytes.length }],
		accessors: [{ bufferView: 0, componentType: 5126, type: 'VEC3', count, min: [0, 0, 0], max: [0, 0, 0] }],
	}
	let yielded = false
	const timer = setTimeout(() => {
		yielded = true
	}, 0)
	try {
		expect(await accepts(document, bytes)).toBe(true)
		expect(yielded).toBe(true)
	} finally {
		clearTimeout(timer)
	}
})
