// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { INVITE_DELAY_MS, SharePage } from './SharePage'

const mocks = vi.hoisted(() => ({
	get: vi.fn(),
	review: vi.fn(),
	load: vi.fn(),
	dispose: vi.fn(),
	context: vi.fn(),
	restore: vi.fn(),
	status: vi.fn(),
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
		constructor(_canvas: HTMLCanvasElement, events: NonNullable<typeof mocks.events>) {
			mocks.events = events
		}
		loadFile = mocks.load
		dispose = mocks.dispose
		setCaptureContext = mocks.context
		setMinutes = vi.fn()
		setLighting = vi.fn()
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
	await screen.findByText('Ce souvenir est indisponible ou son accès a été révoqué.')
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
	fireEvent.click(screen.getByRole('button', { name: 'Restaurer le souvenir' }))
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
	expect(await screen.findByText('Ce lien a été arrêté par la personne qui l’avait partagé.')).toBeTruthy()
	expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
	expect(screen.getByRole('link', { name: /Toi aussi, garde tes mondes/ }).getAttribute('href')).toBe(
		'/installation?src=share'
	)
	expect(document.body.textContent).not.toMatch(/expir/i)
	// Nothing will come back: no "will have to wait" heading over the sentence.
	expect(screen.queryByText('Ce souvenir attendra un instant.')).toBeNull()
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

test('a world link welcomes the visitor with the real count, then invites them after 10 s', async () => {
	const snapshots = ['a', 'b', 'c'].map((id, index) => ({ id, at: `2026-0${index + 1}-01T12:00:00Z` }))
	vi.mocked(fetch).mockImplementation(async url =>
		String(url).includes('/file') ? glb() : sharedMeta({ id: 'c', snapshots })
	)
	mount('/share/world-token-0123456789', false)
	await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1))
	// Nothing shows over the scene before it is on screen.
	expect(document.querySelector('[data-share]')).toBeNull()
	vi.useFakeTimers()
	try {
		sceneReady()
		const welcome = document.querySelector('[data-share="welcome"]')
		expect(welcome?.textContent).toBe(
			'Un lieu Minecraft en 3D, partagé avec toi. Fais glisser pour tourner autour. 3 souvenirs de ce lieu. Fais glisser le curseur pour le voir changer.'
		)
		expect(screen.queryByRole('link', { name: /Toi aussi/ })).toBeNull()
		act(() => vi.advanceTimersByTime(INVITE_DELAY_MS - 1))
		expect(screen.queryByRole('link', { name: /Toi aussi/ })).toBeNull()
		act(() => vi.advanceTimersByTime(1))
		expect(screen.getByRole('link', { name: 'Toi aussi, garde tes mondes →' }).getAttribute('href')).toBe(
			'/installation?src=share'
		)
		expect(document.querySelector('[data-share="welcome"]')).toBeNull()
		expect(screen.queryByRole('link', { name: 'Voir d’autres lieux' })).toBeNull()
	} finally {
		vi.useRealTimers()
	}
})

test('a single memory link says no count, and the first gesture on the scene brings the invitation', async () => {
	vi.mocked(fetch).mockImplementation(async url => (String(url).includes('/file') ? glb() : sharedMeta()))
	mount('/share/single-token-0123456789', false)
	await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1))
	sceneReady()
	expect(document.querySelector('[data-share="welcome"]')?.textContent).not.toMatch(/souvenirs? de ce lieu/)
	fireEvent.pointerDown(screen.getByLabelText('Scène 3D partagée'))
	expect(screen.getByRole('link', { name: 'Toi aussi, garde tes mondes →' })).toBeTruthy()
})

test('a public memory says it was reviewed, invites with its own source and leads to other places', async () => {
	mount()
	await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1))
	sceneReady()
	expect(document.querySelector('[data-share="welcome"]')?.textContent).toContain(
		'Publié par son auteur, relu avant publication.'
	)
	fireEvent.wheel(screen.getByLabelText('Scène 3D partagée'))
	expect(screen.getByRole('link', { name: 'Toi aussi, garde tes mondes →' }).getAttribute('href')).toBe(
		'/installation?src=public'
	)
	expect(screen.getByRole('link', { name: 'Voir d’autres lieux' }).getAttribute('href')).toBe('/explore')
})

test('a candidate under review is never called reviewed and carries no invitation', async () => {
	mount('/public/11111111-1111-4111-8111-111111111111?review=1')
	await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1))
	sceneReady()
	fireEvent.pointerDown(screen.getByLabelText('Scène 3D partagée'))
	expect(document.querySelector('[data-share]')).toBeNull()
	expect(document.body.textContent).not.toContain('relu avant publication')
})
