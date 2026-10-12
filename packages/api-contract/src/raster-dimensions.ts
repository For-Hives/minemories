import {
	ascii,
	type ImageChunk,
	type ImageCost,
	type ImageReader,
	imageChunks,
	imageCost,
	uint24,
} from './image-reader'

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10]
const jpegFrames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
const pngDepths = new Map([
	[0, [1, 2, 4, 8, 16]],
	[2, [8, 16]],
	[3, [1, 2, 4, 8]],
	[4, [8, 16]],
	[6, [8, 16]],
])

class PngState {
	frames = 0
	frameHeaders = 0
	data = false
	constructor(
		readonly width: number,
		readonly height: number
	) {}
	async accept(reader: ImageReader, chunk: ImageChunk): Promise<boolean> {
		switch (chunk.type) {
			case 'IHDR':
				return false
			case 'acTL':
				return await this.animation(reader, chunk)
			case 'fcTL':
				return await this.frame(reader, chunk)
			case 'IDAT':
				this.data = true
				return true
			default:
				return true
		}
	}
	private async animation(reader: ImageReader, chunk: ImageChunk): Promise<boolean> {
		if (chunk.length !== 8 || this.frames || this.data) return false
		const view = await reader.view(chunk.data, 8)
		if (!view) return false
		this.frames = view.getUint32(0)
		return this.frames > 0 && imageCost(this.width, this.height, this.frames + 1) !== null
	}
	private async frame(reader: ImageReader, chunk: ImageChunk): Promise<boolean> {
		if (!this.frames || chunk.length !== 26) return false
		const view = await reader.view(chunk.data, 26)
		if (!view) return false
		const width = view.getUint32(4)
		const height = view.getUint32(8)
		this.frameHeaders++
		return (
			width > 0 && height > 0 && width + view.getUint32(12) <= this.width && height + view.getUint32(16) <= this.height
		)
	}
	finish(): ImageCost | null {
		return this.data && this.frames === this.frameHeaders
			? imageCost(this.width, this.height, this.frames ? this.frames + 1 : 1)
			: null
	}
}
export async function pngCost(reader: ImageReader): Promise<ImageCost | null> {
	const header = await reader.view(0, 33)
	if (!(header && pngSignature.every((byte, index) => header.getUint8(index) === byte))) return null
	if (header.getUint32(8) !== 13 || ascii(header, 12, 4) !== 'IHDR' || !validPngFormat(header)) return null
	const state = new PngState(header.getUint32(16), header.getUint32(20))
	if (!imageCost(state.width, state.height)) return null
	for await (const chunk of imageChunks(reader, 33, reader.length, true)) {
		if (!(chunk && (await state.accept(reader, chunk)))) return null
		if (chunk.type === 'IEND') return chunk.length === 0 && chunk.end === reader.length ? state.finish() : null
	}
	return null
}
function validPngFormat(header: DataView): boolean {
	return (
		(pngDepths.get(header.getUint8(25))?.includes(header.getUint8(24)) ?? false) &&
		header.getUint8(26) === 0 &&
		header.getUint8(27) === 0 &&
		header.getUint8(28) <= 1
	)
}

async function jpegSegment(reader: ImageReader, offset: number) {
	if (!reader.work.claimHeader()) return null
	const marker = await reader.view(offset, 2)
	if (marker?.getUint8(0) !== 0xff) return null
	const type = marker.getUint8(1)
	if (type === 0xff) return { type, length: 0, data: offset, end: offset + 1 }
	if (type === 0x01) return { type, length: 0, data: offset, end: offset + 2 }
	if (type === 0 || type === 0xd8 || (type >= 0xd0 && type <= 0xd9)) return null
	const lengthView = await reader.view(offset + 2, 2)
	if (!lengthView) return null
	const length = lengthView.getUint16(0)
	if (length < 2 || offset + 2 + length > reader.length) return null
	return { type, length, data: offset + 4, end: offset + 2 + length }
}
async function jpegFrame(reader: ImageReader, offset: number, length: number): Promise<ImageCost | null> {
	if (length < 11) return null
	const frame = await reader.view(offset, 6)
	if (!frame || length !== 8 + frame.getUint8(5) * 3 || frame.getUint8(5) > 4) return null
	if (![8, 12, 16].includes(frame.getUint8(0))) return null
	return imageCost(frame.getUint16(3), frame.getUint16(1))
}
export async function jpegCost(reader: ImageReader): Promise<ImageCost | null> {
	if ((await reader.view(0, 2))?.getUint16(0) !== 0xffd8) return null
	let offset = 2
	let cost: ImageCost | null = null
	while (offset < reader.length) {
		// biome-ignore lint/performance/noAwaitInLoops: Skip dependent JPEG marker payloads without reading entropy-coded pixels.
		const segment = await jpegSegment(reader, offset)
		if (!segment) return null
		if (jpegFrames.has(segment.type)) {
			if (cost) return null
			cost = await jpegFrame(reader, segment.data, segment.length)
			if (!cost) return null
		}
		if (segment.type === 0xda) return cost
		offset = segment.end
	}
	return null
}

