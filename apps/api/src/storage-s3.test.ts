import { afterAll, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

// Exercise the actual SDK over HTTP. This fixture is not a real Garage deployment.
const objects = new Map<string, Buffer>()
const requests: string[] = []
let available = false
let bucketExists = false
const server = Bun.serve({
	port: 0,
	async fetch(request) {
		const path = new URL(request.url).pathname
		const isBucket = path === '/minemories' || path === '/minemories/'
		requests.push(`${request.method} ${isBucket ? '/minemories' : path}`)
		if (!available)
			return new Response('<Error><Code>ServiceUnavailable</Code><Message>Offline</Message></Error>', {
				status: 503,
				headers: { 'content-type': 'application/xml' },
			})
		if (isBucket) {
			if (request.method === 'HEAD') return new Response(null, { status: bucketExists ? 200 : 404 })
			if (request.method === 'PUT') {
				expect(await request.text()).toContain('<LocationConstraint>garage</LocationConstraint>')
				bucketExists = true
				return new Response(null)
			}
		}
		if (request.method === 'PUT') {
			objects.set(path, Buffer.from(await request.arrayBuffer()))
			expect(request.headers.get('content-type')).toBe('model/gltf-binary')
			expect(request.headers.get('authorization')).toContain('AWS4-HMAC-SHA256')
			return new Response(null, { headers: { etag: '"test-etag"' } })
		}
		if (request.method === 'DELETE') {
			objects.delete(path)
			return new Response(null, { status: 204 })
		}
		const object = objects.get(path)
		return object
			? new Response(Uint8Array.from(object))
			: new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 })
	},
})
process.env.STORAGE_DRIVER = 's3'
process.env.S3_ENDPOINT = server.url.toString()
process.env.S3_BUCKET = 'minemories'
process.env.S3_REGION = 'garage'
const { storeMemory, readMemory, removeMemory, storeMemoryFile, readMemoryStream } = await import('./storage')
afterAll(() => server.stop(true))

test('S3 initialization retries after failure, shares its bucket check and preserves binary bytes', async () => {
	const bytes = Buffer.from([0, 1, 127, 128, 255])
	await expect(storeMemory('owner/failed.glb', bytes)).rejects.toThrow()
	const failedChecks = requests.length
	available = true
	await Promise.all([storeMemory('owner/one.glb', bytes), storeMemory('owner/two.glb', bytes)])
	expect(requests.slice(failedChecks).filter(request => request === 'HEAD /minemories')).toHaveLength(1)
	expect(requests.filter(request => request === 'PUT /minemories')).toHaveLength(1)
	expect(await readMemory('owner/one.glb')).toEqual(bytes)
	await removeMemory('owner/one.glb')
	await expect(readMemory('owner/one.glb')).rejects.toThrow()
	available = false
	await expect(readMemory('owner/two.glb')).rejects.toThrow()
	available = true
	expect(await readMemory('owner/two.glb')).toEqual(bytes)
})

test('S3 file uploads and downloads stream exact bytes and reject a storage outage', async () => {
	available = true
	const directory = await mkdtemp(join(tmpdir(), 'minemories-s3-stream-'))
	const path = join(directory, 'capture.glb')
	const bytes = Buffer.alloc(1024 * 1024, 37)
	await writeFile(path, bytes)
	try {
		await storeMemoryFile('owner/stream.glb', path, bytes.length)
		const stream = await readMemoryStream('owner/stream.glb')
		const recovered = await new Response(Readable.toWeb(stream) as unknown as ReadableStream).arrayBuffer()
		expect(Buffer.from(recovered).equals(bytes)).toBe(true)
		available = false
		await expect(storeMemoryFile('owner/offline.glb', path, bytes.length)).rejects.toThrow()
		await expect(readMemoryStream('owner/stream.glb')).rejects.toThrow()
		available = true
		expect(objects.has('/minemories/owner/offline.glb')).toBe(false)
	} finally {
		available = true
		await removeMemory('owner/stream.glb')
		await rm(directory, { recursive: true, force: true })
	}
})
