import { afterEach, expect, test, vi } from 'vitest'
import { CaptureRestorationRequired, capturePollDelay, downloadCapture, requireCaptureReady } from './capture-file'

const availability = {
	state: 'cold',
	readyObjects: 0,
	totalObjects: 2,
	restorationAvailable: true,
	retryAfterSeconds: 5,
}
afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

test('a GLB download keeps credentials and its abort signal, and returns a real file', async () => {
	const fetch = vi.fn().mockResolvedValue(new Response('glTF'))
	vi.stubGlobal('fetch', fetch)
	const signal = new AbortController().signal
	const file = await downloadCapture('/private', 'memory.glb', signal)
	expect(fetch).toHaveBeenCalledWith('/private', { credentials: 'include', signal })
	expect(await file.text()).toBe('glTF')
	expect(file.name).toBe('memory.glb')
})

test('HTTP 202 is validated as restoration state and is never parsed as a GLB', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ availability }, { status: 202 })))
	await expect(downloadCapture('/cold', 'file.glb', new AbortController().signal)).rejects.toMatchObject({
		availability,
	})
	await expect(requireCaptureReady(Response.json({ availability }, { status: 202 }))).rejects.toBeInstanceOf(
		CaptureRestorationRequired
	)
	await expect(
		requireCaptureReady(Response.json({ availability: { state: 'unknown' } }, { status: 202 }))
	).rejects.toThrow()
	await expect(requireCaptureReady(new Response('not json', { status: 202 }))).rejects.toThrow()
})

test('revocation and cancellation cannot deliver a file after storage or body reads', async () => {
	const controller = new AbortController(),
		signal = controller.signal
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
	await expect(downloadCapture('/revoked', 'f.glb', signal)).rejects.toThrow('unavailable')
	controller.abort(new Error('stopped'))
	await expect(downloadCapture('/stopped', 'f.glb', signal)).rejects.toThrow('stopped')
	const bodyController = new AbortController(),
		response = new Response('glTF')
	vi.spyOn(response, 'blob').mockImplementation(async () => {
		bodyController.abort(new Error('late'))
		return new Blob(['glTF'])
	})
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
	await expect(downloadCapture('/body', 'f.glb', bodyController.signal)).rejects.toThrow('late')
})

test('polling waits the advertised delay, defaults to five seconds and removes pending timers on abort', async () => {
	vi.useFakeTimers()
	const signal = new AbortController().signal
	const done = vi.fn()
	const first = capturePollDelay(1, signal).then(done)
	await vi.advanceTimersByTimeAsync(999)
	expect(done).not.toHaveBeenCalled()
	await vi.advanceTimersByTimeAsync(1)
	await first
	expect(done).toHaveBeenCalledTimes(1)
	const fallback = capturePollDelay(null, signal).then(done)
	await vi.advanceTimersByTimeAsync(4999)
	expect(done).toHaveBeenCalledTimes(1)
	await vi.advanceTimersByTimeAsync(1)
	await fallback
	const controller = new AbortController(),
		wait = capturePollDelay(30, controller.signal)
	const rejected = expect(wait).rejects.toThrow('cancelled')
	controller.abort(new Error('cancelled'))
	await rejected
	expect(vi.getTimerCount()).toBe(0)
	expect(() => capturePollDelay(1, controller.signal)).toThrow('cancelled')
})
