import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024
export const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024

/** Validate the container without loading the BIN payload into memory. */
export async function validateUploadFile(path: string, size: number, sha256: string): Promise<boolean> {
	const file = await open(path, 'r')
	try {
		if ((await file.stat()).size !== size || size < 20 || size % 4 !== 0) return false
		const header = Buffer.alloc(20)
		await file.read(header, 0, 20, 0)
		if (header.toString('ascii', 0, 4) !== 'glTF' || header.readUInt32LE(4) !== 2 || header.readUInt32LE(8) !== size)
			return false
		const jsonSize = header.readUInt32LE(12)
		if (
			header.readUInt32LE(16) !== 0x4e4f534a ||
			jsonSize === 0 ||
			jsonSize % 4 !== 0 ||
			jsonSize > UPLOAD_CHUNK_BYTES ||
			jsonSize > size - 20
		)
			return false
		const json = Buffer.alloc(jsonSize)
		await file.read(json, 0, jsonSize, 20)
		if (!validDocument(json)) return false
		if (!(await validChunks(file, 20 + jsonSize, size))) return false
		const hash = createHash('sha256')
		for await (const chunk of createReadStream(path)) hash.update(chunk)
		return hash.digest('hex') === sha256
	} finally {
		await file.close()
	}
}
function validDocument(json: Buffer) {
	try {
		const document: unknown = JSON.parse(json.toString('utf8'))
		return (
			typeof document === 'object' &&
			document !== null &&
			'asset' in document &&
			typeof document.asset === 'object' &&
			document.asset !== null &&
			'version' in document.asset &&
			document.asset.version === '2.0'
		)
	} catch {
		return false
	}
}

/** Abort immediately at the chunk limit, even without a Content-Length header. */
export async function readUploadChunk(request: Request): Promise<Buffer | null> {
	if (!request.body) return null
	const reader = request.body.getReader()
	const chunks: Uint8Array[] = []
	let size = 0
	try {
		while (true) {
			// biome-ignore lint/performance/noAwaitInLoops: consuming the stream sequentially enforces the memory bound.
			const { value, done } = await reader.read()
			if (done) break
			size += value.length
			if (size > UPLOAD_CHUNK_BYTES) {
				await reader.cancel()
				return null
			}
			chunks.push(value)
		}
		return size > 0 ? Buffer.concat(chunks, size) : null
	} finally {
		reader.releaseLock()
	}
}

async function validChunks(file: import('node:fs/promises').FileHandle, initialOffset: number, size: number) {
	let offset = initialOffset
	let chunks = 0
	while (offset < size) {
		if (++chunks > 64 || size - offset < 8) return false
		const chunk = Buffer.alloc(8)
		// biome-ignore lint/performance/noAwaitInLoops: each GLB chunk header determines the next offset.
		await file.read(chunk, 0, 8, offset)
		const length = chunk.readUInt32LE(0)
		if (length % 4 !== 0 || length > size - offset - 8) return false
		offset += length + 8
	}
	return true
}
