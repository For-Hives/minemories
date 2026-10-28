// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { HomePage } from './HomePage'

const context = vi.hoisted(() => ({ session: null as null | { user: { name: string } } }))
vi.mock('../app-context', () => ({ useAppContext: () => context }))

const errors: unknown[][] = []
beforeEach(() => {
	errors.length = 0
	vi.spyOn(console, 'error').mockImplementation((...args) => {
		errors.push(args)
	})
	vi.spyOn(console, 'warn').mockImplementation(() => undefined)
	// jsdom has no WebGL, no layout and no matchMedia: the film must fall back to the site without any error.
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
	vi.stubGlobal(
		'matchMedia',
		vi.fn(() => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }))
	)
	vi.stubGlobal('scrollTo', vi.fn())
	localStorage.clear()
})
afterEach(() => {
	cleanup()
	context.session = null
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})
function mount(initialEntries = ['/']) {
	return render(
		<MemoryRouter initialEntries={initialEntries}>
			<I18nProvider initialLocale="fr">
				<HomePage />
			</I18nProvider>
		</MemoryRouter>
	)
}
const html = document.documentElement
async function started() {
	await waitFor(() => expect((window as { __hero?: { fallback: string | null } }).__hero?.fallback).toBe('webgl'))
}

test('without WebGL the film falls back to the site: the story in words, the site sections and real links, no error', async () => {
	mount()
	await started()
	expect(html.dataset.phase).toBe('site')
	expect(html.classList.contains('scene-off')).toBe(true)
	expect(html.classList.contains('scene-on')).toBe(false)
	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Il y a des soirs qu’on aimerait garder.')
	for (const id of ['hero', 'steps', 'share', 'limits', 'more', 'faq', 'words'])
		expect(document.getElementById(id)).not.toBeNull()
	// the story is readable as text for people who cannot see the canvas
	expect(document.getElementById('w1')?.textContent?.length).toBeGreaterThan(40)
	const hrefs = [...document.querySelectorAll('a[href^="/"]')].map(a => a.getAttribute('href'))
	for (const route of [
		'/installation',
		'/privacy',
		'/terms',
		'/legal',
		'/concept',
		'/fonctionnement',
		'/faq',
		'/blog',
		'/pricing',
		'/login',
	])
		expect(hrefs, route).toContain(route)
	// every target of the former home page is still linked (the demo memories, the community, the concept, the discovery pages, the album)
	for (const target of [
		'/explorer?demo=1',
		'/explorer',
		'/concept',
		'/open-source',
		'/nostalgie',
		'/partager',
		'/classement',
		'/register',
	])
		expect(hrefs, target).toContain(target)
	// the prototype's three dead root links are real routes now; nothing points at a file next to the page
	expect(hrefs.filter(h => /\.html?$/.test(String(h)))).toEqual([])
	expect(errors).toEqual([])
})

test('one language selector is visible, it is the app one, and the whole page follows it', async () => {
	mount()
	await started()
	const selector = screen.getByRole('combobox', { name: 'Langue' })
	expect(screen.getAllByRole('combobox')).toHaveLength(1)
	expect(within(selector).getAllByRole('option')).toHaveLength(11)
	act(() => {
		fireEvent.change(selector, { target: { value: 'en' } })
	})
	await waitFor(() =>
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('There are evenings we wish we could keep.')
	)
	expect(html.lang).toBe('en-US')
	expect(screen.getAllByRole('link', { name: 'Sign in' })[0]?.getAttribute('href')).toBe('/login')
	expect(localStorage.getItem('minemories-locale')).toBe('en')
	act(() => {
		fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'ja' } })
	})
	await waitFor(() => expect(html.classList.contains('mm-cjk')).toBe(true))
	expect(html.lang).toBe('ja-JP')
	expect(errors).toEqual([])
})

test('signed-in visitors see their gallery link instead of sign-in', async () => {
	context.session = { user: { name: 'Alex' } }
	mount()
	await started()
	expect(screen.queryByRole('link', { name: 'Se connecter' })).toBeNull()
	expect(screen.getAllByRole('link', { name: 'Ma galerie' })[0]?.getAttribute('href')).toBe('/gallery')
	expect(screen.getByRole('link', { name: 'Retrouver mes souvenirs' }).getAttribute('href')).toBe('/gallery')
})

test('the film leaves nothing behind: <html> is restored, listeners and test hooks are gone, and it can mount again', async () => {
	html.className = 'kept'
	html.setAttribute('data-theme', 'x')
	const view = mount()
	await started()
	expect(html.dataset.phase).toBe('site')
	expect(html.classList.contains('is-scrub')).toBe(true)
	view.unmount()
	expect(html.className).toBe('kept')
	expect(html.getAttribute('data-theme')).toBe('x')
	expect(html.dataset.phase).toBeUndefined()
	expect(html.getAttribute('style')).toBeNull()
	expect(document.body.classList.contains('mc-root')).toBe(false)
	expect((window as { __hero?: unknown }).__hero).toBeUndefined()
	// Escape, K, arrows and a wheel after the film is gone reach nothing
	fireEvent.keyDown(window, { key: 'Escape' })
	fireEvent.keyDown(window, { key: 'k' })
	mount()
	await started()
	expect(html.dataset.phase).toBe('site')
	expect(errors).toEqual([])
})

test('keys, the menu and the replay button do nothing harmful while the scene is absent', async () => {
	mount()
	await started()
	for (const key of ['k', ' ', 'ArrowRight', 'ArrowLeft', '1', '5', 'Escape']) fireEvent.keyDown(window, { key })
	const menu = document.getElementById('site-menu') as HTMLElement
	expect(menu.hidden).toBe(true)
	fireEvent.click(document.getElementById('site-menu-btn') as HTMLElement)
	expect(menu.hidden).toBe(false)
	fireEvent.keyDown(document, { key: 'Escape' })
	expect(menu.hidden).toBe(true)
	fireEvent.click(screen.getAllByRole('button', { name: 'Revoir le film' })[0] as HTMLElement)
	fireEvent.click(document.getElementById('film-play') as HTMLElement)
	fireEvent.click(document.getElementById('film-skip') as HTMLElement)
	// options: the readable font applies at once and is remembered
	const font = screen.getByRole('checkbox', { name: 'Police lisible' })
	fireEvent.click(font)
	expect(html.dataset.mcFont).toBe('read')
	expect(localStorage.getItem('mcui-font')).toBe('1')
	fireEvent.click(font)
	expect(html.dataset.mcFont).toBeUndefined()
	expect(errors).toEqual([])
})
