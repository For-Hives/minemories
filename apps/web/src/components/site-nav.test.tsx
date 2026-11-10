// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Link, MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { navMenus } from '../content/navigation'
import { I18nProvider } from '../i18n/I18n'
import { publicMetadata } from '../route-metadata'
import { SiteNav } from './SiteNav'

const mocks = vi.hoisted(() => ({
	context: {
		session: null as null | { user: { id: string; name: string; email?: string; image?: string | null } },
		isPending: false,
		refreshSession: vi.fn(),
	},
	navigate: vi.fn(),
	signOut: vi.fn(),
	access: { admin: false, moderator: false, operator: false },
}))
vi.mock('../app-context', () => ({ useAppContext: () => mocks.context }))
vi.mock('../auth-client', () => ({ authClient: { signOut: mocks.signOut } }))
vi.mock('react-router', async importOriginal => ({
	...(await importOriginal<typeof import('react-router')>()),
	useNavigate: () => mocks.navigate,
}))
vi.mock('../api-client', () => ({
	apiClient: {
		admin: { access: async () => ({ allowed: mocks.access.admin }) },
		discovery: { moderator: async () => ({ allowed: mocks.access.moderator }) },
		diagnostics: { access: async () => ({ allowed: mocks.access.operator }) },
	},
}))

const media = vi.hoisted(() => ({ listeners: [] as Array<(event: { matches: boolean }) => void> }))
beforeEach(() => {
	media.listeners.length = 0
	vi.stubGlobal(
		'matchMedia',
		vi.fn(() => ({
			matches: false,
			addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => media.listeners.push(listener),
			removeEventListener: () => undefined,
		}))
	)
})
afterEach(() => {
	cleanup()
	mocks.context.session = null
	mocks.context.isPending = false
	mocks.access.admin = false
	vi.clearAllMocks()
	vi.unstubAllGlobals()
})

function Where() {
	const { pathname, hash } = useLocation()
	return (
		<p data-testid="where">
			{pathname}
			{hash}
		</p>
	)
}
function mount(path = '/installation', landing = false) {
	return render(
		<I18nProvider initialLocale="en">
			<MemoryRouter initialEntries={[path]}>
				<header>
					<a className="mm-brand" href="/">
						Minemories
					</a>
					<SiteNav landing={landing} extra={<span>extra</span>} />
				</header>
				<Link to="/roadmap">Elsewhere</Link>
				<Where />
			</MemoryRouter>
		</I18nProvider>
	)
}
const bar = () => screen.getAllByRole('navigation', { name: 'Main navigation' })[0] as HTMLElement
const trigger = (name: string) => within(bar()).getByRole('button', { name })

test('every public page of the site, the home aside, is in the bar menus', () => {
	const linked = navMenus(true).flatMap(menu =>
		menu.sections.flatMap(section => section.links.map(link => ('to' in link ? link.to : link.href)))
	)
	for (const { path } of publicMetadata.filter(page => page.path !== '/')) expect(linked, path).toContain(path)
})

test('every page of the site is in the bar, under Product, Guides and Help; the page on screen marks its menu', () => {
	mount('/installation')
	const hrefs: string[] = []
	for (const name of ['Product', 'Guides', 'Help']) {
		fireEvent.click(trigger(name))
		const panel = document.getElementById(trigger(name).getAttribute('aria-controls') ?? '') as HTMLElement
		expect(trigger(name).getAttribute('aria-expanded')).toBe('true')
		hrefs.push(
			...within(panel)
				.getAllByRole('link')
				.map(link => link.getAttribute('href') ?? '')
		)
	}
	expect(hrefs).toEqual([
		'/concept',
		'/how-it-works',
		'/sharing',
		'/explore',
		'/installation',
		'/downloads',
		'/server-closing',
		'/guides/minecraft-blender',
		'/faq',
		'/safety',
		'/versions',
		'/roadmap',
		'https://github.com/For-Hives/minemories/issues',
		'/privacy',
		'/terms',
		'/legal',
		'https://www.curseforge.com/minecraft/mc-mods/minemories',
		'https://github.com/For-Hives/minemories',
	])
	// one menu open at a time; the page on screen is marked, and its menu too
	expect(trigger('Guides').getAttribute('aria-expanded')).toBe('false')
	expect(trigger('Guides').hasAttribute('data-current')).toBe(true)
	expect(trigger('Help').hasAttribute('data-current')).toBe(false)
	fireEvent.click(trigger('Guides'))
	expect(
		screen
			.getAllByRole('link', { name: 'Install the mod' })
			.find(link => link.closest('nav'))
			?.getAttribute('aria-current')
	).toBe('page')
	// a link closes the menus and goes to its page
	fireEvent.click(screen.getByRole('link', { name: 'Downloads' }))
	expect(screen.getByTestId('where').textContent).toBe('/downloads')
	expect(trigger('Guides').getAttribute('aria-expanded')).toBe('false')
})

