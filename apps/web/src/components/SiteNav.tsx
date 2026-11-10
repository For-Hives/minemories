import {
	type FocusEvent,
	type KeyboardEvent,
	type ReactNode,
	type RefObject,
	useEffect,
	useId,
	useRef,
	useState,
} from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAppContext } from '../app-context'
import { authClient } from '../auth-client'
import { type FooterLink, type NavMenu, type NavSection, navMenus } from '../content/navigation'
import { useI18n } from '../i18n/I18n'
import { avatarUrl } from '../lib/avatar'
import { clearAllDrafts } from '../lib/form-drafts'
import { hasCurrentPage, isCurrentPage, listKeyIndex, rowKeyIndex } from '../lib/site-menu'
import { hasAnyAdminAccess, useAdminAccess } from '../pages/admin-access'
import { LanguagePicker } from './LanguagePicker'
import { LoadingSkeleton } from './Loading'
import { focusables, useInertOutside, useLayer } from './nav-layers'

/*
 * The site's bar, one design for every page and for the landing (HeroMarkup renders it in its own header): the menus of the whole site
 * (content/navigation.ts), the account, the language and "Install the mod". From DESKTOP_NAV px the menus drop from the bar; below, the
 * three bars open a panel with the same groups. The popups are in the page, closed, from the prerender on.
 */

/** The width from which the menus fit in the bar in every language (site-nav.css uses the same number). */
export const DESKTOP_NAV = 960

/** What a menu does once one of its links is chosen; `stay` is a link to the page already on screen (the focus goes back to the menu's button). */
type OnNavigate = (stay: boolean) => void

/** A link of a menu: a page of the site (marked when on screen) or an outside address. */
function NavItemLink({ link, onNavigate }: { link: FooterLink; onNavigate: OnNavigate }) {
	const { t } = useI18n()
	const { pathname } = useLocation()
	const label = link.plain ? link.label : t(link.label)
	if ('to' in link) {
		const current = isCurrentPage(pathname, link.to)
		return (
			<Link
				className="mm-nav__link"
				to={link.to}
				aria-current={current ? 'page' : undefined}
				onClick={() => onNavigate(current)}
			>
				{label}
			</Link>
		)
	}
	return (
		<a className="mm-nav__link" href={link.href} rel="noopener" onClick={() => onNavigate(false)}>
			{label}
		</a>
	)
}

/** One group of a menu; a named group's heading names its list for screen readers. */
function NavGroup({ section, onNavigate }: { section: NavSection; onNavigate: OnNavigate }) {
	const { t } = useI18n()
	const id = useId()
	return (
		<div className="mm-nav__section">
			{section.label && (
				<p className="mm-nav__heading" id={id}>
					{t(section.label)}
				</p>
			)}
			<ul aria-labelledby={section.label ? id : undefined}>
				{section.links.map(link => (
					<li key={link.label + ('to' in link ? link.to : link.href)}>
						<NavItemLink link={link} onNavigate={onNavigate} />
					</li>
				))}
			</ul>
		</div>
	)
}

function NavSections({ sections, onNavigate }: { sections: NavSection[]; onNavigate: OnNavigate }) {
	return sections.map(section => <NavGroup key={section.label ?? 'main'} section={section} onNavigate={onNavigate} />)
}

const menuLinks = (menu: NavMenu) => menu.sections.flatMap(section => section.links)

/** Up and down move through the links of an open panel; the keys stop there (the landing's film never reads them). */
function onPanelKey(event: KeyboardEvent<HTMLElement>) {
	const links = focusables(event.currentTarget)
	const moved = listKeyIndex(event.key, links.indexOf(document.activeElement as HTMLElement), links.length)
	if (moved === null) return
	event.preventDefault()
	event.stopPropagation()
	links[moved]?.focus()
}

/**
 * Left, right, Home and End move between the bar's menu buttons (the account's included), in the order they are drawn; the keys stop
 * there. Returns the button reached, or null for any other key.
 */
