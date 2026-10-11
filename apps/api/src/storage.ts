import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Client } from 'minio'
import { DEV_S3_ACCESS_KEY, DEV_S3_SECRET_KEY } from './configuration'

const endpoint = new URL(process.env.S3_ENDPOINT ?? 'http://127.0.0.1:3900')
const bucket = process.env.S3_BUCKET ?? 'minemories'
const filesystemRoot = resolve(process.env.LOCAL_OBJECTS_PATH ?? './data/objects')
const storageDriver = process.env.STORAGE_DRIVER ?? 's3'
if (storageDriver !== 's3' && storageDriver !== 'filesystem') {
	throw new Error('STORAGE_DRIVER must be either "s3" or "filesystem".')
}
const client = new Client({
	endPoint: endpoint.hostname,
	port: Number(endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80)),
	useSSL: endpoint.protocol === 'https:',
	accessKey: process.env.S3_ACCESS_KEY ?? DEV_S3_ACCESS_KEY,
	secretKey: process.env.S3_SECRET_KEY ?? DEV_S3_SECRET_KEY,
	region: process.env.S3_REGION ?? 'garage',
	partSize: 8 * 1024 * 1024,
})

let bucketReady: Promise<void> | undefined

function localPath(objectKey: string) {
	const path = resolve(filesystemRoot, objectKey)
	const relativePath = relative(filesystemRoot, path)
	if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
		throw new Error('Invalid object key.')
	}
	return path
}

async function ensureBucket() {
	bucketReady ??= (async () => {
		if (!(await client.bucketExists(bucket))) await client.makeBucket(bucket, process.env.S3_REGION ?? 'garage')
	})().catch((error: unknown) => {
		bucketReady = undefined
		throw error
	})
	await bucketReady
}

export async function storeMemory(objectKey: string, contents: Buffer) {
	if (storageDriver === 'filesystem') {
		const path = localPath(objectKey)
		await mkdir(dirname(path), { recursive: true })
		await writeFile(path, contents, { flag: 'wx' })
		return
	}

	await ensureBucket()
	await client.putObject(bucket, objectKey, contents, contents.byteLength, {
		'Content-Type': 'model/gltf-binary',
	})
}

export async function removeMemory(objectKey: string) {
	if (storageDriver === 'filesystem') {
		const path = localPath(objectKey)
		await rm(path, { force: true })
		return
	}

	await client.removeObject(bucket, objectKey)
}

export async function readMemory(objectKey: string) {
	if (storageDriver === 'filesystem') {
		const path = localPath(objectKey)
		return readFile(path)
	}

	const stream = await client.getObject(bucket, objectKey)
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
	await ensureBucket()
	const source = createReadStream(path)
	try {
		await client.putObject(bucket, objectKey, source, size, { 'Content-Type': 'model/gltf-binary' })
	} finally {
		source.destroy()
	}
}

export async function readMemoryStream(objectKey: string) {
	if (storageDriver === 'filesystem') {
		const file = await open(localPath(objectKey), 'r')
		return file.createReadStream()
	}
	return client.getObject(bucket, objectKey)
}

/** Remove an abandoned session's object and unfinished S3 multipart upload. */
export async function discardMemoryUpload(objectKey: string) {
	if (storageDriver === 'filesystem') {
		await removeMemory(objectKey)
		return
	}
	await ensureBucket()
	for await (const upload of client.listIncompleteUploads(bucket, objectKey, true)) {
		if (upload.key === objectKey) await client.removeIncompleteUpload(bucket, objectKey)
	}
	await client.removeObject(bucket, objectKey)
}
