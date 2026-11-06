// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
	usedBytes: 2000,
	reservedBytes: 0,
	pendingDeletionBytes: 0,
	devices: 1,
}
const quotaBytes = 2147483648
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
		quotaBytes,
		overview: { accounts: 26, usedBytes: 4000, nearQuotaAccounts: 0 },
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
	expect(screen.getByRole('button', { name: 'Retirer le rôle admin (Owner)' })).toHaveProperty('disabled', true)
	fireEvent.change(screen.getByLabelText('Rechercher un compte'), { target: { value: 'candidate' } })
	fireEvent.change(screen.getByLabelText('Rôle'), { target: { value: 'user' } })
	fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
	await waitFor(() =>
		expect(mocks.users).toHaveBeenLastCalledWith(
			{ query: 'candidate', role: 'user', page: 1, sort: 'registered_desc' },
			expect.anything()
		)
	)
	await screen.findByText('Candidate')
	fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
	await waitFor(() =>
		expect(mocks.users).toHaveBeenLastCalledWith(
			{ query: 'candidate', role: 'user', page: 2, sort: 'registered_desc' },
			expect.anything()
		)
	)
	fireEvent.change(screen.getByLabelText('Trier par'), { target: { value: 'storage_desc' } })
	fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
	await waitFor(() =>
		expect(mocks.users).toHaveBeenLastCalledWith(
			{ query: 'candidate', role: 'user', page: 1, sort: 'storage_desc' },
			expect.anything()
		)
	)
	fireEvent.change(screen.getByLabelText('Période'), { target: { value: '168' } })
	await waitFor(() => expect(mocks.summary).toHaveBeenLastCalledWith({ hours: 168 }, expect.anything()))
})
test('role changes require confirmation, show safe errors and refresh after success', async () => {
	page()
	fireEvent.click(await screen.findByRole('button', { name: 'Promouvoir admin (Candidate)' }))
	expect(mocks.setRole).not.toHaveBeenCalled()
	expect(within(screen.getByRole('dialog')).getByText('Compte concerné')).toBeTruthy()
	expect(within(screen.getByRole('dialog')).getByText('candidate@example.com')).toBeTruthy()
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
	await waitFor(() => expect(mocks.summary).toHaveBeenCalledTimes(2))
	expect(mocks.users).toHaveBeenCalledTimes(2)
	expect(mocks.audit).toHaveBeenCalledTimes(2)
})
test('each account shows its storage as a labelled progress bar, in text and in bytes', async () => {
	mocks.users.mockResolvedValue({
		users: [
			{ ...user, id: 'empty', name: 'Empty', captures: 0, storedBytes: 0, usedBytes: 0 },
			{
				...user,
				id: 'near',
				name: 'Nearly full',
				usedBytes: 1_900_000_000,
				storedBytes: 1_800_000_000,
				reservedBytes: 50_000_000,
				pendingDeletionBytes: 50_000_000,
			},
			{ ...user, id: 'full', name: 'Full', usedBytes: quotaBytes + 5 },
		],
		total: 3,
		page: 1,
		pageSize: 25,
		quotaBytes,
		overview: { accounts: 3, usedBytes: 4_000_000_000, nearQuotaAccounts: 2 },
	})
	page()
	await screen.findByText('Nearly full')
	const bar = (name: string) => screen.getByRole('progressbar', { name })
	expect(bar('Stockage de Empty').getAttribute('aria-valuenow')).toBe('0')
	expect(bar('Stockage de Nearly full').getAttribute('aria-valuenow')).toBe('88')
	expect(bar('Stockage de Nearly full').getAttribute('aria-valuetext')).toMatch(/1,9\s+Go.*2,15\s+Go.*88\s%/)
	expect(bar('Stockage de Full').getAttribute('aria-valuenow')).toBe('100')
	expect(screen.getByText('Quota atteint')).toBeTruthy()
	expect(screen.getAllByText(/1\u202f900\u202f000\u202f000 octets|1 900 000 000 octets/).length).toBeGreaterThan(0)
	expect(screen.getByText(/50\sMo réservés pour des envois, 50\sMo en attente de suppression/)).toBeTruthy()
	const totals = screen.getByText('Stockage total utilisé').closest('div') as HTMLElement
	expect(totals.textContent).toMatch(/4\sGo/)
	expect(screen.getByText('Comptes proches de leur quota').closest('div')?.textContent).toContain('2')
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
