import { Link } from 'react-router'
import { useAppContext } from '../app-context'
import { faqText, pageQuestions } from '../content/faq'
import { footerGroups, navigation } from '../content/navigation'
import { useI18n } from '../i18n/I18n'
import { isLocale, localeOptions } from '../i18n/locales'
import { repositoryUrl } from '../lib/repository'
import { catalogLinks } from '../pages/installation-loaders'
import { DiagnosticsAccessLink } from './DiagnosticsAccessLink'

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

/** The site's main links, as on every other page. Signed in, the account button already opens the gallery. */
export function HeroNavLinks() {
	const { t } = useI18n()
	return (
		<>
			{navigation.map(link => (
				<li key={link.to}>
					<Link to={link.to}>{t(link.label)}</Link>
				</li>
			))}
		</>
	)
}

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
			{footerGroups.flatMap(group =>
				group.links.map(link => (
					<li key={link.label}>
						{'href' in link ? (
							<a className="mc-link" href={link.href}>
								{t(link.label)}
							</a>
						) : (
							<Link className="mc-link" to={link.to}>
								{t(link.label)}
							</Link>
						)}
					</li>
				))
			)}
			{session && (
				<li>
					<DiagnosticsAccessLink key={session.user.id} />
				</li>
			)}
			<li>
				<a className="mc-link" href={repositoryUrl}>
					GitHub
				</a>
			</li>
			{catalogLinks().map(catalog => (
				<li key={catalog.name}>
					<a className="mc-link" href={catalog.url}>
						{catalog.name}
					</a>
				</li>
			))}
		</>
	)
}

/** The landing's three questions, read from content/faq.ts like every other page's (the /faq list holds them all): a component, so it follows the app's language by itself. */
export function HeroQuestions() {
	const { t } = useI18n()
	return (
		<div className="mc-faq">
			{pageQuestions.home.map(id => {
				const { question, answer } = faqText(id, t)
				return (
					<details key={id} className="mc-faq__item" name="faq">
						<summary className="mc-faq__q">{question}</summary>
						<p className="mc-faq__a">{answer}</p>
					</details>
				)
			})}
			<p>
				<Link className="mc-link" to="/faq">
					{t('All questions')} →
				</Link>
			</p>
		</div>
	)
}
