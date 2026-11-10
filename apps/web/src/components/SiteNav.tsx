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
import { focusables, useLayer } from './nav-layers'

/*
 * The site's bar, one design for every page and for the landing (HeroMarkup renders it in its own header): the menus of the whole site
 * (content/navigation.ts), the account, the language and "Install the mod". From DESKTOP_NAV px the menus drop from the bar; below, the
 * three bars open a panel with the same groups. The popups are in the page, closed, from the prerender on.
 */

/** The width from which the menus fit in the bar in every language (site-nav.css uses the same number). */
export const DESKTOP_NAV = 1100

/** A link of a menu: a page of the site (marked when on screen), a section of the landing (hero.js glides to it) or an outside address. */
function NavItemLink({ link, onNavigate }: { link: FooterLink; onNavigate: () => void }) {
	const { t } = useI18n()
	const { pathname } = useLocation()
	if ('to' in link)
		return (
			<Link
				className="mm-nav__link"
				to={link.to}
				aria-current={isCurrentPage(pathname, link.to) ? 'page' : undefined}
				onClick={onNavigate}
			>
				{t(link.label)}
			</Link>
		)
	const section = link.href.startsWith('#')
	return (
		<a
			className="mm-nav__link"
			href={link.href}
			data-section-link={section ? '' : undefined}
			rel={section ? undefined : 'noopener'}
			onClick={onNavigate}
		>
			{t(link.label)}
		</a>
	)
}

function NavSections({ sections, onNavigate }: { sections: NavSection[]; onNavigate: () => void }) {
	const { t } = useI18n()
	return sections.map(section => (
		<div
			key={section.label ?? 'main'}
			className="mm-nav__section"
			data-landing-sections={section.label === 'On this page' ? '' : undefined}
		>
			{section.label && <p className="mm-nav__heading">{t(section.label)}</p>}
			<ul>
				{section.links.map(link => (
					<li key={link.label + ('to' in link ? link.to : link.href)}>
						<NavItemLink link={link} onNavigate={onNavigate} />
					</li>
				))}
			</ul>
		</div>
	))
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

/** The bar's menus (wide screens): disclosure buttons over lists of links; left and right move between the buttons. */
function DesktopMenus({ menus }: { menus: NavMenu[] }) {
	const { t } = useI18n()
	const { pathname, hash } = useLocation()
	const id = useId()
	const nav = useRef<HTMLElement>(null)
	const buttons = useRef<Array<HTMLButtonElement | null>>([])
	const [open, setOpen] = useState<number | null>(null)
	// Down on a menu's button opens it on its first link, once it is drawn.
	const focusFirst = useRef(false)
	useEffect(() => {
		if (open === null || !focusFirst.current) return
		focusFirst.current = false
		focusables(document.getElementById(`${id}-${open}`))[0]?.focus()
	}, [open, id])
	const close = (focus: boolean) => {
		if (focus && open !== null) buttons.current[open]?.focus()
		setOpen(null)
	}
	useLayer(open !== null, close, [nav])
	// A new page or section closes the menus.
	useEffect(() => setOpen(null), [pathname, hash])
	const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
		const moved = rowKeyIndex(event.key, index, menus.length)
		if (moved !== null) {
			event.preventDefault()
			event.stopPropagation()
			buttons.current[moved]?.focus()
			if (open !== null) setOpen(moved)
		} else if (event.key === 'ArrowDown') {
			event.preventDefault()
			event.stopPropagation()
			focusFirst.current = true
			setOpen(index)
		}
	}
	const onBlur = (event: FocusEvent<HTMLElement>) => {
		if (!(event.relatedTarget instanceof Node && nav.current?.contains(event.relatedTarget))) setOpen(null)
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
							aria-expanded={open === index}
							aria-controls={`${id}-${index}`}
							data-current={hasCurrentPage(pathname, menuLinks(menu)) ? '' : undefined}
							onClick={() => setOpen(open === index ? null : index)}
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
							id={`${id}-${index}`}
							className={`mm-nav__panel mm-nav__panel--${menu.id}`}
							hidden={open !== index}
							onKeyDown={onPanelKey}
						>
							<NavSections sections={menu.sections} onNavigate={() => setOpen(null)} />
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
	}
}

/** The administration entry, asked of the server only once the account's menu is open (never on every page). */
function AdminLink({ onNavigate }: { onNavigate: () => void }) {
	const access = useAdminAccess()
	if (!hasAnyAdminAccess(access)) return null
	return (
		<li>
			<NavItemLink link={{ to: '/admin', label: 'Administration' }} onNavigate={onNavigate} />
		</li>
	)
}

/** The signed-in account's links: gallery, account, administration when allowed, and signing out. */
function AccountLinks({ onNavigate }: { onNavigate: () => void }) {
	const { t } = useI18n()
	const signOut = useSignOut()
	return (
		<ul>
			<li>
				<NavItemLink link={{ to: '/gallery', label: 'My gallery' }} onNavigate={onNavigate} />
			</li>
			<li>
				<NavItemLink link={{ to: '/account', label: 'My account' }} onNavigate={onNavigate} />
			</li>
			<AdminLink onNavigate={onNavigate} />
			<li>
				<button type="button" className="mm-nav__link" onClick={() => void signOut()}>
					{t('Sign out')}
				</button>
			</li>
		</ul>
	)
}

function Avatar({ user }: { user: { name: string; image?: string | null | undefined } }) {
	const avatar = avatarUrl(user)
	return (
		<b className="mm-account-avatar" aria-hidden="true">
			{user.name.slice(0, 1).toUpperCase()}
			{avatar && <img src={avatar} alt="" width={32} height={32} loading="lazy" />}
		</b>
	)
}

