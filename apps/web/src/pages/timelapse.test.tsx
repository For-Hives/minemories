// @vitest-environment jsdom
import type { TemporalFrame, TemporalWindow } from '@minemories/api-contract'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { TimelapsePage } from './TimelapsePage'
import { rememberFrame, resumedFrame } from './temporal-resume'

const mocks = vi.hoisted(() => ({
	frames: vi.fn(),
	load: vi.fn(),
	dispose: vi.fn(),
	context: vi.fn(),
	minutes: vi.fn(),
	reset: vi.fn(),
	construct: vi.fn(),
}))
vi.mock('../api-client', () => ({ apiBase: 'http://example.test', apiClient: { timelapse: { frames: mocks.frames } } }))
vi.mock('../viewer-scene', () => ({
	ViewerScene: class {
		constructor() {
			mocks.construct()
		}
		loadFile = mocks.load
		dispose = mocks.dispose
		setCaptureContext = mocks.context
		setMinutes = mocks.minutes
		resetView = mocks.reset
	},
}))
const seriesId = 'a'.repeat(64)
function frame(n: number): TemporalFrame {
	return {
		id: `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`,
		name: `Capture ${n}`,
		size: 3,
		at: `2026-10-${String(n).padStart(2, '0')}T12:00:00Z`,
		timeSource: 'capture',
		captureStartedAt: null,
		captureFinishedAt: null,
		origin: { x: 10, y: 100 - n, z: 20 },
		bounds: { minX: 8, minY: 28, minZ: 18, maxX: 12, maxY: 319, maxZ: 22 },
		dayTime: 6000,
		biome: 'minecraft:plains',
		seed: null,
	}
}
function page(frames = [frame(1), frame(2), frame(3)], extra: Partial<TemporalWindow> = {}): TemporalWindow {
	return {
		seriesId,
		name: 'My village',
		dimension: 'minecraft:overworld',
		mode: 'around',
		scope: 'world',
		totalFrames: 3,
		totalBytes: 9,
		hasPrevious: false,
		hasNext: false,
		frames,
		...extra,
	}
}
function mount() {
	return render(
		<I18nProvider initialLocale="en">
			<MemoryRouter>
				<TimelapsePage memoryId={frame(1).id} />
			</MemoryRouter>
		</I18nProvider>
	)
}
async function ready() {
	await screen.findByText(/Capture 1 ·/)
	await waitFor(() => expect(screen.queryByText('Loading capture…')).toBeNull())
}
function deferred() {
	let resolve!: () => void
	const promise = new Promise<void>(done => {
		resolve = done
	})
	return { promise, resolve }
}
beforeEach(() => {
	vi.resetAllMocks()
	localStorage.clear()
	mocks.frames.mockResolvedValue(page())
	mocks.load.mockResolvedValue(undefined)
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
	)
})
afterEach(() => {
	cleanup()
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

test('navigation renders only recorded states, aligns their origins, preserves the camera and saves only completed captures', async () => {
	mount()
	await ready()
	expect(mocks.frames).toHaveBeenCalledWith(
		{ memoryId: frame(1).id, direction: 'around' },
		{ signal: expect.any(AbortSignal) }
	)
	expect(resumedFrame(seriesId)).toBe(frame(1).id)
	const pending = deferred()
	mocks.load.mockReturnValueOnce(pending.promise)
	fireEvent.click(screen.getByRole('button', { name: 'Next capture' }))
	await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2))
	expect(screen.getByText(/Capture 1 ·/)).toBeTruthy()
	expect(resumedFrame(seriesId)).toBe(frame(1).id)
	expect(mocks.context).toHaveBeenCalledTimes(1)
	await act(async () => pending.resolve())
	await screen.findByText(/Capture 2 ·/)
	expect(mocks.load.mock.calls[1]?.[1]).toMatchObject({ preserveView: true, originDelta: { x: 0, y: -1, z: 0 } })
	expect(resumedFrame(seriesId)).toBe(frame(2).id)
	fireEvent.click(screen.getByRole('button', { name: 'Recenter the camera' }))
	expect(mocks.reset).toHaveBeenCalledOnce()
})

