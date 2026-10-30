// Tiny, real GLB captures for the tests: meshopt vertex + index streams (old codec), PNG textures, the same JSON shape as the film's captures.
import pngjs from 'pngjs'
import { buildGlb } from './glb.mjs'

const { PNG } = pngjs

export function pngOf(width, height, pixel, options = {}) {
	const png = new PNG({ width, height })
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) png.data.set(pixel(x, y), (y * width + x) * 4)
	return new Uint8Array(PNG.sync.write(png, options))
}

/**
 * @param {{ MeshoptEncoder: any }} meshopt
 * @param {{ cells?: number, tint?: number }} [options] `cells` grid quads (more cells = more geometry), `tint` changes one texture colour
 */
export function syntheticGlb({ MeshoptEncoder }, { cells = 64, tint = 0 } = {}) {
	const vertexCount = cells * 4
	const positions = new Float32Array(vertexCount * 3)
	for (let cell = 0; cell < cells; cell++)
		for (let corner = 0; corner < 4; corner++) {
			const at = (cell * 4 + corner) * 3
			positions.set([(cell % 8) + (corner & 1), Math.floor(cell / 8) + (corner >> 1), 0], at)
		}
	const indices = new Uint16Array(cells * 6)
	for (let cell = 0; cell < cells; cell++)
		indices.set(
			[0, 1, 2, 2, 1, 3].map(i => i + cell * 4),
			cell * 6
		)
	const vertexStream = MeshoptEncoder.encodeVertexBufferLevel(new Uint8Array(positions.buffer), vertexCount, 12, 2, 0)
	const indexStream = MeshoptEncoder.encodeGltfBuffer(new Uint8Array(indices.buffer), indices.length, 2, 'TRIANGLES')
	const image = pngOf(16, 16, (x, y) => [(x * 16) & 255, (y * 16) & 255, tint, x === y ? 128 : 255])
	const parts = [image, vertexStream, indexStream]
	let offset = 0
	const placed = parts.map(part => {
		const at = offset
		offset += (part.length + 3) & ~3
		return at
	})
	const bin = new Uint8Array(offset)
	for (const [index, part] of parts.entries()) bin.set(part, placed[index])
	const compressed = (index, count, byteStride, mode, length) => ({
		buffer: 1,
		byteOffset: 0,
		byteLength: count * byteStride,
		target: mode === 'TRIANGLES' ? 34963 : 34962,
		...(mode === 'ATTRIBUTES' ? { byteStride } : {}),
		extensions: {
			EXT_meshopt_compression: { buffer: 0, byteOffset: placed[index], byteLength: length, mode, byteStride, count },
		},
	})
	const json = {
		asset: { generator: 'synthetic', version: '2.0' },
		accessors: [
			{ type: 'SCALAR', componentType: 5123, count: indices.length, bufferView: 2 },
			{
				type: 'VEC3',
				componentType: 5126,
				count: vertexCount,
				bufferView: 1,
				min: [0, 0, 0],
				max: [9, cells / 8 + 1, 0],
			},
		],
		bufferViews: [
			{ buffer: 0, byteOffset: placed[0], byteLength: image.length },
			compressed(1, vertexCount, 12, 'ATTRIBUTES', vertexStream.length),
			compressed(2, indices.length, 2, 'TRIANGLES', indexStream.length),
		],
		samplers: [{ magFilter: 9728, minFilter: 9728 }],
		textures: [{ sampler: 0, source: 0 }],
		images: [{ name: 'minecraft:block/test', mimeType: 'image/png', bufferView: 0 }],
		buffers: [{ byteLength: offset }, { byteLength: 1, extensions: { EXT_meshopt_compression: { fallback: true } } }],
		materials: [{ name: 'test', pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
		meshes: [{ name: 'capture', primitives: [{ attributes: { POSITION: 1 }, indices: 0, material: 0 }] }],
		nodes: [{ name: 'capture', mesh: 0 }],
		scenes: [{ nodes: [0] }],
		scene: 0,
		extensionsUsed: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
		extensionsRequired: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
	}
	return buildGlb(json, bin)
}
