import { ShareDemo } from '../components/diagrams'
import { linkWarning, pageFaqGroups } from '../content/faq'
import { useI18n } from '../i18n/I18n'
import { FaqLink, InfoPage } from './InfoPages'

/** /sharing: how a memory is shown to others by link, what the visitor sees, and how sharing stops. */
export function SharingPage() {
	const { t } = useI18n()
	return (
		<InfoPage title="Share your base with a link">
			<p>{t('In your gallery, open a memory → Share → Create a link → Copy. Paste it on Discord, done.')}</p>
			<ShareDemo />
			<p>{t('A link to one memory, or to a whole world with its timeline slider.')}</p>
			<p>{t('Or download an HD postcard.')}</p>
			<h2>{t('What your friends see')}</h2>
			<p>
				{t('Your base in 3D, its name and its date.')} {t(linkWarning)}
			</p>
			<p>
				{t('Players nearby appear with their skin.')} {t('Ask them before you share.')}
			</p>
			<FaqLink group={pageFaqGroups.sharing} />
		</InfoPage>
	)
}
