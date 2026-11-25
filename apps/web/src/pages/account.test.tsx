// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { authClient } from '../auth-client'
import { I18nProvider } from '../i18n/I18n'
import { AccountPage } from './AccountPage'

const mocks = vi.hoisted(() => ({
	name: vi.fn(),
	head: vi.fn(),
	image: { value: null as string | null },
	refresh: vi.fn(),
	email: vi.fn(),
	password: vi.fn(),
	complete: vi.fn(),
}))
vi.mock('../api-client', () => ({
	apiBase: 'http://localhost:3001',
	apiClient: {
		account: {
			changeName: mocks.name,
			setMinecraftHead: mocks.head,
			changeEmail: mocks.email,
			changePassword: mocks.password,
		},
	},
}))
vi.mock('../app-context', () => ({
	useAppContext: () => ({
		refreshSession: mocks.refresh,
		session: {
			user: { name: 'Tester', email: 'tester@example.com', image: mocks.image.value, displayUsername: 'Tester_1' },
		},
	}),
}))
vi.mock('../auth-client', () => ({
	authClient: {
		listAccounts: vi.fn().mockResolvedValue({ data: [{ providerId: 'credential' }] }),
		updateUser: vi.fn(),
	},
}))
vi.mock('./account-navigation', () => ({ credentialChangeComplete: mocks.complete }))
beforeEach(() => {
	vi.clearAllMocks()
	vi.mocked(authClient.updateUser).mockResolvedValue({ data: { status: true }, error: null } as never)
	mocks.image.value = null
	mocks.head.mockResolvedValue({ ok: true })
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

test('the name is edited in place and is also the sign-in name: one update, with its capitals', async () => {
	page()
	expect(screen.getByRole('heading', { level: 1, name: 'Tester' })).toBeTruthy()
	expect(screen.getByText('Tu te connectes avec ce pseudo ou ton e-mail.')).toBeTruthy()
	expect(screen.queryByRole('textbox', { name: 'Pseudo' })).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Modifier le pseudo' }))
	const form = screen.getByRole('form', { name: 'Pseudo' })
	expect(document.activeElement).toBe(within(form).getByRole('textbox', { name: 'Pseudo' }))
	expect(within(form).getByText('Un pseudo Minecraft a 3 à 16 lettres, chiffres ou _.')).toBeTruthy()
	fill(form, 'Pseudo', '  Diablox  ')
	fireEvent.submit(form)
	await waitFor(() =>
		expect(authClient.updateUser).toHaveBeenCalledWith({
			name: 'Diablox',
			username: 'Diablox',
			displayUsername: 'Diablox',
		})
	)
	await screen.findByText('Pseudo enregistré.')
	expect(mocks.name).not.toHaveBeenCalled()
	expect(mocks.refresh).toHaveBeenCalledOnce()
	expect(mocks.complete).not.toHaveBeenCalled()
	expect(screen.queryByRole('form', { name: 'Pseudo' })).toBeNull()
})

test('Escape or Cancel leaves the name edit without saving', () => {
	page()
	fireEvent.click(screen.getByRole('button', { name: 'Modifier le pseudo' }))
	fireEvent.keyDown(screen.getByRole('textbox', { name: 'Pseudo' }), { key: 'Escape' })
	expect(screen.queryByRole('form', { name: 'Pseudo' })).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Modifier le pseudo' }))
	fireEvent.keyDown(screen.getByRole('textbox', { name: 'Pseudo' }), { key: 'a' })
	expect(screen.getByRole('form', { name: 'Pseudo' })).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
	expect(screen.queryByRole('form', { name: 'Pseudo' })).toBeNull()
	expect(authClient.updateUser).not.toHaveBeenCalled()
})

test('a failed name change keeps the field open with a safe error', async () => {
	vi.mocked(authClient.updateUser).mockRejectedValue(new Error('private details'))
	page()
	fireEvent.click(screen.getByRole('button', { name: 'Modifier le pseudo' }))
	fireEvent.submit(screen.getByRole('form', { name: 'Pseudo' }))
	await screen.findByRole('alert')
	expect(screen.queryByText('private details')).toBeNull()
	expect(screen.getByRole('form', { name: 'Pseudo' })).toBeTruthy()
})

test('social accounts manage credentials at their provider and retain display-name editing', async () => {
	vi.mocked(authClient.listAccounts).mockResolvedValueOnce({
		data: [
			{
				id: 'google-account',
				providerId: 'google',
				accountId: 'google-user',
				userId: 'tester',
				createdAt: new Date(0),
				updatedAt: new Date(0),
				scopes: [],
			},
		],
		error: null,
	})
	page()
	await screen.findByText('Ton e-mail et ton mot de passe se gèrent auprès de ton fournisseur de connexion.')
	expect(screen.queryByRole('form', { name: 'Mot de passe' })).toBeNull()
	expect(screen.queryByText('Tu te connectes avec ce pseudo ou ton e-mail.')).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Modifier le pseudo' }))
	const form = screen.getByRole('form', { name: 'Pseudo' })
	expect(within(form).queryByText('Un pseudo Minecraft a 3 à 16 lettres, chiffres ou _.')).toBeNull()
	fill(form, 'Pseudo', '  Jean Dupont ')
	fireEvent.submit(form)
	await waitFor(() => expect(mocks.name).toHaveBeenCalledWith({ name: 'Jean Dupont' }))
	expect(authClient.updateUser).not.toHaveBeenCalled()
})

test('the avatar dialog previews the typed Minecraft head, then saves it', async () => {
	page()
	expect(screen.queryByText('Tester · tester@example.com')).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Changer d’avatar' }))
	const dialog = screen.getByRole('dialog', { name: 'Avatar' })
	expect(within(dialog).queryByRole('button', { name: 'Retirer l’avatar' })).toBeNull()
	const save = within(dialog).getByRole('button', { name: 'Enregistrer l’avatar' }) as HTMLButtonElement
	expect(save.disabled).toBe(true)
	fireEvent.change(within(dialog).getByLabelText('Compte Minecraft'), { target: { value: '  Notch ' } })
	const preview = (await within(dialog).findByRole('img', { name: 'Aperçu de l’avatar' })) as HTMLImageElement
	expect(preview.src).toBe('https://head.sttr.io/face/Notch')
	expect(save.disabled).toBe(false)
	fireEvent.submit(within(dialog).getByRole('form', { name: 'Avatar' }))
	await waitFor(() => expect(mocks.head).toHaveBeenCalledWith({ username: 'Notch' }))
	await screen.findByText('Avatar enregistré.')
	expect(mocks.refresh).toHaveBeenCalledOnce()
	expect(screen.queryByRole('dialog')).toBeNull()
})
test('an invalid name shows no preview, and Cancel closes the dialog', async () => {
	page()
	fireEvent.click(screen.getByRole('button', { name: 'Changer d’avatar' }))
	const dialog = screen.getByRole('dialog', { name: 'Avatar' })
	fireEvent.change(within(dialog).getByLabelText('Compte Minecraft'), { target: { value: 'a b' } })
	await new Promise(resolve => setTimeout(resolve, 450))
	expect(within(dialog).queryByRole('img')).toBeNull()
	fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }))
	expect(screen.queryByRole('dialog')).toBeNull()
	expect(mocks.head).not.toHaveBeenCalled()
})
test('the current avatar can be removed from the dialog', async () => {
	mocks.image.value = 'https://head.sttr.io/face/Notch'
	page()
	fireEvent.click(screen.getByRole('button', { name: 'Changer d’avatar' }))
	const dialog = screen.getByRole('dialog', { name: 'Avatar' })
	expect((within(dialog).getByRole('img', { name: 'Aperçu de l’avatar' }) as HTMLImageElement).src).toBe(
		'https://head.sttr.io/face/Notch'
	)
	fireEvent.click(within(dialog).getByRole('button', { name: 'Retirer l’avatar' }))
	await waitFor(() => expect(mocks.head).toHaveBeenLastCalledWith({ username: null }))
	await screen.findByText('Avatar retiré.')
	expect(screen.queryByRole('dialog')).toBeNull()
})
test('a failed avatar change keeps the dialog open with a safe error', async () => {
	mocks.image.value = 'https://head.sttr.io/face/Notch'
	mocks.head.mockRejectedValue(new Error('private details'))
	page()
	fireEvent.click(screen.getByRole('button', { name: 'Changer d’avatar' }))
	const dialog = screen.getByRole('dialog', { name: 'Avatar' })
	fireEvent.click(within(dialog).getByRole('button', { name: 'Retirer l’avatar' }))
	await within(dialog).findByRole('alert')
	expect(screen.queryByText('private details')).toBeNull()
	expect(screen.getByRole('dialog', { name: 'Avatar' })).toBeTruthy()
	fireEvent.keyDown(document, { key: 'Escape' })
	expect(screen.queryByRole('alert')).toBeNull()
})

test('a taken or invalid sign-in name is explained', async () => {
	page()
	fireEvent.click(screen.getByRole('button', { name: 'Modifier le pseudo' }))
	const form = screen.getByRole('form', { name: 'Pseudo' })
	fill(form, 'Pseudo', 'Diablox')
	vi.mocked(authClient.updateUser).mockResolvedValueOnce({
		data: null,
		error: { code: 'USERNAME_IS_ALREADY_TAKEN' },
	} as never)
	fireEvent.submit(form)
	expect(await screen.findByRole('alert')).toHaveProperty(
		'textContent',
		'Un autre compte se connecte déjà avec ce pseudo.'
	)
	vi.mocked(authClient.updateUser).mockResolvedValueOnce({ data: null, error: { code: 'INVALID_USERNAME' } } as never)
	fireEvent.submit(form)
	await waitFor(() =>
		expect(screen.getByRole('alert').textContent).toBe('Un pseudo Minecraft a 3 à 16 lettres, chiffres ou _.')
	)
	vi.mocked(authClient.updateUser).mockResolvedValueOnce({ data: null, error: {} } as never)
	fireEvent.submit(form)
	await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Modification impossible'))
	expect(screen.getByRole('form', { name: 'Pseudo' })).toBeTruthy()
})
