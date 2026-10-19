import { Link } from 'react-router'
import { useAppContext } from '../app-context'
import { LivingLandscape } from '../components/LivingLandscape'
import { MemoryScene } from '../components/MemoryScene'
import { buttonLime, buttonOutline } from '../components/ui'
import { discoveryPages } from '../content/discovery'
import { useI18n } from '../i18n/I18n'

export function HomePage() {
	const { t } = useI18n()
	const { session } = useAppContext()
	return (
		<div className="album-home">
			<section className="album-intro">
				<div className="album-intro-top">
					<span className="album-kicker">{t('WORLDS PASS. MEMORIES STAY.')}</span>
					<span className="album-edition">{t('An album for your Minecraft worlds')}</span>
				</div>
				<div className="album-intro-grid">
					<h1>
						{t('It was just')}
						<br />
						{t('a few blocks.')}
						<br />
						<em>{t('It was our whole world.')}</em>
					</h1>
					<div className="album-intro-note">
						<span className="album-small-star" aria-hidden="true">
							✳
						</span>
						<p>
							{t(
								'The first house. A server with friends. The path you knew by heart. Keep those places, and the joy of finding them again.'
							)}
						</p>
						<Link className={buttonLime} to={session ? '/gallery' : '/register'}>
							{t(session ? 'Find my memories' : 'Start my album')} <span aria-hidden="true">↗</span>
						</Link>
						<Link className="album-text-link" to="/explorer">
							{t('Explore community memories')} →
						</Link>
					</div>
				</div>
			</section>
			<LivingLandscape />
			<div className="album-footnote">
				<span>01 / {t('RETURN')}</span>
				<span>{t('Your captures stay private. You choose what to share.')}</span>
				<span aria-hidden="true">↓</span>
			</div>
			<section className="album-manifesto">
				<span className="album-kicker">{t('MORE THAN A BACKUP')}</span>
				<h2>
					{t('We didn’t just')}
					<br />
					{t('build houses.')}
					<br />
					<em>{t('We spent time together.')}</em>
				</h2>
				<p>
					{t(
						'Seasons end. Servers close. Minemories keeps a 3D capture of your places to revisit in your browser, without finding the right modpack. Your original world stays yours.'
					)}
				</p>
				<Link to="/concept" className="album-text-link">
					{t('The story behind Minemories')} ↗
				</Link>
			</section>
			<section className="album-journey" aria-label={t('How it works')}>
				<div className="album-section-title">
					<span className="album-kicker">02 / {t('PRESERVE')}</span>
					<h2>
						{t('Three steps.')}
						<br />
						<em>{t('Years of memories.')}</em>
					</h2>
					<Link className={buttonOutline} to="/installation">
						{t('Install the mod')} ↗
					</Link>
				</div>
				<div className="album-steps">
					{[
						[
							t('Choose a place.'),
							t('From Minecraft, capture the house, village or corner of the world that matters to you.'),
						],
						[
							t('Keep a place for it.'),
							t('Keep your file locally, or find your captures in your private gallery after pairing the mod.'),
						],
						[
							t('Return, together.'),
							t('Step into the memory, change the light and invite your friends with a link you can revoke.'),
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
					<span className="album-kicker">03 / {t('DISCOVER')}</span>
					<h2>
						{t('Every world has')} <em>{t('a story.')}</em>
					</h2>
				</div>
				<div className="album-collection-grid">
					{discoveryPages.map((page, index) => (
						<Link to={page.path} key={page.path}>
							<div className={`album-collection-art album-art-${index}`}>
								<MemoryScene theme={index % 2 ? 'garden' : 'home'} label={t('Memory illustration')} />
							</div>
							<span className="album-kicker">0{index + 1} / MINEMORIES</span>
							<h3>
								{t(page.label)} <span aria-hidden="true">↗</span>
							</h3>
						</Link>
					))}
				</div>
			</section>
			<section className="album-outro">
				<span className="album-kicker">{t('FOR LATER. FOR REMEMBERING.')}</span>
				<h2>
					{t('Next time,')}
					<br />
					<em>{t('keep a little piece.')}</em>
				</h2>
				<Link className={buttonLime} to={session ? '/gallery' : '/register'}>
					{t('Keep my first memory')} ↗
				</Link>
			</section>
		</div>
	)
}
