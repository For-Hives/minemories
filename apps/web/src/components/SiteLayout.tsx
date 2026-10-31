import { type ReactNode, useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAppContext } from '../app-context'
import { authClient } from '../auth-client'
import { useI18n } from '../i18n/I18n'
import { isLocale, localeOptions } from '../i18n/locales'
import { avatarUrl } from '../lib/avatar'
import { LoadingSkeleton } from './Loading'
import { buttonDark, buttonQuiet, fileInputHidden } from './ui'

export function Brand() {
	return (
		<Link className="mm-brand" to="/" aria-label="Minemories">
			<span aria-hidden="true">
				<svg viewBox="0 0 32 32" width="26" height="26">
					<path
						d="m16 3 12 7v13l-12 7-12-7V10Zm0 0v13m12-6-12 6-12-6m12 6v14"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.3"
					/>
				</svg>
			</span>
			minemories
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
	return (
		<div className="mm-account">
			<Link to="/account" title={`${session.user.name} — ${t('My account')}`} aria-label={t('My account')}>
				<b className="mm-account-avatar" aria-hidden="true">
					{session.user.name.slice(0, 1).toUpperCase()}
					{/* biome-ignore lint/performance/noImgElement: optional avatar overlays the local initial fallback. */}
					<img src={avatarUrl(session.user)} alt="" width={32} height={32} loading="lazy" />
				</b>
				<span>{session.user.name}</span>
			</Link>
			<button
				type="button"
				onClick={async () => {
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
			<span aria-hidden="true">＋</span>
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
		<label className="mm-language">
			<span className="sr-only">{t('Language')}</span>
			<select
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
export function SiteLayout({ notice = '', children }: { notice?: string; children?: ReactNode }) {
	const { session } = useAppContext()
	const { t } = useI18n()
	const { pathname } = useLocation()
	const mobile = useRef<HTMLDetailsElement>(null)
	useEffect(() => {
		mobile.current?.removeAttribute('open')
	}, [pathname])
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
			<header className="mm-header">
				<Brand />
				<nav className="mm-desktop-nav" aria-label={t('Main navigation')}>
					<NavLink to="/" end>
						{t('Home')}
					</NavLink>
					{session && <NavLink to="/gallery">{t('My gallery')}</NavLink>}
				</nav>
				<div className="mm-header-actions">
					<LanguageControl />
					<FileControl />
					<AccountControl />
					<details ref={mobile} className="mm-mobile-menu">
						<summary aria-label={t('Open menu')}>
							<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
								<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.5" />
							</svg>
						</summary>
						<nav aria-label={t('Main navigation')}>
							<Link to="/">{t('Home')}</Link>
							{session && <Link to="/gallery">{t('My gallery')}</Link>}
						</nav>
					</details>
				</div>
			</header>
			<main id="main-content" tabIndex={-1} className="mm-main">
				<div className="mm-page-transition">{children ?? <Outlet />}</div>
			</main>
			<footer className="mm-footer">
				<div>
					<Brand />
					<p>{t('Your worlds stay yours.')}</p>
					<p className="mm-fineprint">{t('Not affiliated with Mojang or Microsoft.')}</p>
				</div>
				<nav aria-label="Minemories">
					<a href="https://github.com/For-Hives/minemories">GitHub</a>
				</nav>
			</footer>
			{notice && (
				<div className="mm-toast" role="status">
					{t(notice)}
				</div>
			)}
		</div>
	)
}

function AuthLayout({ children }: { children: ReactNode }) {
	const { t } = useI18n()
	return (
		<div className="mm-site auth-shell">
			<a className="mm-skip" href="#main-content">
				{t('Skip to content')}
			</a>
			<header className="auth-topbar">
				<Brand />
				<div>
					<LanguageControl />
				</div>
			</header>
			<main id="main-content" tabIndex={-1}>
				{children}
			</main>
			<footer className="auth-footer">
				<span>© Minemories</span>
			</footer>
		</div>
	)
}
