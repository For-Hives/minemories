// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../App'

vi.mock('../auth-client', () => ({
	authClient: { useSession: () => ({ data: null, isPending: false, refetch: async () => undefined }) },
}))

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
	localStorage.clear()
	window.history.replaceState(null, '', '/')
})

test('the app serves /roadmap and the footer of every site page links to it', async () => {
	vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'roadmap_unavailable' }, { status: 503 })))
	localStorage.setItem('minemories-locale', 'en')
	window.history.replaceState(null, '', '/faq')
	render(<App />)
	const footer = await screen.findByRole('contentinfo')
	fireEvent.click(within(footer).getByRole('link', { name: 'Roadmap' }))
	expect(await screen.findByRole('heading', { level: 1, name: 'Roadmap' }, { timeout: 10000 })).toBeTruthy()
	expect(window.location.pathname).toBe('/roadmap')
	expect(await screen.findByRole('alert')).toBeTruthy()
})
