export type ImageRead = (offset: number, length: number) => Promise<Uint8Array | null>
export const MAX_IMAGE_DIMENSION = 16384
export const MAX_IMAGE_PIXELS = 16 * 1024 * 1024
export const MAX_TEXTURE_PIXELS = 64 * 1024 * 1024
export const MAX_IMAGE_DECODE_BYTES = 128 * 1024 * 1024
export const MAX_TEXTURE_DECODE_BYTES = 512 * 1024 * 1024
export const MAX_IMAGE_HEADER_BYTES = 8 * 1024 * 1024
export const MAX_IMAGE_HEADERS = 16384

export interface ImageCost {
	pixels: number
	bytes: number
}
export function imageCost(width: number, height: number, copies = 1): ImageCost | null {
	if (!(width > 0 && height > 0 && width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION && copies > 0))
		return null
	const pixels = width * height * copies
	return pixels <= MAX_IMAGE_PIXELS ? { pixels, bytes: pixels * 8 } : null
}
export class ImageWork {
	bytes = 0
	headers = 0
	claimBytes(bytes: number): boolean {
		this.bytes += bytes
		return this.bytes <= MAX_IMAGE_HEADER_BYTES
	}
	claimHeader(): boolean {
		return ++this.headers <= MAX_IMAGE_HEADERS
	}
}
export class ImageReader {
	private cached: Uint8Array = new Uint8Array(0)
	private start = 0
	constructor(
		readonly length: number,
		readonly read: ImageRead,
		readonly work: ImageWork
	) {}
	async view(offset: number, length: number): Promise<DataView | null> {
		if (offset < 0 || length < 1 || length > 4096 || offset + length > this.length) return null
		if (offset < this.start || offset + length > this.start + this.cached.length) {
			const size = Math.min(Math.max(length, 4096), this.length - offset)
			const before = this.work.bytes
			if (!this.work.claimBytes(size)) return null
			if (Math.floor(before / 262144) !== Math.floor(this.work.bytes / 262144)) {
				await new Promise<void>(resolve => setTimeout(resolve, 0))
			}
			const bytes = await this.read(offset, size)
			if (bytes?.byteLength !== size) return null
			this.cached = bytes
			this.start = offset
		}
		return new DataView(this.cached.buffer, this.cached.byteOffset + offset - this.start, length)
	}
}
export function ascii(view: DataView, offset: number, length: number): string {
	let result = ''
	for (let index = 0; index < length; index++) result += String.fromCharCode(view.getUint8(offset + index))
	return result
}
export function uint24(view: DataView, offset: number): number {
	return view.getUint8(offset) + view.getUint8(offset + 1) * 256 + view.getUint8(offset + 2) * 65536
}
export function uint64(view: DataView, offset: number, littleEndian = false): number | null {
	const value = view.getBigUint64(offset, littleEndian)
	return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null
}

export interface ImageChunk {
	type: string
	length: number
	data: number
	end: number
}
export async function* imageChunks(reader: ImageReader, start: number, end: number, png = false) {
	let offset = start
	while (offset < end) {
		if (!reader.work.claimHeader()) {
			yield null
			return
		}
		// biome-ignore lint/performance/noAwaitInLoops: Chunk headers are dependent and cached in bounded windows.
		const view = await reader.view(offset, 8)
		if (!view) {
			yield null
			return
		}
		const length = view.getUint32(png ? 0 : 4, !png)
		const extra = png ? 4 : length % 2
		const next = offset + 8 + length + extra
		if (next > end) {
			yield null
			return
		}
		yield { type: ascii(view, png ? 4 : 0, 4), length, data: offset + 8, end: next }
		offset = next
	}
}
