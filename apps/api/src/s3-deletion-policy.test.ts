import { afterAll, expect, test } from 'bun:test'
import { S3Client } from '@aws-sdk/client-s3'
import { assertUnversionedBucket, deleteS3Object } from './s3-deletion-policy'

const requests: string[] = []
let status = '',
	marker = '',
	version = '',
	denied = false
const server = Bun.serve({
	port: 0,
	hostname: '127.0.0.1',
	fetch(request) {
		const url = new URL(request.url)
		requests.push(`${request.method} ${url.search}`)
		if (url.searchParams.has('versioning')) {
			if (denied) return new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 })
			return new Response(
				`<VersioningConfiguration>${status ? `<Status>${status}</Status>` : ''}</VersioningConfiguration>`,
				{ headers: { 'content-type': 'application/xml' } }
			)
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
const { configureS3DeletionProvider, removeS3Memory, discardS3MemoryUpload } = await import('./storage-s3')
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
	configureS3DeletionProvider(null)
	configureS3DeletionProvider('aws')
	configureS3DeletionProvider('aws')
	expect(() => configureS3DeletionProvider('r2')).toThrow('bound')
	expect(() => configureS3DeletionProvider(null)).toThrow('bound')
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
