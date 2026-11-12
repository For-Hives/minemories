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
			<ShareDemo />
			<p>{t('A link for one memory, or for a whole world with its slider through time.')}</p>
			<p>{t('Prefer a picture? Download the HD postcard and post it on Discord.')}</p>
			<h2>{t('What someone with a link sees')}</h2>
			<p>
				{t('The 3D scene, its name and its date.')}{' '}
				{t(
					'The link also shows the coordinates, the dimension, the biome, the world name, the seed (in single player) or the server name or address.'
				)}
			</p>
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
