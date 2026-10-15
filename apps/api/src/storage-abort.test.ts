import { afterAll, expect, test } from 'bun:test'
import { once } from 'node:events'

let putSeen: () => void = () => {},
	getSeen: () => void = () => {},
	releasePut: () => void = () => {},
	releaseGet: () => void = () => {}
const putDone = new Promise<void>(resolve => {
		releasePut = resolve
	}),
	getDone = new Promise<void>(resolve => {
		releaseGet = resolve
	})
const server = Bun.serve({
	port: 0,
	async fetch(request) {
		const url = new URL(request.url)
		if (request.method === 'HEAD') return new Response(null)
		if (request.method === 'PUT') {
			await request.arrayBuffer()
			putSeen()
			await putDone
			return new Response(null, { headers: { etag: '"fixture"' } })
		}
		if (url.pathname.endsWith('/waiting.glb')) {
			getSeen()
			await getDone
			return new Response('glTF')
		}
		return new Response(
			new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new Uint8Array([1, 2, 3]))
				},
			})
		)
	},
})
process.env.STORAGE_DRIVER = 's3'
process.env.S3_ENDPOINT = server.url.toString()
process.env.S3_REGION = 'garage'
const { storeMemory, readMemoryStream } = await import('./storage')
afterAll(() => {
	releasePut()
	releaseGet()
	server.stop(true)
})

test('aborted calls never start an S3 transfer', async () => {
	const controller = new AbortController()
	controller.abort(new Error('cancel before transfer'))
	await expect(storeMemory('owner/cancel.glb', Buffer.from('glTF'), controller.signal)).rejects.toThrow(
		'cancel before transfer'
	)
	await expect(readMemoryStream('owner/cancel.glb', controller.signal)).rejects.toThrow('cancel before transfer')
})

test('an in-flight SDK upload rejects when its caller aborts while awaiting the provider acknowledgement', async () => {
	const controller = new AbortController(),
		seen = new Promise<void>(resolve => {
			putSeen = resolve
		})
	const writing = storeMemory('owner/pending.glb', Buffer.alloc(256 * 1024), controller.signal)
	await seen
	controller.abort()
	await expect(writing).rejects.toThrow()
	releasePut()
})

test('an SDK GET can abort before response headers', async () => {
	const controller = new AbortController(),
		seen = new Promise<void>(resolve => {
			getSeen = resolve
		})
	const opening = readMemoryStream('owner/waiting.glb', controller.signal)
	await seen
	controller.abort()
	await expect(opening).rejects.toThrow()
	releaseGet()
})

test('aborting an opened S3 body closes its stream and releases listeners', async () => {
	const controller = new AbortController(),
		body = await readMemoryStream('owner/stream.glb', controller.signal)
	await once(body, 'data')
	body.pause()
	const closed = new Promise<void>(resolve => body.once('close', resolve)),
		error = once(body, 'error')
	controller.abort('consumer stopped')
	expect((await error)[0]).toBeInstanceOf(Error)
	await closed
	expect(body.destroyed).toBe(true)
})
