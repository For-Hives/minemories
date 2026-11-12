import { Link } from 'react-router'
import { type FaqEntry, faqText, installationHelp, installationHelpByStep, questions } from '../content/faq'
import { T, useI18n } from '../i18n/I18n'
import { helpOrder, type StepId } from '../lib/install-guide'

/**
 * "If a step gets stuck": what can break during the install, as folds written once in the FAQ. On a screen of the
 * stepper, the items about that screen come first.
 */
export function InstallationHelp({ step }: { step: StepId | 'done' | null }) {
	const { t } = useI18n()
	return (
		<section id="aide" className="install-help" aria-labelledby="help-title">
			<span className="install-eyebrow">
				<T message={'A little help'} />
			</span>
			<h2 id="help-title">
				<T message={'If a step gets stuck'} />
			</h2>
			{helpOrder(installationHelp, installationHelpByStep, step).map(id => {
				const entry: FaqEntry = questions[id]
				const { question, answer } = faqText(id, t)
				return (
					<details key={id}>
						<summary>{question}</summary>
						<p>
							{answer}
							{entry.link && (
								<>
									{' '}
									<Link to={entry.link.to}>{t(entry.link.label)} →</Link>
								</>
							)}
						</p>
					</details>
				)
			})}
			<p className="install-actions">
				<Link to="/downloads">{t('All downloads')}</Link>
				<Link to="/faq">{t('All questions')}</Link>
				<Link to="/safety#verifier">{t('Check your file')}</Link>
			</p>
		</section>
	)
}
