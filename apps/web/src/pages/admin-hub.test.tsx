// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { adminRoutes } from '../admin-routes'
import { AppContext, type AppContextValue } from '../app-context'
import { I18nProvider } from '../i18n/I18n'

const rpc = vi.hoisted(() => ({
	admin: { access: vi.fn() },
	discovery: { moderator: vi.fn(), queueSummary: vi.fn() },
	diagnostics: { access: vi.fn() },
}))
vi.mock('../api-client', () => ({ apiClient: rpc }))
vi.mock('../observability/WebObservability', () => ({ reportWebFailure: vi.fn() }))
vi.mock('./AdminPage', async () => ({ AdminPage: () => <h1>Accounts page</h1> }))
vi.mock('./DiagnosticsPage', async () => ({ DiagnosticsPage: () => <h1>Diagnostics page</h1> }))
vi.mock('./PublicCatalog', async () => ({ ModerationPage: () => <h1>Moderation page</h1> }))

type Rights = { admin?: boolean; moderator?: boolean; operator?: boolean }
function grant({ admin = false, moderator = false, operator = false }: Rights) {
	rpc.admin.access.mockResolvedValue({ allowed: admin })
	rpc.discovery.moderator.mockResolvedValue({ allowed: moderator })
	rpc.diagnostics.access.mockResolvedValue({ allowed: operator })
}
function Where() {
	return <output data-testid="where">{useLocation().pathname}</output>
}
function mount(path: string) {
	const context: AppContextValue = {
		session: { user: { id: 'someone' } } as unknown as AppContextValue['session'],
		isPending: false,
		refreshSession: vi.fn(),
		viewerFile: null,
		setViewerFile: vi.fn(),
		notify: vi.fn(),
	}
	return render(
		<AppContext.Provider value={context}>
			<I18nProvider>
				<MemoryRouter initialEntries={[path]}>
					<Where />
					<Routes>{adminRoutes}</Routes>
				</MemoryRouter>
			</I18nProvider>
		</AppContext.Provider>
	)
}
const bar = () => screen.queryByRole('navigation', { name: 'Sections d’administration' })
const linkNames = () =>
	within(bar() as HTMLElement)
		.getAllByRole('link')
		.map(link => link.textContent)

beforeEach(() => {
	vi.resetAllMocks()
	localStorage.clear()
	rpc.discovery.queueSummary.mockResolvedValue({ pending: 3, reported: 1 })
})
afterEach(cleanup)

test('an administrator sees the overview and accounts entries only', async () => {
	grant({ admin: true })
	mount('/admin/users')
	await screen.findByRole('heading', { name: 'Accounts page' })
	await waitFor(() => expect(bar()).not.toBeNull())
	expect(linkNames()).toEqual(['Vue d’ensemble', 'Comptes et rôles'])
	expect(rpc.discovery.queueSummary).not.toHaveBeenCalled()
})

test('a moderator, an operator and an account holding all three capabilities get matching entries', async () => {
	grant({ moderator: true })
	const first = mount('/admin/moderation')
	await waitFor(() => expect(bar()).not.toBeNull())
	expect(linkNames()).toEqual(['Vue d’ensemble', 'Modération'])
	first.unmount()
	grant({ operator: true })
	const second = mount('/admin/diagnostics')
	await waitFor(() => expect(bar()).not.toBeNull())
	expect(linkNames()).toEqual(['Vue d’ensemble', 'Diagnostics'])
	second.unmount()
	grant({ admin: true, moderator: true, operator: true })
	mount('/admin/diagnostics')
	await waitFor(() => expect(bar()).not.toBeNull())
	expect(linkNames()).toEqual(['Vue d’ensemble', 'Comptes et rôles', 'Modération', 'Diagnostics'])
})

test('the current section is marked with aria-current and the bar is keyboard reachable', async () => {
	grant({ admin: true, moderator: true, operator: true })
	mount('/admin/moderation')
	await waitFor(() => expect(bar()).not.toBeNull())
	const current = within(bar() as HTMLElement).getAllByRole('link', { current: 'page' })
	expect(current.map(link => link.textContent)).toEqual(['Modération'])
	expect(
		within(bar() as HTMLElement)
			.getByRole('link', { name: 'Vue d’ensemble' })
			.getAttribute('aria-current')
	).toBeNull()
	const accounts = within(bar() as HTMLElement).getByRole('link', { name: 'Comptes et rôles' })
	accounts.focus()
	expect(document.activeElement).toBe(accounts)
	fireEvent.click(accounts)
	await screen.findByRole('heading', { name: 'Accounts page' })
	expect(screen.getByTestId('where').textContent).toBe('/admin/users')
	expect(accounts.getAttribute('aria-current')).toBe('page')
})

test('an account without any capability sees no bar, and the overview refuses it as before', async () => {
	grant({})
	mount('/admin')
	await screen.findByRole('alert')
	expect(bar()).toBeNull()
	expect(screen.queryByRole('list')).toBeNull()
	expect(rpc.discovery.queueSummary).not.toHaveBeenCalled()
})

test('failed or refused permission checks never grant a section', async () => {
	rpc.admin.access.mockRejectedValue(new Error('network'))
	rpc.discovery.moderator.mockResolvedValue({ allowed: false })
	rpc.diagnostics.access.mockRejectedValue(new Error('forbidden'))
	mount('/admin')
	await screen.findByRole('alert')
	expect(bar()).toBeNull()
})

test('the overview lists one card per allowed section, with the moderation counters', async () => {
	grant({ moderator: true, operator: true })
	mount('/admin')
	const cards = await screen.findAllByRole('listitem')
	await screen.findByText('3 en attente de validation · 1 signalées')
	const titles = cards.filter(card => card.className.includes('mm-admin-hub-card'))
	expect(titles.map(card => within(card).getByRole('heading').textContent)).toEqual(['Modération', 'Diagnostics'])
	expect(
		within(titles[0] as HTMLElement)
			.getByRole('link')
			.getAttribute('href')
	).toBe('/admin/moderation')
	expect(
		within(titles[1] as HTMLElement)
			.getByRole('link')
			.getAttribute('href')
	).toBe('/admin/diagnostics')
	expect(screen.queryByRole('link', { name: 'Comptes et rôles', description: /Chiffres/ })).toBeNull()
	expect(screen.getAllByRole('link', { current: 'page' }).map(link => link.textContent)).toEqual(['Vue d’ensemble'])
})

test('a failing counter leaves the moderation card without a number', async () => {
	grant({ admin: true, moderator: true })
	rpc.discovery.queueSummary.mockRejectedValue(new Error('down'))
	mount('/admin')
	await screen.findByRole('heading', { name: 'Modération', level: 2 })
	await waitFor(() => expect(rpc.discovery.queueSummary).toHaveBeenCalled())
	expect(screen.queryByText(/en attente de validation/)).toBeNull()
	expect(screen.getByRole('heading', { name: 'Comptes et rôles', level: 2 })).toBeTruthy()
})

test('the old moderation URL redirects to the new one and keeps the page working', async () => {
	grant({ moderator: true })
	mount('/moderation')
	await screen.findByRole('heading', { name: 'Moderation page' })
	expect(screen.getByTestId('where').textContent).toBe('/admin/moderation')
})