/** The account in the bar: "Sign in", or the avatar and name opening the account's menu. */
function AccountMenu() {
	const { session, isPending } = useAppContext()
	const { t } = useI18n()
	const { pathname } = useLocation()
	const id = useId()
	const root = useRef<HTMLDivElement>(null)
	const button = useRef<HTMLButtonElement>(null)
	const [open, setOpen] = useState(false)
	const close = (focus: boolean) => {
		setOpen(false)
		if (focus) button.current?.focus()
	}
	useLayer(open, close, [root])
	// A new page closes the menu.
	useEffect(() => setOpen(false), [pathname])
	if (isPending) return <LoadingSkeleton kind="account" label="Loading your space…" />
	if (!session)
		return (
			<Link
				className="mc-btn mc-btn--auto mm-nav-account"
				to="/login"
				aria-current={isCurrentPage(pathname, '/login') ? 'page' : undefined}
			>
				{t('Sign in')}
			</Link>
		)
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
				className="mm-nav__trigger mm-nav-account__button"
				aria-expanded={open}
				aria-controls={`${id}-account`}
				aria-label={`${session.user.name} — ${t('My account')}`}
				onClick={() => setOpen(!open)}
			>
				<Avatar user={session.user} />
				<span className="mm-nav-account__name">{session.user.name}</span>
				<span className="mc-icon mc-icon--chevron mm-nav__chevron" aria-hidden="true" />
			</button>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the arrows move between the links inside (the disclosure menu pattern); the panel itself is not a control. */}
			<div id={`${id}-account`} className="mm-nav__panel mm-nav__panel--end" hidden={!open} onKeyDown={onPanelKey}>
				<div className="mm-nav__section">{open && <AccountLinks onNavigate={() => setOpen(false)} />}</div>
			</div>
		</div>
	)
}

function InstallCta({ block = false }: { block?: boolean }) {
	const { t } = useI18n()
	return (
		<Link
			className={`mc-btn mc-btn--primary mc-btn--auto mm-nav-cta${block ? ' mm-nav-cta--block' : ''}`}
			to="/installation"
		>
			<span className="mc-icon mc-icon--ember mm-nav-cta__icon" aria-hidden="true" />
			<span className="mm-nav-cta__long">{t('Install the mod')}</span>
			<span className="mm-nav-cta__short" aria-hidden="true">
				{t('Install it')}
			</span>
		</Link>
	)
}

/** One group of the phones' panel: a button that unfolds its links. */
function DrawerGroup({ menu, onNavigate }: { menu: NavMenu; onNavigate: () => void }) {
	const { t } = useI18n()
	const { pathname } = useLocation()
	const id = useId()
	const current = hasCurrentPage(pathname, menuLinks(menu))
	const [open, setOpen] = useState(current)
	// The group of the page on screen is the one unfolded.
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
				{t(menu.label)}
				<span className="mc-icon mc-icon--chevron mm-nav__chevron" aria-hidden="true" />
			</button>
			<div id={id} className="mm-drawer__links" hidden={!open}>
				<NavSections sections={menu.sections} onNavigate={onNavigate} />
			</div>
		</div>
	)
}

function DrawerAccount({ onNavigate }: { onNavigate: () => void }) {
	const { session } = useAppContext()
	const { t } = useI18n()
	if (!session)
		return (
			<Link className="mc-btn mc-btn--block" to="/login" onClick={onNavigate}>
				{t('Sign in')}
			</Link>
		)
	return (
		<div className="mm-drawer__group">
			<p className="mm-nav__heading mm-drawer__who">
				<Avatar user={session.user} />
				<span>{session.user.name}</span>
			</p>
			<div className="mm-nav__section">
				<AccountLinks onNavigate={onNavigate} />
			</div>
		</div>
	)
}

/** While the phones' panel is open, Tab and Shift+Tab stay between its button and its content. */
function useFocusTrap(open: boolean, button: RefObject<HTMLElement | null>, panel: RefObject<HTMLElement | null>) {
	useEffect(() => {
		if (!open) return
		focusables(panel.current)[0]?.focus({ preventScroll: true })
		const onKey = (event: globalThis.KeyboardEvent) => {
			if (event.key !== 'Tab') return
			const ring = [button.current, ...focusables(panel.current)].filter(element => element !== null)
			const index = ring.indexOf(document.activeElement as HTMLElement)
			const next = event.shiftKey ? index - 1 : index + 1
			const wrapped = next < 0 ? ring.length - 1 : next % ring.length
			event.preventDefault()
			ring[index < 0 ? Math.min(1, ring.length - 1) : wrapped]?.focus()
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

/** The phones' and tablets' menu: the three bars open a panel under the header with the same groups, the account, the language and the install button. */
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
						<DrawerGroup key={menu.id} menu={menu} onNavigate={() => setOpen(false)} />
					))}
				</nav>
				<DrawerAccount onNavigate={() => setOpen(false)} />
				{open && <LanguagePicker className="mm-drawer__lang" />}
				<InstallCta block />
			</div>
		</>
	)
}

/**
 * The bar after the brand: the menus, then the account, the language, `extra` (the development file opener) and the install button,
 * then the phones' menu button and its panel.
 */
export function SiteNav({ landing = false, extra }: { landing?: boolean; extra?: ReactNode }) {
	const menus = navMenus(landing)
	return (
		<>
			<DesktopMenus menus={menus} />
			<div className="mm-nav-end">
				<div className="mm-nav-end__wide">
					<AccountMenu />
				</div>
				<LanguagePicker className="mm-nav-end__lang" />
				{extra}
				<InstallCta />
				<Drawer menus={menus} />
			</div>
		</>
	)
}
