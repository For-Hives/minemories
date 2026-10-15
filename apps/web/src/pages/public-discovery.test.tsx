// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AppContext, type AppContextValue } from '../app-context'
import { I18nProvider } from '../i18n/I18n'
import { ExplorerPage } from './DiscoveryPages'
import { ModerationPage, PublicationPanel, PublicGallery } from './PublicDiscovery'

const discovery = vi.hoisted(() => ({
	list: vi.fn(),
	vote: vi.fn(),
	report: vi.fn(),
	status: vi.fn(),
	publish: vi.fn(),
	revoke: vi.fn(),
	moderator: vi.fn(),
	queue: vi.fn(),
	moderate: vi.fn(),
}))
vi.mock('../api-client', () => ({ apiClient: { discovery } }))
const item = {
	id: '11111111-1111-4111-8111-111111111111',
	title: 'Village public',
	description: 'Une description choisie',
	category: 'build',
	thumbnail: null,
	publishedAt: '2026-10-15T00:00:00Z',
	votes: 2,
	voted: false,
}
function mount(content: React.ReactNode, signedIn = false, path = '/explorer') {
	const context: AppContextValue = {
		session: signedIn ? ({ user: { id: 'viewer' } } as unknown as AppContextValue['session']) : null,
		isPending: false,
		refreshSession: vi.fn(),
		viewerFile: null,
		setViewerFile: vi.fn(),
		notify: vi.fn(),
	}
	return render(
		<AppContext.Provider value={context}>
			<I18nProvider>
				<MemoryRouter initialEntries={[path]}>{content}</MemoryRouter>
			</I18nProvider>
		</AppContext.Provider>
	)
}
beforeEach(() => {
	vi.resetAllMocks()
	localStorage.clear()
	discovery.list.mockResolvedValue({ items: [item], hasMore: false })
	discovery.status.mockResolvedValue({ id: null, state: 'private', reason: null })
	discovery.moderator.mockResolvedValue({ allowed: true })
	discovery.queue.mockResolvedValue({
		items: [
			{
				...item,
				memoryId: 'memory',
				state: 'pending',
				reason: null,
				reports: [{ id: 1, reason: 'Un panneau', createdAt: '2026-10-15T00:00:00Z' }],
			},
		],
		hasMore: false,
	})
})
afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

test('public catalogue uses server filters, ranking and pages; demo remains an explicit separate choice', async () => {
	discovery.list.mockResolvedValue({ items: [item], hasMore: true })
	mount(<ExplorerPage ranking />, false, '/classement')
	await screen.findByRole('heading', { name: 'Village public' })
	expect(discovery.list).toHaveBeenCalledTimes(1)
	expect(discovery.list.mock.calls[0]?.[0]).toMatchObject({ sort: 'votes', page: 0 })
	expect(screen.getByRole('link', { name: 'Essayer la démonstration' }).getAttribute('href')).toBe('/classement?demo=1')
	expect(screen.queryByRole('button', { name: 'Soumettre à la modération' })).toBeNull()
	fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Village' } })
	await waitFor(() => expect(discovery.list.mock.lastCall?.[0]).toMatchObject({ query: 'Village' }))
	fireEvent.change(screen.getByRole('combobox', { name: 'Catégorie' }), { target: { value: 'landscape' } })
	await waitFor(() => expect(discovery.list.mock.lastCall?.[0]).toMatchObject({ category: 'landscape' }))
	fireEvent.click(await screen.findByRole('button', { name: 'Suivant' }))
	await waitFor(() => expect(discovery.list.mock.lastCall?.[0]).toMatchObject({ page: 1 }))
	expect(screen.getByRole('link', { name: /Se connecter pour voter/ })).toBeTruthy()
	expect(screen.getByRole('link', { name: 'Visiter' }).getAttribute('href')).toBe(`/public/${item.id}`)
})

