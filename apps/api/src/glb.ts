/** Checks the GLB container before persisting an untrusted upload. */
export function isGlbContainer(contents: Buffer): boolean {
	if (contents.length < 20 || contents.length % 4 !== 0) return false
	if (
		contents.toString('ascii', 0, 4) !== 'glTF' ||
		contents.readUInt32LE(4) !== 2 ||
		contents.readUInt32LE(8) !== contents.length
	) {
		return false
	}

	const jsonLength = contents.readUInt32LE(12)
	if (
		contents.readUInt32LE(16) !== 0x4e4f534a ||
		jsonLength === 0 ||
		jsonLength % 4 !== 0 ||
		jsonLength > contents.length - 20
	) {
		return false
	}

	try {
		const document: unknown = JSON.parse(contents.toString('utf8', 20, 20 + jsonLength))
		if (
			typeof document !== 'object' ||
			document === null ||
			!('asset' in document) ||
			typeof document.asset !== 'object' ||
			document.asset === null ||
			!('version' in document.asset) ||
			document.asset.version !== '2.0'
		) {
			return false
		}
	} catch {
		return false
	}

	let offset = 20 + jsonLength
	while (offset < contents.length) {
		if (contents.length - offset < 8) return false
		const chunkLength = contents.readUInt32LE(offset)
		if (chunkLength % 4 !== 0 || chunkLength > contents.length - offset - 8) return false
		offset += 8 + chunkLength
	}
	return offset === contents.length
}
