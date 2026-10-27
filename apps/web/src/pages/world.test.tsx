// @vitest-environment jsdom
import type { TemporalFrame, WorldEvolution } from '@minemories/api-contract'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import * as THREE from 'three'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { createCapture } from '../lib/world-evolution'
import { WorldPage } from './WorldPage'

const mocks = vi.hoisted(() => ({
	world: vi.fn(),
	addLayer: vi.fn(),
	showWorld: vi.fn(),
	focusLayer: vi.fn(),
	context: vi.fn(),
	dispose: vi.fn(),
	construct: vi.fn(),
}))
vi.mock('../api-client', () => ({ apiBase: 'http://example.test', apiClient: { timelapse: { world: mocks.world } } }))
vi.mock('../viewer-scene', () => ({
	ViewerScene: class {
		constructor() {
			mocks.construct()
		}
		addLayer = mocks.addLayer
		showWorld = mocks.showWorld
		focusLayer = mocks.focusLayer
		setCaptureContext = mocks.context
		dispose = mocks.dispose
	},
}))

function frame(n: number, size = 3): TemporalFrame {
	return {
		id: `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`,
		name: `Capture ${n}`,
		size,
		at: `2026-10-${String(n).padStart(2, '0')}T12:00:00Z`,
		timeSource: 'capture',
		captureStartedAt: null,
		captureFinishedAt: null,
		origin: { x: 10 * n, y: 64, z: 0 },
		bounds: { minX: 10 * n - 8, minY: 40, minZ: -8, maxX: 10 * n + 8, maxY: 88, maxZ: 8 },
		dayTime: 6000,
		biome: 'minecraft:plains',
		seed: null,
	}
}
function evolution(frames = [frame(1), frame(2), frame(3)], extra: Partial<WorldEvolution> = {}): WorldEvolution {
	return {
		worldKey: 'a'.repeat(64),
		name: 'My village',
		dimension: 'minecraft:overworld',
		scope: 'world',
		totalFrames: frames.length,
		totalBytes: frames.reduce((total, item) => total + item.size, 0),
		frames,
		truncated: false,
		...extra,
	}
}
function layer(bounds: TemporalFrame['bounds']) {
	const light = { position: new THREE.Vector3(0, 0, 0), color: new THREE.Color(), intensity: 1, distance: 4 }
	return { root: new THREE.Group(), capture: createCapture(bounds, []), meshes: [], lights: [light] }
}
function mount() {
	return render(
		<I18nProvider initialLocale="en">
			<MemoryRouter>
				<WorldPage memoryId={frame(1).id} />
			</MemoryRouter>
		</I18nProvider>
	)
}
const flush = () => act(async () => await new Promise(resolve => setTimeout(resolve, 0)))

