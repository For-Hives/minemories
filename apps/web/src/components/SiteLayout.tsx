import { type ReactNode, useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAppContext } from '../app-context'
import { authClient } from '../auth-client'
import { discoveryPages } from '../content/discovery'
import { useI18n } from '../i18n/I18n'
import { avatarUrl } from '../lib/avatar'
import { LoadingSkeleton } from './Loading'
import { buttonDark, buttonQuiet, fileInputHidden } from './ui'

const navigation = [
	{ to: '/decouvrir', label: 'Discover' },
	{ to: '/installation', label: 'Guides' },
	{ to: '/blog', label: 'Blog' },
	{ to: '/pricing', label: 'Pricing' },
]
const legalLinks = [
	{ to: '/privacy', label: 'Privacy' },
	{ to: '/terms', label: 'Terms' },
	{ to: '/legal', label: 'Legal' },
]
export function Brand() {
	return (
		<Link className="mm-brand" to="/" aria-label="Minemories">
			<span aria-hidden="true">m</span>minemories
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
			<Link to="/gallery" title={session.user.name}>
				{/* biome-ignore lint/performance/noImgElement: lazy external avatar in a static React app. */}
				<img src={avatarUrl(session.user)} alt="" width={32} height={32} loading="lazy" />
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
	return (
		<label className={`${buttonQuiet} mm-file-control`}>
			<span>{t('Open a local GLB')}</span>
			<span aria-hidden="true">＋</span>
			<input
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
	const { locale, setLocale, t } = useI18n()
	return (
		<label className="mm-language">
			<span className="sr-only">{t('Language')}</span>
			<select value={locale} onChange={event => setLocale(event.target.value === 'en' ? 'en' : 'fr')}>
				<option value="fr">FR</option>
				<option value="en">EN</option>
			</select>
		</label>
	)
}
export function SiteLayout({ notice = '', children }: { notice?: string; children?: ReactNode }) {
	const { session } = useAppContext()
	const { t, locale } = useI18n()
	const { pathname } = useLocation()
	const mobile = useRef<HTMLDetailsElement>(null)
	useEffect(() => {
		mobile.current?.removeAttribute('open')
	}, [pathname])
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
					<details ref={mobile} className="mm-mobile-menu">
						<summary aria-label={t('Open menu')}>
							<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
								<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.5" />
							</svg>
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
				<nav aria-label={t('Guides')}>
					<Link to="/concept">Le concept</Link>
					<Link to="/fonctionnement">Comment ça marche</Link>
					<Link to="/installation">Installer le mod</Link>
					<Link to="/versions">{t('Mod versions')}</Link>
					<Link to="/changelog">{t('What’s new')}</Link>
					<Link to="/faq">FAQ</Link>
				</nav>
				<nav aria-label="Minemories">
					{navigation
						.filter(link => link.to !== '/installation')
						.map(link => (
							<Link to={link.to} key={link.to}>
								{t(link.label)}
							</Link>
						))}
					{[...discoveryPages, { path: '/explorer', label: { fr: 'Galerie publique', en: 'Public gallery' } }].map(
						page => (
							<Link key={page.path} to={page.path}>
								{page.label[locale]}
							</Link>
						)
					)}
					<a href="https://github.com/For-Hives/minemories">GitHub</a>
				</nav>
				<nav aria-label={t('Legal')}>
					{legalLinks.map(link => (
						<Link to={link.to} key={link.to}>
							{t(link.label)}
						</Link>
					))}
				</nav>
			</footer>
			{notice && (
				<div className="mm-toast" role="status">
					{notice}
				</div>
			)}
		</div>
	)
}