function moveAlongBar(event: KeyboardEvent<HTMLElement>): HTMLElement | null {
	const bar = event.currentTarget.closest('header') ?? document.body
	const buttons = [...bar.querySelectorAll<HTMLElement>('[data-bar-menu]')].filter(
		button => button.checkVisibility?.() !== false
	)
	const moved = rowKeyIndex(event.key, buttons.indexOf(event.currentTarget), buttons.length)
	const target = moved === null ? undefined : buttons[moved]
	if (!target) return null
	event.preventDefault()
	event.stopPropagation()
	target.focus()
	return target
}

/** Whether Escape may bring the focus back to a menu's button: it was in the menu, on the button, or nowhere (never taken from elsewhere). */
function focusWasIn(...containers: Array<HTMLElement | null | undefined>): boolean {
	const active = document.activeElement
	if (!active || active === document.body) return true
	return containers.some(container => container?.contains(active))
}

/** The bar's menus (wide screens): disclosure buttons over lists of links; left and right move between the buttons. */
function DesktopMenus({ menus }: { menus: NavMenu[] }) {
	const { t } = useI18n()
	const { pathname, hash } = useLocation()
	const nav = useRef<HTMLElement>(null)
	const buttons = useRef<Array<HTMLButtonElement | null>>([])
	const [open, setOpen] = useState<number | null>(null)
	// Fixed ids (one bar per page): React's generated ids differ between the prerender's tree and the hydrated one, so a lookup by a
	// generated id would miss the prerendered panels.
	const panelId = (index: number) => `mm-menu-${menus[index]?.id}`
	const panelOf = (index: number) => document.getElementById(panelId(index))
	// Down on a closed menu's button opens it on its first link, once it is drawn.
	const focusFirst = useRef(false)
	useEffect(() => {
		if (open === null || !focusFirst.current) return
		focusFirst.current = false
		focusables(panelOf(open))[0]?.focus()
	})
	const close = (focus: boolean) => {
		if (focus && open !== null && focusWasIn(buttons.current[open], panelOf(open))) buttons.current[open]?.focus()
		setOpen(null)
	}
	useLayer(open !== null, close, [nav])
	// A new page or section closes the menus.
	useEffect(() => setOpen(null), [pathname, hash])
	const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
		const moved = moveAlongBar(event)
		if (moved) {
			const next = buttons.current.indexOf(moved as HTMLButtonElement)
			if (open !== null && next >= 0) setOpen(next)
			return
		}
		if (event.key !== 'ArrowDown') return
		event.preventDefault()
		event.stopPropagation()
		if (open === index) focusables(panelOf(index))[0]?.focus()
		else {
			focusFirst.current = true
			setOpen(index)
		}
	}
	const onBlur = (event: FocusEvent<HTMLElement>) => {
		if (!(event.relatedTarget instanceof Node && nav.current?.contains(event.relatedTarget))) setOpen(null)
	}
	const onNavigate = (stay: boolean) => {
		if (stay && open !== null) buttons.current[open]?.focus()
		setOpen(null)
	}
	return (
		<nav ref={nav} className="mm-nav site-nav" aria-label={t('Main navigation')} data-own-keys="" onBlur={onBlur}>
			<ul className="mm-nav__menus">
				{menus.map((menu, index) => (
					<li key={menu.id} className="mm-nav__item">
						<button
							ref={element => {
								buttons.current[index] = element
							}}
							type="button"
							className="mm-nav__trigger"
							data-bar-menu=""
							aria-expanded={open === index}
							aria-controls={panelId(index)}
							data-current={hasCurrentPage(pathname, menuLinks(menu)) ? '' : undefined}
							onClick={() => setOpen(open === index ? null : index)}
							onFocus={() => {
								// Focus on another menu's button (Tab, Shift+Tab) closes the open one; the arrows open the next one themselves.
								if (open !== null && open !== index) setOpen(null)
							}}
							onPointerEnter={event => {
								// A menu already open follows the pointer to its neighbours, as in the game's menu bars; none opens on a mere hover.
								if (event.pointerType === 'mouse' && open !== null) setOpen(index)
							}}
							onKeyDown={event => onButtonKey(event, index)}
						>
							{t(menu.label)}
							<span className="mc-icon mc-icon--chevron mm-nav__chevron" aria-hidden="true" />
						</button>
						{/* biome-ignore lint/a11y/noStaticElementInteractions: the arrows move between the links inside (the disclosure menu pattern); the panel itself is not a control. */}
						<div
							id={panelId(index)}
							className={`mm-nav__panel mm-nav__panel--${menu.id}`}
							hidden={open !== index}
							onKeyDown={onPanelKey}
						>
							<NavSections sections={menu.sections} onNavigate={onNavigate} />
						</div>
					</li>
				))}
			</ul>
		</nav>
	)
}

