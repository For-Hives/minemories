// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { SharePage } from './SharePage'

const mocks = vi.hoisted(() => ({
	get: vi.fn(),
	review: vi.fn(),
	load: vi.fn(),
	dispose: vi.fn(),
	context: vi.fn(),
	restore: vi.fn(),
	status: vi.fn(),
	minutes: vi.fn(),
	view: vi.fn(),
	weather: vi.fn(),
	hide: vi.fn(),
	events: null as null | { onEmptyChange(empty: boolean): void; onLoading(message: string | null): void },
}))
vi.mock('../api-client', () => ({
	apiBase: 'http://example.test',
	apiClient: {
		discovery: { get: mocks.get, review: mocks.review },
		captureStorage: { restore: mocks.restore, status: mocks.status },
	},
}))
vi.mock('../viewer-scene', () => ({
	formatClock: () => '',
	ViewerScene: class {
		flight = { setControls: vi.fn(), setTouch: vi.fn(), onSpeedChange: null }
		constructor(_canvas: HTMLCanvasElement, events: NonNullable<typeof mocks.events>) {
			mocks.events = events
		}
		loadFile = mocks.load
		dispose = mocks.dispose
		setCaptureContext = mocks.context
		setMinutes = mocks.minutes
		setLighting = vi.fn()
		setWeather = mocks.weather
		applyView = mocks.view
		setCategoryVisible = mocks.hide
		currentView = () => ({ camera: [10.5, 80, -4], target: [2, 64, 3] })
		categories = () => ['terrain', 'entities']
		isCategoryVisible = (category: string) => category !== 'entities'
	},
}))
function mount(path = '/public/11111111-1111-4111-8111-111111111111', isPublic = true) {
	return render(
		<I18nProvider>
			<MemoryRouter initialEntries={[path]}>
				<Routes>
					<Route path={isPublic ? '/public/:id' : '/share/:token'} element={<SharePage isPublic={isPublic} />} />
				</Routes>
			</MemoryRouter>
		</I18nProvider>
	)
}
beforeEach(() => {
	vi.clearAllMocks()
	localStorage.clear()
	mocks.get.mockResolvedValue({ title: 'Mon village public' })
	mocks.review.mockResolvedValue({ title: 'Candidate to review' })
	mocks.load.mockResolvedValue(undefined)
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 })))
})
afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})
test('public viewer downloads the approved file and receives no private capture context', async () => {
	const view = mount()
	await screen.findByRole('heading', { name: 'Mon village public' })
	await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1))
	expect(mocks.load.mock.calls[0]?.[0].name).toBe('public.glb')
	expect(mocks.context).toHaveBeenCalledWith({
		x: null,
		y: null,
		z: null,
		dayTime: null,
		dimension: null,
		seed: null,
		biome: null,
	})
	expect(fetch).toHaveBeenCalledWith(
		expect.stringContaining('/api/public/11111111-1111-4111-8111-111111111111/file'),
		expect.objectContaining({ credentials: 'include' })
	)
	expect(mocks.review).not.toHaveBeenCalled()
	view.unmount()
	expect(mocks.dispose).toHaveBeenCalledTimes(1)
})
test('review mode uses the protected review procedure and returns to moderation', async () => {
	mount('/public/11111111-1111-4111-8111-111111111111?review=1')
	await screen.findByRole('heading', { name: 'Candidate to review' })
	expect(mocks.review).toHaveBeenCalled()
	expect(mocks.get).not.toHaveBeenCalled()
	expect(screen.getByRole('link', { name: 'Retour à la modération' }).getAttribute('href')).toBe('/admin/moderation')
})
test('a refused review never requests the file', async () => {
	mocks.review.mockRejectedValueOnce(new Error('Forbidden'))
	mount('/public/11111111-1111-4111-8111-111111111111?review=1')
	await screen.findByRole('alert')
	expect(fetch).not.toHaveBeenCalled()
	expect(mocks.load).not.toHaveBeenCalled()
})
test('a revoked file after catalogue lookup is shown as unavailable', async () => {
	vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }))
	mount()
	await screen.findByText('Ce souvenir n’existe plus, ou son lien a été coupé.')
	expect(mocks.load).not.toHaveBeenCalled()
})
test('private shared links retain their existing metadata and file route', async () => {
	vi.mocked(fetch).mockResolvedValueOnce(
		new Response(
			JSON.stringify({
				name: 'Private share',
				size: 3,
				metadata: {
					x: 1,
					y: 2,
					z: 3,
					dayTime: null,
					dimension: 'minecraft:overworld',
					seed: 'chosen',
					biome: 'plains',
				},
			}),
			{ status: 200 }
		)
	)
	mount('/share/private-token', false)
	await screen.findByRole('heading', { name: 'Private share' })
	await waitFor(() => expect(mocks.load).toHaveBeenCalled())
	expect(fetch).toHaveBeenNthCalledWith(
		2,
		'http://example.test/api/shared/private-token/file?variant=meshopt',
		expect.anything()
	)
	expect(mocks.get).not.toHaveBeenCalled()
})

