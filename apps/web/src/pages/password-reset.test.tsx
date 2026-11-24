// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ForgotPasswordPage, ResetPasswordPage } from './PasswordResetPages'

const mocks = vi.hoisted(() => ({ request: vi.fn(), reset: vi.fn(), navigate: vi.fn() }))
vi.mock('../auth-client', () => ({
	authClient: { requestPasswordReset: mocks.request, resetPassword: mocks.reset },
}))
vi.mock('react-router', async importOriginal => ({
	...(await importOriginal<typeof import('react-router')>()),
	useNavigate: () => mocks.navigate,
}))
beforeEach(() => {
	vi.clearAllMocks()
	mocks.request.mockResolvedValue({ data: { status: true }, error: null })
	mocks.reset.mockResolvedValue({ data: { status: true }, error: null })
})
afterEach(cleanup)

function at(entry: string | { pathname: string; search?: string; state?: unknown }, page: React.ReactNode) {
	return render(<MemoryRouter initialEntries={[entry]}>{page}</MemoryRouter>)
}

test('forgot password sends what was typed on the sign-in page, then answers the same for any account', async () => {
	at({ pathname: '/login/forgot', state: { identifier: 'Diablox' } }, <ForgotPasswordPage />)
	const field = screen.getByLabelText('Email or Minecraft name') as HTMLInputElement
	expect(field.value).toBe('Diablox')
	fireEvent.change(field, { target: { value: '  Diablox ' } })
	fireEvent.click(screen.getByRole('button', { name: 'Send me a link' }))
	expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeTruthy()
	expect(mocks.request).toHaveBeenCalledWith({
		email: 'Diablox',
		redirectTo: `${window.location.origin}/login/reset`,
	})
	expect(screen.getByRole('status').textContent).toContain('The link works for one hour.')
	expect(screen.getByRole('link', { name: '← Back to sign-in' }).getAttribute('href')).toBe('/login')
})

test('forgot password shows why a request failed, and a second click waits for the first', async () => {
	let answer: ((value: unknown) => void) | undefined
	mocks.request.mockImplementationOnce(
		() =>
			new Promise(resolve => {
				answer = resolve
			})
	)
	at('/login/forgot', <ForgotPasswordPage />)
	fireEvent.change(screen.getByLabelText('Email or Minecraft name'), { target: { value: 'a@example.com' } })
	const form = screen.getByRole('button', { name: 'Send me a link' }).closest('form') as HTMLFormElement
	fireEvent.submit(form)
	expect(screen.getByRole('button', { name: 'One moment…' })).toHaveProperty('disabled', true)
	fireEvent.submit(form)
	expect(mocks.request).toHaveBeenCalledOnce()
	await act(async () => {
		answer?.({ error: { code: 'RESET_PASSWORD_DISABLED' } })
	})
	expect((await screen.findByRole('alert')).textContent).toBe(
		'Password reset is unavailable right now. Try again later.'
	)
	await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('alert')))
	mocks.request.mockRejectedValueOnce(new Error('offline'))
	fireEvent.submit(form)
	await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Could not connect right now.'))
})

test('the email link sets a new password once both fields match, then sends the player to sign in', async () => {
	at({ pathname: '/login/reset', search: '?token=abc123' }, <ResetPasswordPage />)
	const form = screen.getByRole('button', { name: 'Save my new password' }).closest('form') as HTMLFormElement
	fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'a-brand-new-password' } })
	fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'something-else-entirely' } })
	fireEvent.submit(form)
	expect(screen.getByRole('alert').textContent).toBe('The new passwords do not match.')
	expect(mocks.reset).not.toHaveBeenCalled()
	fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'a-brand-new-password' } })
	fireEvent.submit(form)
	await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/login?updated=password', { replace: true }))
	expect(mocks.reset).toHaveBeenCalledWith({ newPassword: 'a-brand-new-password', token: 'abc123' })
})

test('a used or expired link says so, before and after the form', async () => {
	at({ pathname: '/login/reset', search: '?error=INVALID_TOKEN' }, <ResetPasswordPage />)
	expect(screen.getByRole('heading', { name: 'This link no longer works' })).toBeTruthy()
	expect(screen.getByRole('link', { name: 'Ask for a new link' }).getAttribute('href')).toBe('/login/forgot')
	cleanup()
	mocks.reset.mockResolvedValueOnce({ error: { code: 'INVALID_TOKEN' } })
	at({ pathname: '/login/reset', search: '?token=used' }, <ResetPasswordPage />)
	fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'a-brand-new-password' } })
	fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'a-brand-new-password' } })
	fireEvent.click(screen.getByRole('button', { name: 'Save my new password' }))
	expect((await screen.findByRole('alert')).textContent).toBe('This link no longer works. Ask for a new one.')
	expect(mocks.navigate).not.toHaveBeenCalled()
})
