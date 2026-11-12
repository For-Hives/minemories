// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { chooseLanguage } from '../testing/language'
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

test('the film exposes how many captures fell back to the full GLB files (none before any download)', async () => {
	mount()
	await started()
	await waitFor(() =>
		expect((window as { __hero?: { captureFallbacks?: unknown } }).__hero?.captureFallbacks).toEqual({
			count: 0,
			last: null,
		})
	)
})

test('without WebGL the film falls back to the site: the story in words, the site sections and real links, no error', async () => {
	mount()
	await started()
	expect(html.dataset.phase).toBe('site')
	expect(html.classList.contains('scene-off')).toBe(true)
	expect(html.classList.contains('scene-on')).toBe(false)
	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Garde tes constructions Minecraft en 3D')
	for (const id of ['hero', 'steps', 'share', 'faq', 'words']) expect(document.getElementById(id)).not.toBeNull()
	expect(document.getElementById('more')).toBeNull()
	// the story is readable as text for people who cannot see the canvas
	expect(document.getElementById('w1')?.textContent?.length).toBeGreaterThan(40)
	const hrefs = [...document.querySelectorAll('a[href^="/"]')].map(a => a.getAttribute('href'))
	for (const route of [
		'/installation',
		'/privacy',
		'/terms',
		'/legal',
		'/concept',
		'/how-it-works',
		'/faq',
		'/sharing',
		'/login',
	])
		expect(hrefs, route).toContain(route)
	// the home sends to the install guide, the share page and the whole FAQ; the gallery stays in the footer only
	for (const target of ['/sharing', '/server-closing', '/safety', '/guides/minecraft-blender', '/faq', '/explore'])
		expect(hrefs, target).toContain(target)
	expect(hrefs).not.toContain('/explore?demo=1')
	// the prototype's three dead root links are real routes now; nothing points at a file next to the page
	expect(hrefs.filter(h => /\.html?$/.test(String(h)))).toEqual([])
	expect(errors).toEqual([])
})

test('the first screen: one install button, the facts line, three cards, then three questions and the whole FAQ', async () => {
	mount()
	await started()
	const hero = document.getElementById('hero') as HTMLElement
	expect(
		within(hero)
			.getAllByRole('link')
			.map(link => link.getAttribute('href'))
	).toEqual(['/installation'])
	const lines = [...hero.querySelectorAll('.mc-hero__compat')].map(line => line.textContent)
	expect(lines).toEqual([
		'Minecraft Java 1.18.2, 1.19.2, 1.20.1, 1.21.1, 1.21.11 · 26.3 expérimentale · Fabric, Forge, NeoForge · solo et serveurs · bêta',
	])
	const steps = document.getElementById('steps') as HTMLElement
	expect(
		within(steps)
			.getAllByRole('heading', { level: 3 })
			.map(title => title.textContent)
	).toEqual(['Installe.', 'Joue.', 'Revois.'])
	expect(steps.textContent).toContain('Appuie sur M → Prendre un souvenir.')
	const faq = document.getElementById('faq') as HTMLElement
	expect([...faq.querySelectorAll('summary')].map(summary => summary.textContent)).toEqual([
		'Il faut installer quelque chose sur le serveur\u00a0?',
		'C’est pas juste Litematica\u00a0?',
		'Et si Minemories ferme\u00a0?',
	])
	expect(within(faq).getByRole('link', { name: 'Toutes les questions →' }).getAttribute('href')).toBe('/faq')
	// the questions follow the app's language by themselves
	chooseLanguage('Langue', 'en')
	await waitFor(() =>
		expect(faq.querySelector('summary')?.textContent).toBe('Do I need to install anything on the server?')
	)
	expect(errors).toEqual([])
})

test('one language selector is visible, it is the app one, and the whole page follows it', async () => {
	mount()
	await started()
	// One picker in the bar (the phones' panel draws its own only while open), every language under its own name, the current one selected.
	expect(screen.getAllByRole('button', { name: /^Langue / })).toHaveLength(1)
	fireEvent.click(screen.getByRole('button', { name: 'Langue Français (FR)' }))
	const list = screen.getByRole('listbox', { name: 'Langue' })
	expect(within(list).getAllByRole('option')).toHaveLength(11)
	expect(within(list).getByRole('option', { selected: true }).textContent).toBe('Français (FR)')
	act(() => {
		fireEvent.click(within(list).getByRole('option', { name: 'English (US)' }))
	})
	await waitFor(() =>
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Keep your Minecraft builds in 3D')
	)
	expect(html.lang).toBe('en-US')
	expect(screen.getAllByRole('link', { name: 'Sign in' })[0]?.getAttribute('href')).toBe('/login')
	expect(localStorage.getItem('minemories-locale')).toBe('en')
	chooseLanguage('Language', 'ja')
	await waitFor(() => expect(html.classList.contains('mm-cjk')).toBe(true))
	expect(html.lang).toBe('ja-JP')
	expect(errors).toEqual([])
})

test('signed-in visitors are not offered to sign in', async () => {
	context.session = { user: { name: 'Alex' } }
	mount()
	await started()
	expect(screen.queryByRole('link', { name: 'Se connecter' })).toBeNull()
	// The bar's brand: the whole logo alone, decorative; the link's aria-label names it.
	const brand = document.querySelector('.mc-sitebar__brand')
	const mark = brand?.querySelector('img')
	expect(mark?.getAttribute('src')).toBe('/brand/minemories-logo.svg')
	expect(mark?.getAttribute('alt')).toBe('')
	expect(mark?.className).toBe('mm-brand-mark mm-brand-mark--solo')
	expect(brand?.textContent).toBe('')
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
	// the footer is the site's: no display options, the same groups of links as every page
	expect(screen.queryByRole('checkbox')).toBeNull()
	expect(screen.getByRole('navigation', { name: 'Ailleurs' })).toBeTruthy()
	expect(errors).toEqual([])
})
