// @vitest-environment jsdom
import type { TemporalFrame } from '@minemories/api-contract'
import { afterEach, expect, test, vi } from 'vitest'
import { compressedSample } from '../testing/quads-glb'
import { fetchTemporalFile } from './temporal-files'

vi.mock('../api-client', () => ({ apiBase: 'http://example.test' }))
const frame = { id: 'capture', name: 'World', size: 3 } as TemporalFrame
afterEach(() => vi.unstubAllGlobals())
test('private file requests carry cookies and cancellation and require the exact declared size', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
	)
	const signal = new AbortController().signal
	const file = await fetchTemporalFile(frame, signal)
	expect(fetch).toHaveBeenCalledWith('http://example.test/api/memories/capture/file?variant=meshopt', {
		credentials: 'include',
		signal,
	})
	expect(file.name).toBe('World.glb')
	expect(file.size).toBe(3)
	expect(file.type).toBe('model/gltf-binary')
})
test('oversized streams are cancelled immediately without collecting the rest of the body', async () => {
	const cancel = vi.fn()
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(new Uint8Array(4))
		},
		cancel,
	})
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(stream))
	)
	await expect(fetchTemporalFile(frame, new AbortController().signal)).rejects.toThrow('Capture size changed')
	expect(cancel).toHaveBeenCalledOnce()
})
test('truncation, denied files, and unsupported sizes never reach the renderer', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(new Uint8Array(2)))
	)
	await expect(fetchTemporalFile(frame, new AbortController().signal)).rejects.toThrow('Capture size changed')
	vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403 }))
	await expect(fetchTemporalFile(frame, new AbortController().signal)).rejects.toThrow('Capture unavailable')
	await expect(
		fetchTemporalFile({ ...frame, size: 450 * 1024 * 1024 + 1 }, new AbortController().signal)
	).rejects.toThrow('Unsupported capture size')
})

test('a cold timeline frame reports restoration before starting its bounded GLB reader', async () => {
	const availability = {
		state: 'restoring',
		readyObjects: 1,
		totalObjects: 3,
		restorationAvailable: true,
		retryAfterSeconds: 5,
	}
	const response = Response.json({ availability }, { status: 202 })
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
	await expect(fetchTemporalFile(frame, new AbortController().signal)).rejects.toMatchObject({ availability })
	expect(response.bodyUsed).toBe(true)
})

test('a Meshopt variant is expanded, bounded by the declared size, and refused when corrupted', async () => {
	const { compressed } = await compressedSample(150)
	const headers = { 'X-Minemories-Variant': 'meshopt' }
	const declared = { ...frame, size: compressed.byteLength + 500 } as TemporalFrame
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(compressed as BlobPart, { headers }))
	)
	const file = await fetchTemporalFile(declared, new AbortController().signal)
	expect(file.name).toBe('World.glb')
	expect(file.size).toBeGreaterThan(compressed.byteLength)
	expect(new TextDecoder().decode(new Uint8Array(await file.arrayBuffer()).subarray(20, 600))).not.toContain(
		'EXT_meshopt'
	)
	await expect(
		fetchTemporalFile({ ...frame, size: compressed.byteLength - 1 } as TemporalFrame, new AbortController().signal)
	).rejects.toThrow('Capture size changed')
	vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array(40), { headers }))
	await expect(
		fetchTemporalFile({ ...frame, size: 40 } as TemporalFrame, new AbortController().signal)
	).rejects.toThrow('Capture unavailable')
	const controller = new AbortController()
	vi.mocked(fetch).mockImplementationOnce(async () => {
		queueMicrotask(() => controller.abort(new Error('stopped')))
		return new Response(compressed as BlobPart, { headers })
	})
	await expect(fetchTemporalFile(declared, controller.signal)).rejects.toThrow('stopped')
})