test('menus: Escape and a press outside close them, the arrows move along the bar and into a menu, a hover follows an open menu', async () => {
	mount('/faq')
	fireEvent.click(trigger('Product'))
	fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
	expect(trigger('Product').getAttribute('aria-expanded')).toBe('false')
	expect(document.activeElement).toBe(trigger('Product'))
	// right and left wrap along the bar, Home and End too; a closed bar stays closed
	fireEvent.keyDown(trigger('Product'), { key: 'ArrowRight' })
	expect(document.activeElement).toBe(trigger('Guides'))
	fireEvent.keyDown(trigger('Guides'), { key: 'End' })
	expect(document.activeElement).toBe(trigger('Help'))
	fireEvent.keyDown(trigger('Help'), { key: 'ArrowRight' })
	expect(document.activeElement).toBe(trigger('Product'))
	expect(trigger('Product').getAttribute('aria-expanded')).toBe('false')
	fireEvent.keyDown(trigger('Product'), { key: 'Enter' })
	// down opens the menu on its first link; up and down move through its links
	fireEvent.keyDown(trigger('Help'), { key: 'ArrowDown' })
	await waitFor(() => expect(document.activeElement?.textContent).toBe('FAQ'))
	const panel = document.getElementById(trigger('Help').getAttribute('aria-controls') ?? '') as HTMLElement
	fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' })
	expect(document.activeElement?.textContent).toBe('GitHub')
	// the groups after the first are named lists
	expect(within(panel).getByRole('list', { name: 'Legal' })).toBeTruthy()
	expect(within(panel).getByRole('list', { name: 'Elsewhere' })).toBeTruthy()
	fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Home' })
	expect(document.activeElement?.textContent).toBe('FAQ')
	fireEvent.keyDown(panel, { key: 'a' })
	// an open menu follows the bar's keys and the mouse to its neighbours; a touch does not
	fireEvent.keyDown(trigger('Help'), { key: 'ArrowLeft' })
	expect(trigger('Guides').getAttribute('aria-expanded')).toBe('true')
	fireEvent.pointerEnter(trigger('Product'), { pointerType: 'mouse' })
	expect(trigger('Product').getAttribute('aria-expanded')).toBe('true')
	fireEvent.pointerEnter(trigger('Help'), { pointerType: 'touch' })
	expect(trigger('Product').getAttribute('aria-expanded')).toBe('true')
	// focus leaving the bar closes it; a press outside too
	fireEvent.blur(trigger('Product'), { relatedTarget: trigger('Guides') })
	expect(trigger('Product').getAttribute('aria-expanded')).toBe('true')
	fireEvent.blur(trigger('Product'), { relatedTarget: null })
	expect(trigger('Product').getAttribute('aria-expanded')).toBe('false')
	fireEvent.click(trigger('Product'))
	fireEvent.pointerDown(trigger('Help'))
	expect(trigger('Product').getAttribute('aria-expanded')).toBe('true')
	fireEvent.pointerDown(screen.getByTestId('where'))
	expect(trigger('Product').getAttribute('aria-expanded')).toBe('false')
	fireEvent.pointerEnter(trigger('Help'), { pointerType: 'mouse' })
	expect(trigger('Help').getAttribute('aria-expanded')).toBe('false')
	// a click on the open menu's button closes it; a new page too
	fireEvent.click(trigger('Help'))
	fireEvent.click(trigger('Help'))
	expect(trigger('Help').getAttribute('aria-expanded')).toBe('false')
	fireEvent.click(trigger('Help'))
	fireEvent.click(screen.getByRole('link', { name: 'Elsewhere' }))
	expect(trigger('Help').getAttribute('aria-expanded')).toBe('false')
})

