// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { CaptureRestorationRequired } from '../lib/capture-file'
import { CaptureRestorationPanel, useCaptureRestoration } from './CaptureRestoration'

const api = vi.hoisted(() => ({ restore: vi.fn(), status: vi.fn() }))
vi.mock('../api-client', () => ({ apiClient: { captureStorage: api } }))
const cold = {
	state: 'cold' as const,
	readyObjects: 0,
	totalObjects: 2,
	restorationAvailable: true,
	retryAfterSeconds: 1,
}
const restoring = { ...cold, state: 'restoring' as const, readyObjects: 1 }
const ready = { ...cold, state: 'ready' as const, readyObjects: 2, retryAfterSeconds: null }
const access = { kind: 'owner' as const, id: 'capture' }
afterEach(() => {
	cleanup()
	vi.clearAllMocks()
	vi.useRealTimers()
})

test('archived capture requires an explicit action, displays object progress, then resumes its download', async () => {
	vi.useFakeTimers()
	api.restore.mockResolvedValue(restoring)
	api.status.mockResolvedValue(ready)
	const controller = new AbortController(),
		download = vi.fn().mockRejectedValueOnce(new CaptureRestorationRequired(cold)).mockResolvedValue('GLB')
	const hook = renderHook(useCaptureRestoration)
	let promise!: Promise<string>
	await act(async () => {
		promise = hook.result.current.load(download, access, controller.signal)
	})
	expect(api.restore).not.toHaveBeenCalled()
	const panel = render(
		<CaptureRestorationPanel view={hook.result.current.view} onRestore={hook.result.current.resume} />
	)
	fireEvent.click(screen.getByRole('button', { name: 'Restore memory' }))
	await act(async () => {
		await Promise.resolve()
	})
	panel.rerender(<CaptureRestorationPanel view={hook.result.current.view} onRestore={hook.result.current.resume} />)
	expect(screen.getByRole('progressbar').getAttribute('value')).toBe('1')
	expect(screen.queryByRole('button')).toBeNull()
	await act(async () => {
		await vi.advanceTimersByTimeAsync(1000)
	})
	expect(await promise).toBe('GLB')
	expect(api.restore).toHaveBeenCalledWith(access, { signal: controller.signal })
	expect(hook.result.current.view).toBeNull()
})

test('already restoring captures poll automatically; abort cancels polling and never downloads another file', async () => {
	vi.useFakeTimers()
	const controller = new AbortController(),
		hook = renderHook(useCaptureRestoration)
	const download = vi.fn().mockRejectedValue(new CaptureRestorationRequired(restoring))
	let promise!: Promise<unknown>
	await act(async () => {
		promise = hook.result.current.load(download, access, controller.signal).catch(error => error)
	})
	await act(async () => {
		controller.abort(new Error('changed capture'))
		await promise
	})
	expect(vi.getTimerCount()).toBe(0)
	expect(api.restore).not.toHaveBeenCalled()
	expect(api.status).not.toHaveBeenCalled()
	expect(download).toHaveBeenCalledTimes(1)
})

test('disabled restoration offers a manual availability check without creating restore work', async () => {
	const controller = new AbortController(),
		hook = renderHook(useCaptureRestoration)
	const download = vi
		.fn()
		.mockRejectedValueOnce(new CaptureRestorationRequired({ ...cold, restorationAvailable: false }))
		.mockResolvedValue('GLB')
	let promise!: Promise<string>
	await act(async () => {
		promise = hook.result.current.load(download, access, controller.signal)
	})
	render(<CaptureRestorationPanel view={hook.result.current.view} onRestore={hook.result.current.resume} />)
	fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
	await act(async () => {
		await promise
	})
	expect(api.restore).not.toHaveBeenCalled()
	expect(await promise).toBe('GLB')
})

test('provider errors allow retry, but revoked access ends the load and clears its panel', async () => {
	api.restore.mockRejectedValueOnce(new Error('network')).mockRejectedValueOnce({ code: 'NOT_FOUND' })
	const controller = new AbortController(),
		hook = renderHook(useCaptureRestoration)
	let promise!: Promise<unknown>
	await act(async () => {
		promise = hook.result.current
			.load(() => Promise.reject(new CaptureRestorationRequired(cold)), access, controller.signal)
			.catch(error => error)
	})
	await act(async () => {
		hook.result.current.resume()
	})
	expect(hook.result.current.view?.error).toBe(true)
	await act(async () => {
		hook.result.current.resume()
		await promise
	})
	expect(await promise).toBeInstanceOf(Error)
	expect(hook.result.current.view).toBeNull()
})

test('aborting a waiting confirmation removes its action and a fresh capture can load', async () => {
	const controller = new AbortController(),
		hook = renderHook(useCaptureRestoration)
	let pending!: Promise<unknown>
	await act(async () => {
		pending = hook.result.current
			.load(() => Promise.reject(new CaptureRestorationRequired(cold)), access, controller.signal)
			.catch(error => error)
	})
	await act(async () => {
		controller.abort()
		await pending
		hook.result.current.resume()
	})
	await act(async () => {
		expect(await hook.result.current.load(() => Promise.resolve('new'), access, new AbortController().signal)).toBe(
			'new'
		)
	})
	expect(hook.result.current.view).toBeNull()
})
