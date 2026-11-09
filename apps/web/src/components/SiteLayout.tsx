import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAppContext } from '../app-context'
import { authClient } from '../auth-client'
import { navigation } from '../content/navigation'
import { useI18n } from '../i18n/I18n'
import { isLocale, localeOptions } from '../i18n/locales'
import { avatarUrl } from '../lib/avatar'
import {
	applyDisplay,
	type DisplayOption,
	readDisplayOption,
	setDisplayOption,
	storeDisplayOption,
} from '../lib/display-preferences'
import { clearAllDrafts } from '../lib/form-drafts'
import { catalogLinks } from '../pages/installation-loaders'
import { BrandMark } from './BrandMark'
import { DiagnosticsAccessLink } from './DiagnosticsAccessLink'
import { LoadingSkeleton } from './Loading'
import { buttonDark, buttonQuiet, fileInputHidden } from './ui'

const legalLinks = [
	{ to: '/privacy', label: 'Privacy' },
	{ to: '/terms', label: 'Terms' },
	{ to: '/legal', label: 'Legal' },
]
/** The link home: the logo alone in the header (`solo`), the small mark and the word Minemories in the footer. */
export function Brand({ solo = false }: { solo?: boolean }) {
	return (
		<Link className="mm-brand" to="/" aria-label="Minemories">
			<BrandMark solo={solo} />
			{!solo && <span>Minemories</span>}
		</Link>
	)
}
function AccountControl() {
	const { session, isPending, refreshSession } = useAppContext()
	const { t } = useI18n()
	const navigate = useNavigate()
	if (isPending) return <LoadingSkeleton kind="account" label="Loading your space…" />
	if (!session)
		return (
			<Link className={buttonDark} to="/login">
				{t('Sign in')}
			</Link>
		)
	const avatar = avatarUrl(session.user)
	return (
		<div className="mm-account">
			<Link to="/account" title={`${session.user.name} — ${t('My account')}`} aria-label={t('My account')}>
				<b className="mm-account-avatar" aria-hidden="true">
					{session.user.name.slice(0, 1).toUpperCase()}
					{avatar && <img src={avatar} alt="" width={32} height={32} loading="lazy" />}
				</b>
				<span>{session.user.name}</span>
			</Link>
			<button
				type="button"
				onClick={async () => {
					// Unsaved names and descriptions are private: they never outlive the session on a shared computer.
					clearAllDrafts()
					await authClient.signOut()
					await refreshSession()
					navigate('/')
				}}
			>
				{t('Sign out')}
			</button>
		</div>
	)
}
function FileControl() {
	const { setViewerFile } = useAppContext()
	const { t } = useI18n()
	const navigate = useNavigate()
	if (!import.meta.env.DEV) return null
	return (
		<label className={`${buttonQuiet} mm-file-control`}>
			<span>{t('Open a local GLB')}</span>
			<span className="mm-glyph" data-icon="plus" aria-hidden="true">
				＋
			</span>
			<input
				id="global-file-input"
				type="file"
				aria-label={t('Open a local GLB')}
				accept=".glb,model/gltf-binary"
				className={fileInputHidden}
				onChange={event => {
					const file = event.currentTarget.files?.[0]
					if (file) {
						setViewerFile(file)
						navigate('/viewer')
					}
					event.currentTarget.value = ''
				}}
			/>
		</label>
	)
}
function LanguageControl() {
	const { locale, setLocale, pendingLocale, localeError, t } = useI18n()
	return (
		<label className="mm-language mc-select mc-select--compact">
			<span className="sr-only">{t('Language')}</span>
			<select
				className="mc-select__control"
				value={pendingLocale ?? locale}
				aria-busy={pendingLocale !== null}
				onChange={event => {
					if (isLocale(event.target.value)) setLocale(event.target.value)
				}}
			>
				{localeOptions.map(option => (
					<option key={option.id} value={option.id} lang={option.tag}>
						{option.label}
					</option>
				))}
			</select>
			{localeError && (
				<span role="alert" className="mm-language-error">
					{t('Could not load this language. Select it again to retry.')}
				</span>
			)}
		</label>
	)
}
/** The site's bar, the same on every page that is not the landing film or the 3D viewer: brand, links, language, account and the phones' menu. */
function SiteHeader() {
	const { session } = useAppContext()
	const { t } = useI18n()
	const { pathname } = useLocation()
	const mobile = useRef<HTMLDetailsElement>(null)
	// The menu's own language picker (phones) only exists while the menu is open: one picker at a time.
	const [menuOpen, setMenuOpen] = useState(false)
	useEffect(() => {
		mobile.current?.removeAttribute('open')
	}, [pathname])
	return (
		<header className="mm-header">
			<Brand solo />
			<nav className="mm-desktop-nav" aria-label={t('Main navigation')}>
				<NavLink to="/" end>
					{t('Home')}
				</NavLink>
				{navigation.map(link => (
					<NavLink key={link.to} to={link.to}>
						{t(link.label)}
					</NavLink>
				))}
				{session && <NavLink to="/gallery">{t('My gallery')}</NavLink>}
			</nav>
			<div className="mm-header-actions">
				<LanguageControl />
				<FileControl />
				<AccountControl />
				<details ref={mobile} className="mm-mobile-menu" onToggle={event => setMenuOpen(event.currentTarget.open)}>
					<summary className="mc-btn mc-btn--tool" aria-label={t('Open menu')}>
						<span className="mc-icon mc-icon--menu" aria-hidden="true" />
					</summary>
					<nav aria-label={t('Main navigation')}>
						<Link to="/">{t('Home')}</Link>
						{navigation.map(link => (
							<Link key={link.to} to={link.to}>
								{t(link.label)}
							</Link>
						))}
						{session && <Link to="/gallery">{t('My gallery')}</Link>}
						{legalLinks.map(link => (
							<Link to={link.to} key={link.to}>
								{t(link.label)}
							</Link>
						))}
						{menuOpen && <LanguageControl />}
					</nav>
				</details>
			</div>
		</header>
	)
}
export function SiteLayout({ notice = '', children }: { notice?: string; children?: ReactNode }) {
	const { session } = useAppContext()
	const { t, locale } = useI18n()
	const { pathname } = useLocation()
	// The landing's film resets <html> when it leaves: the stored display options and the Unifont class are put back on every page (lib/display-preferences.ts).
	useLayoutEffect(() => {
		if (pathname !== '/') applyDisplay(document.documentElement, safeStorage(), locale)
	}, [pathname, locale])
	if (pathname === '/login' || pathname === '/register') return <AuthLayout>{children ?? <Outlet />}</AuthLayout>
	const cinema = pathname === '/viewer' || pathname.startsWith('/share/') || pathname.startsWith('/public/')
	if (cinema)
		return (
			<main id="main-content" className="cinema-layout" tabIndex={-1}>
				{children ?? <Outlet />}
			</main>
		)
	// The home page is the film (HeroFilm): a full-screen page with its own compact header, skip link and full-width footer, which carry the site's navigation.
	if (pathname === '/')
		return (
			<>
				{children ?? <Outlet />}
				{notice && (
					<div className="mm-toast" role="status">
						{t(notice)}
					</div>
				)}
			</>
		)
	return (
		<div className="mm-site">
			<a className="mm-skip" href="#main-content">
				{t('Skip to content')}
			</a>
			<SiteHeader />
			<main id="main-content" tabIndex={-1} className="mm-main">
				<div className="mm-page-transition">{children ?? <Outlet />}</div>
			</main>
			<div className="mm-footer-band mc-band mc-bg-dirt" aria-hidden="true" />
			<footer className="mm-footer">
				<div className="album-footer-heading">
					<span>
						{t('Worlds change.')}
						<br />
						<em>{t('What they leave us stays.')}</em>
					</span>
					<Link to="/explore">{t('Explore memories')} ↗</Link>
				</div>
				<div>
					<Brand />
					<p>{t('Your worlds stay yours.')}</p>
					<p className="mm-fineprint">
						{t(
							'Minemories is not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.'
						)}
					</p>
				</div>
				<nav aria-label={t('Guides')}>
					<Link to="/concept">{t('The concept')}</Link>
					<Link to="/how-it-works">{t('How it works')}</Link>
					<Link to="/installation">{t('Install the mod')}</Link>
					<Link to="/versions">{t('Mod versions')}</Link>
					<Link to="/roadmap">{t('Roadmap')}</Link>
					<Link to="/faq">{t('FAQ')}</Link>
				</nav>
				<nav aria-label="Minemories">
					{navigation
						.filter(link => link.to !== '/installation')
						.map(link => (
							<Link to={link.to} key={link.to}>
								{t(link.label)}
							</Link>
						))}
					<Link to="/sharing">{t('A gallery to share')}</Link>
					<Link to="/explore">{t('Public gallery')}</Link>
					<a href="https://github.com/For-Hives/minemories">GitHub</a>
					{catalogLinks().map(catalog => (
						<a key={catalog.name} href={catalog.url}>
							{catalog.name}
						</a>
					))}
					{session && <DiagnosticsAccessLink key={session.user.id} />}
				</nav>
				<nav aria-label={t('Legal')}>
					{legalLinks.map(link => (
						<Link to={link.to} key={link.to}>
							{t(link.label)}
						</Link>
					))}
				</nav>
				<DisplayOptions />
			</footer>
			{notice && (
				<div className="mm-toast" role="status">
					{t(notice)}
				</div>
			)}
		</div>
	)
}

