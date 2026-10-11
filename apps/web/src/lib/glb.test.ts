import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import { formatFileSize, isGlbFileName, parseEmbeddedGlb, UnsupportedGlbError } from './glb'

describe('isGlbFileName', () => {
	it('accepts the GLB extension without case sensitivity', () => {
		expect(isGlbFileName('world.glb')).toBe(true)
		expect(isGlbFileName('WORLD.GLB')).toBe(true)
	})

	it('rejects other files and names that only contain .glb', () => {
		expect(isGlbFileName('world.gltf')).toBe(false)
		expect(isGlbFileName('world.glb.zip')).toBe(false)
		expect(isGlbFileName('.glb.tmp')).toBe(false)
		expect(isGlbFileName('')).toBe(false)
	})
})

describe('formatFileSize', () => {
	it('formats bytes using binary units', () => {
		expect(formatFileSize(0)).toBe('0 B')
		expect(formatFileSize(1023)).toBe('1023 B')
		expect(formatFileSize(1024)).toBe('1 KiB')
		expect(formatFileSize(1_572_864)).toBe('1.5 MiB')
		expect(formatFileSize(1024 ** 3)).toBe('1 GiB')
		expect(formatFileSize(1024 ** 5)).toBe('1,024 TiB')
	})

	it('rejects invalid sizes', () => {
		expect(() => formatFileSize(-1)).toThrow(RangeError)
		expect(() => formatFileSize(Number.NaN)).toThrow(RangeError)
		expect(() => formatFileSize(Number.POSITIVE_INFINITY)).toThrow(RangeError)
	})
})
function fixture(document: unknown, binary?: Uint8Array): ArrayBuffer {
	const json = new TextEncoder().encode(JSON.stringify(document))
	const length = Math.ceil(json.length / 4) * 4
	const buffer = new ArrayBuffer(20 + length + (binary ? 8 + Math.ceil(binary.length / 4) * 4 : 0))
	const bytes = new Uint8Array(buffer)
	bytes.fill(0x20)
	const view = new DataView(buffer)
	view.setUint32(0, 0x46546c67, true)
	view.setUint32(4, 2, true)
	view.setUint32(8, buffer.byteLength, true)
	view.setUint32(12, length, true)
	view.setUint32(16, 0x4e4f534a, true)
	bytes.set(json, 20)
	if (binary) {
		view.setUint32(20 + length, Math.ceil(binary.length / 4) * 4, true)
		view.setUint32(24 + length, 0x004e4942, true)
		bytes.set(binary, 28 + length)
	}
	return buffer
}

describe('parseEmbeddedGlb', () => {
	it('passes a self-contained scene to the real Three.js parser', async () => {
		const buffer = fixture({
			asset: { version: '2.0' },
			scene: 0,
			scenes: [{ nodes: [0] }],
			nodes: [{ name: 'Cabin' }],
		})
		const loader = new GLTFLoader()
		const result = await parseEmbeddedGlb(buffer, data => loader.parseAsync(data, ''))
		expect(result.scene.children[0]?.name).toBe('Cabin')
	})

	it('rejects unsafe or malformed files before the parser can load their resources', async () => {
		let called = false
		const parse = () => {
			called = true
			return Promise.resolve()
		}
		const buffers = [
			new ArrayBuffer(0),
			fixture({ asset: { version: '2.0' }, images: [{ uri: 'https://private.test/image.png' }] }),
		]
		await Promise.all(
			buffers.map(buffer => expect(parseEmbeddedGlb(buffer, parse)).rejects.toBeInstanceOf(UnsupportedGlbError))
		)
		expect(called).toBe(false)
	})
})

function triangle() {
	return {
		asset: { version: '2.0' },
		buffers: [{ byteLength: 36 }],
		bufferViews: [{ buffer: 0, byteLength: 36 }],
		accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
		meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
		nodes: [{ mesh: 0 }],
		scenes: [{ nodes: [0] }],
		scene: 0,
	}
}
it('loads bounded triangle geometry through the real Three.js parser', async () => {
	const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
	const loader = new GLTFLoader()
	const result = await parseEmbeddedGlb(fixture(triangle(), new Uint8Array(positions.buffer)), data =>
		loader.parseAsync(data, '')
	)
	const mesh = result.scene.children[0] as import('three').Mesh
	expect(mesh.geometry.getAttribute('position').count).toBe(3)
	expect(mesh.geometry.boundingBox?.max.toArray()).toEqual([1, 1, 0])
	mesh.geometry.dispose()
})
it('refuses inconsistent geometry and oversized implied allocations before invoking the loader', async () => {
	let called = false
	const parse = () => {
		called = true
		return Promise.resolve()
	}
	const range = { ...triangle(), bufferViews: [{ buffer: 0, byteLength: 40 }] }
	const reference = { ...triangle(), meshes: [{ primitives: [{ attributes: { POSITION: 1 } }] }] }
	const zeroFilled = {
		asset: { version: '2.0' },
		accessors: [{ componentType: 5126, count: 32_000_000, type: 'VEC4' }],
	}
	await Promise.all(
		[range, reference, zeroFilled].map(document =>
			expect(parseEmbeddedGlb(fixture(document, new Uint8Array(36)), parse)).rejects.toBeInstanceOf(UnsupportedGlbError)
		)
	)
	expect(called).toBe(false)
})

it('refuses non-finite vertices and false binary bounds before invoking the loader', async () => {
	let called = false
	const parse = () => {
		called = true
		return Promise.resolve()
	}
	await Promise.all(
		[Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].map(async value => {
			const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
			positions[0] = value
			await expect(
				parseEmbeddedGlb(fixture(triangle(), new Uint8Array(positions.buffer)), parse)
			).rejects.toBeInstanceOf(UnsupportedGlbError)
		})
	)
	const wrong = triangle()
	const accessor = wrong.accessors[0]
	if (!accessor) throw new Error('Missing triangle accessor')
	accessor.max = [2, 1, 0]
	const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
	await expect(parseEmbeddedGlb(fixture(wrong, new Uint8Array(positions.buffer)), parse)).rejects.toBeInstanceOf(
		UnsupportedGlbError
	)
	expect(called).toBe(false)
})

it('loads sparse replacements through Three.js and refuses duplicate sparse indices', async () => {
	const document = triangle()
	const sparse = {
		...document,
		buffers: [{ byteLength: 28 }],
		bufferViews: [
			{ buffer: 0, byteLength: 2 },
			{ buffer: 0, byteOffset: 4, byteLength: 24 },
		],
		accessors: [
			{
				...document.accessors[0],
				bufferView: undefined,
				sparse: {
					count: 2,
					indices: { bufferView: 0, componentType: 5121 },
					values: { bufferView: 1 },
				},
			},
		],
	}
	const binary = new Uint8Array(28)
	binary.set([1, 2])
	new Float32Array(binary.buffer, 4, 6).set([1, 0, 0, 0, 1, 0])
	const loader = new GLTFLoader()
	const result = await parseEmbeddedGlb(fixture(sparse, binary), data => loader.parseAsync(data, ''))
	const mesh = result.scene.children[0] as import('three').Mesh
	expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
	mesh.geometry.dispose()
	binary[1] = 1
	await expect(
		parseEmbeddedGlb(fixture(sparse, binary), () => Promise.reject(new Error('Loader must not run')))
	).rejects.toBeInstanceOf(UnsupportedGlbError)
})
