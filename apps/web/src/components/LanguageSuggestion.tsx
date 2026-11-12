import { translate, useI18n } from '../i18n/I18n'
import { localeTag } from '../i18n/locales'

/**
 * Offers the browser's language when it differs from the page's, without switching anything until the visitor accepts.
 * Every label is in the suggested language: the two neutral keys ("this language") read, in each catalogue, as that
 * catalogue's own language name, so they are only ever passed to `translate(target, …)`, never to `t()`; the card floats
 * over the page (no layout shift), takes no focus, and `data-nosnippet` keeps it out of search snippets. It only appears
 * after mount, so it is never part of the prerendered HTML.
 */
export function LanguageSuggestion() {
	const { suggestedLocale: target, setLocale, dismissSuggestion } = useI18n()
	if (!target) return null
	return (
		<section
			className="mm-toast mm-language-suggestion"
			lang={localeTag(target)}
			aria-label={translate(target, 'Language suggestion')}
			data-nosnippet=""
		>
			<p>{translate(target, 'Read Minemories in this language?')}</p>
			<div className="mm-language-suggestion__actions">
				<button className="mc-btn mc-btn--auto mc-btn--primary" type="button" onClick={() => setLocale(target)}>
					{translate(target, 'Switch to this language')}
				</button>
				<button className="mc-btn mc-btn--auto" type="button" onClick={dismissSuggestion}>
					{translate(target, 'No thanks')}
				</button>
			</div>
		</section>
	)
}