test('public viewer displays a cold capture in French and restores only after the explicit action', async () => {
	const cold = { state: 'cold', readyObjects: 0, totalObjects: 1, restorationAvailable: true, retryAfterSeconds: 5 }
	vi.mocked(fetch).mockResolvedValueOnce(Response.json({ availability: cold }, { status: 202 }))
	mocks.restore.mockResolvedValue({ ...cold, state: 'ready', readyObjects: 1 })
	mount()
	await screen.findByRole('heading', { name: 'Ce souvenir est archivé.' })
	expect(mocks.load).not.toHaveBeenCalled()
	expect(mocks.restore).not.toHaveBeenCalled()
	fireEvent.click(screen.getByRole('button', { name: 'Le récupérer' }))
	await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1))
	expect(mocks.restore).toHaveBeenCalledWith(
		{ kind: 'public', id: '11111111-1111-4111-8111-111111111111' },
		expect.objectContaining({ signal: expect.any(AbortSignal) })
	)
	expect(screen.queryByRole('heading', { name: 'Ce souvenir est archivé.' })).toBeNull()
})

test('an owner-chosen capture title is displayed verbatim even when it matches a translated UI key', async () => {
	mocks.get.mockResolvedValueOnce({ title: 'Sign in' })
	mount()
	await screen.findByRole('heading', { name: 'Sign in' })
	expect(screen.queryByRole('heading', { name: 'Se connecter' })).toBeNull()
})

const glb = () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })
const sharedMeta = (extra: Record<string, unknown> = {}) =>
	Response.json({
		name: 'Our village',
		size: 3,
		metadata: { x: null, y: null, z: null, dayTime: null, dimension: null, seed: null, biome: null },
		...extra,
	})
/** What the real scene reports once the file is on screen. */
function sceneReady() {
	act(() => {
		mocks.events?.onEmptyChange(false)
		mocks.events?.onLoading(null)
	})
}

test('a stopped link says who stopped it, offers no Retry and points to the guide', async () => {
	vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: 'memory_not_found' }, { status: 404 }))
	mount('/share/stopped-token-0123456789', false)
	expect(await screen.findByText('La personne qui a partagé ce lien l’a désactivé.')).toBeTruthy()
	expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
	// no base is on screen, so the invitation does not say "the same"
	expect(screen.getByRole('link', { name: 'Fais pareil avec ta base →' }).getAttribute('href')).toBe(
		'/installation?src=share'
	)
	expect(screen.queryByRole('link', { name: /la même chose/ })).toBeNull()
	expect(document.body.textContent).not.toMatch(/expir/i)
	// Nothing will come back: no "will have to wait" heading over the sentence.
	expect(screen.queryByText('Impossible d’ouvrir ce souvenir.')).toBeNull()
})

test.each([
	['an unreachable API', () => Promise.reject(new TypeError('Failed to fetch'))],
	['a server failure', () => Promise.resolve(new Response(null, { status: 502 }))],
])('%s is a network error with Retry, which loads the link again', async (_name, failure) => {
	vi.mocked(fetch).mockImplementationOnce(failure)
	mount('/share/flaky-token-0123456789', false)
	expect(await screen.findByText('On n’arrive pas à charger la scène. Réessaie dans un moment.')).toBeTruthy()
	expect(screen.queryByText(/arrêté/)).toBeNull()
	vi.mocked(fetch).mockImplementation(async url => (String(url).includes('/file') ? glb() : sharedMeta()))
	fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
	await screen.findByRole('heading', { name: 'Our village' })
	await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1))
	expect(screen.queryByRole('alert')).toBeNull()
})

test('a storage outage on the file is a network error too, not a revoked link', async () => {
	vi.mocked(fetch).mockImplementation(async url =>
		String(url).includes('/file') ? new Response(null, { status: 503 }) : sharedMeta()
	)
	mount('/share/outage-token-0123456789', false)
	expect(await screen.findByText('On n’arrive pas à charger la scène. Réessaie dans un moment.')).toBeTruthy()
	expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy()
})

