// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AppContext, type AppContextValue } from '../app-context'
import { I18nProvider } from '../i18n/I18n'
import { ExplorerPage } from './DiscoveryPages'
import { ModerationPage, PublicGallery } from './PublicCatalog'
import { PublicationPanel } from './PublicDiscovery'

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
function mount(content: React.ReactNode, signedIn = false, path = '/explore') {
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

test('public catalogue uses server filters, sorting and pages; demo remains an explicit separate choice', async () => {
	discovery.list.mockResolvedValue({ items: [item], hasMore: true })
	mount(<ExplorerPage />, false, '/explore')
	await screen.findByRole('heading', { name: 'Village public' })
	expect(discovery.list).toHaveBeenCalledTimes(1)
	expect(discovery.list.mock.calls[0]?.[0]).toMatchObject({ sort: 'recent', page: 0 })
	expect(screen.getByRole('link', { name: 'Essayer la démo' }).getAttribute('href')).toBe('/explore?demo=1')
	expect(screen.queryByRole('button', { name: 'Soumettre à la modération' })).toBeNull()
	fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Village' } })
	await waitFor(() => expect(discovery.list.mock.lastCall?.[0]).toMatchObject({ query: 'Village' }))
	fireEvent.change(screen.getByRole('combobox', { name: 'Trier' }), { target: { value: 'votes' } })
	await waitFor(() => expect(discovery.list.mock.lastCall?.[0]).toMatchObject({ sort: 'votes' }))
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
		target: { value: 'Private sign' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Envoyer le signalement' }))
	await screen.findByText('Signalement transmis aux modérateurs.')
	expect(discovery.report).toHaveBeenCalledWith({ id: item.id, reason: 'Private sign' })
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

const memory = { id: 'memory', name: 'Mon monde', metadata: { thumbnail: null } }
const submission = { title: 'Village', description: 'Au bord de l’eau', category: 'landscape' }

test('publication requires explicit consent and chosen fields, confirms the submission, then withdraws after a confirmation', async () => {
	discovery.publish.mockResolvedValue({ id: item.id, state: 'pending', reason: null })
	discovery.revoke.mockResolvedValue({ id: item.id, state: 'revoked', reason: null })
	mount(<PublicationPanel memory={memory} />)
	await screen.findByText('Privé')
	expect(document.activeElement).toBe(document.body)
	const submit = screen.getByRole('button', { name: 'Soumettre à la modération' })
	expect(submit.hasAttribute('disabled')).toBe(true)
	expect(screen.getByText('Coche la case de consentement pour soumettre.')).toBeTruthy()
	expect(screen.getByRole('textbox', { name: 'Titre public' })).toHaveProperty('value', 'Mon monde')
	expect(screen.getByText('9 / 80')).toBeTruthy()
	fireEvent.change(screen.getByRole('textbox', { name: 'Titre public' }), { target: { value: '  Titre choisi ' } })
	fireEvent.change(screen.getByRole('textbox', { name: 'Description publique' }), {
		target: { value: 'Description choisie' },
	})
	expect(screen.getByText('15 / 80')).toBeTruthy()
	expect(screen.getByText('19 / 500')).toBeTruthy()
	fireEvent.click(screen.getByRole('radio', { name: 'Aventure' }))
	expect(screen.getByRole('radio', { name: 'Aventure' })).toHaveProperty('checked', true)
	expect(screen.getByRole('radio', { name: 'Construction' })).toHaveProperty('checked', false)
	fireEvent.click(screen.getByRole('checkbox'))
	fireEvent.click(submit)
	await screen.findByText('Soumis — en attente de modération')
	expect(screen.getByText('En attente de modération')).toBeTruthy()
	expect(discovery.publish).toHaveBeenCalledWith({
		memoryId: 'memory',
		title: 'Titre choisi',
		description: 'Description choisie',
		category: 'adventure',
		thumbnail: null,
		consent: true,
	})
	expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
	expect(screen.queryByText('Brouillon — pas encore enregistré')).toBeNull()
	expect(screen.getByRole('textbox', { name: 'Titre public' })).toHaveProperty('value', 'Titre choisi')
	// The form now equals what is under moderation: only a change can be submitted.
	fireEvent.click(screen.getByRole('checkbox'))
	const resubmit = screen.getByRole('button', { name: 'Soumettre les modifications à la modération' })
	expect(resubmit.hasAttribute('disabled')).toBe(true)
	expect(screen.getByText('Rien n’a changé depuis ta dernière soumission.')).toBeTruthy()

	fireEvent.click(screen.getByRole('button', { name: 'Retirer la publication' }))
	expect(screen.getByRole('group', { name: 'Retirer la publication\u00a0?' })).toBeTruthy()
	expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Annuler' }))
	fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
	expect(discovery.revoke).not.toHaveBeenCalled()
	expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Retirer la publication' }))
	fireEvent.click(screen.getByRole('button', { name: 'Retirer la publication' }))
	fireEvent.click(screen.getByRole('button', { name: 'Oui, retirer' }))
	await screen.findByText('Retiré du public')
	expect(discovery.revoke).toHaveBeenCalledWith({ memoryId: 'memory' })
	// The withdraw control is gone: focus lands on the state card, never on the page body.
	await waitFor(() =>
		expect(document.activeElement).toBe(screen.getByText('Retiré du public').closest('.mm-publication-state'))
	)
	// Withdrawn keeps the last submission in the form and offers a fresh submission.
	expect(screen.getByRole('textbox', { name: 'Titre public' })).toHaveProperty('value', 'Titre choisi')
	expect(screen.getByRole('button', { name: 'Soumettre à la modération' }).hasAttribute('disabled')).toBe(false)
	expect(screen.queryByRole('button', { name: 'Retirer la publication' })).toBeNull()
})

test('publication form starts from the current submission and submits changes only', async () => {
	discovery.status.mockResolvedValue({ id: item.id, state: 'approved', reason: null, submission })
	discovery.publish.mockResolvedValue({
		id: item.id,
		state: 'pending',
		reason: null,
		submission: { ...submission, title: 'Village du lac' },
	})
	mount(<PublicationPanel memory={memory} />)
	await screen.findByText('Publié')
	expect(screen.getByRole('link', { name: 'Voir la publication' }).getAttribute('href')).toBe(`/public/${item.id}`)
	expect(screen.getByRole('textbox', { name: 'Titre public' })).toHaveProperty('value', 'Village')
	expect(screen.getByRole('textbox', { name: 'Description publique' })).toHaveProperty('value', 'Au bord de l’eau')
	expect(screen.getByRole('radio', { name: 'Paysage' })).toHaveProperty('checked', true)
	fireEvent.click(screen.getByRole('checkbox'))
	const submit = screen.getByRole('button', { name: 'Soumettre les modifications à la modération' })
	expect(submit.hasAttribute('disabled')).toBe(true)
	// Trailing spaces are trimmed by the server, so they are no change.
	fireEvent.change(screen.getByRole('textbox', { name: 'Titre public' }), { target: { value: 'Village ' } })
	expect(submit.hasAttribute('disabled')).toBe(true)
	expect(screen.getByRole('textbox', { name: 'Titre public' })).toHaveProperty('value', 'Village ')
	expect(screen.queryByText('Brouillon — pas encore enregistré')).toBeNull()
	fireEvent.change(screen.getByRole('textbox', { name: 'Titre public' }), { target: { value: '' } })
	expect(screen.getByText('Ajoute un titre public pour soumettre.')).toBeTruthy()
	fireEvent.change(screen.getByRole('textbox', { name: 'Titre public' }), { target: { value: 'Village du lac' } })
	expect(submit.hasAttribute('disabled')).toBe(false)
	fireEvent.submit(submit.closest('form') as HTMLFormElement)
	await screen.findByText('Soumis — en attente de modération')
	expect(discovery.publish).toHaveBeenCalledTimes(1)
	expect(discovery.publish.mock.lastCall?.[0]).toMatchObject({ title: 'Village du lac', category: 'landscape' })
	expect(screen.getByText('En attente de modération')).toBeTruthy()
	expect(screen.queryByText('Brouillon — pas encore enregistré')).toBeNull()
})

test('an unsent publication form survives closing the panel, overrides the submission and can be discarded', async () => {
	discovery.status.mockResolvedValue({ id: item.id, state: 'rejected', reason: 'Panneau privé', submission })
	const first = mount(<PublicationPanel memory={memory} />)
	await screen.findByText('Note du modérateur : Panneau privé')
	expect(screen.queryByText('Brouillon — pas encore enregistré')).toBeNull()
	fireEvent.change(screen.getByRole('textbox', { name: 'Description publique' }), {
		target: { value: 'Sans le panneau' },
	})
	fireEvent.click(screen.getByRole('radio', { name: 'Autre' }))
	expect(screen.getByText('Brouillon — pas encore enregistré')).toBeTruthy()
	first.unmount()

	mount(<PublicationPanel memory={memory} />)
	await screen.findByText('Refusé')
	expect(screen.getByText('Brouillon — pas encore enregistré')).toBeTruthy()
	expect(screen.getByRole('textbox', { name: 'Titre public' })).toHaveProperty('value', 'Village')
	expect(screen.getByRole('textbox', { name: 'Description publique' })).toHaveProperty('value', 'Sans le panneau')
	expect(screen.getByRole('radio', { name: 'Autre' })).toHaveProperty('checked', true)
	fireEvent.click(screen.getByRole('button', { name: 'Supprimer le brouillon' }))
	expect(screen.getByRole('textbox', { name: 'Description publique' })).toHaveProperty('value', 'Au bord de l’eau')
	expect(screen.getByRole('radio', { name: 'Paysage' })).toHaveProperty('checked', true)
	expect(screen.queryByText('Brouillon — pas encore enregistré')).toBeNull()
	// Typing back the submitted text is no draft either.
	fireEvent.change(screen.getByRole('textbox', { name: 'Titre public' }), { target: { value: 'Villages' } })
	fireEvent.change(screen.getByRole('textbox', { name: 'Titre public' }), { target: { value: 'Village' } })
	expect(screen.queryByText('Brouillon — pas encore enregistré')).toBeNull()
	expect(localStorage.getItem('minemories-form-drafts')).toBeNull()
})

test('fields hold still while the status loads; a stored draft waits for it, then is dropped once it matches', async () => {
	discovery.status.mockResolvedValue({ id: item.id, state: 'private', reason: null, submission: null })
	const first = mount(<PublicationPanel memory={memory} />)
	await screen.findByText('Privé')
	fireEvent.change(screen.getByRole('textbox', { name: 'Titre public' }), { target: { value: 'Village' } })
	first.unmount()

	let answer: (value: unknown) => void = () => undefined
	discovery.status.mockReturnValue(new Promise(resolve => (answer = resolve)))
	mount(<PublicationPanel memory={memory} />)
	expect(screen.getByText('Vérification…')).toBeTruthy()
	expect(screen.getByRole('textbox', { name: 'Titre public' })).toHaveProperty('readOnly', true)
	expect(screen.getByRole('textbox', { name: 'Description publique' })).toHaveProperty('readOnly', true)
	expect(screen.getByRole('radio', { name: 'Paysage' }).matches(':disabled')).toBe(true)
	// The stored draft shows at once and is not compared with a placeholder.
	expect(screen.getByRole('textbox', { name: 'Titre public' })).toHaveProperty('value', 'Village')
	expect(screen.getByText('Brouillon — pas encore enregistré')).toBeTruthy()
	await act(async () => answer({ id: item.id, state: 'pending', reason: null, submission }))
	await screen.findByText('En attente de modération')
	expect(screen.getByRole('textbox', { name: 'Titre public' })).toHaveProperty('readOnly', false)
	expect(screen.getByRole('radio', { name: 'Paysage' }).matches(':disabled')).toBe(false)
	expect(screen.getByText('Brouillon — pas encore enregistré')).toBeTruthy()
	fireEvent.change(screen.getByRole('textbox', { name: 'Description publique' }), {
		target: { value: 'Au bord de l’eau' },
	})
	fireEvent.click(screen.getByRole('radio', { name: 'Paysage' }))
	await waitFor(() => expect(screen.queryByText('Brouillon — pas encore enregistré')).toBeNull())
})

test('publication status and mutation failures never report a false success', async () => {
	discovery.status.mockRejectedValueOnce(new Error('network'))
	const first = mount(<PublicationPanel memory={memory} />)
	await screen.findByText('Statut de publication indisponible.')
	expect(screen.getByRole('button', { name: 'Soumettre à la modération' }).hasAttribute('disabled')).toBe(true)
	// The fields stay usable, and a retry asks again without closing the panel.
	expect(screen.getByRole('textbox', { name: 'Titre public' })).toHaveProperty('readOnly', false)
	fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
	expect(screen.queryByText('Statut de publication indisponible.')).toBeNull()
	expect(screen.getByText('Vérification…')).toBeTruthy()
	await screen.findByText('Privé')
	expect(discovery.status).toHaveBeenCalledTimes(2)
	fireEvent.click(screen.getByRole('checkbox'))
	expect(screen.getByRole('button', { name: 'Soumettre à la modération' }).hasAttribute('disabled')).toBe(false)
	first.unmount()
	discovery.status.mockResolvedValue({ id: item.id, state: 'rejected', reason: 'Private sign' })
	discovery.publish.mockRejectedValueOnce(new Error('limit'))
	discovery.revoke.mockRejectedValueOnce(new Error('offline'))
	mount(<PublicationPanel memory={memory} />)
	await screen.findByText('Note du modérateur : Private sign')
	expect(screen.getByText('Refusé')).toBeTruthy()
	fireEvent.click(screen.getByRole('checkbox'))
	fireEvent.click(screen.getByRole('button', { name: 'Soumettre les modifications à la modération' }))
	await screen.findByText('Publication refusée ou limite atteinte. Réessaie plus tard.')
	expect(screen.queryByText('En attente de modération')).toBeNull()
	expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
	fireEvent.click(screen.getByRole('button', { name: 'Retirer la publication' }))
	fireEvent.click(screen.getByRole('button', { name: 'Oui, retirer' }))
	await screen.findByText('Impossible de retirer la publication. Réessaie plus tard.')
	expect(screen.getByText('Refusé')).toBeTruthy()
	expect(document.activeElement).toBe(screen.getByText('Refusé').closest('.mm-publication-state'))
})

test('a publication answer arriving after the panel closed changes nothing', async () => {
	let answer: (value: unknown) => void = () => undefined
	let fail: (error: Error) => void = () => undefined
	discovery.status.mockResolvedValue({ id: item.id, state: 'pending', reason: null, submission })
	discovery.publish.mockReturnValue(new Promise(resolve => (answer = resolve)))
	discovery.revoke.mockReturnValue(new Promise((_, reject) => (fail = reject)))
	const view = mount(<PublicationPanel memory={memory} />)
	await screen.findByText('En attente de modération')
	fireEvent.change(screen.getByRole('textbox', { name: 'Titre public' }), { target: { value: 'Autre titre' } })
	fireEvent.click(screen.getByRole('checkbox'))
	fireEvent.click(screen.getByRole('button', { name: 'Soumettre les modifications à la modération' }))
	expect(screen.getByRole('button', { name: 'Envoi…' }).hasAttribute('disabled')).toBe(true)
	view.unmount()
	await act(async () => answer({ id: item.id, state: 'pending', reason: null, submission: null }))
	const again = mount(<PublicationPanel memory={memory} />)
	await screen.findByText('En attente de modération')
	// The draft stays: nothing confirmed it was saved in this view.
	expect(screen.getByRole('textbox', { name: 'Titre public' })).toHaveProperty('value', 'Autre titre')
	fireEvent.click(screen.getByRole('button', { name: 'Retirer la publication' }))
	fireEvent.click(screen.getByRole('button', { name: 'Oui, retirer' }))
	again.unmount()
	await act(async () => fail(new Error('late')))
	expect(screen.queryByRole('alert')).toBeNull()
})

test('moderation checks role, exposes reported queue and sends explicit approve/reject decisions', async () => {
	discovery.moderate.mockResolvedValue({ id: item.id, state: 'approved', reason: null })

	mount(<ModerationPage />, true)
	await screen.findByRole('heading', { name: item.title })
	expect(screen.getByRole('link', { name: 'Examiner le GLB' }).getAttribute('href')).toBe(`/public/${item.id}?review=1`)
	fireEvent.change(screen.getByRole('textbox', { name: 'Motif de la décision (facultatif)' }), {
		target: { value: 'Reviewed' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Approuver' }))
	await waitFor(() =>
		expect(discovery.moderate).toHaveBeenCalledWith({ id: item.id, decision: 'approved', reason: 'Reviewed' })
	)
	await waitFor(() => expect(discovery.queue).toHaveBeenCalledTimes(2))
	fireEvent.change(screen.getByRole('combobox', { name: 'File' }), { target: { value: 'reported' } })
	await waitFor(() => expect(discovery.queue.mock.lastCall?.[0]).toMatchObject({ state: 'reported', page: 0 }))
	await screen.findByRole('button', { name: 'Refuser' })
	fireEvent.click(screen.getByRole('button', { name: 'Refuser' }))
	await waitFor(() =>
		expect(discovery.moderate).toHaveBeenLastCalledWith({ id: item.id, decision: 'rejected', reason: 'Reviewed' })
	)
})

test('non-moderators never receive a moderation queue', async () => {
	discovery.moderator.mockResolvedValue({ allowed: false })
	mount(<ModerationPage />, true)
	await screen.findByRole('alert')
	expect(discovery.queue).not.toHaveBeenCalled()
	expect(screen.queryByRole('button', { name: 'Approuver' })).toBeNull()
})
