import { compressGlb } from '@minemories/api-contract/glb-meshopt'
import { MeshoptEncoder } from 'meshoptimizer/encoder'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/HxoAAAAASUVORK5CYII='

/** A row of quads with int16 positions (stride 8), 16-bit indices and an embedded PNG. */
function quadsGlb(quads: number): Uint8Array {
	const positions = new Int16Array(quads * 16)
	const indices = new Uint16Array(quads * 6)
	for (let quad = 0; quad < quads; quad++) {
		for (let corner = 0; corner < 4; corner++)
			positions.set([quad * 16 + (corner % 2) * 16, (corner >> 1) * 16, 0, 0], (quad * 4 + corner) * 4)
		indices.set(
			[0, 1, 2, 0, 2, 3].map(value => quad * 4 + value),
			quad * 6
		)
	}
	const png = Uint8Array.from(atob(PNG), character => character.charCodeAt(0))
	const chunks = [new Uint8Array(positions.buffer), new Uint8Array(indices.buffer), png]
	const views: object[] = []
	const extra = [{ byteStride: 8, target: 34962 }, { target: 34963 }, {}]
	const bin: number[] = []
	for (const [index, chunk] of chunks.entries()) {
		while (bin.length % 4 !== 0) bin.push(0)
		views.push({
			buffer: 0,
			byteOffset: bin.length,
			byteLength: chunk.length,
			...extra[index],
		})
		bin.push(...chunk)
	}
	const json = {
		asset: { version: '2.0' },
		scene: 0,
		scenes: [{ nodes: [0] }],
		nodes: [{ mesh: 0 }],
		meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
		materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
		textures: [{ source: 0 }],
		images: [{ bufferView: 2, mimeType: 'image/png' }],
		accessors: [
			{ bufferView: 0, componentType: 5122, count: quads * 4, type: 'VEC3', min: [0, 0, 0], max: [quads * 16, 16, 0] },
			{ bufferView: 1, componentType: 5123, count: quads * 6, type: 'SCALAR' },
		],
		bufferViews: views,
		buffers: [{ byteLength: bin.length }],
		extensionsUsed: ['KHR_mesh_quantization'],
		extensionsRequired: ['KHR_mesh_quantization'],
	}
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

export async function compressedSample(quads = 200): Promise<{ plain: Uint8Array; compressed: Uint8Array }> {
	await MeshoptEncoder.ready
	const plain = quadsGlb(quads)
	const compressed = compressGlb(plain, MeshoptEncoder)
	if (!compressed) throw new Error('sample did not compress')
	return { plain, compressed }
}