function useSignOut() {
	const { refreshSession } = useAppContext()
	const navigate = useNavigate()
	return async () => {
		// Unsaved names and descriptions are private: they never outlive the session on a shared computer.
		clearAllDrafts()
		await authClient.signOut()
		await refreshSession()
		navigate('/')
		// The home page's brand takes the focus (the account's menu that held it is gone), once the home page is drawn.
		focusBrandSoon()
	}
}

/** Focuses the home page's brand (the landing's) as soon as it is drawn: its chunk may still be arriving (two seconds at most). */
function focusBrandSoon(frames = 120) {
	requestAnimationFrame(() => {
		const brand = document.querySelector<HTMLElement>('.mc-sitebar__brand')
		if (brand) brand.focus()
		else if (frames > 1) focusBrandSoon(frames - 1)
	})
}

/**
 * The signed-in account's links: gallery and account, then, after a rule, administration when allowed and signing out. `admin` is the
 * server's answer, asked as soon as the account's button is hovered or focused, so the list is whole when it opens.
 */
function AccountLinks({ admin, onNavigate }: { admin: boolean; onNavigate: OnNavigate }) {
	const { t } = useI18n()
	const signOut = useSignOut()
	return (
		<>
			<div className="mm-nav__section">
				<ul>
					<li>
						<NavItemLink link={{ to: '/gallery', label: 'My gallery' }} onNavigate={onNavigate} />
					</li>
					<li>
						<NavItemLink link={{ to: '/account', label: 'My account' }} onNavigate={onNavigate} />
					</li>
				</ul>
			</div>
			<div className="mm-nav__section">
				<ul>
					{admin && (
						<li>
							<NavItemLink link={{ to: '/admin', label: 'Administration' }} onNavigate={onNavigate} />
						</li>
					)}
					<li>
						<button type="button" className="mm-nav__link" onClick={() => void signOut()}>
							{t('Sign out')}
						</button>
					</li>
				</ul>
			</div>
		</>
	)
}

type User = { name: string; email?: string | null; image?: string | null | undefined }

function Avatar({ user }: { user: User }) {
	const avatar = avatarUrl(user)
	return (
		<b className="mm-account-avatar" aria-hidden="true">
			{user.name.slice(0, 1).toUpperCase()}
			{avatar && <img src={avatar} alt="" width={32} height={32} loading="lazy" />}
		</b>
	)
}

/** Who is signed in, at the top of the account's menu: the whole name, the address under it. */
function AccountWho({ user }: { user: User }) {
	return (
		<div className="mm-nav__who">
			<Avatar user={user} />
			<span className="mm-nav__who-text">
				<span className="mm-nav__who-name">{user.name}</span>
				{user.email && <span className="mm-nav__who-email">{user.email}</span>}
			</span>
		</div>
	)
}

