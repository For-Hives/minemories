// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { SharePanel } from './SharePanel'

const api = vi.hoisted(() => ({
	// A capture without a temporal identity has no world to link to: that status call fails.
	shareStatus: vi.fn(
		({ scope }: { scope: string }): Promise<{ shared: boolean; urlPath?: string }> =>
			scope === 'world' ? Promise.reject(new Error('NOT_FOUND')) : Promise.resolve({ shared: false })
	),
	createShare: vi.fn().mockResolvedValue({ urlPath: '/shared/proof' }),
	revokeShare: vi.fn().mockResolvedValue({ ok: true }),
	notify: vi.fn(),
}))
vi.mock('../api-client', () => ({ apiClient: { memories: api } }))
vi.mock('../app-context', () => ({ useAppContext: () => ({ notify: api.notify }) }))
afterEach(cleanup)

test('opening sharing does not publish; an explicit action creates the link and revocation removes it', async () => {
	render(
		<I18nProvider initialLocale="en">
			<SharePanel memoryId="private-memory" />
		</I18nProvider>
	)
	const create = await screen.findByRole('button', { name: 'Create a link' })
	expect(api.createShare).not.toHaveBeenCalled()
	// Before any link exists, the panel says what it exposes beyond the 3D scene.
	expect(
		screen.getByText(
			'The link also shows the coordinates, the dimension, the biome, the world name, the seed (in single player) or the server name or address.'
		)
	).toBeTruthy()
	fireEvent.click(create)
	const link = (await screen.findByRole('textbox', { name: 'Share link' })) as HTMLInputElement
	expect(api.createShare).toHaveBeenCalledWith({ id: 'private-memory', scope: 'memory' })
	expect(link.value).toContain('/shared/proof')
	fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }))
	await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Share link' })).toBeNull())
	expect(api.revokeShare).toHaveBeenCalledWith({ id: 'private-memory', scope: 'memory' })
	expect(screen.getByRole('button', { name: 'Create a link' })).toBeTruthy()
})

test('reopening sharing retrieves the same active link without rotating it', async () => {
	api.shareStatus.mockImplementationOnce(() => Promise.resolve({ shared: true, urlPath: '/shared/preserved' }))
	api.createShare.mockClear()
	render(
		<I18nProvider initialLocale="en">
			<SharePanel memoryId="private-memory" />
		</I18nProvider>
	)
	const link = await screen.findByRole('textbox', { name: 'Share link' })
	expect(link).toHaveProperty('value', `${window.location.origin}/shared/preserved`)
	expect(api.createShare).not.toHaveBeenCalled()
	expect(screen.getByRole('link', { name: 'Open link ↗' }).getAttribute('href')).toContain('/shared/preserved')
})

test('a world offers two independent links, a snapshot one and a world one, each created on its own', async () => {
	const live = { memory: { shared: true, urlPath: '/share/snap' }, world: { shared: false } }
	api.shareStatus.mockImplementation(({ scope }: { scope: string }) =>
		Promise.resolve(live[scope as 'memory' | 'world'])
	)
	api.createShare.mockClear()
	api.createShare.mockResolvedValue({ urlPath: '/share/wide' })
	render(
		<I18nProvider initialLocale="en">
			<SharePanel memoryId="evolving" />
		</I18nProvider>
	)
	const snapshot = await screen.findByRole('button', { name: 'Snapshot · Link active' })
	const world = screen.getByRole('button', { name: 'World' })
	expect(snapshot.getAttribute('aria-pressed')).toBe('true')
	expect(world.getAttribute('aria-pressed')).toBe('false')
	expect((screen.getByRole('textbox', { name: 'Share link' }) as HTMLInputElement).value).toContain('/share/snap')
	fireEvent.click(world)
	fireEvent.click(await screen.findByRole('button', { name: 'Create a link' }))
	await waitFor(() => expect(api.createShare).toHaveBeenCalledWith({ id: 'evolving', scope: 'world' }))
	expect(api.createShare).not.toHaveBeenCalledWith({ id: 'evolving', scope: 'memory' })
	expect(((await screen.findByRole('textbox', { name: 'Share link' })) as HTMLInputElement).value).toContain(
		'/share/wide'
	)
	expect(screen.getByRole('button', { name: 'Snapshot · Link active' })).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Snapshot · Link active' }))
	expect(((await screen.findByRole('textbox', { name: 'Share link' })) as HTMLInputElement).value).toContain(
		'/share/snap'
	)
})

test('the French panel warns about coordinates, world name, seed and server before a link is created', async () => {
	api.shareStatus.mockImplementation(({ scope }: { scope: string }) =>
		scope === 'world' ? Promise.reject(new Error('NOT_FOUND')) : Promise.resolve({ shared: false })
	)
	render(
		<I18nProvider initialLocale="fr">
			<SharePanel memoryId="private-memory" />
		</I18nProvider>
	)
	await screen.findByRole('button', { name: 'Créer un lien' })
	expect(
		screen.getByText(
			'Le lien montre aussi les coordonnées, la dimension, le biome, le nom du monde, la graine (en solo) ou le nom ou l’adresse du serveur.'
		)
	).toBeTruthy()
})

test('from the viewer, the link carries the view on screen unless asked not to, and a world link its snapshot', async () => {
	const live = { memory: { shared: true, urlPath: '/share/snap' }, world: { shared: true, urlPath: '/share/wide' } }
	api.shareStatus.mockImplementation(({ scope }: { scope: string }) =>
		Promise.resolve(live[scope as 'memory' | 'world'])
	)
	let minutes = 600
	const view = vi.fn(() => ({ camera: [1, 2, 3] as const, target: [4, 5, 6] as const, minutes }))
	const writeText = vi.fn().mockResolvedValue(undefined)
	vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
	render(
		<I18nProvider initialLocale="en">
			<SharePanel memoryId="frame-7" view={view} />
		</I18nProvider>
	)
	const link = (await screen.findByRole('textbox', { name: 'Share link' })) as HTMLInputElement
	expect(link.value).toBe(`${window.location.origin}/share/snap?cam=1,2,3&at=4,5,6&time=10:00`)
	// The copy reads the view again: a camera or clock moved since the panel opened is caught.
	minutes = 615
	fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
	await waitFor(() =>
		expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/share/snap?cam=1,2,3&at=4,5,6&time=10:15`)
	)
	fireEvent.click(screen.getByRole('button', { name: 'World · Link active' }))
	expect(((await screen.findByRole('textbox', { name: 'Share link' })) as HTMLInputElement).value).toContain(
		'/share/wide?cam=1,2,3&at=4,5,6&time=10:15&snap=frame-7'
	)
	fireEvent.click(screen.getByRole('checkbox', { name: /Include this view/ }))
	expect((screen.getByRole('textbox', { name: 'Share link' }) as HTMLInputElement).value).toBe(
		`${window.location.origin}/share/wide`
	)
	expect(screen.getByRole('link', { name: 'Open link ↗' }).getAttribute('href')).toBe(
		`${window.location.origin}/share/wide`
	)
	vi.unstubAllGlobals()
})
