const PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff
	for (const byte of bytes) {
		crc ^= byte
		for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
	}
	return (crc ^ 0xffffffff) >>> 0
}

export function largeThumbnail(): string {
	const png = Buffer.from(PIXEL_PNG, 'base64')
	const text = Buffer.alloc(71_982 - png.length - 12, 0x41)
	text.write('fixture\0', 0, 'ascii')
	const chunk = Buffer.alloc(text.length + 12)
	chunk.writeUInt32BE(text.length, 0)
	chunk.write('tEXt', 4, 'ascii')
	text.copy(chunk, 8)
	chunk.writeUInt32BE(crc32(chunk.subarray(4, chunk.length - 4)), chunk.length - 4)
	const bytes = Buffer.concat([png.subarray(0, png.length - 12), chunk, png.subarray(png.length - 12)])
	return `data:image/png;base64,${bytes.toString('base64')}`
}
