export function isoBox(type: string, body: Buffer): Buffer {
	const result = Buffer.alloc(8 + body.length)
	result.writeUInt32BE(result.length)
	result.write(type, 4, 'ascii')
	body.copy(result, 8)
	return result
}
class Writer {
	readonly bits: number[] = []
	value(value: number, count: number) {
		for (let index = count - 1; index >= 0; index--) this.bits.push((value >>> index) & 1)
		return this
	}
	bytes(): Buffer {
		const bytes = Buffer.alloc(Math.ceil(this.bits.length / 8))
		for (let index = 0; index < this.bits.length; index++) {
			const position = Math.floor(index / 8)
			bytes[position] = (bytes[position] as number) | ((this.bits[index] as number) << (7 - (index % 8)))
		}
		return bytes
	}
}
function fullTiming(writer: Writer, longUvlc: boolean) {
	writer.value(1, 1).value(1, 32).value(60, 32).value(1, 1)
	if (longUvlc) writer.value(0, 32)
	else writer.value(2, 3)
	writer.value(1, 1).value(4, 5).value(1, 32).value(31, 5).value(31, 5)
	writer.value(1, 1).value(1, 5)
	for (let index = 0; index < 2; index++)
		writer.value(0, 12).value(8, 5).value(0, 1).value(1, 1).value(2, 5).value(2, 5).value(0, 1).value(1, 1).value(3, 4)
}
// Synthetic dimension prefixes, not complete decodable AV1 sequence headers.
export function sequenceHeader(width = 16, height = 16, reduced = true, longUvlc = false): Buffer {
	const writer = new Writer()
		.value(0, 3)
		.value(1, 1)
		.value(reduced ? 1 : 0, 1)
	if (reduced) writer.value(0, 5)
	else fullTiming(writer, longUvlc)
	const widthBits = Math.max(1, Math.ceil(Math.log2(width)))
	const heightBits = Math.max(1, Math.ceil(Math.log2(height)))
	writer
		.value(widthBits - 1, 4)
		.value(heightBits - 1, 4)
		.value(width - 1, widthBits)
		.value(height - 1, heightBits)
	return writer.bytes()
}
export function obu(type: number, payload: Buffer): Buffer {
	if (payload.length > 127) throw new Error('Fixture only supports short OBU payloads')
	return Buffer.concat([Buffer.from([(type << 3) | 2, payload.length]), payload])
}
interface Grid {
	rows: number
	columns: number
	width: number
	height: number
	wide?: boolean
}
export function avifFixture(width = 16, height = 16, idat = false, payload?: Buffer, grid?: Grid): Buffer {
	const coded = payload ?? Buffer.concat([obu(1, sequenceHeader(width, height)), obu(6, Buffer.from([0]))])
	const brand = isoBox('ftyp', Buffer.from('avif\0\0\0\0avif'))
	const properties = Buffer.alloc(12)
	properties.writeUInt32BE(16, 4)
	properties.writeUInt32BE(16, 8)
	const parts = [{ type: 'av01', bytes: coded }]
	if (grid) parts.push({ type: 'grid', bytes: gridBytes(grid) })
	const items = parts.map((part, index) => {
		const item = Buffer.alloc(13)
		item[0] = 2
		item.writeUInt16BE(index + 1, 4)
		item.write(part.type, 8, 'ascii')
		return isoBox('infe', item)
	})
	const info = Buffer.alloc(6)
	info.writeUInt16BE(parts.length, 4)
	const entryBytes = idat ? 16 : 14
	const location = Buffer.alloc(8 + parts.length * entryBytes)
	location[0] = idat ? 1 : 0
	location[4] = 0x44
	location.writeUInt16BE(parts.length, 6)
	const data = Buffer.concat(parts.map(part => part.bytes))
	const locate = (start: number) => {
		let offset = start
		for (const [index, part] of parts.entries()) {
			const entry = 8 + index * entryBytes
			location.writeUInt16BE(index + 1, entry)
			if (idat) location.writeUInt16BE(1, entry + 2)
			location.writeUInt16BE(1, entry + entryBytes - 10)
			location.writeUInt32BE(offset, entry + entryBytes - 8)
			location.writeUInt32BE(part.bytes.length, entry + entryBytes - 4)
			offset += part.bytes.length
		}
	}
	locate(0)
	const makeMeta = () =>
		isoBox(
			'meta',
			Buffer.concat([
				Buffer.alloc(4),
				isoBox('iinf', Buffer.concat([info, ...items])),
				isoBox('iloc', location),
				isoBox('iprp', isoBox('ipco', isoBox('ispe', properties))),
				...(idat ? [isoBox('idat', data)] : []),
			])
		)
	const meta = makeMeta()
	if (!idat) locate(brand.length + meta.length + 8)
	return Buffer.concat([brand, makeMeta(), ...(idat ? [] : [isoBox('mdat', data)])])
}
function gridBytes(grid: Grid): Buffer {
	const bytes = Buffer.alloc(grid.wide ? 12 : 8)
	bytes[1] = grid.wide ? 1 : 0
	bytes[2] = grid.rows - 1
	bytes[3] = grid.columns - 1
	if (grid.wide) {
		bytes.writeUInt32BE(grid.width, 4)
		bytes.writeUInt32BE(grid.height, 8)
	} else {
		bytes.writeUInt16BE(grid.width, 4)
		bytes.writeUInt16BE(grid.height, 6)
	}
	return bytes
}