/** "Sign in": a stone button of the bar; between DESKTOP_NAV and 1280 px a head alone (its name stays for screen readers). */
function SignInLink({ block = false, onNavigate }: { block?: boolean; onNavigate?: () => void }) {
	const { t } = useI18n()
	const { pathname } = useLocation()
	return (
		<Link
			className={block ? 'mc-btn mc-btn--block' : 'mc-btn mc-btn--auto mm-nav-account mm-nav-signin'}
			to="/login"
			aria-current={isCurrentPage(pathname, '/login') ? 'page' : undefined}
			title={block ? undefined : t('Sign in')}
			onClick={onNavigate}
		>
			{!block && <span className="mm-nav-signin__head" aria-hidden="true" />}
			<span className="mm-nav-signin__label">{t('Sign in')}</span>
		</Link>
	)
}

/** The account in the bar: "Sign in", or the avatar and name (a stone button like its neighbours) opening the account's menu. */
function AccountMenu() {
	const { session, isPending } = useAppContext()
	const { t } = useI18n()
	const { pathname } = useLocation()
	const id = useId()
	const root = useRef<HTMLDivElement>(null)
	const button = useRef<HTMLButtonElement>(null)
	const panel = useRef<HTMLDivElement>(null)
	const [open, setOpen] = useState(false)
	// The administration check starts once the account is about to open, and its answer stays while the bar does.
	const [primed, setPrimed] = useState(false)
	const access = useAdminAccess(primed)
	const focusFirst = useRef(false)
	useEffect(() => {
		if (!(open && focusFirst.current)) return
		focusFirst.current = false
		focusables(panel.current)[0]?.focus()
	}, [open])
	const close = (focus: boolean) => {
		if (focus && focusWasIn(root.current)) button.current?.focus()
		setOpen(false)
	}
	useLayer(open, close, [root])
	// A new page closes the menu.
	useEffect(() => setOpen(false), [pathname])
	if (isPending) return <LoadingSkeleton kind="account" label="Loading your space…" />
	if (!session) return <SignInLink />
	const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (moveAlongBar(event) || event.key !== 'ArrowDown') return
		event.preventDefault()
		event.stopPropagation()
		setPrimed(true)
		if (open) focusables(panel.current)[0]?.focus()
		else {
			focusFirst.current = true
			setOpen(true)
		}
	}
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: focus leaving the account's button and menu closes the menu; the wrapper is not a control.
		<div
			ref={root}
			className="mm-nav__item mm-nav-account"
			data-own-keys=""
			onBlur={event => {
				if (!(event.relatedTarget instanceof Node && root.current?.contains(event.relatedTarget))) setOpen(false)
			}}
		>
			<button
				ref={button}
				type="button"
				className="mc-btn mc-btn--auto mm-nav-account__button"
				data-bar-menu=""
				aria-expanded={open}
				aria-controls={`${id}-account`}
				aria-label={`${session.user.name} — ${t('My account')}`}
				onClick={() => {
					setPrimed(true)
					setOpen(!open)
				}}
				onPointerEnter={() => setPrimed(true)}
				onFocus={() => setPrimed(true)}
				onKeyDown={onButtonKey}
			>
				<Avatar user={session.user} />
				<span className="mm-nav-account__name">{session.user.name}</span>
				<span className="mc-icon mc-icon--chevron mm-nav__chevron" aria-hidden="true" />
			</button>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the arrows move between the links inside (the disclosure menu pattern); the panel itself is not a control. */}
			<div
				ref={panel}
				id={`${id}-account`}
				className="mm-nav__panel mm-nav__panel--end"
				hidden={!open}
				onKeyDown={onPanelKey}
			>
				<AccountWho user={session.user} />
				{open && (
					<AccountLinks
						admin={hasAnyAdminAccess(access)}
						onNavigate={stay => {
							if (stay) button.current?.focus()
							setOpen(false)
						}}
					/>
				)}
			</div>
		</div>
	)
}

/** "Install the mod": its whole name from 1280 px, "Install" below (never the ember alone: it is the bar's main action). */
function InstallCta() {
	const { t } = useI18n()
	return (
		<Link className="mc-btn mc-btn--primary mc-btn--auto mm-nav-cta" to="/installation">
			<span className="mc-icon mc-icon--ember mm-nav-cta__icon" aria-hidden="true" />
			<span className="mm-nav-cta__long">{t('Install the mod')}</span>
			<span className="mm-nav-cta__short" aria-hidden="true">
				{t('Install it')}
			</span>
		</Link>
	)
}

