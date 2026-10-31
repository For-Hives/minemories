// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { authClient } from '../auth-client'
import { I18nProvider } from '../i18n/I18n'
import { AccountPage } from './AccountPage'

const mocks = vi.hoisted(() => ({
	name: vi.fn(),
	refresh: vi.fn(),
	email: vi.fn(),
	password: vi.fn(),
	complete: vi.fn(),
}))
vi.mock('../api-client', () => ({
	apiBase: 'http://localhost:3001',
	apiClient: { account: { changeName: mocks.name, changeEmail: mocks.email, changePassword: mocks.password } },
}))
vi.mock('../app-context', () => ({
	useAppContext: () => ({
		refreshSession: mocks.refresh,
		session: { user: { name: 'Tester', email: 'tester@example.com' } },
	}),
}))
vi.mock('../auth-client', () => ({
	authClient: { listAccounts: vi.fn().mockResolvedValue({ data: [{ providerId: 'credential' }] }) },
}))
vi.mock('./account-navigation', () => ({ credentialChangeComplete: mocks.complete }))
beforeEach(() => {
	vi.clearAllMocks()
	localStorage.clear()
	mocks.email.mockResolvedValue({ ok: true })
	mocks.password.mockResolvedValue({ ok: true })
})
afterEach(cleanup)
function page() {
	return render(
		<MemoryRouter>
			<I18nProvider>
				<AccountPage />
			</I18nProvider>
		</MemoryRouter>
	)
}
function fill(form: HTMLElement, label: string, value: string) {
	fireEvent.change(within(form).getByLabelText(label), { target: { value } })
}
test('email change trims input, confirms the current password and clears fields before reauthentication', async () => {
	page()
	const form = screen.getByRole('form', { name: 'Adresse e-mail' })
	fill(form, 'Nouvelle adresse e-mail', 'new@example.com')
	fill(form, 'Mot de passe actuel', 'my-old-password')
	fireEvent.submit(form)
	await waitFor(() => expect(mocks.complete).toHaveBeenCalledWith('email'))
	expect(mocks.email).toHaveBeenCalledWith({ email: 'new@example.com', currentPassword: 'my-old-password' })
	expect(within(form).getByLabelText('Mot de passe actuel')).toHaveProperty('value', '')
})
test('password mismatch never reaches the API and a corrected submission signs in again', async () => {
	page()
	const form = screen.getByRole('form', { name: 'Mot de passe' })
	fill(form, 'Mot de passe actuel', 'my-old-password')
	fill(form, 'Nouveau mot de passe', 'my-new-password')
	fill(form, 'Confirmer le nouveau mot de passe', 'different-password')
	fireEvent.submit(form)
	expect(screen.getByRole('alert').textContent).toContain('ne correspondent pas')
	expect(mocks.password).not.toHaveBeenCalled()
	fill(form, 'Confirmer le nouveau mot de passe', 'my-new-password')
	fireEvent.submit(form)
	await waitFor(() => expect(mocks.complete).toHaveBeenCalledWith('password'))
	expect(mocks.password).toHaveBeenCalledWith({ currentPassword: 'my-old-password', newPassword: 'my-new-password' })
})
test('pending requests disable both forms, deduplicate submits and show safe retry errors', async () => {
	let fail: ((error: unknown) => void) | undefined
	mocks.email.mockImplementation(
		() =>
			new Promise((_resolve, reject) => {
				fail = reject
			})
	)
	page()
	const form = screen.getByRole('form', { name: 'Adresse e-mail' })
	fill(form, 'Nouvelle adresse e-mail', 'new@example.com')
	fill(form, 'Mot de passe actuel', 'my-old-password')
	fireEvent.submit(form)
	fireEvent.submit(form)
	expect(mocks.email).toHaveBeenCalledTimes(1)
	expect(screen.getByRole('button', { name: 'Modifier mon mot de passe' })).toHaveProperty('disabled', true)
	fail?.(new Error('CURRENT_PASSWORD_INVALID'))
	await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('actuel est incorrect'))
	expect(mocks.complete).not.toHaveBeenCalled()
	mocks.email.mockRejectedValueOnce(new Error('EMAIL_UNAVAILABLE'))
	fireEvent.submit(form)
	await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('ne peut pas être utilisée'))
})
test('English copy and network failures do not expose raw backend details', async () => {
	localStorage.setItem('minemories-locale', 'en')
	mocks.password.mockRejectedValueOnce(new Error('SQLITE_SECRET_INTERNAL'))
	page()
	const form = screen.getByRole('form', { name: 'Password' })
	fill(form, 'Current password', 'my-old-password')
	fill(form, 'New password', 'my-new-password')
	fill(form, 'Confirm new password', 'my-new-password')
	fireEvent.submit(form)
	await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Could not update your account'))
	expect(screen.queryByText('SQLITE_SECRET_INTERNAL')).toBeNull()
})
test('an obsolete mutation response does not navigate after leaving the account page', async () => {
	let resolve: ((value: unknown) => void) | undefined
	mocks.email.mockImplementation(
		() =>
			new Promise(done => {
				resolve = done
			})
	)
	const view = page(),
		form = screen.getByRole('form', { name: 'Adresse e-mail' })
	fill(form, 'Nouvelle adresse e-mail', 'new@example.com')
	fill(form, 'Mot de passe actuel', 'my-old-password')
	fireEvent.submit(form)
	view.unmount()
	resolve?.({ ok: true })
	await Promise.resolve()
	expect(mocks.complete).not.toHaveBeenCalled()
})

test('display name is trimmed, saved and refreshes the visible session without signing out', async () => {
	page()
	const form = screen.getByRole('form', { name: 'Profil' })
	fill(form, 'Pseudo', '  Nouveau pseudo  ')
	fireEvent.submit(form)
	await waitFor(() => expect(mocks.name).toHaveBeenCalledWith({ name: 'Nouveau pseudo' }))
	await screen.findByText('Pseudo enregistré.')
	expect(mocks.refresh).toHaveBeenCalledOnce()
	expect(mocks.complete).not.toHaveBeenCalled()
})

test('social accounts manage credentials at their provider and retain display-name editing', async () => {
	vi.mocked(authClient.listAccounts).mockResolvedValueOnce({ data: [{ providerId: 'google' }] } as never)
	page()
	await screen.findByText('Ton e-mail et ton mot de passe se gèrent auprès de ton fournisseur de connexion.')
	expect(screen.queryByRole('form', { name: 'Mot de passe' })).toBeNull()
	expect(screen.getByRole('form', { name: 'Profil' })).toBeTruthy()
})
