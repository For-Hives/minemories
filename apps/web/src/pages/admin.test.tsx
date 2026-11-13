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
	insights: vi.fn(),
	setRole: vi.fn(),
	deleteUser: vi.fn(),
	storageRoles: vi.fn(),
	setRoleStorage: vi.fn(),
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
	quotaBytes: 2147483648,
}
const quotaBytes = 2147483648
const storageRoles = [
	{ role: 'user', limitBytes: null, effectiveBytes: quotaBytes, accounts: 26, updatedAt: null },
	{ role: 'admin', limitBytes: 5_000_000_000, effectiveBytes: 5_000_000_000, accounts: 1, updatedAt: 1000 },
]
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
	mocks.insights.mockResolvedValue({
		windowDays: 30,
		versions: {
			reportingDevices: 3,
			minecraft: [
				{ version: '1.21.1', devices: 2 },
				{ version: 'unknown', devices: 1 },
			],
			loader: [],
			mod: [{ version: '0.36.5-beta.1', devices: 3 }],
		},
		shares: {
			links: 4,
			activeLinks: 3,
			revokedLinks: 1,
			worldLinks: 1,
			openedLinks: 2,
			opens: 9,
			top: [
				{ name: 'Castle', owner: 'Alex', scope: 'memory', opens: 7, lastOpenedAt: 1, revoked: false },
				{ name: 'Farm', owner: null, scope: 'world', opens: 2, lastOpenedAt: null, revoked: true },
			],
		},
		activity: {
			activeUsers: 2,
			users: [
				{
					id: 'a',
					name: 'Alex',
					email: 'alex@example.com',
					level: 'high',
					score: 20,
					logins: 5,
					uploads: 5,
					lastActiveAt: 86_400_000,
				},
				{
					id: 'b',
					name: 'Bo',
					email: 'bo@example.com',
					level: 'low',
					score: 1,
					logins: 1,
					uploads: 0,
					lastActiveAt: null,
				},
			],
		},
	})
	mocks.setRole.mockResolvedValue({ ok: true })
	mocks.deleteUser.mockResolvedValue({ ok: true })
	mocks.storageRoles.mockResolvedValue(storageRoles)
	mocks.setRoleStorage.mockResolvedValue({ ok: true })
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
			{ ...user, id: 'big', name: 'Big admin', role: 'admin', usedBytes: 2_500_000_000, quotaBytes: 5_000_000_000 },
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
	// Each account is measured against its own limit, not the base quota.
	expect(bar('Stockage de Big admin').getAttribute('aria-valuenow')).toBe('50')
	expect(screen.getByText(/Quota de base par compte : 2,15\sGo/)).toBeTruthy()
	expect(screen.getByText('Quota atteint')).toBeTruthy()
	expect(screen.getAllByText(/1\u202f900\u202f000\u202f000 octets|1 900 000 000 octets/).length).toBeGreaterThan(0)
	expect(screen.getByText(/50\sMo réservés pour des envois, 50\sMo en attente de suppression/)).toBeTruthy()
	const totals = screen.getByText('Stockage total utilisé').closest('div') as HTMLElement
	expect(totals.textContent).toMatch(/4\sGo/)
	expect(screen.getByText('Comptes proches de leur quota').closest('div')?.textContent).toContain('2')
})
test('storage limits are listed per role and edited in decimal gigabytes, with reset and safe errors', async () => {
	page()
	const section = (await screen.findByRole('heading', { name: 'Stockage par rôle' })).closest('section') as HTMLElement
	expect(within(section).getByText(/2,15\sGo \(valeur par défaut du serveur\)/)).toBeTruthy()
	expect(within(section).getByText(/^5\sGo$/)).toBeTruthy()
	expect(within(section).getByText('26')).toBeTruthy()
	// The base role has nothing configured: no reset is offered, the form starts empty with the default as a hint,
	// so saving it untouched is rejected instead of pinning the server default.
	fireEvent.click(within(section).getByRole('button', { name: 'Modifier la limite (Utilisateur)' }))
	let dialog = screen.getByRole('dialog')
	expect(within(dialog).queryByRole('button', { name: 'Rétablir la valeur par défaut' })).toBeNull()
	const field = within(dialog).getByLabelText('Limite en Go') as HTMLInputElement
	expect(field.value).toBe('')
	expect(field.placeholder).toBe('2.15')
	fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
	expect((await within(dialog).findByRole('alert')).textContent).toContain('supérieure à 0')
	expect(mocks.setRoleStorage).not.toHaveBeenCalled()
	fireEvent.change(field, { target: { value: '0' } })
	fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
	expect((await within(dialog).findByRole('alert')).textContent).toContain('supérieure à 0')
	expect(document.activeElement).toBe(field)
	expect(field.getAttribute('aria-invalid')).toBe('true')
	expect(field.getAttribute('aria-describedby')).toBe('role-storage-hint role-storage-error')
	expect(document.getElementById('role-storage-error')?.textContent).toContain('supérieure à 0')
	expect(mocks.setRoleStorage).not.toHaveBeenCalled()
	fireEvent.change(field, { target: { value: '0,5' } })
	mocks.setRoleStorage.mockRejectedValueOnce(new Error('private database internals'))
	fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
	expect((await within(dialog).findByRole('alert')).textContent).toBe(
		'Impossible d’enregistrer cette limite. Réessaie.'
	)
	expect(screen.queryByText('private database internals')).toBeNull()
	// A server failure is not the value's fault: the field is no longer marked invalid.
	expect(field.getAttribute('aria-invalid')).toBeNull()
	expect(field.getAttribute('aria-describedby')).toBe('role-storage-hint')
	expect(mocks.setRoleStorage).toHaveBeenLastCalledWith({ role: 'user', quotaBytes: 500_000_000 })
	fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
	await waitFor(() => expect(mocks.storageRoles).toHaveBeenCalledTimes(2))
	expect(mocks.users).toHaveBeenCalledTimes(2)
	// A configured role can go back to the default; cancelling sends nothing.
	fireEvent.click(await screen.findByRole('button', { name: 'Modifier la limite (Admin)' }))
	dialog = screen.getByRole('dialog')
	expect((within(dialog).getByLabelText('Limite en Go') as HTMLInputElement).value).toBe('5')
	fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }))
	expect(screen.queryByRole('dialog')).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Modifier la limite (Admin)' }))
	fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Rétablir la valeur par défaut' }))
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
	expect(mocks.setRoleStorage).toHaveBeenLastCalledWith({ role: 'admin', quotaBytes: null })
	await waitFor(() => expect(mocks.storageRoles).toHaveBeenCalledTimes(3))
})
test('a role without a configured limit shows that its holders get the base quota', async () => {
	mocks.storageRoles.mockResolvedValue([
		{ role: 'user', limitBytes: 3_000_000_000, effectiveBytes: 3_000_000_000, accounts: 2, updatedAt: 1 },
		{ role: 'admin', limitBytes: null, effectiveBytes: 3_000_000_000, accounts: 1, updatedAt: null },
	])
	page()
	const section = (await screen.findByRole('heading', { name: 'Stockage par rôle' })).closest('section') as HTMLElement
	expect(within(section).getByText('Non définie')).toBeTruthy()
	expect(within(section).getByText(/Les comptes ayant ce rôle reçoivent 3\sGo/)).toBeTruthy()
	expect(within(section).getAllByText(/^3\sGo$/)).toHaveLength(1)
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

test('insights list versions, shared links and the most active accounts', async () => {
	page()
	await screen.findByText('Versions utilisées')
	expect(screen.getByText('1.21.1')).toBeTruthy()
	expect(screen.getByText('Version inconnue')).toBeTruthy()
	expect(screen.getByText('0.36.5-beta.1')).toBeTruthy()
	expect(screen.getAllByText('Aucune donnée pour le moment.')).toHaveLength(1)
	expect(screen.getByText('Castle')).toBeTruthy()
	expect(screen.getByText(/Compte supprimé · Monde · Révoqué/)).toBeTruthy()
	expect(screen.getByText('Très actif')).toBeTruthy()
	expect(screen.getByText('Occasionnel')).toBeTruthy()
})
test('an empty period shows no activity', async () => {
	const insights = await mocks.insights()
	mocks.insights.mockResolvedValue({
		...insights,
		shares: { ...insights.shares, top: [] },
		activity: { activeUsers: 0, users: [] },
	})
	page()
	await screen.findByText('Aucune activité sur cette période.')
})
test('deleting an account asks for the password, shows safe errors and refreshes', async () => {
	page()
	fireEvent.click(await screen.findByRole('button', { name: 'Supprimer le compte (Candidate)' }))
	expect(screen.queryByRole('button', { name: 'Supprimer le compte (Owner)' })).toBeNull()
	expect(mocks.deleteUser).not.toHaveBeenCalled()
	fireEvent.change(screen.getByLabelText('Ton mot de passe actuel'), { target: { value: 'confirmed-password' } })
	mocks.deleteUser.mockRejectedValueOnce(new Error('ADMIN_ACCOUNT'))
	fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer le compte' }))
	await screen.findByText('Retire d’abord l’accès administrateur avant de supprimer ce compte.')
	mocks.deleteUser.mockRejectedValueOnce(new Error('SELF_DELETE'))
	fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer le compte' }))
	await screen.findByText('Tu ne peux pas supprimer ton propre compte d’ici.')
	fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer le compte' }))
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
	expect(mocks.deleteUser).toHaveBeenLastCalledWith({ userId: 'candidate', currentPassword: 'confirmed-password' })
	await waitFor(() => expect(mocks.summary).toHaveBeenCalledTimes(2))
})