test('fast slider changes abort parsing but wait before loading only the most recent selection', async () => {
	const mounted = mount()
	await ready()
	const pending = deferred()
	mocks.load.mockReturnValueOnce(pending.promise)
	fireEvent.change(screen.getByRole('slider'), { target: { value: '1' } })
	await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2))
	fireEvent.change(screen.getByRole('slider'), { target: { value: '2' } })
	expect(mocks.load.mock.calls[1]?.[1].signal.aborted).toBe(true)
	expect(mocks.load).toHaveBeenCalledTimes(2)
	await act(async () => pending.resolve())
	await screen.findByText(/Capture 3 ·/)
	expect(mocks.load).toHaveBeenCalledTimes(3)
	expect(mocks.context).toHaveBeenCalledTimes(2)
	mounted.unmount()
	expect(mocks.dispose).toHaveBeenCalledOnce()
})

test('download errors stop playback and retain the last valid date; retry loads the selected capture', async () => {
	mount()
	await ready()
	vi.mocked(fetch).mockRejectedValueOnce(new Error('Offline'))
	fireEvent.click(screen.getByRole('button', { name: 'Next capture' }))
	await screen.findByRole('alert')
	expect(screen.getByText(/Capture 1 ·/)).toBeTruthy()
	expect(resumedFrame(seriesId)).toBe(frame(1).id)
	fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
	await screen.findByText(/Capture 2 ·/)
	expect(screen.queryByRole('alert')).toBeNull()
})

test('resume fetches an owner-checked anchor page without preloading GLBs from its manifest', async () => {
	rememberFrame(seriesId, frame(8).id)
	mocks.frames.mockResolvedValueOnce(page()).mockResolvedValueOnce(page([frame(8), frame(9)]))
	mount()
	await screen.findByText(/Capture 8 ·/)
	expect(mocks.frames.mock.calls[1]?.[0]).toEqual({ memoryId: frame(1).id, anchorId: frame(8).id, direction: 'around' })
	expect(fetch).toHaveBeenCalledOnce()
	expect(screen.getByText('Resumed at your last displayed capture.')).toBeTruthy()
})

test('an unavailable resume anchor falls back to the selected capture and explains the fallback', async () => {
	rememberFrame(seriesId, frame(8).id)
	mocks.frames.mockResolvedValueOnce(page()).mockRejectedValueOnce(new Error('404'))
	mount()
	await ready()
	expect(screen.getByText('Your saved capture is unavailable. Opened the selected capture instead.')).toBeTruthy()
	expect(fetch).toHaveBeenCalledOnce()
})

test('page navigation uses the strict edge anchor, replaces the bounded manifest and cannot join a different series', async () => {
	mocks.frames
		.mockResolvedValueOnce(page([frame(1)], { hasNext: true, totalFrames: 4 }))
		.mockResolvedValueOnce(page([frame(4)], { hasPrevious: true, totalFrames: 4 }))
		.mockResolvedValueOnce(page([frame(5)], { seriesId: 'b'.repeat(64) }))
	mount()
	await ready()
	fireEvent.click(screen.getByRole('button', { name: 'Later captures' }))
	await screen.findByText(/Capture 4 ·/)
	expect(mocks.frames.mock.calls[1]?.[0]).toMatchObject({ direction: 'after', anchorId: frame(1).id })
	expect(screen.getByText('1 captures in this page')).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Earlier captures' }))
	await screen.findByRole('alert')
	expect(screen.getByText(/Capture 4 ·/)).toBeTruthy()
	expect(fetch).toHaveBeenCalledTimes(2)
})

test('denied timelines never fetch private files and offer an explicit retry', async () => {
	mocks.frames.mockRejectedValueOnce(new Error('Forbidden'))
	mount()
	await screen.findByRole('alert')
	expect(fetch).not.toHaveBeenCalled()
	fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
	await ready()
})

test('renderer startup failure is visible without issuing index or file requests', async () => {
	mocks.construct.mockImplementationOnce(() => {
		throw new Error('No WebGL')
	})
	mount()
	await screen.findByRole('alert')
	expect(screen.getByText('The 3D viewer could not start. Enable WebGL and reload this page.')).toBeTruthy()
	expect(mocks.frames).not.toHaveBeenCalled()
	expect(fetch).not.toHaveBeenCalled()
})

