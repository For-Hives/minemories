// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
		loadFile = mocks.load
		dispose = mocks.dispose
		setCaptureContext = mocks.context
		setMinutes = vi.fn()
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
	mocks.review.mockResolvedValue({ title: 'Candidat à examiner' })
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
	await screen.findByRole('heading', { name: 'Candidat à examiner' })
	expect(mocks.review).toHaveBeenCalled()
	expect(mocks.get).not.toHaveBeenCalled()
	expect(screen.getByRole('link', { name: 'Retour à la modération' }).getAttribute('href')).toBe('/moderation')
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
				name: 'Partage privé',
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
	await screen.findByRole('heading', { name: 'Partage privé' })
	await waitFor(() => expect(mocks.load).toHaveBeenCalled())
	expect(fetch).toHaveBeenNthCalledWith(2, 'http://example.test/api/shared/private-token/file', expect.anything())
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
