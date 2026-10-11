import { afterAll, expect, test } from 'bun:test'

let authorized = false
let bucketExists = false
let creations = 0
const server = Bun.serve({
	port: 0,
	async fetch(request) {
		if (!authorized) return new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 })
		const url = new URL(request.url)
		if (request.method === 'HEAD') return new Response(null, { status: bucketExists ? 200 : 404 })
		if (request.method === 'PUT' && url.pathname === '/minemories/') {
			expect(await request.text()).toBe('')
			creations++
			bucketExists = true
			return new Response(null)
		}
		if (request.method === 'PUT') {
			expect(request.headers.get('authorization')).toContain('/us-east-1/s3/aws4_request')
			return new Response(null, { headers: { etag: '"test-etag"' } })
		}
		return new Response('Unexpected S3 request', { status: 400 })
	},
})
process.env.STORAGE_DRIVER = 's3'
process.env.S3_ENDPOINT = server.url.toString()
process.env.S3_BUCKET = 'minemories'
process.env.S3_REGION = 'us-east-1'
const { storeMemory } = await import('./storage')
afterAll(() => server.stop(true))

test('authorization errors do not create a bucket; us-east-1 creation omits its location constraint', async () => {
	await expect(storeMemory('owner/denied.glb', Buffer.from('glTF'))).rejects.toThrow()
	expect(creations).toBe(0)
	authorized = true
	await storeMemory('owner/capture.glb', Buffer.from('glTF'))
	expect(creations).toBe(1)
})
