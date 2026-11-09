import { Link } from 'react-router'
import { ShareDemo } from '../components/diagrams'
import { More } from '../components/explainers'
import { buttonLime, buttonOutline } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import { ContentLayout } from './ContentPages'

/** /sharing: how a memory is shown to others by link. Its own module, so the page can grow without the retired discovery template. */
export function SharingPage() {
	const { t } = useI18n()
	return (
		<ContentLayout
			eyebrow={`MINEMORIES / ${t('A gallery to share')}`}
			title={t('Show people around your base, even those who don’t play')}
		>
			<ShareDemo />
			<div className="mm-actions">
				<Link className={buttonOutline} to="/explore?demo=1">
					{t('View the demo')}
				</Link>
				<Link className={buttonLime} to="/gallery">
					{t('My private gallery')}
				</Link>
			</div>
			<More label={t('Good to know')}>
				<p>{t('The demo explorer uses illustrations. No private captures are published there.')}</p>
			</More>
		</ContentLayout>
	)
}