test('playback follows real captures at the selected cadence, crosses pages, and stops at the last recorded state', async () => {
	mocks.frames
		.mockResolvedValueOnce(page([frame(1), frame(2)], { hasNext: true }))
		.mockResolvedValueOnce(page([frame(3)], { hasPrevious: true }))
	mount()
	await ready()
	vi.useFakeTimers()
	fireEvent.change(screen.getByRole('combobox', { name: 'Seconds per capture' }), { target: { value: '1' } })
	fireEvent.click(screen.getByRole('button', { name: 'Play' }))
	await act(async () => {
		await vi.advanceTimersByTimeAsync(1000)
	})
	expect(screen.getByText(/Capture 2 ·/)).toBeTruthy()
	await act(async () => {
		await vi.advanceTimersByTimeAsync(1000)
	})
	expect(screen.getByText(/Capture 3 ·/)).toBeTruthy()
	expect(mocks.frames.mock.calls[1]?.[0]).toMatchObject({ anchorId: frame(2).id, direction: 'after' })
	await act(async () => {
		await vi.advanceTimersByTimeAsync(3000)
	})
	expect(mocks.load).toHaveBeenCalledTimes(3)
	expect(screen.getByRole('button', { name: 'Play' }).getAttribute('aria-pressed')).toBe('false')
})

test('pausing or hiding the page stops autoplay without advancing or inventing intermediate states', async () => {
	mount()
	await ready()
	vi.useFakeTimers()
	fireEvent.click(screen.getByRole('button', { name: 'Play' }))
	fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
	await act(async () => {
		await vi.advanceTimersByTimeAsync(10_000)
	})
	expect(mocks.load).toHaveBeenCalledOnce()
	fireEvent.click(screen.getByRole('button', { name: 'Play' }))
	Object.defineProperty(document, 'hidden', { configurable: true, value: true })
	fireEvent(document, new Event('visibilitychange'))
	await act(async () => {
		await vi.advanceTimersByTimeAsync(10_000)
	})
	expect(mocks.load).toHaveBeenCalledOnce()
	expect(screen.getByRole('button', { name: 'Play' }).getAttribute('aria-pressed')).toBe('false')
	Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})

test('closing during parsing aborts the load and cannot save the pending capture or update its environment', async () => {
	const mounted = mount()
	await ready()
	const pending = deferred()
	mocks.load.mockReturnValueOnce(pending.promise)
	fireEvent.click(screen.getByRole('button', { name: 'Next capture' }))
	await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2))
	mounted.unmount()
	expect(mocks.load.mock.calls[1]?.[1].signal.aborted).toBe(true)
	await act(async () => pending.resolve())
	expect(resumedFrame(seriesId)).toBe(frame(1).id)
	expect(mocks.context).toHaveBeenCalledOnce()
})

test('an exhausted page after deletion preserves the last rendered capture and explains how to refresh', async () => {
	mocks.frames
		.mockResolvedValueOnce(page([frame(1)], { hasNext: true }))
		.mockResolvedValueOnce(page([], { hasPrevious: true }))
	mount()
	await ready()
	fireEvent.click(screen.getByRole('button', { name: 'Later captures' }))
	await screen.findByText('No further capture is available. Reload to refresh the timeline.')
	expect(screen.getByText(/Capture 1 ·/)).toBeTruthy()
	expect(mocks.load).toHaveBeenCalledOnce()
})

test('pause remains available while autoplay is waiting for an in-flight GLB', async () => {
	mount()
	await ready()
	vi.useFakeTimers()
	const pending = deferred()
	mocks.load.mockReturnValueOnce(pending.promise)
	fireEvent.click(screen.getByRole('button', { name: 'Play' }))
	await act(async () => {
		await vi.advanceTimersByTimeAsync(2000)
	})
	const pause = screen.getByRole('button', { name: 'Pause' }) as HTMLButtonElement
	expect(pause.disabled).toBe(false)
	fireEvent.click(pause)
	await act(async () => pending.resolve())
	await act(async () => {
		await vi.advanceTimersByTimeAsync(10_000)
	})
	expect(mocks.load).toHaveBeenCalledTimes(2)
	expect(screen.getByText(/Capture 2 ·/)).toBeTruthy()
})
