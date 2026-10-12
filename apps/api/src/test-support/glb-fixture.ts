import { pngImage } from './image-fixture'

export function minimalGlb(binary?: Buffer, document: unknown = { asset: { version: '2.0' } }): Buffer {
	const json = Buffer.from(JSON.stringify(document))
	const jsonLength = Math.ceil(json.length / 4) * 4
	const binLength = binary ? Math.ceil(binary.length / 4) * 4 : 0
	const total = 20 + jsonLength + (binary ? 8 + binLength : 0)
	const glb = Buffer.alloc(total, 0x20)
	glb.write('glTF', 0, 'ascii')
	glb.writeUInt32LE(2, 4)
	glb.writeUInt32LE(total, 8)
	glb.writeUInt32LE(jsonLength, 12)
	glb.writeUInt32LE(0x4e4f534a, 16)
	json.copy(glb, 20)
	if (binary) {
		const offset = 20 + jsonLength
		glb.writeUInt32LE(binLength, offset)
		glb.writeUInt32LE(0x004e4942, offset + 4)
		binary.copy(glb, offset + 8)
	}
	return glb
}

export function externalGlbs(): Buffer[] {
	const fixtures = [
		'https://private.test/file',
		'http://127.0.0.1/private',
		'//private.test/file',
		'../file',
		'file:///private',
		'blob:https://private.test/id',
	].flatMap(uri =>
		['buffers', 'images'].map(field =>
			minimalGlb(undefined, { asset: { version: '2.0' }, [field]: [{ byteLength: 3, uri }] })
		)
	)
	const safe = minimalGlb()
	const first = fixtures[0]
	if (!first) throw new Error('Missing external GLB fixture')
	const replaced = Buffer.concat([safe, first.subarray(12)])
	replaced.writeUInt32LE(replaced.length, 8)
	return [...fixtures, replaced]
}

export function malformedGeometryGlbs(): Buffer[] {
	const bufferView = { buffer: 0, byteLength: 36 }
	const accessor = { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }
	const document = {
		asset: { version: '2.0' },
		buffers: [{ byteLength: 64 }],
		bufferViews: [bufferView],
		accessors: [accessor],
		meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
	}
	return [
		{ ...document, bufferViews: [{ ...bufferView, byteLength: 65 }] },
		{ ...document, accessors: [{ ...accessor, count: 4 }] },
		{ ...document, meshes: [{ primitives: [{ attributes: { POSITION: 99 } }] }] },
		{ ...document, accessors: [{ componentType: 5126, count: 32_000_000, type: 'VEC4' }] },
		{ ...document, nodes: [{ mesh: 0, children: [0] }] },
	].map(value => minimalGlb(Buffer.alloc(64), value))
}

export function malformedBinaryGlbs(): Buffer[] {
	const binary = Buffer.alloc(72)
	new Float32Array(binary.buffer, binary.byteOffset, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0])
	binary.writeUInt16LE(1, 38)
	binary.writeUInt16LE(2, 40)
	const document = {
		asset: { version: '2.0' },
		buffers: [{ byteLength: binary.length }],
		bufferViews: [
			{ buffer: 0, byteLength: 36 },
			{ buffer: 0, byteOffset: 36, byteLength: 6 },
		],
		accessors: [
			{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
			{ bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
		],
		meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
	}
	const nan = Buffer.from(binary)
	nan.writeFloatLE(Number.NaN, 0)
	const index = Buffer.from(binary)
	index.writeUInt16LE(3, 40)
	const sparse = {
		...document,
		bufferViews: [
			...document.bufferViews,
			{ buffer: 0, byteOffset: 44, byteLength: 2 },
			{ buffer: 0, byteOffset: 48, byteLength: 24 },
		],
		accessors: [
			{
				...document.accessors[0],
				bufferView: undefined,
				sparse: { count: 2, indices: { bufferView: 2, componentType: 5121 }, values: { bufferView: 3 } },
			},
			document.accessors[1],
		],
	}
	return [
		minimalGlb(nan, document),
		minimalGlb(index, document),
		minimalGlb(binary, sparse),
		minimalGlb(binary, {
			...document,
			accessors: [{ ...document.accessors[0], max: [2, 1, 0] }, document.accessors[1]],
		}),
	]
}

export function malformedImageGlbs(): Buffer[] {
	const image = Buffer.from(pngImage)
	image.writeUInt32BE(16385, 16)
	const document = {
		asset: { version: '2.0' },
		buffers: [{ byteLength: image.length }],
		bufferViews: [{ buffer: 0, byteLength: image.length }],
		images: [{ bufferView: 0, mimeType: 'image/png' }],
	}
	const huge = Buffer.from(pngImage)
	huge.writeUInt32BE(4096, 16)
	huge.writeUInt32BE(4096, 20)
	return [
		minimalGlb(image, document),
		minimalGlb(Buffer.alloc(image.length), document),
		minimalGlb(huge, { ...document, textures: Array.from({ length: 5 }, () => ({ source: 0 })) }),
		minimalGlb(undefined, {
			asset: document.asset,
			images: [{ uri: `data:image/png;base64,${image.toString('base64')}` }],
		}),
	]
}