function safeStorage() {
	try {
		return window.localStorage
	} catch {
		return undefined
	}
}
/** The landing's two accessibility options, on every page: the readable font applies at once, reduced motion too (the pages have no film to restart). */
function DisplayOptions() {
	const { t } = useI18n()
	// The prerendered HTML has no storage: both boxes start unchecked, as on the server, then take the stored choice once mounted (no hydration mismatch).
	const [options, setOptions] = useState({ font: false, motion: false })
	useEffect(() => {
		setOptions({ font: readDisplayOption(safeStorage(), 'font'), motion: readDisplayOption(safeStorage(), 'motion') })
	}, [])
	const toggle = (option: DisplayOption, on: boolean) => {
		storeDisplayOption(safeStorage(), option, on)
		setDisplayOption(document.documentElement, option, on)
		setOptions(current => ({ ...current, [option]: on }))
	}
	return (
		<fieldset className="mc-fieldset mm-display-options">
			<legend>{t('Accessibility')}</legend>
			<label className="mc-check">
				<input type="checkbox" checked={options.font} onChange={event => toggle('font', event.target.checked)} />
				<span className="mc-check__box" aria-hidden="true" />
				<span>{t('Readable font')}</span>
			</label>
			<label className="mc-check">
				<input type="checkbox" checked={options.motion} onChange={event => toggle('motion', event.target.checked)} />
				<span className="mc-check__box" aria-hidden="true" />
				<span>{t('Reduced motion')}</span>
			</label>
		</fieldset>
	)
}

function AuthLayout({ children }: { children: ReactNode }) {
	const { t } = useI18n()
	return (
		<div className="mm-site auth-shell">
			<a className="mm-skip" href="#main-content">
				{t('Skip to content')}
			</a>
			<SiteHeader />
			<main id="main-content" tabIndex={-1}>
				{children}
			</main>
			<footer className="auth-footer">
				<span>© Minemories</span>
				<p>
					{t(
						'Minemories is not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.'
					)}
				</p>
				<nav aria-label={t('Legal')}>
					{legalLinks.map(link => (
						<Link key={link.to} to={link.to}>
							{t(link.label)}
						</Link>
					))}
				</nav>
			</footer>
		</div>
	)
}
