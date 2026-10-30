// Minimal GLB container reader / writer: a JSON chunk and one BIN chunk, nothing else.
const MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

const padded = length => (length + 3) & ~3

/** @param {Uint8Array} bytes */
export function parseGlb(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	if (bytes.length < 20 || view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== 2)
		throw new Error('not a GLB 2.0')
	if (view.getUint32(8, true) !== bytes.length) throw new Error('GLB length field does not match the file')
	const jsonLength = view.getUint32(12, true)
	if (view.getUint32(16, true) !== JSON_CHUNK) throw new Error('first GLB chunk is not JSON')
	const jsonEnd = 20 + jsonLength
	const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, jsonEnd)))
	let bin = new Uint8Array(0)
	if (jsonEnd < bytes.length) {
		const binLength = view.getUint32(jsonEnd, true)
		if (view.getUint32(jsonEnd + 4, true) !== BIN_CHUNK) throw new Error('second GLB chunk is not BIN')
		if (jsonEnd + 8 + binLength !== bytes.length) throw new Error('unexpected data after the BIN chunk')
		bin = bytes.subarray(jsonEnd + 8, jsonEnd + 8 + binLength)
	}
	return { json, bin }
}

/**
 * @param {object} json
 * @param {Uint8Array} bin
 */
export function buildGlb(json, bin) {
	const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
	const jsonLength = padded(jsonBytes.length)
	const binLength = padded(bin.length)
	const out = new Uint8Array(12 + 8 + jsonLength + 8 + binLength)
	const view = new DataView(out.buffer)
	view.setUint32(0, MAGIC, true)
	view.setUint32(4, 2, true)
	view.setUint32(8, out.length, true)
	view.setUint32(12, jsonLength, true)
	view.setUint32(16, JSON_CHUNK, true)
	out.fill(0x20, 20, 20 + jsonLength)
	out.set(jsonBytes, 20)
	const binAt = 20 + jsonLength
	view.setUint32(binAt, binLength, true)
	view.setUint32(binAt + 4, BIN_CHUNK, true)
	out.set(bin, binAt + 8)
	return out
}

/** The extension object that describes a meshopt-compressed buffer view, under either name, or undefined. */
export function meshoptExtension(view) {
	return view.extensions?.EXT_meshopt_compression ?? view.extensions?.KHR_meshopt_compression
}