function webpFrame(view: DataView, type: string): { width: number; height: number } | null {
	if (type === 'VP8 ') {
		if (view.byteLength < 10 || view.getUint8(0) & 1 || ascii(view, 3, 3) !== '\x9d\x01\x2a') return null
		return { width: view.getUint16(6, true) & 16383, height: view.getUint16(8, true) & 16383 }
	}
	if (view.byteLength < 5 || view.getUint8(0) !== 0x2f) return null
	const word = view.getUint32(1, true)
	if (word >>> 29) return null
	return { width: (word & 16383) + 1, height: ((word >>> 14) & 16383) + 1 }
}
async function webpPayload(reader: ImageReader, start: number, end: number) {
	let frame: { width: number; height: number } | null = null
	for await (const chunk of imageChunks(reader, start, end)) {
		if (!chunk) return null
		if (chunk.type !== 'VP8 ' && chunk.type !== 'VP8L') continue
		if (frame) return null
		const payload = await reader.view(chunk.data, Math.min(chunk.length, 10))
		if (!payload) return null
		frame = webpFrame(payload, chunk.type)
		if (!(frame && imageCost(frame.width, frame.height))) return null
	}
	return frame
}
export async function webpCost(reader: ImageReader): Promise<ImageCost | null> {
	const header = await reader.view(0, 12)
	if (!header || ascii(header, 0, 4) !== 'RIFF' || ascii(header, 8, 4) !== 'WEBP') return null
	if (header.getUint32(4, true) + 8 !== reader.length) return null
	const first = await reader.view(12, Math.min(18, reader.length - 12))
	if (!first || first.byteLength < 8) return null
	if (ascii(first, 0, 4) !== 'VP8X') {
		const frame = await webpPayload(reader, 12, reader.length)
		return frame ? imageCost(frame.width, frame.height) : null
	}
	if (first.byteLength < 18 || first.getUint32(4, true) !== 10 || first.getUint32(8, true) & 0xffffffc1) return null
	const width = uint24(first, 12) + 1
	const height = uint24(first, 15) + 1
	if (!imageCost(width, height)) return null
	if (!(first.getUint8(8) & 2)) {
		const frame = await webpPayload(reader, 30, reader.length)
		return frame?.width === width && frame.height === height ? imageCost(width, height) : null
	}
	return await animatedWebp(reader, width, height)
}
class WebpAnimation {
	frames = 0
	animation = false
	constructor(
		readonly width: number,
		readonly height: number
	) {}
	async accept(reader: ImageReader, chunk: ImageChunk): Promise<boolean> {
		if (chunk.type === 'ANIM') {
			if (this.animation || chunk.length !== 6) return false
			this.animation = true
		}
		if (chunk.type === 'ANMF') {
			if (!this.animation || chunk.length < 24) return false
			if (!(await validWebpAnimationFrame(reader, chunk.data, chunk.end - (chunk.length % 2), this.width, this.height)))
				return false
			this.frames++
			return imageCost(this.width, this.height, this.frames + 1) !== null
		}
		return chunk.type !== 'VP8 ' && chunk.type !== 'VP8L'
	}
}
async function animatedWebp(reader: ImageReader, width: number, height: number): Promise<ImageCost | null> {
	const state = new WebpAnimation(width, height)
	for await (const chunk of imageChunks(reader, 30, reader.length)) {
		if (!(chunk && (await state.accept(reader, chunk)))) return null
	}
	return state.frames ? imageCost(width, height, state.frames + 1) : null
}
async function validWebpAnimationFrame(reader: ImageReader, start: number, end: number, width: number, height: number) {
	const view = await reader.view(start, 16)
	if (!view || view.getUint8(15) & 252) return false
	const frameWidth = uint24(view, 6) + 1
	const frameHeight = uint24(view, 9) + 1
	if (uint24(view, 0) * 2 + frameWidth > width || uint24(view, 3) * 2 + frameHeight > height) return false
	const frame = await webpPayload(reader, start + 16, end)
	return frame?.width === frameWidth && frame.height === frameHeight
}
