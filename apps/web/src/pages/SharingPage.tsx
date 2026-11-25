import { ShareDemo } from '../components/diagrams'
import { linkWarning, pageFaqGroups } from '../content/faq'
import { useI18n } from '../i18n/I18n'
import { FaqLink, InfoPage } from './InfoPages'

/** /sharing: how a memory is shown to others by link, what the visitor sees, and how sharing stops. */
export function SharingPage() {
	const { t } = useI18n()
	return (
		<InfoPage title="Show people around your base, even those who don’t play">
			<p>{t('In your gallery, open a memory → Share → Create a link → Copy. Paste it on Discord, done.')}</p>
			<ShareDemo />
			<p>{t('A link to one memory, or to a whole world with its timeline slider.')}</p>
			<p>{t('Prefer a picture? Download the HD postcard and post it on Discord.')}</p>
			<h2>{t('What someone with a link sees')}</h2>
			<p>{t(linkWarning)}</p>
			<p>{t('The 3D scene, its name and its date.')}</p>
			<p>
				{t('Players nearby appear with their skin.')} {t('Ask them before you share.')}
			</p>
			<FaqLink group={pageFaqGroups.sharing} />
		</InfoPage>
	)
}
