import { createHash } from 'node:crypto'
import type { TemporalFrame } from '@minemories/api-contract'
import { afterEach, expect, test, vi } from 'vitest'
import { RetryableTileError, type TileSummary } from '../lib/tiles'
import { fetchTemporalTile } from './temporal-tiles'

vi.mock('../api-client', () => ({ apiBase: 'http://example.test' }))

const frame = { id: 'capture', name: 'World', size: 3 } as TemporalFrame
const payload = new Uint8Array([1, 2, 3])
const tile = (overrides: Partial<TileSummary> = {}): TileSummary => ({
	x: -1,
	z: 2,
	size: 3,
	sha256: createHash('sha256').update(payload).digest('hex'),
	quads: 1,
	...overrides,
})
const availability = {
	state: 'restoring',
	readyObjects: 1,
	totalObjects: 3,
	restorationAvailable: true,
	retryAfterSeconds: 5,
}
const signal = () => new AbortController().signal

afterEach(() => vi.unstubAllGlobals())

test('requests the tile with cookies and cancellation, then returns exactly its verified bytes', async () => {
	const controls = signal()
	const fetchMock = vi.fn(async () => new Response(payload))
	vi.stubGlobal('fetch', fetchMock)
	const data = await fetchTemporalTile(frame, tile(), controls)
	expect(fetchMock).toHaveBeenCalledWith('http://example.test/api/memories/capture/tiles/-1/2', {
		credentials: 'include',
		signal: controls,
	})
	expect(data).toBeInstanceOf(ArrayBuffer)
	expect([...new Uint8Array(data)]).toEqual([1, 2, 3])
})

test('a cold storage tile reports restoration before any bytes are read', async () => {
	const response = Response.json({ availability }, { status: 202 })
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
	await expect(fetchTemporalTile(frame, tile(), signal())).rejects.toMatchObject({ availability })
	expect(response.bodyUsed).toBe(true)
})

test.each([429, 503])('status %i is retryable', async status => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })))
	await expect(fetchTemporalTile(frame, tile(), signal())).rejects.toBeInstanceOf(RetryableTileError)
})

test('other failure statuses are not retryable', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })))
	await expect(fetchTemporalTile(frame, tile(), signal())).rejects.toThrow('Tile unavailable')
})

test('an ok response without a body is treated as unavailable', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
	await expect(fetchTemporalTile(frame, tile(), signal())).rejects.toThrow('Tile unavailable')
})

test('an oversized body is cancelled as soon as it exceeds the declared tile size', async () => {
	const cancel = vi.fn()
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(new Uint8Array(4))
		},
		cancel,
	})
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)))
	await expect(fetchTemporalTile(frame, tile(), signal())).rejects.toThrow('Tile size changed')
	expect(cancel).toHaveBeenCalledOnce()
})

test('a truncated body is rejected as a size change', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(2))))
	await expect(fetchTemporalTile(frame, tile(), signal())).rejects.toThrow('Tile size changed')
})

test('a digest mismatch never returns the tile', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(payload)))
	await expect(fetchTemporalTile(frame, tile({ sha256: '0'.repeat(64) }), signal())).rejects.toThrow(
		'Tile failed integrity validation'
	)
})

test('an abort during the body read stops the reader', async () => {
	const controls = new AbortController()
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(new Uint8Array(1))
		},
	})
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)))
	controls.abort(new Error('cancelled'))
	await expect(fetchTemporalTile(frame, tile(), controls.signal)).rejects.toThrow('cancelled')
})
