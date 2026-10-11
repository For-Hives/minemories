import { afterAll, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

const root = mkdtempSync(join(tmpdir(), 'minemories-s3-stream-'))
const partSizes: number[] = []
let digest = createHash('sha256')
let completed = false
let pending = false
let aborted = false
let removed = false
let refusedPart = 0
let firstPartDelivered: (() => void) | undefined
const sha256Pattern = /^[a-f0-9]{64}$/
function xml(body: string) {
	return new Response(body, { headers: { 'content-type': 'application/xml' } })
}
function removeObject(url: URL) {
	if (url.searchParams.has('uploadId')) {
		aborted = true
		pending = false
	} else removed = true
	return new Response(null, { status: 204 })
}

async function uploadPart(request: Request, url: URL) {
	expect(request.headers.get('x-amz-content-sha256')).toMatch(sha256Pattern)
	if (Number(url.searchParams.get('partNumber')) === refusedPart)
		return new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 })
	const bytes = Buffer.from(await request.arrayBuffer())
	expect(request.headers.get('x-amz-content-sha256')).toBe(createHash('sha256').update(bytes).digest('hex'))
	partSizes.push(bytes.length)
	digest.update(bytes)
	if (url.searchParams.get('partNumber') === '1') firstPartDelivered?.()
	return new Response(null, { headers: { etag: `"${createHash('md5').update(bytes).digest('hex')}"` } })
}
// Real S3 SDK and HTTP multipart; this fixture does not claim Garage validation.
const server = Bun.serve({
	port: 0,
	maxRequestBodySize: 8 * 1024 * 1024,
	async fetch(request) {
		const url = new URL(request.url)
		if (request.method === 'HEAD') return new Response(null)
		if (request.method === 'GET' && url.searchParams.has('uploadId'))
			return xml('<ListPartsResult><IsTruncated>false</IsTruncated></ListPartsResult>')
		if (request.method === 'DELETE') return removeObject(url)
		if (request.method === 'GET' && url.searchParams.has('uploads'))
			return xml(
				`<ListMultipartUploadsResult><IsTruncated>false</IsTruncated>${pending ? '<Upload><Key>owner/large.glb</Key><UploadId>test-upload</UploadId><Initiated>2026-09-30T15:00:00Z</Initiated></Upload>' : ''}</ListMultipartUploadsResult>`
			)
		if (request.method === 'POST' && url.searchParams.has('uploads')) {
			expect(request.headers.get('content-type')).toBe('model/gltf-binary')
			expect(request.headers.has('x-amz-sdk-checksum-algorithm')).toBe(false)
			pending = true
			return xml('<InitiateMultipartUploadResult><UploadId>test-upload</UploadId></InitiateMultipartUploadResult>')
		}
		if (request.method === 'PUT' && url.searchParams.has('partNumber')) return uploadPart(request, url)
		if (request.method === 'POST' && url.searchParams.has('uploadId')) {
			completed = true
			pending = false
			return xml(
				'<CompleteMultipartUploadResult><Location>test</Location><Bucket>minemories</Bucket><Key>owner/large.glb</Key><ETag>test</ETag></CompleteMultipartUploadResult>'
			)
		}
		return new Response('Unexpected S3 request', { status: 400 })
	},
})
process.env.STORAGE_DRIVER = 's3'
process.env.S3_ENDPOINT = server.url.toString()
process.env.S3_REGION = 'garage'
const { storeMemoryFile, discardMemoryUpload } = await import('./storage')
const { uploadS3Memory } = await import('./storage-s3')
afterAll(() => {
	server.stop(true)
	rmSync(root, { recursive: true, force: true })
})

test('finalization streams through 8 MiB S3 parts rather than buffering the whole file', async () => {
	const size = 20 * 1024 * 1024
	const path = join(root, 'large.glb')
	const file = await open(path, 'w')
	await file.truncate(size)
	await Promise.all(
		Array.from({ length: 20 }, (_, part) => file.write(Buffer.from([part + 1]), 0, 1, part * 1024 * 1024))
	)
	await file.close()
	await storeMemoryFile('owner/large.glb', path, size)
	expect(partSizes).toEqual([8 * 1024 * 1024, 8 * 1024 * 1024, 4 * 1024 * 1024])
	expect(completed).toBe(true)
	const expected = createHash('sha256')
	const zeros = Buffer.alloc(1024 * 1024)
	for (let part = 0; part < 20; part++) {
		zeros[0] = part + 1
		expected.update(zeros)
	}
	expect(digest.digest('hex')).toBe(expected.digest('hex'))
}, 15_000)

test('cleanup aborts an unfinished multipart upload before deleting its object', async () => {
	pending = true
	await discardMemoryUpload('owner/large.glb')
	expect(aborted).toBe(true)
	expect(removed).toBe(true)
})

test('a refused multipart part retains its upload until durable cleanup aborts it', async () => {
	partSizes.length = 0
	digest = createHash('sha256')
	completed = false
	pending = false
	aborted = false
	removed = false
	refusedPart = 2
	const size = 20 * 1024 * 1024
	await expect(storeMemoryFile('owner/large.glb', join(root, 'large.glb'), size)).rejects.toThrow()
	expect(partSizes).toEqual([8 * 1024 * 1024])
	expect(completed).toBe(false)
	expect(pending).toBe(true)
	expect(aborted).toBe(false)
	expect(removed).toBe(false)
	await discardMemoryUpload('owner/large.glb')
	expect(pending).toBe(false)
	expect(aborted).toBe(true)
	expect(removed).toBe(true)
})

test('the first S3 part is sent while the source tail is still unavailable', async () => {
	partSizes.length = 0
	digest = createHash('sha256')
	completed = false
	refusedPart = 0
	let requestedTail = false
	let timer: ReturnType<typeof setTimeout> | undefined
	const delivered = new Promise<void>((resolve, reject) => {
		firstPartDelivered = resolve
		timer = setTimeout(() => reject(new Error('Source tail requested before the first S3 part was sent.')), 5000)
	})
	const source = Readable.from(
		(async function* () {
			yield Buffer.alloc(8 * 1024 * 1024, 7)
			yield Buffer.from([8])
			await delivered
			requestedTail = true
			for (let part = 0; part < 12; part++) {
				const bytes = Buffer.alloc(1024 * 1024, part + 9)
				yield part === 0 ? bytes.subarray(1) : bytes
			}
		})(),
		{ objectMode: false, highWaterMark: 64 * 1024 }
	)
	try {
		await uploadS3Memory('owner/large.glb', source, 20 * 1024 * 1024)
		expect(requestedTail).toBe(true)
		expect(partSizes).toEqual([8 * 1024 * 1024, 8 * 1024 * 1024, 4 * 1024 * 1024])
		expect(completed).toBe(true)
	} finally {
		clearTimeout(timer)
		firstPartDelivered = undefined
		source.destroy()
	}
}, 10_000)