test('a single memory link says no count, and the first gesture on the scene brings the invitation', async () => {
	vi.mocked(fetch).mockImplementation(async url => (String(url).includes('/file') ? glb() : sharedMeta()))
	mount('/share/single-token-0123456789', false)
	await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1))
	sceneReady()
	expect(document.querySelector('[data-share="welcome"]')?.textContent).not.toMatch(/souvenirs? de ce lieu/)
	fireEvent.pointerDown(screen.getByLabelText('Scène 3D partagée'))
	expect(screen.getByRole('link', { name: 'Fais pareil avec ta base →' })).toBeTruthy()
})

test('a public memory shows the drag hint, invites with its own source and leads to other places', async () => {
	mount()
	await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1))
	sceneReady()
	expect(document.querySelector('[data-share="welcome"]')?.textContent).toBe('Glisse pour regarder.')
	fireEvent.wheel(screen.getByLabelText('Scène 3D partagée'))
	expect(screen.getByRole('link', { name: 'Fais pareil avec ta base →' }).getAttribute('href')).toBe(
		'/installation?src=public'
	)
	expect(screen.getByRole('link', { name: 'Voir d’autres lieux' }).getAttribute('href')).toBe('/explore')
})

test('a candidate under review carries no welcome and no invitation', async () => {
	mount('/public/11111111-1111-4111-8111-111111111111?review=1')
	await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1))
	sceneReady()
	fireEvent.pointerDown(screen.getByLabelText('Scène 3D partagée'))
	expect(document.querySelector('[data-share]')).toBeNull()
})

test('a link carrying a view opens that hour, weather, layers and camera, once', async () => {
	vi.mocked(fetch).mockImplementation(async url =>
		String(url).includes('/file') ? glb() : sharedMeta({ metadata: { dayTime: 1000 } })
	)
	mount('/share/view-token-0123456789?cam=1,2,3&at=4,5,6&time=17:30&weather=rain&hide=entities', false)
	await waitFor(() => expect(mocks.view).toHaveBeenCalledWith([1, 2, 3], [4, 5, 6]))
	// The link is asked about once: its answer is reused for the file, so the opening is counted once.
	expect(vi.mocked(fetch).mock.calls.map(call => String(call[0]))).toEqual([
		'http://example.test/api/shared/view-token-0123456789',
		'http://example.test/api/shared/view-token-0123456789/file?variant=meshopt',
	])
	expect(mocks.hide).toHaveBeenCalledWith('entities', false)
	// The link's hour comes after the capture's own.
	expect(mocks.minutes.mock.calls.at(-1)).toEqual([1050])
	expect(mocks.load.mock.invocationCallOrder[0]).toBeLessThan(mocks.view.mock.invocationCallOrder[0] as number)
	sceneReady()
	await waitFor(() => expect(mocks.weather).toHaveBeenCalledWith('rain'))
	// The visitor can pass their own view on: this page's address with the current view.
	const writeText = vi.fn().mockResolvedValue(undefined)
	vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
	fireEvent.click(screen.getByRole('button', { name: 'Copier le lien de cette vue' }))
	await waitFor(() => expect(writeText).toHaveBeenCalled())
	const copied = new URL(writeText.mock.calls[0]?.[0] as string)
	expect(Object.fromEntries(copied.searchParams)).toMatchObject({
		cam: '10.5,80,-4',
		at: '2,64,3',
		weather: 'rain',
		hide: 'entities',
	})
	// A capture link has no snapshot to point at.
	expect(copied.searchParams.has('snap')).toBe(false)
	expect(await screen.findByText('Lien de cette vue copié.')).toBeTruthy()
})

test('a link without a view keeps the default framing and the capture’s hour', async () => {
	vi.mocked(fetch).mockImplementation(async url => (String(url).includes('/file') ? glb() : sharedMeta()))
	mount('/share/plain-token-0123456789?cam=1,2,3', false)
	await waitFor(() => expect(mocks.load).toHaveBeenCalled())
	expect(mocks.view).not.toHaveBeenCalled()
	expect(mocks.hide).not.toHaveBeenCalled()
	expect(fetch).toHaveBeenNthCalledWith(1, 'http://example.test/api/shared/plain-token-0123456789', expect.anything())
})

test('a shared link is titled with the name its owner gave the place, else the capture’s', async () => {
	vi.mocked(fetch).mockImplementation(async url =>
		String(url).includes('/file') ? glb() : sharedMeta({ place: 'Lalaland, our town' })
	)
	mount('/share/placed-token-0123456789', false)
	expect(await screen.findByRole('heading', { name: 'Lalaland, our town' })).toBeTruthy()
})