test('votes and reports call authenticated server operations; failures do not fabricate a local vote', async () => {
	discovery.vote.mockResolvedValue({ votes: 3, voted: true })
	discovery.report.mockResolvedValue({ ok: true })
	mount(<PublicGallery />, true)
	await screen.findByRole('heading', { name: item.title })
	fireEvent.click(screen.getByRole('button', { name: '♥ 2' }))
	await waitFor(() => expect(discovery.vote).toHaveBeenCalledWith({ id: item.id, voted: true }))
	await waitFor(() => expect(discovery.list).toHaveBeenCalledTimes(2))

	fireEvent.click(screen.getByRole('button', { name: 'Signaler' }))
	fireEvent.change(screen.getByRole('textbox', { name: 'Motif du signalement' }), {
		target: { value: 'Panneau privé' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Envoyer le signalement' }))
	await screen.findByText('Signalement transmis aux modérateurs.')
	expect(discovery.report).toHaveBeenCalledWith({ id: item.id, reason: 'Panneau privé' })
	discovery.vote.mockRejectedValueOnce(new Error('rate'))
	fireEvent.click(screen.getByRole('button', { name: '♥ 2' }))
	await screen.findByText('Vote refusé ou limite atteinte. Réessaie plus tard.')
	expect(screen.getByRole('button', { name: '♥ 2' }).getAttribute('aria-pressed')).toBe('false')
})

test('catalogue error is explicit and retry can return an empty real catalogue', async () => {
	discovery.list.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ items: [], hasMore: false })
	mount(<PublicGallery />)
	await screen.findByRole('alert')
	fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
	await screen.findByText('Aucun souvenir public pour ces filtres.')
	expect(screen.queryByRole('article')).toBeNull()
})

test('publication requires explicit consent and chosen fields, then supports withdrawal', async () => {
	const memory = { id: 'memory', name: 'Mon monde', metadata: { thumbnail: null } }
	discovery.publish.mockResolvedValue({ id: item.id, state: 'pending', reason: null })
	discovery.revoke.mockResolvedValue({ id: item.id, state: 'revoked', reason: null })
	mount(<PublicationPanel memory={memory} />)
	await screen.findByText('Privé')
	const submit = screen.getByRole('button', { name: 'Soumettre à la modération' })
	expect(submit.hasAttribute('disabled')).toBe(true)
	fireEvent.change(screen.getByRole('textbox', { name: 'Titre public' }), { target: { value: 'Titre choisi' } })
	fireEvent.change(screen.getByRole('textbox', { name: 'Description publique' }), {
		target: { value: 'Description choisie' },
	})
	fireEvent.click(screen.getByRole('checkbox'))
	fireEvent.click(submit)
	await screen.findByText('En attente de modération')
	expect(discovery.publish).toHaveBeenCalledWith({
		memoryId: 'memory',
		title: 'Titre choisi',
		description: 'Description choisie',
		category: 'build',
		thumbnail: null,
		consent: true,
	})
	expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
	fireEvent.click(screen.getByRole('button', { name: 'Retirer la publication' }))
	await screen.findByText('Retiré du public')
	expect(discovery.revoke).toHaveBeenCalledWith({ memoryId: 'memory' })
})

test('publication status and mutation failures never report a false success', async () => {
	discovery.status.mockRejectedValueOnce(new Error('network'))
	const memory = { id: 'memory', name: 'Mon monde', metadata: { thumbnail: null } }
	const first = mount(<PublicationPanel memory={memory} />)
	await screen.findByText('Statut de publication indisponible.')
	expect(screen.getByRole('button', { name: 'Soumettre à la modération' }).hasAttribute('disabled')).toBe(true)
	first.unmount()
	discovery.status.mockResolvedValue({ id: item.id, state: 'rejected', reason: 'Panneau privé' })
	discovery.publish.mockRejectedValueOnce(new Error('limit'))
	mount(<PublicationPanel memory={memory} />)
	await screen.findByText(/Refusé · Panneau privé/)
	fireEvent.click(screen.getByRole('checkbox'))
	fireEvent.click(screen.getByRole('button', { name: 'Soumettre à la modération' }))
	await screen.findByText('Publication refusée ou limite atteinte. Réessaie plus tard.')
	expect(screen.queryByText('En attente de modération')).toBeNull()
})

test('moderation checks role, exposes reported queue and sends explicit approve/reject decisions', async () => {
	discovery.moderate.mockResolvedValue({ id: item.id, state: 'approved', reason: null })

	mount(<ModerationPage />, true)
	await screen.findByRole('heading', { name: item.title })
	expect(screen.getByRole('link', { name: 'Examiner le GLB' }).getAttribute('href')).toBe(`/public/${item.id}?review=1`)
	fireEvent.change(screen.getByRole('textbox', { name: 'Motif de la décision (facultatif)' }), {
		target: { value: 'Examiné' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Approuver' }))
	await waitFor(() =>
		expect(discovery.moderate).toHaveBeenCalledWith({ id: item.id, decision: 'approved', reason: 'Examiné' })
	)
	await waitFor(() => expect(discovery.queue).toHaveBeenCalledTimes(2))
	fireEvent.change(screen.getByRole('combobox', { name: 'File' }), { target: { value: 'reported' } })
	await waitFor(() => expect(discovery.queue.mock.lastCall?.[0]).toMatchObject({ state: 'reported', page: 0 }))
	await screen.findByRole('button', { name: 'Refuser' })
	fireEvent.click(screen.getByRole('button', { name: 'Refuser' }))
	await waitFor(() =>
		expect(discovery.moderate).toHaveBeenLastCalledWith({ id: item.id, decision: 'rejected', reason: 'Examiné' })
	)
})

test('non-moderators never receive a moderation queue', async () => {
	discovery.moderator.mockResolvedValue({ allowed: false })
	mount(<ModerationPage />, true)
	await screen.findByRole('alert')
	expect(discovery.queue).not.toHaveBeenCalled()
	expect(screen.queryByRole('button', { name: 'Approuver' })).toBeNull()
})
