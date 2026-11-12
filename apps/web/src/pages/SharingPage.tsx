import { Link } from 'react-router'
import { ShareDemo } from '../components/diagrams'
import { buttonLime } from '../components/ui'
import { pageQuestions } from '../content/faq'
import { useI18n } from '../i18n/I18n'
import { InfoPage, Questions } from './InfoPages'

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
			<p>
				{t(
					'Heads-up: the link shows your base’s coordinates and the server name or address. Think before posting it publicly. It also shows the dimension, biome, world name and seed (in single player).'
				)}
			</p>
			<p>{t('The 3D scene, its name and its date.')}</p>
			<p>
				{t('Players nearby appear with their skin.')} {t('Ask them before you share.')}
			</p>
			<h2>{t('Questions')}</h2>
			<Questions ids={pageQuestions.sharing} />
			<p>
				<Link className={buttonLime} to="/installation">
					{t('Install the mod')}
				</Link>
			</p>
		</InfoPage>
	)
}
