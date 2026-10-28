import { Link } from 'react-router'
import { useAppContext } from '../app-context'
import { discoveryPages } from '../content/discovery'
import { useI18n } from '../i18n/I18n'
import { isLocale, localeOptions } from '../i18n/locales'

/*
 * The parts of the film's page that depend on the language or on the session. They are components of their own (the film's markup, HeroMarkup, is rendered once and never
 * re-rendered), so they follow the app's context by themselves; the film never touches their nodes.
 */

/** The app's language selector, in the film's kit look: the only selector of the page (header, and the menu of the small screens). */
export function HeroLanguage({ id, className = '' }: { id?: string; className?: string }) {
	const { locale, pendingLocale, setLocale, t } = useI18n()
	return (
		<div className={`mc-select mc-select--compact ${className}`.trim()}>
			<select
				className="mc-select__control"
				id={id}
				aria-label={t('Language')}
				aria-busy={pendingLocale !== null}
				value={pendingLocale ?? locale}
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
		</div>
	)
}

/** The way into the private space: a button in the header (wide screens), a row of the menu on small ones. */
export function HeroAccount({ menu = false }: { menu?: boolean }) {
	const { session } = useAppContext()
	const { t } = useI18n()
	return (
		<Link
			className={menu ? 'site-menu__account' : 'mc-btn mc-btn--auto site-account'}
			to={session ? '/gallery' : '/login'}
		>
			{t(session ? 'My gallery' : 'Sign in')}
		</Link>
	)
}

const footerPages = [
	{ to: '/installation', label: 'Installation' },
	{ to: '/concept', label: 'The concept' },
	{ to: '/fonctionnement', label: 'How it works' },
	{ to: '/faq', label: 'FAQ' },
	{ to: '/versions', label: 'Mod versions' },
	{ to: '/changelog', label: 'What’s new' },
	{ to: '/decouvrir', label: 'Discover' },
	{ to: '/explorer', label: 'Public gallery' },
	{ to: '/blog', label: 'Blog' },
	{ to: '/pricing', label: 'Pricing' },
	{ to: '/privacy', label: 'Privacy' },
	{ to: '/terms', label: 'Terms' },
	{ to: '/legal', label: 'Legal notice' },
] as const

/** The site's pages, in the film's footer: every one is a real route of the app. */
export function HeroFooterLinks() {
	const { session } = useAppContext()
	const { t } = useI18n()
	return (
		<>
			<li>
				<Link className="mc-link" to={session ? '/gallery' : '/login'}>
					{t(session ? 'My gallery' : 'Sign in')}
				</Link>
			</li>
			{footerPages.map(page => (
				<li key={page.to}>
					<Link className="mc-link" to={page.to}>
						{t(page.label)}
					</Link>
				</li>
			))}
			<li>
				<a className="mc-link" href="https://github.com/For-Hives/minemories">
					GitHub
				</a>
			</li>
		</>
	)
}

/** What the home page said before the film and the film's site does not: why a memory is more than a backup, the discovery pages, the way into the album. */
export function HeroExtras() {
	const { session } = useAppContext()
	const { t } = useI18n()
	return (
		<section className="mc-section" id="more" aria-labelledby="more-title">
			<h2 className="mc-section__title" id="more-title">
				{t('Every world has')} {t('a story.')}
			</h2>
			<p className="mc-section__text">
				{t(
					'Seasons end. Servers close. Minemories keeps a 3D capture of your places to revisit in your browser, without finding the right modpack. Your original world stays yours.'
				)}
			</p>
			<ul className="site-links">
				{discoveryPages.map(page => (
					<li key={page.path}>
						<Link className="mc-link" to={page.path}>
							{t(page.label)}
						</Link>
					</li>
				))}
				<li>
					<Link className="mc-link" to="/concept">
						{t('The story behind Minemories')}
					</Link>
				</li>
				<li>
					<Link className="mc-link" to="/explorer">
						{t('Explore community memories')}
					</Link>
				</li>
			</ul>
			<div className="mc-hero__actions">
				<Link className="mc-btn" to={session ? '/gallery' : '/register'}>
					{t(session ? 'Find my memories' : 'Keep my first memory')}
				</Link>
			</div>
		</section>
	)
}
