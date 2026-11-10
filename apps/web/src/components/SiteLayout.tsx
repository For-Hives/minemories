import { type ReactNode, useEffect, useLayoutEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { useAppContext } from '../app-context'
import { type FooterLink, footerGroups } from '../content/navigation'
import { useI18n } from '../i18n/I18n'
import {
	applyDisplay,
	type DisplayOption,
	readDisplayOption,
	setDisplayOption,
	storeDisplayOption,
} from '../lib/display-preferences'
import { repositoryUrl } from '../lib/repository'
import { catalogLinks } from '../pages/installation-loaders'
import { BrandMark } from './BrandMark'
import { DiagnosticsAccessLink } from './DiagnosticsAccessLink'
import { SiteNav } from './SiteNav'
import { buttonQuiet, fileInputHidden } from './ui'

const legalLinks = [
	{ to: '/privacy', label: 'Privacy' },
	{ to: '/terms', label: 'Terms' },
	{ to: '/legal', label: 'About and legal notice' },
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
				<div className="mm-footer-brand">
					<Brand />
					<p className="mm-fineprint">
						{t(
							'Minemories is not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.'
						)}
					</p>
					<DisplayOptions />
				</div>
				{footerGroups.map(group => (
					<nav key={group.label} aria-label={t(group.label)}>
						<h2 className="mm-footer-title">{t(group.label)}</h2>
						{group.links.map(link => (
							<FooterAnchor key={link.label} link={link} />
						))}
					</nav>
				))}
				<nav aria-label={t('Elsewhere')}>
					<h2 className="mm-footer-title">{t('Elsewhere')}</h2>
					{catalogLinks().map(catalog => (
						<a key={catalog.name} href={catalog.url}>
							{catalog.name}
						</a>
					))}
					<a href={repositoryUrl}>GitHub</a>
					{session && <DiagnosticsAccessLink key={session.user.id} />}
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

/** A footer link: a page of the site, or an outside address. */
function FooterAnchor({ link }: { link: FooterLink }) {
	const { t } = useI18n()
	if ('href' in link) return <a href={link.href}>{t(link.label)}</a>
	return <Link to={link.to}>{t(link.label)}</Link>
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
