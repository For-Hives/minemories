import { Link } from 'react-router'
import { faqText, pageQuestions } from '../content/faq'
import { useI18n } from '../i18n/I18n'

/*
 * The parts of the film's page that depend on the language or on the session. They are components of their own (the film's markup, HeroMarkup, is rendered once and never
 * re-rendered), so they follow the app's context by themselves; the film never touches their nodes.
 */

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
