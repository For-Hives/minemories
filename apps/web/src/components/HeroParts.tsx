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

/** The footer's links: the code and its releases are the only pages outside the landing for now (the other pages are archived, see docs/features/pages-archive-et-audit.md). */
export function HeroFooterLinks() {
	const { t } = useI18n()
	return (
		<>
			<li>
				<a className="mc-link" href="https://github.com/For-Hives/minemories/releases">
					{t('Mod versions')}
				</a>
			</li>
			<li>
				<a className="mc-link" href="https://github.com/For-Hives/minemories">
					GitHub
				</a>
			</li>
		</>
	)
}

/** What the home page said before the film and the film's site does not: why a memory is more than a backup, the story behind it. */
export function HeroExtras() {
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
		</section>
	)
}
