// @vitest-environment jsdom
import type { TemporalFrame } from '@minemories/api-contract'
import { afterEach, expect, test, vi } from 'vitest'
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
	expect(fetch).toHaveBeenCalledWith('http://example.test/api/memories/capture/file', {
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
	await expect(fetchTemporalFile({ ...frame, size: 201 * 1024 * 1024 }, new AbortController().signal)).rejects.toThrow(
		'Unsupported capture size'
	)
})
