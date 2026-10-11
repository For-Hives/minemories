import { expect, test } from 'bun:test'
import { Hono } from 'hono'
import { boundedRequest, requestBodyLimit } from './body-limits'

function streamed(chunks: Uint8Array[], headers: Record<string, string> = {}, failCancellation = false) {
	let reads = 0
	let cancelled = false
	const body = new ReadableStream<Uint8Array>(
		{
			pull(controller) {
				const value = chunks[reads++]
				if (value === undefined) controller.close()
				else controller.enqueue(value)
			},
			cancel() {
				cancelled = true
				if (failCancellation) throw new Error('private cancellation fixture')
			},
		},
		{ highWaterMark: 0 }
	)
	return {
		request: new Request('http://localhost/echo?capture=one', { method: 'POST', body, headers }),
		reads: () => reads,
		cancelled: () => cancelled,
	}
}

test('bounded requests preserve split UTF-8, URL, method, credentials and actual content length', async () => {
	const bytes = new TextEncoder().encode('{"name":"été"}')
	const split = bytes.indexOf(0xc3) + 1
	const source = streamed([bytes.subarray(0, split), bytes.subarray(split)], {
		'content-type': 'application/json',
		'content-length': '1',
		'transfer-encoding': 'chunked',
		cookie: 'fixture=session',
		authorization: 'Bearer fixture',
		origin: 'http://localhost:5173',
	})
	const request = await boundedRequest(source.request, bytes.byteLength)
	if (!request) throw new Error('Valid request refused')
	expect(request.method).toBe('POST')
	expect(request.url).toBe(source.request.url)
	expect(request.headers.get('content-length')).toBe(String(bytes.byteLength))
	expect(request.headers.has('transfer-encoding')).toBe(false)
	expect(request.headers.get('cookie')).toBe('fixture=session')
	expect(request.headers.get('authorization')).toBe('Bearer fixture')
	expect(request.headers.get('origin')).toBe('http://localhost:5173')
	expect(await request.json()).toEqual({ name: 'été' })
	expect(source.request.body?.locked).toBe(false)
	const empty = new Request('http://localhost/session')
	expect(await boundedRequest(empty, 16)).toBe(empty)
	expect(await boundedRequest(new Request('http://localhost', { headers: { 'content-length': '17' } }), 16)).toBeNull()
})

test('oversized streams cancel before further reads even with missing or misleading length and cancellation errors', async () => {
	const declared = streamed([new Uint8Array(1)], { 'content-length': '17' }, true)
	expect(await boundedRequest(declared.request, 16)).toBeNull()
	expect(declared.reads()).toBe(0)
	expect(declared.cancelled()).toBe(true)
	await Promise.all(
		[{}, { 'content-length': '1' }].map(async headers => {
			const source = streamed([new Uint8Array(8), new Uint8Array(9), new Uint8Array(1)], headers, true)
			expect(await boundedRequest(source.request, 16)).toBeNull()
			expect(source.reads()).toBe(2)
			expect(source.cancelled()).toBe(true)
			expect(source.request.body?.locked).toBe(false)
		})
	)
})

test('middleware forwards accepted bodies and returns generic errors before downstream parsing', async () => {
	let parsed = 0
	const app = new Hono().use('*', requestBodyLimit(16)).post('/echo', async context => {
		parsed += 1
		return context.json(await context.req.json())
	})
	const valid = streamed([new TextEncoder().encode('{"valid":true}')])
	expect(await (await app.fetch(valid.request)).json()).toEqual({ valid: true })
	const oversized = await app.fetch(streamed([new Uint8Array(17)]).request)
	expect(oversized.status).toBe(413)
	expect(await oversized.json()).toEqual({ error: 'request_body_too_large' })
	const failed = new Request('http://localhost/echo', {
		method: 'POST',
		body: new ReadableStream({
			pull() {
				throw new Error('private stream fixture')
			},
		}),
	})
	const response = await app.fetch(failed)
	expect(response.status).toBe(400)
	expect(await response.json()).toEqual({ error: 'invalid_request_body' })
	expect(parsed).toBe(1)
})