test('on the landing, Product starts with the page sections, which glide in place', () => {
	mount('/', true)
	fireEvent.click(trigger('Product'))
	const panel = document.getElementById(trigger('Product').getAttribute('aria-controls') ?? '') as HTMLElement
	expect(within(panel).getByText('On this page').closest('[data-landing-sections]')).toBeTruthy()
	const sections = within(panel)
		.getAllByRole('link')
		.filter(link => link.hasAttribute('data-section-link'))
	// the sections have their own names, never a page's ("How it works" and "FAQ" are pages)
	expect(sections.map(link => [link.textContent, link.getAttribute('href')])).toEqual([
		['The three steps', '#steps'],
		['Show it to the group', '#share'],
		['Your server is closing?', '#server-closing'],
		['Questions', '#faq'],
	])
	expect(within(panel).getByRole('list', { name: 'Pages' })).toBeTruthy()
	const names = within(panel)
		.getAllByRole('link')
		.map(link => link.textContent)
	expect(new Set(names).size).toBe(names.length)
	expect(sections[0]?.getAttribute('rel')).toBeNull()
	fireEvent.click(sections[3] as HTMLElement)
	expect(trigger('Product').getAttribute('aria-expanded')).toBe('false')
	fireEvent.click(trigger('Help'))
	expect(screen.getByRole('link', { name: 'Report a bug (GitHub)' }).getAttribute('rel')).toBe('noopener')
})

test('the account: Sign in, a placeholder while the session loads, or the avatar opening the account menu', async () => {
	mocks.context.isPending = true
	const view = mount('/login')
	expect(screen.getByText('extra')).toBeTruthy()
	expect(document.querySelector('.mm-nav-end__wide')?.textContent).not.toContain('Sign in')
	mocks.context.isPending = false
	view.rerender(
		<I18nProvider initialLocale="en">
			<MemoryRouter initialEntries={['/login']}>
				<SiteNav />
			</MemoryRouter>
		</I18nProvider>
	)
	const signIn = screen.getAllByRole('link', { name: 'Sign in' })[0] as HTMLElement
	expect(signIn.getAttribute('href')).toBe('/login')
	expect(signIn.getAttribute('aria-current')).toBe('page')
	cleanup()
	mocks.context.session = { user: { id: 'u1', name: 'Alex', image: null } }
	mocks.access.admin = true
	mocks.signOut.mockResolvedValue({})
	mount('/gallery')
	const account = screen.getByRole('button', { name: 'Alex — My account' })
	expect(account.textContent).toContain('A')
	fireEvent.click(account)
	const panel = document.getElementById(account.getAttribute('aria-controls') ?? '') as HTMLElement
	expect(within(panel).getByRole('link', { name: 'My gallery' }).getAttribute('aria-current')).toBe('page')
	expect(within(panel).getByRole('link', { name: 'My account' }).getAttribute('href')).toBe('/account')
	expect(await within(panel).findByRole('link', { name: 'Administration' })).toBeTruthy()
	within(panel).getByRole('link', { name: 'My gallery' }).focus()
	fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' })
	expect(document.activeElement?.textContent).toBe('My account')
	fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
	expect(account.getAttribute('aria-expanded')).toBe('false')
	expect(document.activeElement).toBe(account)
	fireEvent.click(account)
	fireEvent.blur(account, { relatedTarget: within(panel).getByRole('link', { name: 'My gallery' }) })
	expect(account.getAttribute('aria-expanded')).toBe('true')
	fireEvent.blur(account, { relatedTarget: null })
	expect(account.getAttribute('aria-expanded')).toBe('false')
	fireEvent.click(account)
	fireEvent.click(within(panel).getByRole('link', { name: 'My account' }))
	expect(account.getAttribute('aria-expanded')).toBe('false')
	fireEvent.click(account)
	fireEvent.click(within(panel).getByRole('button', { name: 'Sign out' }))
	await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/'))
	expect(mocks.signOut).toHaveBeenCalledOnce()
	expect(mocks.context.refreshSession).toHaveBeenCalled()
})

test('no administration link without a confirmed access', async () => {
	mocks.context.session = { user: { id: 'u2', name: 'Sam' } }
	mount('/faq')
	fireEvent.click(screen.getByRole('button', { name: 'Sam — My account' }))
	await screen.findByRole('link', { name: 'My gallery' })
	await new Promise(resolve => setTimeout(resolve, 0))
	expect(screen.queryByRole('link', { name: 'Administration' })).toBeNull()
})