beforeEach(() => {
	vi.resetAllMocks()
	mocks.world.mockResolvedValue(evolution())
	mocks.addLayer.mockImplementation(async (_file: File, capture: { bounds: TemporalFrame['bounds'] }) =>
		layer(capture.bounds)
	)
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

test('loads every capture of the world oldest first, aligns origins and starts on the oldest state', async () => {
	mount()
	await screen.findByText('3 of 3 captures loaded', { exact: false })
	expect(mocks.world).toHaveBeenCalledWith({ memoryId: frame(1).id }, { signal: expect.any(AbortSignal) })
	expect(mocks.addLayer.mock.calls.map(call => call[1].offset)).toEqual([
		{ x: 0, y: 0, z: 0 },
		{ x: 10, y: 0, z: 0 },
		{ x: 20, y: 0, z: 0 },
	])
	expect(mocks.context).toHaveBeenCalledWith(expect.objectContaining({ x: 10, dimension: 'minecraft:overworld' }))
	const items = screen.getAllByRole('button', { name: /Capture \d/ })
	expect(items.map(item => item.textContent)).toEqual([
		expect.stringContaining('Capture 1'),
		expect.stringContaining('Capture 2'),
		expect.stringContaining('Capture 3'),
	])
	expect(items[0]?.getAttribute('aria-current')).toBe('step')
	expect(screen.getAllByText(/Loaded · 0 chunks/)).toHaveLength(3)
	expect(mocks.showWorld.mock.lastCall?.[0]).toHaveLength(1)
	fireEvent.click(screen.getByRole('button', { name: 'Next capture' }))
	expect(screen.getByRole('button', { name: /Capture 2/ }).getAttribute('aria-current')).toBe('step')
	expect(mocks.showWorld.mock.lastCall?.[0]).toHaveLength(2)
	fireEvent.click(screen.getByRole('button', { name: /Capture 3/ }))
	expect(screen.getByRole('button', { name: 'Next capture' })).toHaveProperty('disabled', true)
	fireEvent.click(screen.getByRole('button', { name: 'Previous capture' }))
	fireEvent.change(screen.getByLabelText('Moment of the world'), { target: { value: '0' } })
	expect(screen.getByRole('button', { name: 'Previous capture' })).toHaveProperty('disabled', true)
	fireEvent.click(screen.getByRole('button', { name: 'Recenter the camera' }))
	expect(mocks.focusLayer).toHaveBeenCalledTimes(1)
	expect(screen.getAllByRole('link', { name: 'Open alone' })[1]?.getAttribute('href')).toBe(
		`/viewer?memory=${frame(2).id}`
	)
})

test('playback waits for pending captures, stops at the end and pauses when the tab is hidden', async () => {
	let release!: () => void
	const gate = new Promise<void>(resolve => {
		release = resolve
	})
	mocks.addLayer
		.mockImplementationOnce(async (_file: File, capture: { bounds: TemporalFrame['bounds'] }) => layer(capture.bounds))
		.mockImplementationOnce(async (_file: File, capture: { bounds: TemporalFrame['bounds'] }) => {
			await gate
			return layer(capture.bounds)
		})
	mount()
	await screen.findByText('1 of 3 captures loaded', { exact: false })
	vi.useFakeTimers()
	fireEvent.change(screen.getByLabelText('Seconds per capture'), { target: { value: '0.5' } })
	fireEvent.click(screen.getByRole('button', { name: 'Play' }))
	await act(async () => vi.advanceTimersByTime(2000))
	expect(screen.getByRole('button', { name: /Capture 1/ }).getAttribute('aria-current')).toBe('step')
	fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
	vi.useRealTimers()
	release()
	await screen.findByText('3 of 3 captures loaded', { exact: false })
	vi.useFakeTimers()
	fireEvent.click(screen.getByRole('button', { name: 'Play' }))
	await act(async () => vi.advanceTimersByTime(600))
	expect(screen.getByRole('button', { name: /Capture 2/ }).getAttribute('aria-current')).toBe('step')
	Object.defineProperty(document, 'hidden', { configurable: true, value: true })
	act(() => {
		document.dispatchEvent(new Event('visibilitychange'))
	})
	expect(screen.getByRole('button', { name: 'Play' }).getAttribute('aria-pressed')).toBe('false')
	Object.defineProperty(document, 'hidden', { configurable: true, value: false })
	act(() => {
		document.dispatchEvent(new Event('visibilitychange'))
	})
	fireEvent.click(screen.getByRole('button', { name: 'Play' }))
	await act(async () => vi.advanceTimersByTime(600))
	await act(async () => vi.advanceTimersByTime(600))
	expect(screen.getByRole('button', { name: /Capture 3/ }).getAttribute('aria-current')).toBe('step')
	expect(screen.getByRole('button', { name: 'Play' }).getAttribute('aria-pressed')).toBe('false')
})

test('budget, archived and failed captures are explained and a failed capture can be retried', async () => {
	const huge = 800 * 1024 * 1024
	mocks.world.mockResolvedValue(evolution([frame(1, huge), frame(2, 3), frame(3, 3), frame(4, 3)], { truncated: true }))
	const fetch = vi
		.fn<typeof globalThis.fetch>()
		.mockResolvedValueOnce(
			Response.json(
				{
					availability: {
						state: 'cold',
						readyObjects: 0,
						totalObjects: 1,
						restorationAvailable: true,
						retryAfterSeconds: null,
					},
				},
				{ status: 202 }
			)
		)
		.mockResolvedValueOnce(new Response('missing', { status: 404 }))
		.mockImplementation(async () => new Response(new Uint8Array([1, 2, 3])))
	vi.stubGlobal('fetch', fetch)
	mount()
	await screen.findByText('Archived — open it alone to restore it', { exact: false })
	await screen.findByText('Could not load')
	expect(screen.getByText('Only the most recent captures are loaded to keep the viewer fast.')).toBeTruthy()
	expect(screen.getByText('Not loaded')).toBeTruthy()
	expect(screen.getByRole('button', { name: /Capture 2/ }).getAttribute('aria-current')).toBe('step')
	await screen.findByText('1 of 4 captures loaded', { exact: false })
	fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
	await screen.findByText('2 of 4 captures loaded', { exact: false })
})

test('an unavailable world can be retried and a missing WebGL context is reported', async () => {
	mocks.world.mockRejectedValueOnce(new Error('offline'))
	const view = mount()
	await screen.findByText('This world is unavailable. Sign in as its owner, or return to your gallery.')
	fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
	await screen.findByText('3 of 3 captures loaded', { exact: false })
	view.unmount()
	expect(mocks.dispose).toHaveBeenCalledTimes(2)
	mocks.construct.mockImplementation(() => {
		throw new Error('no webgl')
	})
	mount()
	await screen.findByText('The 3D viewer could not start. Enable WebGL and reload this page.')
	await flush()
	expect(mocks.world).toHaveBeenCalledTimes(2)
})

test('leaving the page cancels pending loads', async () => {
	let resolveWorld!: (value: WorldEvolution) => void
	mocks.world.mockReturnValue(
		new Promise<WorldEvolution>(resolve => {
			resolveWorld = resolve
		})
	)
	const view = mount()
	await waitFor(() => expect(mocks.world).toHaveBeenCalled())
	view.unmount()
	resolveWorld(evolution())
	await flush()
	expect(mocks.addLayer).not.toHaveBeenCalled()
})
