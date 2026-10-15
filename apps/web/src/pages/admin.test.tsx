// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AdminAccessLink } from '../components/AdminAccessLink'
import { I18nProvider } from '../i18n/I18n'
import { AdminPage } from './AdminPage'

const mocks = vi.hoisted(() => ({
	access: vi.fn(),
	summary: vi.fn(),
	users: vi.fn(),
	audit: vi.fn(),
	setRole: vi.fn(),
}))
vi.mock('../api-client', () => ({ apiClient: { admin: mocks } }))
vi.mock('../app-context', () => ({ useAppContext: () => ({ session: { user: { id: 'admin' } } }) }))
const user = {
	id: 'candidate',
	name: 'Candidate',
	email: 'candidate@example.com',
	emailVerified: true,
	createdAt: 0,
	role: 'user',
	captures: 2,
	storedBytes: 2000,
	devices: 1,
}
beforeEach(() => {
	vi.resetAllMocks()
	localStorage.clear()
	Object.assign(HTMLDialogElement.prototype, {
		showModal(this: HTMLDialogElement) {
			this.setAttribute('open', '')
		},
		close(this: HTMLDialogElement) {
			this.removeAttribute('open')
		},
	})
	mocks.access.mockResolvedValue({ allowed: true })
	mocks.summary.mockResolvedValue({
		trackingStartedAt: 1000,
		from: 0,
		to: 3600000,
		totals: {
			users: 26,
			admins: 1,
			memories: 2,
			storedBytes: 2000,
			trashBytes: 0,
			pendingDeletionBytes: 0,
			reservedBytes: 0,
			sessions: 1,
			devices: 1,
			publicCaptures: 0,
			coldObjects: 0,
			restoringObjects: 0,
		},
		period: { uploads: 2, uploadedBytes: 2000, signups: 1 },
		series: [{ at: 0, uploads: 2, uploadedBytes: 2000, signups: 1, coverage: 'partial' }],
	})
	mocks.users.mockResolvedValue({
		users: [user, { ...user, id: 'admin', name: 'Owner', role: 'admin' }],
		total: 26,
		page: 1,
		pageSize: 25,
	})
	mocks.audit.mockResolvedValue([])
	mocks.setRole.mockResolvedValue({ ok: true })
})
afterEach(cleanup)
function page(element = <AdminPage />) {
	return render(
		<MemoryRouter>
			<I18nProvider>{element}</I18nProvider>
		</MemoryRouter>
	)
}
test('unauthorized visitors never fetch private statistics or the directory', async () => {
	mocks.access.mockResolvedValue({ allowed: false })
	page()
	await screen.findByText('Accès réservé aux administrateurs')
	expect(mocks.summary).not.toHaveBeenCalled()
	expect(mocks.users).not.toHaveBeenCalled()
})
test('directory searches, role filters, pagination and periods reach the server', async () => {
	page()
	await screen.findByText('Candidate')
	expect(screen.getByRole('button', { name: 'Retirer le rôle admin' })).toHaveProperty('disabled', true)
	fireEvent.change(screen.getByLabelText('Rechercher un compte'), { target: { value: 'candidate' } })
	fireEvent.change(screen.getByLabelText('Rôle'), { target: { value: 'user' } })
	fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
	await waitFor(() =>
		expect(mocks.users).toHaveBeenLastCalledWith({ query: 'candidate', role: 'user', page: 1 }, expect.anything())
	)
	await screen.findByText('Candidate')
	fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
	await waitFor(() =>
		expect(mocks.users).toHaveBeenLastCalledWith({ query: 'candidate', role: 'user', page: 2 }, expect.anything())
	)
	fireEvent.change(screen.getByLabelText('Période'), { target: { value: '168' } })
	await waitFor(() => expect(mocks.summary).toHaveBeenLastCalledWith({ hours: 168 }, expect.anything()))
})
test('role changes require confirmation, show safe errors and refresh after success', async () => {
	page()
	fireEvent.click(await screen.findByRole('button', { name: 'Promouvoir admin' }))
	expect(mocks.setRole).not.toHaveBeenCalled()
	const password = screen.getByLabelText('Ton mot de passe actuel')
	fireEvent.change(password, { target: { value: 'confirmed-password' } })
	mocks.setRole.mockRejectedValueOnce(new Error('private database internals'))
	fireEvent.click(screen.getByRole('button', { name: 'Confirmer le changement' }))
	await screen.findByRole('alert')
	expect(screen.queryByText('private database internals')).toBeNull()
	expect(mocks.setRole).toHaveBeenCalledWith({
		userId: 'candidate',
		role: 'admin',
		currentPassword: 'confirmed-password',
	})
	fireEvent.click(screen.getByRole('button', { name: 'Confirmer le changement' }))
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
	expect(mocks.summary).toHaveBeenCalledTimes(2)
})
test('network failures can be retried and revoked permissions hide private data', async () => {
	mocks.summary.mockRejectedValueOnce(new Error('network'))
	page()
	await screen.findByRole('alert')
	fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }))
	await screen.findByText('Candidate')
	mocks.summary.mockRejectedValueOnce({ code: 'FORBIDDEN' })
	fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }))
	await screen.findByText('Accès réservé aux administrateurs')
	expect(screen.queryByText('Candidate')).toBeNull()
})
test('account entry appears only after server permission confirmation', async () => {
	const first = page(<AdminAccessLink />)
	await screen.findByRole('link', { name: /Ouvrir le panneau/ })
	first.unmount()
	mocks.access.mockResolvedValue({ allowed: false })
	page(<AdminAccessLink />)
	await waitFor(() => expect(mocks.access).toHaveBeenCalledTimes(2))
	expect(screen.queryByRole('link')).toBeNull()
})
