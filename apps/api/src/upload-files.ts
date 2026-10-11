import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'
import { glbChunk, glbJsonLength, validEmbeddedGltfValues } from '@minemories/api-contract/glb'

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024
export const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024

/** Validate container and accessor values without loading the BIN payload into memory. */
export async function validateUploadFile(path: string, size: number, sha256: string): Promise<boolean> {
	const file = await open(path, 'r')
	try {
		if ((await file.stat()).size !== size || size < 20 || size % 4 !== 0) return false
		const header = Buffer.alloc(20)
		await file.read(header, 0, 20, 0)
		const jsonSize = glbJsonLength(header, size)
		if (jsonSize === null) return false
		const json = Buffer.alloc(jsonSize)
		await file.read(json, 0, jsonSize, 20)
		const binary = await validChunks(file, 20 + jsonSize, size)
		if (binary === false) return false
		const valid = await validEmbeddedGltfValues(json, binary.length, async (_buffer, offset, length) => {
			const bytes = Buffer.alloc(length)
			const { bytesRead } = await file.read(bytes, 0, length, binary.offset + offset)
			return bytesRead === length ? bytes : null
		})
		if (!valid) return false
		const hash = createHash('sha256')
		for await (const chunk of createReadStream(path)) hash.update(chunk)
		return hash.digest('hex') === sha256
	} finally {
		await file.close()
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
	let binaryLength: number | null = null
	let binaryOffset = 0
	while (offset < size) {
		if (size - offset < 8) return false
		const chunk = Buffer.alloc(8)
		// biome-ignore lint/performance/noAwaitInLoops: each GLB chunk header determines the next offset.
		await file.read(chunk, 0, 8, offset)
		const parsed = glbChunk(chunk, chunks++, size - offset)
		if (parsed === null) return false
		if (parsed.binary) {
			binaryLength = parsed.length
			binaryOffset = offset + 8
		}
		offset += parsed.length + 8
	}
	return { length: binaryLength, offset: binaryOffset }
}
