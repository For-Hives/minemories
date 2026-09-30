import { afterAll, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'minemories-s3-stream-'))
const partSizes: number[] = []
const digest = createHash('sha256')
let completed = false
let pending = false
let aborted = false
let removed = false
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
// Real minio SDK and HTTP multipart; this fixture does not claim Garage validation.
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
		if (request.method === 'POST' && url.searchParams.has('uploads'))
			return xml('<InitiateMultipartUploadResult><UploadId>test-upload</UploadId></InitiateMultipartUploadResult>')
		if (request.method === 'PUT' && url.searchParams.has('partNumber')) {
			const bytes = Buffer.from(await request.arrayBuffer())
			partSizes.push(bytes.length)
			digest.update(bytes)
			return new Response(null, { headers: { etag: `"${createHash('md5').update(bytes).digest('hex')}"` } })
		}
		if (request.method === 'POST' && url.searchParams.has('uploadId')) {
			completed = true
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
afterAll(() => {
	server.stop(true)
	rmSync(root, { recursive: true, force: true })
})

test('finalization streams through 8 MiB S3 parts rather than buffering the whole file', async () => {
	const size = 20 * 1024 * 1024
	const path = join(root, 'large.glb')
	const file = await open(path, 'w')
	await file.truncate(size)
	await file.close()
	await storeMemoryFile('owner/large.glb', path, size)
	expect(partSizes).toEqual([8 * 1024 * 1024, 8 * 1024 * 1024, 4 * 1024 * 1024])
	expect(completed).toBe(true)
	const expected = createHash('sha256')
	const zeros = Buffer.alloc(1024 * 1024)
	for (let part = 0; part < 20; part++) expected.update(zeros)
	expect(digest.digest('hex')).toBe(expected.digest('hex'))
}, 15_000)

test('cleanup aborts an unfinished multipart upload before deleting its object', async () => {
	pending = true
	await discardMemoryUpload('owner/large.glb')
	expect(aborted).toBe(true)
	expect(removed).toBe(true)
})
