// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { SocialSignIn } from './SocialSignIn'

const social = vi.hoisted(() => vi.fn())
const linkSocial = vi.hoisted(() => vi.fn())
vi.mock('../auth-client', () => ({ authClient: { signIn: { social }, linkSocial } }))
afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.clearAllMocks()
})
function page(destination = '/gallery') {
	return render(
		<I18nProvider initialLocale="en">
			<SocialSignIn destination={destination} />
		</I18nProvider>
	)
}
test('only enabled known providers appear and Google preserves the internal destination', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ['google', 'discord', 'unknown'] }))
	social.mockResolvedValue({})
	page('/viewer?memory=proof')
	fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }))
	await waitFor(() =>
		expect(social).toHaveBeenCalledWith({
			provider: 'google',
			callbackURL: `${window.location.origin}/viewer?memory=proof`,
		})
	)
	expect(screen.getByRole('button', { name: 'Continue with Discord' })).toHaveProperty('disabled', true)
})
test('Discord errors allow retry and external destinations fall back to the gallery', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ['discord'] }))
	social.mockResolvedValue({ error: { message: 'internal detail' } })
	page('//evil.example')
	fireEvent.click(await screen.findByRole('button', { name: 'Continue with Discord' }))
	await screen.findByRole('alert')
	expect(social).toHaveBeenCalledWith({ provider: 'discord', callbackURL: `${window.location.origin}/gallery` })
	expect(screen.getByRole('button', { name: 'Continue with Discord' })).toHaveProperty('disabled', false)
	expect(screen.queryByText('internal detail')).toBeNull()
})
test('configuration failure never blocks the email login', async () => {
	vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
	const view = page()
	await waitFor(() => expect(fetch).toHaveBeenCalled())
	expect(view.container.textContent).toBe('')
})

test('the profile explicitly links a provider to the current account and hides existing associations', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ['google', 'discord'] }))
	linkSocial.mockResolvedValue({})
	render(
		<I18nProvider initialLocale="en">
			<SocialSignIn destination="/account" link linkedProviders={['google']} />
		</I18nProvider>
	)
	fireEvent.click(await screen.findByRole('button', { name: 'Link Discord' }))
	await waitFor(() =>
		expect(linkSocial).toHaveBeenCalledWith({ provider: 'discord', callbackURL: `${window.location.origin}/account` })
	)
	expect(screen.queryByRole('button', { name: 'Link Google' })).toBeNull()
	expect(social).not.toHaveBeenCalled()
})
