import { useI18n } from '../i18n/I18n'
import './not-found.css'

/** The only page besides the landing: the others are archived (docs/features/pages-archive-et-audit.md). */
export function NotFoundPage() {
	const { t } = useI18n()
	return (
		<main id="main-content" tabIndex={-1} className="not-found">
			<p className="not-found__code" aria-hidden="true">
				404
			</p>
			<h1>{t('Page not found')}</h1>
			<p>{t('This address does not lead to a Minemories page.')}</p>
			<a className="not-found__back" href="/">
				{t('Back home')}
			</a>
		</main>
	)
}
