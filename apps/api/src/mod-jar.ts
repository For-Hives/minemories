import { open } from 'node:fs/promises'

export type JarVerdict = 'ok' | 'not_zip' | 'no_classes'

const LOCAL_HEADER = 0x04034b50
const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_ENTRY = 0x02014b50
const EOCD_MIN = 22
const EOCD_SEARCH = 0xffff + EOCD_MIN
const ENTRY_MIN = 46
const ZIP64 = 0xffffffff

/**
 * Contrôle un JAR reçu sans le charger en entier : signature `PK\x03\x04`, répertoire central lisible (sans
 * zip64, inutile pour un mod de quelques Mio) et au moins une entrée `.class`. Refuse un JAR vide ou tronqué.
 */
export async function inspectJar(path: string): Promise<JarVerdict> {
	const handle = await open(path, 'r')
	try {
		const { size } = await handle.stat()
		const head = Buffer.alloc(4)
		const read = await handle.read(head, 0, 4, 0)
		if (read.bytesRead < 4 || head.readUInt32LE(0) !== LOCAL_HEADER) return 'not_zip'
		const tailLength = Math.min(size, EOCD_SEARCH)
		const tail = Buffer.alloc(tailLength)
		await handle.read(tail, 0, tailLength, size - tailLength)
		const eocd = lastEndRecord(tail)
		if (eocd < 0) return 'not_zip'
		const entries = tail.readUInt16LE(eocd + 10)
		const directorySize = tail.readUInt32LE(eocd + 12)
		const directoryOffset = tail.readUInt32LE(eocd + 16)
		if (entries === 0xffff || directorySize === ZIP64 || directoryOffset === ZIP64) return 'not_zip'
		if (directoryOffset + directorySize > size) return 'not_zip'
		const directory = Buffer.alloc(directorySize)
		await handle.read(directory, 0, directorySize, directoryOffset)
		return hasClassEntry(directory) ? 'ok' : 'no_classes'
	} finally {
		await handle.close()
	}
}

function lastEndRecord(tail: Buffer): number {
	for (let position = tail.length - EOCD_MIN; position >= 0; position -= 1)
		if (tail.readUInt32LE(position) === END_OF_CENTRAL_DIRECTORY) return position
	return -1
}

function hasClassEntry(directory: Buffer): boolean {
	let position = 0
	while (position + ENTRY_MIN <= directory.length && directory.readUInt32LE(position) === CENTRAL_ENTRY) {
		const nameLength = directory.readUInt16LE(position + 28)
		const extraLength = directory.readUInt16LE(position + 30)
		const commentLength = directory.readUInt16LE(position + 32)
		const name = directory.toString('utf8', position + ENTRY_MIN, position + ENTRY_MIN + nameLength)
		if (name.endsWith('.class')) return true
		position += ENTRY_MIN + nameLength + extraLength + commentLength
	}
	return false
}
