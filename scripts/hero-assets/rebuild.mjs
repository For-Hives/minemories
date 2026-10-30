// Lossless rebuild of one capture, at the container level (no Blender, no scene graph round trip):
//  - every meshopt vertex stream is decoded and encoded again with the encoder's current codec (smaller),
//  - every PNG texture goes through oxipng (lossless),
//  - everything else (index streams, JSON, material and node order) is left as it is.
// The result is only trusted after `proveEquivalent` (equivalence.mjs) has decoded both files and compared them.
import { buildGlb, meshoptExtension, parseGlb } from './glb.mjs'

export const EXT = 'EXT_meshopt_compression'
export const KHR = 'KHR_meshopt_compression'
const align4 = length => (length + 3) & ~3

/**
 * @typedef {object} Tools
 * @property {{ decodeGltfBuffer: Function, ready: Promise<void> }} decoder meshoptimizer decoder
 * @property {{ encodeVertexBuffer: (source: Uint8Array, count: number, size: number) => Uint8Array, ready: Promise<void> }} encoder
 * @property {(png: Uint8Array) => Promise<Uint8Array>} optimisePng lossless PNG recompression
 */

/** The regions of the real buffer (buffer 0), in file order: raw views (images) and meshopt-compressed streams. */
function regionsOf(json) {
	const regions = []
	for (const [index, view] of (json.bufferViews ?? []).entries()) {
		const extension = meshoptExtension(view)
		if (!extension) {
			if (view.buffer === 0) regions.push({ index, holder: view, mode: 'RAW' })
			continue
		}
		if (extension.buffer !== 0) throw new Error(`bufferView ${index}: compressed data outside buffer 0`)
		if (extension.filter && extension.filter !== 'NONE')
			throw new Error(`bufferView ${index}: meshopt filter ${extension.filter}`)
		regions.push({ index, holder: extension, mode: extension.mode })
	}
	return regions.sort((a, b) => a.holder.byteOffset - b.holder.byteOffset)
}

/** The vertex stream, encoded again; the smaller of the two is kept (a v1 stream has header 0xa1). */
function reencodeVertices(holder, original, tools) {
	const decoded = new Uint8Array(holder.count * holder.byteStride)
	tools.decoder.decodeGltfBuffer(decoded, holder.count, holder.byteStride, original, 'ATTRIBUTES', 'NONE')
	const encoded = tools.encoder.encodeVertexBuffer(decoded, holder.count, holder.byteStride)
	return encoded.length < original.length
		? { data: encoded, version1: encoded[0] === 0xa1 }
		: { data: original, version1: false }
}

/** New bytes of one region, plus what to count. */
async function rebuildRegion({ index, holder, mode }, bin, imageViews, tools) {
	const original = bin.subarray(holder.byteOffset, holder.byteOffset + holder.byteLength)
	if (mode === 'ATTRIBUTES') {
		const { data, version1 } = reencodeVertices(holder, original, tools)
		return { data, version1, kind: 'vertex', before: original.length }
	}
	if (mode === 'RAW' && imageViews.has(index)) {
		const optimised = await tools.optimisePng(original)
		return {
			data: optimised.length < original.length ? optimised : original,
			version1: false,
			kind: 'png',
			before: original.length,
		}
	}
	return { data: original, version1: false, kind: 'other', before: original.length }
}

/**
 * @param {Uint8Array} source GLB bytes
 * @param {Tools} tools
 * @returns {Promise<{ glb: Uint8Array, stats: { vertexStreams: number, vertexIn: number, vertexOut: number, pngs: number, pngIn: number, pngOut: number, renamed: boolean } }>}
 */
export async function rebuildGlb(source, tools) {
	await Promise.all([tools.decoder.ready, tools.encoder.ready])
	const { json, bin } = parseGlb(source)
	const stats = { vertexStreams: 0, vertexIn: 0, vertexOut: 0, pngs: 0, pngIn: 0, pngOut: 0, renamed: false }
	const imageViews = new Set((json.images ?? []).map(image => image.bufferView))
	const parts = []
	let offset = 0
	let version1 = false
	for (const region of regionsOf(json)) {
		// biome-ignore lint/performance/noAwaitInLoops: one WASM optimiser, one stream at a time, in a stable order
		const result = await rebuildRegion(region, bin, imageViews, tools)
		version1 ||= result.version1
		if (result.kind === 'vertex')
			Object.assign(stats, {
				vertexStreams: stats.vertexStreams + 1,
				vertexIn: stats.vertexIn + result.before,
				vertexOut: stats.vertexOut + result.data.length,
			})
		if (result.kind === 'png')
			Object.assign(stats, {
				pngs: stats.pngs + 1,
				pngIn: stats.pngIn + result.before,
				pngOut: stats.pngOut + result.data.length,
			})
		region.holder.byteOffset = offset
		region.holder.byteLength = result.data.length
		parts.push({ offset, data: result.data })
		offset += align4(result.data.length)
	}
	const out = new Uint8Array(offset)
	for (const { offset: at, data } of parts) out.set(data, at)
	json.buffers[0].byteLength = offset
	// A v1 stream under the EXT name would be illegal: the extension is renamed (same codec family, three registers both names).
	const before = JSON.stringify(json)
	const after = version1 ? before.replaceAll(EXT, KHR) : before
	stats.renamed = after !== before
	return { glb: buildGlb(JSON.parse(after), out), stats }
}
