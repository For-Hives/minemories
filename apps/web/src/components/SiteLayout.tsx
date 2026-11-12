import { type ReactNode, useLayoutEffect } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { useAppContext } from '../app-context'
import { useI18n } from '../i18n/I18n'
import { applyDisplay } from '../lib/display-preferences'
import { Brand, SiteFooter } from './SiteFooter'
import { SiteNav } from './SiteNav'
import { buttonQuiet, fileInputHidden } from './ui'

const legalLinks = [
	{ to: '/privacy', label: 'Privacy' },
	{ to: '/terms', label: 'Terms' },
	{ to: '/legal', label: 'About and legal notice' },
]
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
/** The site's bar, the same on every page that is not the 3D viewer, and on the landing (HeroMarkup): the brand, then SiteNav. */
function SiteHeader() {
	return (
		<header className="mm-header">
			<Brand solo />
			<SiteNav extra={<FileControl />} />
		</header>
	)
}
export function SiteLayout({ notice = '', children }: { notice?: string; children?: ReactNode }) {
	const { t, locale } = useI18n()
	const { pathname } = useLocation()
	// The landing's film resets <html> when it leaves: the Unifont class of the locale is put back on every page (lib/display-preferences.ts).
	useLayoutEffect(() => {
		if (pathname !== '/') applyDisplay(document.documentElement, locale)
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
			<SiteFooter />
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
