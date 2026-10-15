import { afterAll, expect, test } from 'bun:test'
import { S3Client } from '@aws-sdk/client-s3'
import { assertUnversionedBucket, deleteS3Object } from './s3-deletion-policy'

const requests: string[] = []
const uploads: { method: string; multipart: boolean; storageClass: string | null }[] = []
let status = '',
	marker = '',
	version = '',
	denied = false
const server = Bun.serve({
	port: 0,
	hostname: '127.0.0.1',
	async fetch(request) {
		const url = new URL(request.url)
		requests.push(`${request.method} ${url.search}`)
		if (url.searchParams.has('versioning')) {
			if (denied) return new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 })
			return new Response(
				`<VersioningConfiguration>${status ? `<Status>${status}</Status>` : ''}</VersioningConfiguration>`,
				{ headers: { 'content-type': 'application/xml' } }
			)
		}
		if (request.method === 'PUT' || request.method === 'POST') {
			await request.arrayBuffer()
			uploads.push({
				method: request.method,
				multipart: url.searchParams.has('uploads'),
				storageClass: request.headers.get('x-amz-storage-class'),
			})
			if (url.searchParams.has('uploads'))
				return new Response(
					'<InitiateMultipartUploadResult><UploadId>fixture</UploadId></InitiateMultipartUploadResult>',
					{ headers: { 'content-type': 'application/xml' } }
				)
			if (request.method === 'POST')
				return new Response('<CompleteMultipartUploadResult><ETag>"complete"</ETag></CompleteMultipartUploadResult>', {
					headers: { 'content-type': 'application/xml' },
				})
			return new Response(null, { headers: { etag: '"part"' } })
		}
		if (url.searchParams.has('uploads'))
			return new Response('<ListMultipartUploadsResult/>', { headers: { 'content-type': 'application/xml' } })
		return new Response(null, {
			status: request.method === 'DELETE' ? 204 : 200,
			headers: {
				...(marker ? { 'x-amz-delete-marker': marker } : {}),
				...(version ? { 'x-amz-version-id': version } : {}),
			},
		})
	},
})
process.env.S3_ENDPOINT = server.url.toString()
process.env.S3_BUCKET = 'private'
process.env.S3_REGION = 'auto'
const { configureS3StorageProvider, removeS3Memory, discardS3MemoryUpload, uploadS3Memory } = await import(
	'./storage-s3'
)
const client = new S3Client({
	endpoint: server.url.toString(),
	region: 'auto',
	forcePathStyle: true,
	maxAttempts: 1,
	credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture-private' },
})
afterAll(() => {
	client.destroy()
	server.stop(true)
})

test('bound AWS deletion checks versioning for normal deletion and abandoned multipart cleanup', async () => {
	configureS3StorageProvider(null)
	await uploadS3Memory('owner/garage.glb', Buffer.alloc(20), 20)
	expect(uploads.at(-1)?.storageClass).toBeNull()
	configureS3StorageProvider('aws')
	configureS3StorageProvider('aws')
	expect(() => configureS3StorageProvider('r2')).toThrow('bound')
	expect(() => configureS3StorageProvider(null)).toThrow('bound')
	await removeS3Memory('owner/original.glb')
	expect(requests.slice(-2)).toEqual(['GET ?versioning=', 'DELETE ?x-id=DeleteObject'])
	await discardS3MemoryUpload('owner/abandoned.glb')
	expect(requests.slice(-2)).toEqual(['GET ?versioning=', 'DELETE ?x-id=DeleteObject'])
	for (const value of ['Enabled', 'Suspended']) {
		status = value
		const count = requests.filter(r => r.startsWith('DELETE')).length
		// biome-ignore lint/performance/noAwaitInLoops: Observe each bucket state before changing the shared server fixture.
		await expect(removeS3Memory('owner/retained.glb')).rejects.toThrow('versioning')
		expect(requests.filter(r => r.startsWith('DELETE'))).toHaveLength(count)
	}
	status = ''
	denied = true
	await expect(removeS3Memory('owner/retained.glb')).rejects.toThrow()
	denied = false
})

test('delete markers or version identifiers are never accepted as private object deletion acknowledgements', async () => {
	marker = 'true'
	await expect(removeS3Memory('owner/race.glb')).rejects.toThrow('not confirmed')
	marker = ''
	version = 'new-delete-marker-version'
	await expect(deleteS3Object(client, 'private', 'owner/race.glb', null)).rejects.toThrow('not confirmed')
	version = ''
	const start = requests.length
	await deleteS3Object(client, 'private', 'owner/r2.glb', 'r2')
	expect(requests.slice(start)).toEqual(['DELETE ?x-id=DeleteObject'])
	await assertUnversionedBucket(client, 'private', new AbortController().signal)
	const before = requests.length
	await expect(assertUnversionedBucket(client, 'private', AbortSignal.abort())).rejects.toThrow()
	expect(requests).toHaveLength(before)
})

test('bound hot uploads pin STANDARD for both PutObject and multipart initiation', async () => {
	const first = uploads.length
	await uploadS3Memory('owner/small.glb', Buffer.alloc(20), 20)
	const size = 8 * 1024 * 1024 + 1
	await uploadS3Memory('owner/large.glb', Buffer.alloc(size), size)
	const writes = uploads.slice(first)
	expect(writes.filter(r => r.storageClass === 'STANDARD')).toEqual([
		{ method: 'PUT', multipart: false, storageClass: 'STANDARD' },
		{ method: 'POST', multipart: true, storageClass: 'STANDARD' },
	])
	expect(writes.filter(r => r.method === 'PUT')).toHaveLength(3)
})
