import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { discardS3MemoryUpload, readS3MemoryStream, removeS3Memory, uploadS3Memory } from './storage-s3'

const filesystemRoot = resolve(process.env.LOCAL_OBJECTS_PATH ?? './data/objects')
const storageDriver = process.env.STORAGE_DRIVER ?? 's3'
if (storageDriver !== 's3' && storageDriver !== 'filesystem') {
	throw new Error('STORAGE_DRIVER must be either "s3" or "filesystem".')
}

function localPath(objectKey: string) {
	const path = resolve(filesystemRoot, objectKey)
	const relativePath = relative(filesystemRoot, path)
	if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
		throw new Error('Invalid object key.')
	}
	return path
}

export async function storeMemory(objectKey: string, contents: Buffer, signal?: AbortSignal) {
	signal?.throwIfAborted()
	if (storageDriver === 'filesystem') {
		const path = localPath(objectKey)
		await mkdir(dirname(path), { recursive: true })
		await writeFile(path, contents, { flag: 'wx', signal })
		return
	}

	await uploadS3Memory(objectKey, contents, contents.byteLength, signal)
}

export async function removeMemory(objectKey: string) {
	if (storageDriver === 'filesystem') {
		const path = localPath(objectKey)
		await rm(path, { force: true })
		return
	}

	await removeS3Memory(objectKey)
}

export async function readMemory(objectKey: string) {
	if (storageDriver === 'filesystem') {
		const path = localPath(objectKey)
		return readFile(path)
	}

	const stream = await readS3MemoryStream(objectKey)
	const chunks: Buffer[] = []
	for await (const chunk of stream) chunks.push(Buffer.from(chunk))
	return Buffer.concat(chunks)
}

/** Streaming finalization for uploads larger than the legacy in-memory endpoint. */
export async function storeMemoryFile(objectKey: string, path: string, size: number) {
	if (storageDriver === 'filesystem') {
		const target = localPath(objectKey)
		await mkdir(dirname(target), { recursive: true })
		await pipeline(createReadStream(path), createWriteStream(target, { flags: 'w' }))
		return
	}
	const source = createReadStream(path)
	try {
		await uploadS3Memory(objectKey, source, size)
	} finally {
		source.destroy()
	}
}

export async function readMemoryStream(objectKey: string, signal?: AbortSignal) {
	signal?.throwIfAborted()
	if (storageDriver === 'filesystem') {
		const file = await open(localPath(objectKey), 'r')
		try {
			signal?.throwIfAborted()
			return file.createReadStream({ signal })
		} catch (error) {
			await file.close()
			throw error
		}
	}
	return readS3MemoryStream(objectKey, signal)
}

/** Remove an abandoned session's object and unfinished S3 multipart upload. */
export async function discardMemoryUpload(objectKey: string) {
	if (storageDriver === 'filesystem') {
		await removeMemory(objectKey)
		return
	}
	await discardS3MemoryUpload(objectKey)
}