/** A group of the phones' panel: a stone button that unfolds its content (the group of the page on screen starts unfolded). */
function DrawerFold({ label, current, children }: { label: ReactNode; current: boolean; children: ReactNode }) {
	const id = useId()
	const [open, setOpen] = useState(current)
	useEffect(() => setOpen(current), [current])
	return (
		<div className="mm-drawer__group">
			<button
				type="button"
				className="mm-drawer__toggle"
				aria-expanded={open}
				aria-controls={id}
				onClick={() => setOpen(!open)}
			>
				{label}
				<span className="mc-icon mc-icon--chevron mm-nav__chevron" aria-hidden="true" />
			</button>
			<div id={id} className="mm-drawer__links" hidden={!open}>
				{children}
			</div>
		</div>
	)
}

function DrawerGroup({ menu, onNavigate }: { menu: NavMenu; onNavigate: OnNavigate }) {
	const { t } = useI18n()
	const { pathname } = useLocation()
	return (
		<DrawerFold
			label={<span className="mm-drawer__label">{t(menu.label)}</span>}
			current={hasCurrentPage(pathname, menuLinks(menu))}
		>
			<NavSections sections={menu.sections} onNavigate={onNavigate} />
		</DrawerFold>
	)
}

const accountPages = [{ to: '/gallery' }, { to: '/account' }, { to: '/admin' }]

/** The account in the phones' panel: "Sign in", or a group of its own (avatar and name) with the account's links. */
function DrawerAccount({ open, onNavigate }: { open: boolean; onNavigate: OnNavigate }) {
	const { session } = useAppContext()
	const { pathname } = useLocation()
	// The administration check waits for the panel to open, then its answer stays.
	const [primed, setPrimed] = useState(false)
	useEffect(() => {
		if (open) setPrimed(true)
	}, [open])
	const access = useAdminAccess(primed)
	if (!session) return <SignInLink block onNavigate={() => onNavigate(false)} />
	return (
		<DrawerFold
			label={
				<span className="mm-drawer__who">
					<Avatar user={session.user} />
					<span className="mm-drawer__label">{session.user.name}</span>
				</span>
			}
			current={hasCurrentPage(pathname, accountPages)}
		>
			{session.user.email && <p className="mm-nav__who-email mm-drawer__email">{session.user.email}</p>}
			{open && <AccountLinks admin={hasAnyAdminAccess(access)} onNavigate={onNavigate} />}
		</DrawerFold>
	)
}

