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