test('the phones’ panel: a modal dialog with the groups, the account and the language; focus kept inside; Escape, outside and a link close it', () => {
	const view = mount('/faq')
	const button = screen.getByRole('button', { name: 'Menu' })
	expect(button.getAttribute('aria-controls')).toBe('site-menu')
	expect(screen.queryByRole('dialog')).toBeNull()
	fireEvent.click(button)
	const dialog = screen.getByRole('dialog', { name: 'Menu' })
	expect(button.getAttribute('aria-expanded')).toBe('true')
	expect(document.documentElement.classList.contains('mm-scroll-lock')).toBe(true)
	// the page's group is unfolded, the others wait
	const groups = within(dialog).getAllByRole('button', { expanded: false })
	expect(within(dialog).getByRole('button', { name: 'Help' }).getAttribute('aria-expanded')).toBe('true')
	expect(within(dialog).getByRole('link', { name: 'FAQ' }).getAttribute('aria-current')).toBe('page')
	fireEvent.click(within(dialog).getByRole('button', { name: 'Product' }))
	expect(within(dialog).getByRole('link', { name: 'The concept' })).toBeTruthy()
	expect(groups.length).toBeGreaterThan(0)
	expect(within(dialog).getByRole('button', { name: /^Language / })).toBeTruthy()
	expect(within(dialog).getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login')
	// the bar keeps the install button: the panel does not repeat it
	expect(within(dialog).queryByRole('link', { name: 'Install the mod' })).toBeNull()
	expect(dialog.getAttribute('aria-modal')).toBe('true')
	expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Product' }))
	// Tab wraps from the last control to the menu button, Shift+Tab back
	const last = within(dialog).getByRole('button', { name: /^Language / })
	last.focus()
	fireEvent.keyDown(document, { key: 'Tab' })
	expect(document.activeElement).toBe(button)
	fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
	expect(document.activeElement).toBe(last)
	fireEvent.keyDown(document, { key: 'Tab' })
	fireEvent.keyDown(document, { key: 'Tab' })
	expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Product' }))
	fireEvent.keyDown(document, { key: 'a' })
	;(document.activeElement as HTMLElement).blur()
	fireEvent.keyDown(document, { key: 'Tab' })
	expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Product' }))
	// Escape closes the language list first, then the panel, focus back on its button
	fireEvent.click(within(dialog).getByRole('button', { name: /^Language / }))
	expect(screen.getByRole('listbox')).toBeTruthy()
	fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
	expect(screen.queryByRole('listbox')).toBeNull()
	expect(screen.getByRole('dialog')).toBeTruthy()
	fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
	expect(screen.queryByRole('dialog')).toBeNull()
	expect(document.activeElement).toBe(button)
	expect(document.documentElement.classList.contains('mm-scroll-lock')).toBe(false)
	// a press outside (the dimmed page) closes it, a press inside does not
	fireEvent.click(button)
	fireEvent.pointerDown(screen.getByRole('dialog'))
	expect(screen.getByRole('dialog')).toBeTruthy()
	fireEvent.pointerDown(screen.getByTestId('where'))
	expect(screen.queryByRole('dialog')).toBeNull()
	// a link closes it and goes to its page; the button closes it too
	fireEvent.click(button)
	fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Roadmap' }))
	expect(screen.getByTestId('where').textContent).toBe('/roadmap')
	expect(screen.queryByRole('dialog')).toBeNull()
	fireEvent.click(button)
	fireEvent.click(button)
	expect(screen.queryByRole('dialog')).toBeNull()
	// the panel goes with its button: the menus fit again, or the landing's film hides the button (jsdom: no box)
	fireEvent.click(button)
	act(() => {
		for (const listener of media.listeners) listener({ matches: false })
	})
	expect(screen.getByRole('dialog')).toBeTruthy()
	act(() => {
		for (const listener of media.listeners) listener({ matches: true })
	})
	expect(screen.queryByRole('dialog')).toBeNull()
	fireEvent.click(button)
	act(() => {
		document.dispatchEvent(new Event('mm:phase'))
	})
	expect(screen.queryByRole('dialog')).toBeNull()
	view.unmount()
})

test('a page with a scrollbar keeps its room while the panel is open; the signed-in panel lists the account', async () => {
	mocks.context.session = { user: { id: 'u3', name: 'Kim', image: null } }
	vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(window.innerWidth - 15)
	const access = vi.fn(async () => ({ allowed: false }))
	const { apiClient } = await import('../api-client')
	apiClient.admin.access = access
	mount('/gallery')
	// the administration check waits for a menu of the account to open
	await new Promise(resolve => setTimeout(resolve, 0))
	expect(access).not.toHaveBeenCalled()
	fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
	await waitFor(() => expect(access).toHaveBeenCalled())
	expect(document.documentElement.classList.contains('mm-scroll-lock--gutter')).toBe(true)
	const dialog = screen.getByRole('dialog')
	expect(within(dialog).getByText('Kim')).toBeTruthy()
	fireEvent.click(within(dialog).getByRole('link', { name: 'My account' }))
	expect(screen.getByTestId('where').textContent).toBe('/account')
	expect(document.documentElement.classList.contains('mm-scroll-lock--gutter')).toBe(false)
})

test('menus and the keyboard: Down into an open menu, Escape never takes the focus from another button, Tab to another button closes', () => {
	mount('/installation')
	// Down on a menu already open goes into it; a later click on another menu leaves the focus on its button
	act(() => trigger('Guides').focus())
	fireEvent.click(trigger('Guides'))
	fireEvent.keyDown(trigger('Guides'), { key: 'ArrowDown' })
	expect(document.activeElement?.textContent).toBe('Install the mod')
	act(() => trigger('Help').focus())
	expect(trigger('Guides').getAttribute('aria-expanded')).toBe('false')
	fireEvent.click(trigger('Help'))
	expect(trigger('Help').getAttribute('aria-expanded')).toBe('true')
	expect(document.activeElement).toBe(trigger('Help'))
	// Shift+Tab (or Tab) to another menu's button closes the open one; Escape then leaves the focus where it is
	act(() => trigger('Guides').focus())
	expect(trigger('Help').getAttribute('aria-expanded')).toBe('false')
	fireEvent.click(trigger('Help'))
	act(() => trigger('Guides').focus())
	fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
	expect(document.activeElement).toBe(trigger('Guides'))
	// the link to the page on screen closes the menu and gives the focus back to its button
	fireEvent.click(trigger('Guides'))
	const here = screen.getAllByRole('link', { name: 'Install the mod' }).find(link => link.closest('nav')) as HTMLElement
	act(() => here.focus())
	fireEvent.click(here)
	expect(trigger('Guides').getAttribute('aria-expanded')).toBe('false')
	expect(document.activeElement).toBe(trigger('Guides'))
})

test('the account behaves like the other menus: in the bar’s arrows, Down opens it on its first link, its full list ready', async () => {
	mocks.context.session = { user: { id: 'u4', name: 'Aleksandra', email: 'aleksandra@example.test', image: null } }
	mocks.access.admin = true
	const access = vi.fn(async () => ({ allowed: true }))
	const { apiClient } = await import('../api-client')
	apiClient.admin.access = access
	mount('/faq')
	const account = screen.getByRole('button', { name: 'Aleksandra — My account' })
	expect(account.className).toContain('mc-btn')
	// the administration check starts on a hover or a focus, before the menu opens
	expect(access).not.toHaveBeenCalled()
	fireEvent.pointerEnter(account)
	await waitFor(() => expect(access).toHaveBeenCalled())
	// right from the last menu reaches the account, left comes back
	trigger('Help').focus()
	fireEvent.keyDown(trigger('Help'), { key: 'ArrowRight' })
	expect(document.activeElement).toBe(account)
	fireEvent.keyDown(account, { key: 'ArrowLeft' })
	expect(document.activeElement).toBe(trigger('Help'))
	fireEvent.keyDown(trigger('Help'), { key: 'End' })
	expect(document.activeElement).toBe(account)
	fireEvent.keyDown(account, { key: 'ArrowDown' })
	await waitFor(() => expect(document.activeElement?.textContent).toBe('My gallery'))
	const panel = document.getElementById(account.getAttribute('aria-controls') ?? '') as HTMLElement
	// who is signed in heads the menu; administration and signing out come after a rule
	expect(within(panel).getByText('Aleksandra')).toBeTruthy()
	expect(within(panel).getByText('aleksandra@example.test')).toBeTruthy()
	const groups = panel.querySelectorAll('.mm-nav__section')
	expect(groups).toHaveLength(2)
	expect(within(groups[1] as HTMLElement).getByRole('link', { name: 'Administration' })).toBeTruthy()
	expect(within(groups[1] as HTMLElement).getByRole('button', { name: 'Sign out' })).toBeTruthy()
	// Down on the open account's button goes back into its menu
	account.focus()
	fireEvent.keyDown(account, { key: 'ArrowDown' })
	expect(document.activeElement?.textContent).toBe('My gallery')
	fireEvent.keyDown(account, { key: 'Enter' })
	expect(account.getAttribute('aria-expanded')).toBe('true')
	// the link to the page on screen closes the menu, the focus back on its button
	fireEvent.click(account)
	fireEvent.click(account)
	const gallery = within(panel).getByRole('link', { name: 'My gallery' })
	fireEvent.click(gallery)
	expect(screen.getByTestId('where').textContent).toBe('/gallery')
})

test('signing out goes home, the brand taking the focus', async () => {
	mocks.context.session = { user: { id: 'u5', name: 'Noa', image: null } }
	mocks.signOut.mockResolvedValue({})
	mount('/faq')
	const account = screen.getByRole('button', { name: 'Noa — My account' })
	fireEvent.click(account)
	fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
	await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/'))
	await waitFor(() => expect(document.activeElement?.textContent).toBe('Minemories'))
})

test('the open panel makes the rest of the page inert, gives back only what it changed, and Tab leaves the language list for the ring', () => {
	const view = render(
		<I18nProvider initialLocale="en">
			<MemoryRouter initialEntries={['/faq']}>
				<a href="#main">skip</a>
				<header>
					<SiteNav />
				</header>
				<main>page</main>
				<footer inert>already inert</footer>
			</MemoryRouter>
		</I18nProvider>
	)
	const button = screen.getByRole('button', { name: 'Menu' })
	fireEvent.click(button)
	const main = view.container.querySelector('main') as HTMLElement
	const skip = view.container.querySelector('a[href="#main"]') as HTMLElement
	const footer = view.container.querySelector('footer') as HTMLElement
	expect(main.hasAttribute('inert')).toBe(true)
	expect(skip.hasAttribute('inert')).toBe(true)
	expect(view.container.querySelector('header')?.hasAttribute('inert')).toBe(false)
	// from the language list (not in the Tab order) Tab goes on to the ring's next control, Shift+Tab to the previous one
	const dialog = screen.getByRole('dialog')
	const language = within(dialog).getByRole('button', { name: /^Language / })
	fireEvent.click(language)
	expect(document.activeElement).toBe(screen.getByRole('listbox'))
	fireEvent.keyDown(document, { key: 'Tab' })
	expect(document.activeElement).toBe(button)
	fireEvent.click(language)
	fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
	expect(document.activeElement).toBe(language)
	// a link of a section before the list: Tab from outside the ring goes to the first control after it
	const outside = document.createElement('button')
	dialog.prepend(outside)
	outside.tabIndex = -1
	outside.focus()
	fireEvent.keyDown(document, { key: 'Tab' })
	expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Product' }))
	outside.focus()
	fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
	expect(document.activeElement).toBe(button)
	outside.remove()
	fireEvent.click(button)
	expect(main.hasAttribute('inert')).toBe(false)
	expect(skip.hasAttribute('inert')).toBe(false)
	expect(footer.hasAttribute('inert')).toBe(true)
})

test('the phones’ panel lists the signed-in account in a group of its own; a link to the page on screen gives the focus back to the three bars', () => {
	mocks.context.session = { user: { id: 'u6', name: 'Lou', email: 'lou@example.test', image: null } }
	mount('/account')
	const button = screen.getByRole('button', { name: 'Menu' })
	fireEvent.click(button)
	const dialog = screen.getByRole('dialog')
	const group = within(dialog).getByRole('button', { name: 'Lou' })
	// the account's page is on screen: its group starts unfolded
	expect(group.getAttribute('aria-expanded')).toBe('true')
	expect(within(dialog).getByText('lou@example.test')).toBeTruthy()
	fireEvent.click(within(dialog).getByRole('link', { name: 'My account' }))
	expect(screen.queryByRole('dialog')).toBeNull()
	expect(document.activeElement).toBe(button)
})