/** The ring's next (or previous) element from the focused one, wrapping; from outside the ring, the nearest one in the page's order. */
function trapIndex(ring: HTMLElement[], active: Element | null, back: boolean): number {
	const index = active instanceof HTMLElement ? ring.indexOf(active) : -1
	if (index >= 0) return (index + (back ? ring.length - 1 : 1)) % ring.length
	if (!active || active === document.body) return Math.min(1, ring.length - 1)
	const after = ring.findIndex(element => active.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
	if (back) return after <= 0 ? ring.length - 1 : after - 1
	return Math.max(after, 0)
}

/**
 * While the phones' panel is open, Tab and Shift+Tab stay between its button and its content. From an element outside that ring (the
 * language list, which is not in the Tab order), Tab goes on to the next control of the ring.
 */
function useFocusTrap(open: boolean, button: RefObject<HTMLElement | null>, panel: RefObject<HTMLElement | null>) {
	useEffect(() => {
		if (!open) return
		focusables(panel.current)[0]?.focus({ preventScroll: true })
		const onKey = (event: globalThis.KeyboardEvent) => {
			if (event.key !== 'Tab') return
			const ring = [button.current, ...focusables(panel.current)].filter(element => element !== null)
			event.preventDefault()
			ring[trapIndex(ring, document.activeElement, event.shiftKey)]?.focus()
		}
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [open, button, panel])
}

/** The page under the open panel does not scroll (the scrollbar's room is kept: nothing moves). */
function useScrollLock(open: boolean) {
	useEffect(() => {
		if (!open) return
		const root = document.documentElement
		// Only a page that had a scrollbar keeps its room; one without must not gain an empty gutter.
		const classes =
			window.innerWidth > root.clientWidth ? ['mm-scroll-lock', 'mm-scroll-lock--gutter'] : ['mm-scroll-lock']
		root.classList.add(...classes)
		return () => root.classList.remove(...classes)
	}, [open])
}

/** The phones' and tablets' menu: the three bars open a panel under the header with the same groups, the account and the language. */
function Drawer({ menus }: { menus: NavMenu[] }) {
	const { t } = useI18n()
	const { pathname, hash } = useLocation()
	const button = useRef<HTMLButtonElement>(null)
	const panel = useRef<HTMLDivElement>(null)
	const [open, setOpen] = useState(false)
	const close = (focus: boolean) => {
		setOpen(false)
		if (focus) button.current?.focus({ preventScroll: true })
	}
	useLayer(open, close, [panel, button])
	useFocusTrap(open, button, panel)
	useScrollLock(open)
	useInertOutside(open, button)
	// A new page or section closes the panel.
	useEffect(() => setOpen(false), [pathname, hash])
	useEffect(() => {
		// The panel goes with its button: past the width where the menus fit, or when the landing's film hides the button.
		const wide = window.matchMedia?.(`(min-width: ${DESKTOP_NAV}px)`)
		const onWide = (event: MediaQueryListEvent) => {
			if (event.matches) setOpen(false)
		}
		const onPhase = () => {
			if (!button.current?.getClientRects().length) setOpen(false)
		}
		wide?.addEventListener('change', onWide)
		document.addEventListener('mm:phase', onPhase)
		return () => {
			wide?.removeEventListener('change', onWide)
			document.removeEventListener('mm:phase', onPhase)
		}
	}, [])
	return (
		<>
			<button
				ref={button}
				type="button"
				id="site-menu-btn"
				className="mc-btn mc-btn--tool mm-nav-burger"
				aria-expanded={open}
				aria-controls="site-menu"
				aria-label={t('Menu')}
				title={t('Menu')}
				onClick={() => setOpen(!open)}
			>
				<span className="mc-icon mc-icon--menu mm-nav-burger__open" aria-hidden="true" />
				<span className="mc-icon mc-icon--cross mm-nav-burger__close" aria-hidden="true" />
			</button>
			<div className="mm-drawer__backdrop" hidden={!open} aria-hidden="true" />
			<div
				ref={panel}
				id="site-menu"
				className="mm-drawer"
				role="dialog"
				aria-modal="true"
				aria-label={t('Menu')}
				hidden={!open}
				data-own-keys=""
			>
				<nav aria-label={t('Main navigation')}>
					{menus.map(menu => (
						// A link to the page on screen closes the panel and gives the focus back to its button.
						<DrawerGroup key={menu.id} menu={menu} onNavigate={close} />
					))}
				</nav>
				<DrawerAccount open={open} onNavigate={close} />
				{open && <LanguagePicker className="mm-drawer__lang" name="mm-lang-panel" />}
			</div>
		</>
	)
}

/**
 * The bar after the brand: the menus, then the account, the language, `extra` (the development file opener) and the install button,
 * then the phones' menu button and its panel.
 */
export function SiteNav({ extra }: { extra?: ReactNode }) {
	const menus = navMenus()
	return (
		<>
			<DesktopMenus menus={menus} />
			<div className="mm-nav-end">
				<div className="mm-nav-end__wide">
					<AccountMenu />
				</div>
				<LanguagePicker className="mm-nav-end__lang" compact name="mm-lang-bar" />
				{extra}
				<InstallCta />
				<Drawer menus={menus} />
			</div>
		</>
	)
}
