import {
	type ImageCost,
	type ImageReader,
	imageCost,
	MAX_IMAGE_DECODE_BYTES,
	MAX_IMAGE_DIMENSION,
	uint64,
} from './image-reader'

const signature = [171, 75, 84, 88, 32, 50, 48, 187, 13, 10, 26, 10]
function metadataRange(offset: number, length: number, start: number, end: number): boolean {
	return length === 0 || (offset >= start && offset <= end && length <= end - offset)
}
function headerCost(header: DataView) {
	const width = header.getUint32(20, true)
	const height = Math.max(1, header.getUint32(24, true))
	const depth = Math.max(1, header.getUint32(28, true))
	const layers = Math.max(1, header.getUint32(32, true))
	if (depth > MAX_IMAGE_DIMENSION || layers > 1024) return null
	const faces = header.getUint32(36, true)
	if (faces !== 1 && faces !== 6) return null
	if (faces === 6 && width !== height) return null
	const cost = imageCost(width, height, depth * layers * faces)
	if (!cost) return null
	const levels = Math.max(1, header.getUint32(40, true))
	if (levels > Math.floor(Math.log2(Math.max(width, height, depth))) + 1) return null
	const scheme = header.getUint32(44, true)
	return scheme <= 3 ? { cost, levels, scheme } : null
}
function levelBytes(view: DataView, start: number, end: number, scheme: number): number | null {
	const offset = uint64(view, 0, true)
	const bytes = uint64(view, 8, true)
	const raw = uint64(view, 16, true)
	if (offset === null || bytes === null || raw === null || bytes === 0) return null
	if (!metadataRange(offset, bytes, start, end)) return null
	if ((scheme === 0 && bytes !== raw) || (scheme === 1 && raw !== 0) || (scheme >= 2 && raw === 0)) return null
	return raw
}
async function decodedLevels(reader: ImageReader, levels: number, scheme: number): Promise<number | null> {
	let decoded = 0
	for (let index = 0; index < levels; index++) {
		// biome-ignore lint/performance/noAwaitInLoops: Only fixed-size level indices are read, never supercompressed pixels.
		const level = await reader.view(80 + index * 24, 24)
		if (!level) return null
		const bytes = levelBytes(level, 80 + levels * 24, reader.length, scheme)
		if (bytes === null) return null
		decoded += bytes
		if (decoded > MAX_IMAGE_DECODE_BYTES) return null
	}
	return decoded
}
export async function ktxCost(reader: ImageReader): Promise<ImageCost | null> {
	const header = await reader.view(0, 80)
	if (!(header && signature.every((byte, index) => header.getUint8(index) === byte))) return null
	const parsed = headerCost(header)
	if (!(parsed && validMetadata(header, 80 + parsed.levels * 24, reader.length))) return null
	const bytes = await decodedLevels(reader, parsed.levels, parsed.scheme)
	return bytes === null ? null : { pixels: parsed.cost.pixels, bytes: Math.max(parsed.cost.bytes, bytes) }
}
function validMetadata(header: DataView, start: number, end: number): boolean {
	if (header.getUint32(52, true) < 24) return false
	if (!metadataRange(header.getUint32(48, true), header.getUint32(52, true), start, end)) return false
	if (!metadataRange(header.getUint32(56, true), header.getUint32(60, true), start, end)) return false
	const offset = uint64(header, 64, true)
	const length = uint64(header, 72, true)
	return offset !== null && length !== null && metadataRange(offset, length, start, end)
}
