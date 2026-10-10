import { expect, test } from 'bun:test'
import { PairingAttemptLimiter, pairingAddress, readPairingBody } from './pairing-protection'

test('pairing windows isolate addresses, count rejected attempts and reset after one minute', () => {
	const limiter = new PairingAttemptLimiter()
	for (let attempt = 0; attempt < 8; attempt += 1) expect(limiter.allow('first', 10)).toBe(true)
	expect(limiter.allow('first', 59_999)).toBe(false)
	expect(limiter.allow('second', 59_999)).toBe(true)
	expect(limiter.allow('first', 60_010)).toBe(true)
	for (let attempt = 0; attempt < 7; attempt += 1) expect(limiter.allow('second', 60_010)).toBe(true)
	expect(limiter.allow('second', 60_010)).toBe(false)
	// This window expires between two periodic cleanups.
	expect(limiter.allow('second', 119_999)).toBe(true)
})

test('full capacity rejects new addresses without evicting blocked clients, then recovers', () => {
	const limiter = new PairingAttemptLimiter()
	for (let index = 0; index < 4096; index += 1) expect(limiter.allow(`peer-${index}`, 0)).toBe(true)
	expect(limiter.allow('overflow', 1)).toBe(false)
	for (let attempt = 0; attempt < 7; attempt += 1) expect(limiter.allow('peer-0', 1)).toBe(true)
	expect(limiter.allow('peer-0', 1)).toBe(false)
	expect(limiter.allow('overflow', 59_999)).toBe(false)
	expect(limiter.allow('overflow', 60_000)).toBe(true)
})

test('forwarded addresses are accepted only from an explicitly trusted immediate proxy', () => {
	const trusted = new Set(['127.0.0.1'])
	const spoofed = new Headers({ 'x-forwarded-for': '192.0.2.1, 203.0.113.8', 'cf-connecting-ip': '192.0.2.2' })
	expect(pairingAddress('198.51.100.7', spoofed, trusted)).toBe('198.51.100.7')
	expect(pairingAddress(undefined, spoofed, trusted)).toBe('unknown')
	expect(pairingAddress(undefined, spoofed, new Set(['unknown']))).toBe('unknown')
	expect(pairingAddress('127.0.0.1', spoofed, trusted)).toBe('203.0.113.8')
	expect(pairingAddress('127.0.0.1', new Headers(), trusted)).toBe('127.0.0.1')
	expect(pairingAddress('127.0.0.1', new Headers({ 'x-forwarded-for': 'invalid' }), trusted)).toBe('127.0.0.1')
	expect(pairingAddress('127.0.0.1', new Headers({ 'x-forwarded-for': '::1' }), trusted)).toBe('::1')
})

function streamedBody(chunks: string[], headers?: Record<string, string>) {
	let cancelled = false
	let reads = 0
	const stream = new ReadableStream<Uint8Array>(
		{
			pull(controller) {
				const chunk = chunks[reads++]
				if (chunk === undefined) controller.close()
				else controller.enqueue(new TextEncoder().encode(chunk))
			},
			cancel() {
				cancelled = true
			},
		},
		{ highWaterMark: 0 }
	)
	return {
		request: new Request('http://localhost/api/mod/pair', { method: 'POST', body: stream, headers: headers ?? {} }),
		cancelled: () => cancelled,
		reads: () => reads,
	}
}

test('bounded pairing JSON accepts split UTF-8, empty and malformed bodies safely', async () => {
	expect(await readPairingBody(new Request('http://localhost', { method: 'POST' }))).toEqual({
		tooLarge: false,
		value: null,
	})
	expect(await readPairingBody(streamedBody(['{"code":', '"123456","name":"été"}']).request)).toEqual({
		tooLarge: false,
		value: { code: '123456', name: 'été' },
	})
	expect(await readPairingBody(streamedBody(['not json']).request)).toEqual({ tooLarge: false, value: null })
	expect(await readPairingBody(streamedBody(['"', 'a'.repeat(2046), '"']).request)).toEqual({
		tooLarge: false,
		value: 'a'.repeat(2046),
	})
})

test('body limit cancels early and never consumes the remainder of an oversized stream', async () => {
	const declared = streamedBody(['unused'], { 'content-length': '2049' })
	expect(await readPairingBody(declared.request)).toEqual({ tooLarge: true, value: null })
	expect(declared.cancelled()).toBe(true)
	expect(declared.reads()).toBe(0)
	const oversized = streamedBody(['a'.repeat(1024), 'b'.repeat(1025), 'unread'], { 'content-length': '1' })
	expect(await readPairingBody(oversized.request)).toEqual({ tooLarge: true, value: null })
	expect(oversized.cancelled()).toBe(true)
	expect(oversized.reads()).toBe(2)
	expect(oversized.request.body?.locked).toBe(false)
})
