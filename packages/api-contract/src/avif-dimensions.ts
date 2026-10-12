import { av1Dimensions } from './av1-dimensions'
import { avifLocations, type ItemExtent, type ItemLocation, itemReader } from './avif-locations'
import {
	ascii,
	type ImageCost,
	type ImageReader,
	imageCost,
	MAX_IMAGE_DECODE_BYTES,
	MAX_IMAGE_PIXELS,
	uint64,
} from './image-reader'

interface Box {
	type: string
	data: number
	end: number
}
async function boxAt(reader: ImageReader, offset: number, end: number): Promise<Box | null> {
	if (!reader.work.claimHeader()) return null
	const header = await reader.view(offset, 8)
	if (!header || offset + 8 > end) return null
	let size: number | null = header.getUint32(0)
	let bytes = 8
	if (size === 1) {
		const extended = await reader.view(offset + 8, 8)
		if (!extended) return null
		size = uint64(extended, 0)
		bytes = 16
	} else if (size === 0) size = end - offset
	if (size === null || size < bytes || size > end - offset) return null
	return { type: ascii(header, 4, 4), data: offset + bytes, end: offset + size }
}
class AvifState {
	readonly items = new Map<number, string>()
	locations: Map<number, ItemLocation> | undefined
	idat: Box | undefined
	displayPixels = 0
	brand = false
	async accept(reader: ImageReader, box: Box): Promise<boolean> {
		switch (box.type) {
			case 'ftyp':
				return await this.fileType(reader, box)
			case 'ispe':
				return await this.dimensions(reader, box)
			case 'infe':
				return await this.item(reader, box)
			case 'iloc':
				if (this.locations) return false
				this.locations = (await avifLocations(reader, box.data, box.end)) ?? undefined
				return this.locations !== undefined
			case 'idat':
				if (this.idat) return false
				this.idat = box
				return true
			case 'moov':
				return false // Animated tracks need their own sample-table budgets.
			default:
				return true
		}
	}
	private async fileType(reader: ImageReader, box: Box): Promise<boolean> {
		const length = box.end - box.data
		if (this.brand || length < 8 || length % 4 || length > 4096) return false
		const view = await reader.view(box.data, length)
		if (!view) return false
		for (let offset = 0; offset < length; offset += 4) {
			if (offset !== 4 && ascii(view, offset, 4) === 'avif') this.brand = true
		}
		return this.brand
	}
	private async dimensions(reader: ImageReader, box: Box): Promise<boolean> {
		if (box.end - box.data !== 12) return false
		const view = await reader.view(box.data, 12)
		if (view?.getUint32(0) !== 0) return false
		const cost = imageCost(view.getUint32(4), view.getUint32(8))
		if (!cost) return false
		this.displayPixels += cost.pixels
		return this.displayPixels <= MAX_IMAGE_PIXELS
	}
	private async item(reader: ImageReader, box: Box): Promise<boolean> {
		const view = await reader.view(box.data, Math.min(14, box.end - box.data))
		if (!view || view.byteLength < 12) return false
		const version = view.getUint8(0)
		if (version !== 2 && version !== 3) return false
		if (version === 3 && view.byteLength < 14) return false
		const id = version === 2 ? view.getUint16(4) : view.getUint32(4)
		const type = ascii(view, version === 2 ? 8 : 10, 4)
		if (this.items.has(id) || !['av01', 'grid', 'Exif', 'mime', 'uri '].includes(type)) return false
		this.items.set(id, type)
		return true
	}
}
async function childStart(reader: ImageReader, box: Box): Promise<number | null> {
	if (box.type === 'meta') return box.data + 4 <= box.end ? box.data + 4 : null
	if (box.type === 'iinf') {
		const view = await reader.view(box.data, 4)
		if (!view || view.getUint8(0) > 1) return null
		const start = box.data + (view.getUint8(0) === 0 ? 6 : 8)
		return start <= box.end ? start : null
	}
	return box.data
}
async function walkBoxes(
	reader: ImageReader,
	state: AvifState,
	start: number,
	end: number,
	depth = 0
): Promise<boolean> {
	if (depth > 12) return false
	let offset = start
	while (offset < end) {
		// biome-ignore lint/performance/noAwaitInLoops: Box sizes and nested containers determine the following bounded reads.
		const box = await boxAt(reader, offset, end)
		if (!(box && (await state.accept(reader, box)))) return false
		if (['meta', 'iprp', 'ipco', 'iinf'].includes(box.type)) {
			const child = await childStart(reader, box)
			if (child === null || !(await walkBoxes(reader, state, child, box.end, depth + 1))) return false
		}
		offset = box.end
	}
	return true
}
async function obuSize(reader: ImageReader, offset: number) {
	let value = 0
	for (let index = 0; index < 8; index++) {
		// biome-ignore lint/performance/noAwaitInLoops: LEB128 is bounded to eight bytes and read sequentially.
		const byte = await reader.view(offset + index, 1)
		if (!byte) return null
		const current = byte.getUint8(0)
		value += (current & 127) * 2 ** (index * 7)
		if (!Number.isSafeInteger(value)) return null
		if (!(current & 128)) return { value, end: offset + index + 1 }
	}
	return null
}
async function obuAt(reader: ImageReader, offset: number) {
	if (!reader.work.claimHeader()) return null
	const view = await reader.view(offset, 1)
	if (!view) return null
	const header = view.getUint8(0)
	if (header & 129 || !(header & 2)) return null
	const extension = header & 4 ? 1 : 0
	if (extension) {
		const extended = await reader.view(offset + 1, 1)
		if (!extended || extended.getUint8(0) & 7) return null
	}
	const size = await obuSize(reader, offset + 1 + extension)
	if (!size || size.value > reader.length - size.end) return null
	return { type: (header >> 3) & 15, data: size.end, end: size.end + size.value, length: size.value }
}
class CodedState {
	sequence: ImageCost | null = null
	frames = 0
	async accept(reader: ImageReader, obu: { type: number; data: number; length: number }): Promise<boolean> {
		if (obu.type === 1) {
			if (this.sequence || obu.length > 2048) return false
			const view = await reader.view(obu.data, obu.length)
			this.sequence = view ? av1Dimensions(view) : null
			return this.sequence !== null
		}
		if (obu.type === 3 || obu.type === 6) this.frames++
		return true
	}
	finish(): ImageCost | null {
		if (!(this.sequence && this.frames) || this.sequence.pixels * this.frames > MAX_IMAGE_PIXELS) return null
		return { pixels: this.sequence.pixels * this.frames, bytes: this.sequence.bytes * this.frames }
	}
}
async function codedCost(reader: ImageReader): Promise<ImageCost | null> {
	let offset = 0
	const state = new CodedState()
	while (offset < reader.length) {
		// biome-ignore lint/performance/noAwaitInLoops: Skip coded OBUs and inspect only sequence maxima and frame counts.
		const obu = await obuAt(reader, offset)
		if (!(obu && (await state.accept(reader, obu)))) return null
		offset = obu.end
	}
	return state.finish()
}
async function gridCost(reader: ImageReader): Promise<(ImageCost & { cells: number }) | null> {
	const view = await reader.view(0, Math.min(12, reader.length))
	if (!view || view.byteLength < 8 || view.getUint8(0) !== 0 || view.getUint8(1) > 1) return null
	const wide = view.getUint8(1) & 1
	if (wide && view.byteLength !== 12) return null
	const cost = wide ? imageCost(view.getUint32(4), view.getUint32(8)) : imageCost(view.getUint16(4), view.getUint16(6))
	return cost ? { ...cost, cells: (view.getUint8(2) + 1) * (view.getUint8(3) + 1) } : null
}
function extentsFor(state: AvifState, location: ItemLocation): ItemExtent[] | null {
	if (location.method === 0) return location.extents
	if (!state.idat) return null
	const extents: ItemExtent[] = []
	for (const part of location.extents) {
		if (part.offset + part.length > state.idat.end - state.idat.data) return null
		extents.push({ offset: state.idat.data + part.offset, length: part.length })
	}
	return extents
}
export async function avifCost(reader: ImageReader): Promise<ImageCost | null> {
	const state = new AvifState()
	if (!(await walkBoxes(reader, state, 0, reader.length))) return null
	if (!(state.brand && state.displayPixels && state.locations)) return null
	return await avifItemsCost(reader, state)
}
class ItemBudget {
	private encoded = 0
	private codedPixels = 0
	private gridPixels = 0
	private gridCells = 0
	claimEncoded(length: number): boolean {
		this.encoded += length
		return this.encoded <= MAX_IMAGE_DECODE_BYTES
	}
	add(cost: ImageCost & { cells?: number }): boolean {
		if (cost.cells !== undefined) {
			this.gridPixels += cost.pixels
			this.gridCells += cost.cells
		} else this.codedPixels += cost.pixels
		return this.pixels <= MAX_IMAGE_PIXELS
	}
	get pixels(): number {
		// Count all coded/alpha items for every cell: auxiliary alpha may be reused
		// by several tiles. This conservative budget avoids trusting dimg/auxl aliases.
		return this.codedPixels * Math.max(1, this.gridCells) + this.gridPixels
	}
}
async function avifItemsCost(reader: ImageReader, state: AvifState): Promise<ImageCost | null> {
	const budget = new ItemBudget()
	const coded = Array.from(state.items.values()).includes('av01')
	for (const [id, type] of state.items) {
		if (type !== 'av01' && type !== 'grid') continue
		const item = avifItem(reader, state, id)
		if (!(item && budget.claimEncoded(item.length))) return null
		// biome-ignore lint/performance/noAwaitInLoops: Validate every coded image/alpha/tile without keeping decoded images.
		const cost = type === 'av01' ? await codedCost(item) : await gridCost(item)
		if (!(cost && budget.add(cost))) return null
	}
	const pixels = budget.pixels
	return coded
		? { pixels: Math.max(pixels, state.displayPixels), bytes: Math.max(pixels, state.displayPixels) * 8 }
		: null
}
function avifItem(reader: ImageReader, state: AvifState, id: number): ImageReader | null {
	const location = state.locations?.get(id)
	const extents = location && extentsFor(state, location)
	return extents ? itemReader(reader, extents) : null
}
