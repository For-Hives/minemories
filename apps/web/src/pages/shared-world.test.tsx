// @vitest-environment jsdom
import type { SharedWorld, SharedWorldFrame } from '@minemories/api-contract'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import * as THREE from 'three'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { createCapture } from '../lib/world-evolution'
import { INVITE_DELAY_MS, SharePage } from './SharePage'

const mocks = vi.hoisted(() => ({
	shared: vi.fn(),
	restore: vi.fn(),
	status: vi.fn(),
	addLayer: vi.fn(),
	showWorld: vi.fn(),
	focusLayer: vi.fn(),
	glide: vi.fn(),
	minutes: vi.fn(),
	view: vi.fn(),
	hide: vi.fn(),
	weather: vi.fn(),
	context: vi.fn(),
	dispose: vi.fn(),
	track: vi.fn(),
}))
vi.mock('../api-client', () => ({
	apiBase: 'http://example.test',
	apiClient: {
		timelapse: { shared: mocks.shared },
		captureStorage: { restore: mocks.restore, status: mocks.status },
	},
}))
vi.mock('../observability/insight', () => ({ track: mocks.track }))
vi.mock('../viewer-scene', () => ({
	formatClock: (minutes: number) => String(minutes),
	ViewerScene: class {
		flight = { setControls: vi.fn(), setTouch: vi.fn(), onSpeedChange: null }
		addLayer = mocks.addLayer
		showWorld = mocks.showWorld
		focusLayer = mocks.focusLayer
		glideToLayer = mocks.glide
		setMinutes = mocks.minutes
		setLighting = vi.fn()
		setWeather = mocks.weather
		setCaptureContext = mocks.context
		applyView = mocks.view
		setCategoryVisible = mocks.hide
		dispose = mocks.dispose
		setFirstPerson = vi.fn()
		setTour = vi.fn()
		currentView = () => ({ camera: [10.5, 80, -4], target: [2, 64, 3] })
		categories = () => ['terrain', 'entities']
		isCategoryVisible = (category: string) => category !== 'entities'
	},
}))

const TOKEN = 'world-token-0123456789'
function frame(n: number): SharedWorldFrame {
	return {
		id: `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`,
		name: 'Lake base',
		size: 3,
		at: `2026-10-${String(n).padStart(2, '0')}T12:00:00Z`,
		timeSource: 'capture',
		captureStartedAt: null,
		captureFinishedAt: null,
		origin: { x: 10 * n, y: 64, z: 0 },
		bounds: { minX: 10 * n - 8, minY: 40, minZ: -8, maxX: 10 * n + 8, maxY: 88, maxZ: 8 },
		dayTime: 6000 * n,
		biome: 'minecraft:plains',
		seed: null,
		image: n === 1 ? 'data:image/png;base64,AA==' : null,
	}
}
const frames = [frame(1), frame(2), frame(3)]
function world(): SharedWorld {
	return {
		name: 'Lake base',
		dimension: 'minecraft:overworld',
		scope: 'world',
		totalFrames: 3,
		totalBytes: 9,
		frames,
		truncated: false,
	}
}
function layer(bounds: SharedWorldFrame['bounds']) {
	return { root: new THREE.Group(), capture: createCapture(bounds, []), meshes: [], lights: [] }
}
const meta = () =>
	Response.json({
		name: 'secret-file-name',
		place: 'Our lake',
		size: 3,
		id: frames[2]?.id,
		snapshots: frames.map(item => ({ id: item.id, at: item.at })),
		metadata: { x: null, y: null, z: null, dayTime: null, dimension: null, seed: null, biome: null },
	})
const glb = () => new Response(new Uint8Array([1, 2, 3]))
/** Each file request, by the snapshot it names. */
const fileRequests = () =>
	vi
		.mocked(fetch)
		.mock.calls.map(call => String(call[0]))
		.filter(url => url.includes('/file'))
		.map(url => new URL(url).searchParams.get('snapshot'))
