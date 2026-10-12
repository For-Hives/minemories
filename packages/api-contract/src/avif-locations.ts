import { ImageReader, uint64 } from './image-reader'

export interface ItemExtent {
	offset: number
	length: number
}
export interface ItemLocation {
	method: number
	extents: ItemExtent[]
}
class Cursor {
	position: number
	constructor(
		readonly reader: ImageReader,
		start: number,
		readonly end: number
	) {
		this.position = start
	}
	async number(bytes: number): Promise<number | null> {
		if (bytes === 0) return 0
		if (bytes > 8 || this.position + bytes > this.end) return null
		const view = await this.reader.view(this.position, bytes)
		if (!view) return null
		this.position += bytes
		if (bytes === 8) return uint64(view, 0)
		let value = 0
		for (let index = 0; index < bytes; index++) value = value * 256 + view.getUint8(index)
		return Number.isSafeInteger(value) ? value : null
	}
}
interface Sizes {
	version: number
	offset: number
	length: number
	base: number
	index: number
}
async function extent(cursor: Cursor, sizes: Sizes, base: number): Promise<ItemExtent | null> {
	if (!cursor.reader.work.claimHeader()) return null
	if (sizes.version && (await cursor.number(sizes.index)) === null) return null
	const offset = await cursor.number(sizes.offset)
	const length = await cursor.number(sizes.length)
	if (offset === null || length === null || length === 0 || !Number.isSafeInteger(base + offset)) return null
	return { offset: base + offset, length }
}
async function location(cursor: Cursor, sizes: Sizes) {
	const id = await cursor.number(sizes.version < 2 ? 2 : 4)
	const method = sizes.version ? await cursor.number(2) : 0
	const reference = await cursor.number(2)
	const base = await cursor.number(sizes.base)
	const count = await cursor.number(2)
	if (id === null || method === null || base === null || count === null) return null
	if (method > 1 || reference !== 0 || count === 0 || count > 4096) return null
	const extents: ItemExtent[] = []
	for (let index = 0; index < count; index++) {
		// biome-ignore lint/performance/noAwaitInLoops: Location fields are variable-sized and consumed sequentially.
		const parsed = await extent(cursor, sizes, base)
		if (!parsed) return null
		extents.push(parsed)
	}
	return { id, location: { method, extents } }
}
export async function avifLocations(reader: ImageReader, start: number, end: number) {
	const header = await reader.view(start, 6)
	if (!header || start + 6 > end) return null
	const version = header.getUint8(0)
	if (version > 2) return null
	const sizes = {
		version,
		offset: header.getUint8(4) >> 4,
		length: header.getUint8(4) & 15,
		base: header.getUint8(5) >> 4,
		index: version ? header.getUint8(5) & 15 : 0,
	}
	const cursor = new Cursor(reader, start + 6, end)
	const count = await cursor.number(version < 2 ? 2 : 4)
	if (count === null || count > 4096) return null
	const locations = new Map<number, ItemLocation>()
	for (let index = 0; index < count; index++) {
		// biome-ignore lint/performance/noAwaitInLoops: Parse one item at a time to bound metadata memory.
		const parsed = await location(cursor, sizes)
		if (!parsed || locations.has(parsed.id)) return null
		locations.set(parsed.id, parsed.location)
	}
	return cursor.position === end ? locations : null
}
function extentAt(ends: number[], offset: number): number {
	let low = 0
	let high = ends.length
	while (low < high) {
		const middle = Math.floor((low + high) / 2)
		if ((ends[middle] as number) <= offset) low = middle + 1
		else high = middle
	}
	return low
}
export function itemReader(source: ImageReader, extents: ItemExtent[]): ImageReader | null {
	const ends: number[] = []
	let length = 0
	for (const part of extents) {
		if (part.offset > source.length || part.length > source.length - part.offset) return null
		length += part.length
		if (!Number.isSafeInteger(length) || length > source.length) return null
		ends.push(length)
	}
	return new ImageReader(
		length,
		async (offset, size) => {
			const output = new Uint8Array(size)
			let written = 0
			let index = extentAt(ends, offset)
			while (written < size) {
				const part = extents[index] as ItemExtent
				const inside = offset - (index ? (ends[index - 1] as number) : 0)
				const count = Math.min(size - written, part.length - inside)
				// biome-ignore lint/performance/noAwaitInLoops: A bounded virtual header may span several extents.
				const view = await source.view(part.offset + inside, count)
				if (!view) return null
				output.set(new Uint8Array(view.buffer, view.byteOffset, count), written)
				written += count
				offset += count
				index++
			}
			return output
		},
		source.work
	)
}
