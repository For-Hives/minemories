// Proof that a rebuilt capture is the same capture: decode both files with an INDEPENDENT decoder (three's own meshopt
// decoder, not the one used to rebuild) and compare what the renderer can see.
//  1. the glTF JSON is equal once offsets, lengths and the extension rename are set aside;
//  2. every compressed stream decodes to identical bytes (positions, normals, UVs, indices, all of them);
//  3. every image is the same PNG bytes or, if recompressed, the same RGBA pixels with the same colour-space chunks.
import { createHash } from 'node:crypto'
import pngjs from 'pngjs'
import { meshoptExtension, parseGlb } from './glb.mjs'
import { EXT, KHR } from './rebuild.mjs'

const { PNG } = pngjs
const PNG_SIGNATURE = '89504e470d0a1a0a'
/** Chunks that change how a browser shows the pixels: they must survive as they were. */
const COLOUR_CHUNKS = ['gAMA', 'cHRM', 'sRGB', 'iCCP', 'cICP']

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

const same = (a, b) => a.length === b.length && Buffer.compare(a, b) === 0

function pngChunks(bytes) {
	if (Buffer.from(bytes.subarray(0, 8)).toString('hex') !== PNG_SIGNATURE) return null
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const chunks = new Map() // name -> content (hex), colour chunks only
	for (let at = 8; at + 8 <= bytes.length; ) {
		const name = Buffer.from(bytes.subarray(at + 4, at + 8)).toString('latin1')
		const length = view.getUint32(at, false)
		if (COLOUR_CHUNKS.includes(name))
			chunks.set(name, Buffer.from(bytes.subarray(at + 8, at + 8 + length)).toString('hex'))
		at += 12 + length
	}
	return chunks
}

/** Same RGBA pixels, same size, same colour-space chunks (presence and content). Returns the reason it differs, or null. */
export function pngDifference(a, b) {
	const namesA = pngChunks(a)
	const namesB = pngChunks(b)
	if (!(namesA && namesB)) return 'not a PNG'
	for (const chunk of COLOUR_CHUNKS) if (namesA.get(chunk) !== namesB.get(chunk)) return `chunk ${chunk}`
	const x = PNG.sync.read(Buffer.from(a))
	const y = PNG.sync.read(Buffer.from(b))
	if (x.width !== y.width || x.height !== y.height) return 'size'
	return same(x.data, y.data) ? null : 'pixels'
}

function normalised(json) {
	const clone = JSON.parse(JSON.stringify(json).replaceAll(KHR, EXT))
	delete clone.buffers?.[0]?.byteLength
	for (const view of clone.bufferViews ?? []) {
		const extension = view.extensions?.[EXT]
		const holder = extension ?? (view.buffer === 0 ? view : null)
		if (holder) {
			delete holder.byteOffset
			delete holder.byteLength
		}
	}
	return clone
}

const slice = (bin, holder) => bin.subarray(holder.byteOffset, holder.byteOffset + holder.byteLength)

/** Decoded bytes of one compressed stream, or the decoder's error. */
function decodeStream(decoder, bin, extension) {
	const out = new Uint8Array(extension.count * extension.byteStride)
	decoder.decodeGltfBuffer(
		out,
		extension.count,
		extension.byteStride,
		slice(bin, extension),
		extension.mode,
		extension.filter ?? 'NONE'
	)
	return out
}

/** What differs between two views of the same index (null when they carry the same thing). */
function viewDifference(index, [viewA, viewB], [a, b], imageViews, decoder) {
	const extA = meshoptExtension(viewA)
	const extB = meshoptExtension(viewB)
	if (Boolean(extA) !== Boolean(extB)) return `bufferView ${index}: compression changed`
	if (extA && extB) {
		const sameShape = extA.mode === extB.mode && extA.count === extB.count && extA.byteStride === extB.byteStride
		try {
			return sameShape && same(decodeStream(decoder, a.bin, extA), decodeStream(decoder, b.bin, extB))
				? null
				: `bufferView ${index}: decoded data`
		} catch (error) {
			return `bufferView ${index}: decode (${error.message})`
		}
	}
	if (viewA.buffer !== 0) return null
	const dataA = slice(a.bin, viewA)
	const dataB = slice(b.bin, viewB)
	if (same(dataA, dataB)) return null
	if (!imageViews.has(index)) return `bufferView ${index}: raw data`
	const reason = pngDifference(dataA, dataB)
	return reason ? `image bufferView ${index}: ${reason}` : null
}

/**
 * @param {Uint8Array} source original GLB
 * @param {Uint8Array} rebuilt rebuilt GLB
 * @param {{ decodeGltfBuffer: Function, ready: Promise<void> }} decoder independent meshopt decoder
 * @returns {Promise<{ compared: number, mismatches: string[] }>}
 */
export async function proveEquivalent(source, rebuilt, decoder) {
	await decoder.ready
	const a = parseGlb(source)
	const b = parseGlb(rebuilt)
	const mismatches = []
	if (JSON.stringify(normalised(a.json)) !== JSON.stringify(normalised(b.json))) mismatches.push('json')
	const viewsA = a.json.bufferViews ?? []
	const viewsB = b.json.bufferViews ?? []
	if (viewsA.length !== viewsB.length) return { compared: 1, mismatches: [...mismatches, 'bufferView count'] }
	const imageViews = new Set((a.json.images ?? []).map(image => image.bufferView))
	for (const [index, viewA] of viewsA.entries()) {
		const difference = viewDifference(index, [viewA, viewsB[index]], [a, b], imageViews, decoder)
		if (difference) mismatches.push(difference)
	}
	return { compared: 1 + viewsA.length, mismatches }
}