const metaRequests = () =>
	vi
		.mocked(fetch)
		.mock.calls.map(call => String(call[0]))
		.filter(url => !url.includes('/file'))

function mount(query = '') {
	return render(
		<I18nProvider>
			<MemoryRouter initialEntries={[`/share/${TOKEN}${query}`]}>
				<Routes>
					<Route path="/share/:token" element={<SharePage />} />
				</Routes>
			</MemoryRouter>
		</I18nProvider>
	)
}
const film = () => screen.getAllByRole('button', { name: /^Lake base · / })
const current = () => film().findIndex(item => item.getAttribute('aria-current') === 'step')
const loaded = () => screen.queryAllByRole('button', { name: /· Chargée$/ }).length

beforeEach(() => {
	vi.resetAllMocks()
	localStorage.clear()
	mocks.shared.mockResolvedValue(world())
	mocks.addLayer.mockImplementation(async (_file: File, capture: { bounds: SharedWorldFrame['bounds'] }) =>
		layer(capture.bounds)
	)
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string | URL | Request) => (String(url).includes('/file') ? glb() : meta()))
	)
})
afterEach(() => {
	cleanup()
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

test('a world link opens the composed world with the owner’s film, without file names or the owner’s links', async () => {
	mount()
	await waitFor(() => expect(loaded()).toBe(3))
	expect(mocks.shared).toHaveBeenCalledWith({ token: TOKEN }, { signal: expect.any(AbortSignal) })
	// Every capture joins one scene at its own place; none of them replaces another.
	expect(mocks.addLayer.mock.calls.map(call => call[1].offset)).toEqual([
		{ x: 0, y: 0, z: 0 },
		{ x: 10, y: 0, z: 0 },
		{ x: 20, y: 0, z: 0 },
	])
	expect(new Set(fileRequests())).toEqual(new Set(frames.map(item => item.id)))
	// Only the page's first request asks what the link is: the opening is counted once.
	expect(metaRequests()).toEqual([`http://example.test/api/shared/${TOKEN}`])
	await waitFor(() => expect(mocks.track).toHaveBeenCalledWith('viewer-open', { source: 'share' }))
	expect(screen.getByRole('heading', { name: 'Our lake' })).toBeTruthy()
	// the title stands alone: no "minemories / SHARED WORLD" crumb above it
	expect(document.querySelector('.cinema-title')?.textContent).toBe('Our lake')
	expect(screen.getByRole('link', { name: 'Minemories' }).getAttribute('href')).toBe('/')
	expect(document.body.textContent).not.toContain('secret-file-name')
	expect(screen.queryByRole('link', { name: /Ouvrir seule/ })).toBeNull()
	expect(document.querySelector('.film-thumb')?.getAttribute('style')).toContain('data:image/png;base64,AA==')
	// It opens on the oldest capture, so Play shows the place growing; the next one glides the camera there.
	expect(current()).toBe(0)
	fireEvent.click(screen.getByRole('button', { name: 'Capture suivante' }))
	expect(current()).toBe(1)
	expect(mocks.glide).toHaveBeenCalledTimes(1)
	expect(mocks.addLayer).toHaveBeenCalledTimes(3)
})

test('the visitor is welcomed with the count and Play, then invited after 10 s', async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	mount()
	await waitFor(() => expect(loaded()).toBe(3))
	const welcome = document.querySelector('[data-share="welcome"]')
	expect(welcome?.textContent).toBe(
		'Un lieu Minecraft en 3D, partagé avec toi. Fais glisser pour tourner autour. 3 souvenirs de ce lieu. Appuie sur Lire pour le voir changer.'
	)
	// Once the scene's effects have run (the opening is counted), the invitation's clock is running.
	await waitFor(() => expect(mocks.track).toHaveBeenCalled())
	act(() => vi.advanceTimersByTime(INVITE_DELAY_MS))
	expect(screen.getByRole('link', { name: 'Tu veux la même chose pour ta base ? →' }).getAttribute('href')).toBe(
		'/installation?src=share'
	)
	expect(document.querySelector('[data-share="welcome"]')).toBeNull()
})

test('a link carrying a view opens on its capture, hour, layers and camera, and passes the shown capture on', async () => {
	mount(`?cam=1,2,3&at=4,5,6&time=17:30&weather=rain&hide=entities&snap=${frames[1]?.id}`)
	await waitFor(() => expect(mocks.view).toHaveBeenCalledWith([1, 2, 3], [4, 5, 6]))
	expect(current()).toBe(1)
	// The camera lands on the linked capture once it is framed, and the link's hour comes after the capture's own.
	expect(mocks.focusLayer.mock.invocationCallOrder[0]).toBeLessThan(mocks.view.mock.invocationCallOrder[0] as number)
	expect(mocks.minutes.mock.calls.at(-1)).toEqual([1050])
	expect(mocks.hide).toHaveBeenCalledWith('entities', false)
	await waitFor(() => expect(mocks.weather).toHaveBeenCalledWith('rain'))
	const writeText = vi.fn().mockResolvedValue(undefined)
	vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
	fireEvent.click(screen.getByRole('button', { name: 'Capture suivante' }))
	fireEvent.click(screen.getByRole('button', { name: 'Copier le lien de cette vue' }))
	await waitFor(() => expect(writeText).toHaveBeenCalled())
	const copied = new URL(writeText.mock.calls[0]?.[0] as string)
	expect(Object.fromEntries(copied.searchParams)).toMatchObject({
		cam: '10.5,80,-4',
		at: '2,64,3',
		hide: 'entities',
		snap: frames[2]?.id,
	})
})

test('an archived capture is restored in place by the visitor, then joins the world', async () => {
	const cold = { state: 'cold', readyObjects: 0, totalObjects: 1, restorationAvailable: true, retryAfterSeconds: 5 }
	const archived = frames[1]?.id as string
	let restored = false
	vi.mocked(fetch).mockImplementation(async url => {
		const address = String(url)
		if (!address.includes('/file')) return meta()
		if (address.includes(archived) && !restored) return Response.json({ availability: cold }, { status: 202 })
		return glb()
	})
	mocks.restore.mockImplementation(async () => {
		restored = true
		return { ...cold, state: 'ready', readyObjects: 1 }
	})
	mount()
	await waitFor(() => expect(loaded()).toBe(2))
	expect(mocks.restore).not.toHaveBeenCalled()
	const restore = await screen.findByRole('button', { name: 'Restaurer le souvenir · Lake base' })
	expect(film()[1]?.getAttribute('aria-label')).toContain('Archivée : restaure-la pour la voir')
	fireEvent.click(restore)
	// The restoration card asks before anything is restored, as on a capture opened alone.
	await screen.findByRole('heading', { name: 'Ce souvenir est archivé.' })
	expect(current()).toBe(1)
	fireEvent.click(screen.getByRole('button', { name: 'Restaurer le souvenir' }))
	await waitFor(() => expect(loaded()).toBe(3))
	expect(mocks.restore).toHaveBeenCalledWith(
		{ kind: 'shared', token: TOKEN, snapshot: archived },
		expect.objectContaining({ signal: expect.any(AbortSignal) })
	)
	expect(screen.queryByRole('heading', { name: 'Ce souvenir est archivé.' })).toBeNull()
})

test('a world that cannot be loaded says so and loads again on Retry', async () => {
	mocks.shared.mockRejectedValueOnce(new Error('Service unavailable'))
	mount()
	expect(await screen.findByText('Ce monde partagé n’a pas pu se charger. Réessaie.')).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
	await waitFor(() => expect(loaded()).toBe(3))
	expect(metaRequests()).toHaveLength(1)
})
