// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../App'

vi.mock('../auth-client', () => ({
	authClient: { useSession: () => ({ data: null, isPending: false, refetch: async () => undefined }) },
}))

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	localStorage.clear()
	window.history.replaceState(null, '', '/')
})

test('the URL names the language: /fr pages render in French and their links stay under /fr', async () => {
	vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
	window.history.replaceState(null, '', '/fr/faq')
	render(<App />)
	await waitFor(() => expect(document.documentElement.lang).toBe('fr-FR'))
	expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe('https://minemories.net/fr/faq')
	expect(screen.getAllByRole('link', { name: 'Se connecter' })[0]?.getAttribute('href')).toBe('/fr/login')
})

test('choosing a language moves to the same page under its prefix, saves it, and Back returns', async () => {
	vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
	window.history.replaceState(null, '', '/faq?x=1#bedrock')
	render(<App />)
	await waitFor(() => expect(document.documentElement.lang).toBe('en-US'))
	fireEvent.click(screen.getByRole('button', { name: /^Language / }))
	act(() => {
		fireEvent.click(within(screen.getByRole('listbox', { name: 'Language' })).getByRole('option', { name: 'Français' }))
	})
	await waitFor(() => expect(window.location.pathname).toBe('/fr/faq'))
	expect(window.location.search).toBe('?x=1')
	expect(window.location.hash).toBe('#bedrock')
	expect(localStorage.getItem('minemories-locale')).toBe('fr')
	await waitFor(() => expect(document.documentElement.lang).toBe('fr-FR'))
	act(() => {
		window.history.back()
	})
	await waitFor(() => expect(document.documentElement.lang).toBe('en-US'))
})
