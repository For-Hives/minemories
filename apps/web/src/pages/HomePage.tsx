import { Link } from 'react-router'
import { useAppContext } from '../app-context'
import { LivingLandscape } from '../components/LivingLandscape'
import { MemoryScene } from '../components/MemoryScene'
import { buttonLime, buttonOutline } from '../components/ui'
import { discoveryPages } from '../content/discovery'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'

export function HomePage() {
	const { copy } = useLocalizedCopy()
	const { session } = useAppContext()
	return (
		<div className="album-home">
			<section className="album-intro">
				<div className="album-intro-top">
					<span className="album-kicker">
						{copy('LES MONDES PASSENT. LES SOUVENIRS RESTENT.', 'WORLDS PASS. MEMORIES STAY.')}
					</span>
					<span className="album-edition">
						{copy('Un album pour vos mondes Minecraft', 'An album for your Minecraft worlds')}
					</span>
				</div>
				<div className="album-intro-grid">
					<h1>
						{copy('C’était juste', 'It was just')}
						<br />
						{copy('quelques blocs.', 'a few blocks.')}
						<br />
						<em>{copy('C’était tout un monde.', 'It was our whole world.')}</em>
					</h1>
					<div className="album-intro-note">
						<span className="album-small-star" aria-hidden="true">
							✳
						</span>
						<p>
							{copy(
								'La première maison. Le serveur entre amis. Ce chemin que l’on connaissait par cœur. Gardez ces endroits, et le plaisir d’y retourner.',
								'The first house. A server with friends. The path you knew by heart. Keep those places, and the joy of finding them again.'
							)}
						</p>
						<Link className={buttonLime} to={session ? '/gallery' : '/register'}>
							{copy(
								session ? 'Retrouver mes souvenirs' : 'Commencer mon album',
								session ? 'Find my memories' : 'Start my album'
							)}{' '}
							<span aria-hidden="true">↗</span>
						</Link>
						<Link className="album-text-link" to="/viewer">
							{copy('Ou ouvrir un souvenir local', 'Or open a local memory')} →
						</Link>
					</div>
				</div>
			</section>
			<LivingLandscape />
			<div className="album-footnote">
				<span>01 / {copy('REVENIR', 'RETURN')}</span>
				<span>
					{copy(
						'Vos captures restent privées. Vous choisissez ce que vous partagez.',
						'Your captures stay private. You choose what to share.'
					)}
				</span>
				<span aria-hidden="true">↓</span>
			</div>
			<section className="album-manifesto">
				<span className="album-kicker">{copy('PLUS QU’UNE SAUVEGARDE', 'MORE THAN A BACKUP')}</span>
				<h2>
					{copy('On n’a pas seulement', 'We didn’t just')}
					<br />
					{copy('construit des maisons.', 'build houses.')}
					<br />
					<em>{copy('On a passé du temps ensemble.', 'We spent time together.')}</em>
				</h2>
				<p>
					{copy(
						'Les saisons se terminent. Les serveurs ferment. Minemories garde une capture 3D de vos lieux pour les revisiter dans le navigateur, sans retrouver le bon modpack. Votre monde original reste à vous.',
						'Seasons end. Servers close. Minemories keeps a 3D capture of your places to revisit in your browser, without finding the right modpack. Your original world stays yours.'
					)}
				</p>
				<Link to="/concept" className="album-text-link">
					{copy('L’histoire derrière Minemories', 'The story behind Minemories')} ↗
				</Link>
			</section>
			<section className="album-journey" aria-label={copy('Comment ça marche', 'How it works')}>
				<div className="album-section-title">
					<span className="album-kicker">02 / {copy('CONSERVER', 'PRESERVE')}</span>
					<h2>
						{copy('Trois gestes.', 'Three steps.')}
						<br />
						<em>{copy('Des années de souvenirs.', 'Years of memories.')}</em>
					</h2>
					<Link className={buttonOutline} to="/installation">
						{copy('Installer le mod', 'Install the mod')} ↗
					</Link>
				</div>
				<div className="album-steps">
					{[
						[
							copy('Choisir un endroit.', 'Choose a place.'),
							copy(
								'Depuis Minecraft, capturez la maison, le village ou le coin de monde qui compte pour vous.',
								'From Minecraft, capture the house, village or corner of the world that matters to you.'
							),
						],
						[
							copy('Lui garder une place.', 'Keep a place for it.'),
							copy(
								'Conservez votre fichier localement, ou retrouvez vos captures dans votre galerie privée après association du mod.',
								'Keep your file locally, or find your captures in your private gallery after pairing the mod.'
							),
						],
						[
							copy('Y retourner, ensemble.', 'Return, together.'),
							copy(
								'Entrez dans le souvenir, changez la lumière et invitez vos amis avec un lien que vous pouvez révoquer.',
								'Step into the memory, change the light and invite your friends with a link you can revoke.'
							),
						],
					].map(([title, description], index) => (
						<article key={title}>
							<span className="album-step-number">0{index + 1}</span>
							<div>
								<h3>{title}</h3>
								<p>{description}</p>
							</div>
							<span aria-hidden="true">{['⌖', '▧', '↗'][index]}</span>
						</article>
					))}
				</div>
			</section>
			<section className="album-collections">
				<div className="album-section-title">
					<span className="album-kicker">03 / {copy('S’INSPIRER', 'DISCOVER')}</span>
					<h2>
						{copy('À chaque monde,', 'Every world has')} <em>{copy('son histoire.', 'a story.')}</em>
					</h2>
				</div>
				<div className="album-collection-grid">
					{discoveryPages.map((page, index) => (
						<Link to={page.path} key={page.path}>
							<div className={`album-collection-art album-art-${index}`}>
								<MemoryScene
									theme={index % 2 ? 'garden' : 'home'}
									label={copy('Illustration d’un souvenir', 'Memory illustration')}
								/>
							</div>
							<span className="album-kicker">0{index + 1} / MINEMORIES</span>
							<h3>
								{copy(page.label.fr, page.label.en)} <span aria-hidden="true">↗</span>
							</h3>
						</Link>
					))}
				</div>
			</section>
			<section className="album-outro">
				<span className="album-kicker">
					{copy('POUR PLUS TARD. POUR TOUJOURS SE SOUVENIR.', 'FOR LATER. FOR REMEMBERING.')}
				</span>
				<h2>
					{copy('La prochaine fois,', 'Next time,')}
					<br />
					<em>{copy('gardez une trace.', 'keep a little piece.')}</em>
				</h2>
				<Link className={buttonLime} to={session ? '/gallery' : '/register'}>
					{copy('Garder mon premier souvenir', 'Keep my first memory')} ↗
				</Link>
			</section>
		</div>
	)
}
