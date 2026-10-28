import { memo } from 'react'
import { Link } from 'react-router'
import { translate } from '../i18n/catalog'
import type { TranslateValues } from '../lib/hero-i18n'
import { HeroAccount, HeroExtras, HeroFooterLinks, HeroLanguage } from './HeroParts'

/**
 * The film's page, as JSX (the markup of the prototype's hero.html, same classes and ids: the film code and its CSS address it as is).
 * It is rendered once and never re-rendered (no props, memoised): the prerender, the hydration and the first client render are all French (the site's prerender language),
 * and the film's own `apply()` writes the visitor's language into the `data-i18n` elements once it starts. React and the film therefore never write the same node twice.
 * What depends on the session or the language is in HeroParts.tsx, as separate components that update themselves.
 */
const t = (key: string, values?: TranslateValues) => translate('fr', key, { name: 'Efe', ...values })

export const HeroMarkup = memo(function HeroMarkup() {
	return (
		<>
			<a className="mc-btn mc-btn--auto mc-skip" href="#hero-title">
				<span data-i18n="Skip to content">{t('Skip to content')}</span>
			</a>
			<div className="film-bar">
				<button className="mc-btn mc-btn--auto film-skip" id="film-skip" type="button">
					<span data-i18n="Skip the film">{t('Skip the film')}</span>
				</button>
				<button className="ctl-play mc-btn mc-btn--icon" id="film-play" type="button" hidden>
					<i className="mc-icon mc-icon--pause i-pause" aria-hidden="true" />
					<i className="mc-icon mc-icon--play i-play" aria-hidden="true" />
					<span className="mc-sr-only ctl-label" />
				</button>
				<div className="film-steps" hidden>
					<button className="mc-btn mc-btn--auto" type="button" data-step="-1">
						<span className="mc-icon mc-icon--arrow-l step-icon" aria-hidden="true" />
						<span className="step-label" data-i18n="Previous">
							{t('Previous')}
						</span>
					</button>
					<span
						className="film-steps__count"
						role="status"
						data-short="1/13"
						data-i18n={'Film step {n} of {total}'}
						data-i18n-values={'{"n":1,"total":13}'}
					>
						{t('Film step {n} of {total}', { n: 1, total: 13 })}
					</span>
					<button className="mc-btn mc-btn--auto" type="button" data-step="1">
						<span className="step-label" data-i18n="Next">
							{t('Next')}
						</span>
						<span className="mc-icon mc-icon--arrow-r step-icon" aria-hidden="true" />
					</button>
				</div>
				<ol
					className="ticks"
					data-i18n-attr="aria-label:Film chapters (keys 1 to 5)"
					aria-label={t('Film chapters (keys 1 to 5)')}
				>
					<li>
						<button className="tick" type="button" data-chapter-index="0">
							<span aria-hidden="true">
								<b>1</b> <span data-i18n="The evening">{t('The evening')}</span>
							</span>
						</button>
					</li>
					<li>
						<button className="tick" type="button" data-chapter-index="1">
							<span aria-hidden="true">
								<b>2</b> <span data-i18n="Leaving">{t('Leaving')}</span>
							</span>
						</button>
					</li>
					<li>
						<button className="tick" type="button" data-chapter-index="2">
							<span aria-hidden="true">
								<b>3</b> <span data-i18n="The wait">{t('The wait')}</span>
							</span>
						</button>
					</li>
					<li>
						<button className="tick" type="button" data-chapter-index="3">
							<span aria-hidden="true">
								<b>4</b> <span data-i18n="The kept memory">{t('The kept memory')}</span>
							</span>
						</button>
					</li>
					<li>
						<button className="tick" type="button" data-chapter-index="4">
							<span aria-hidden="true">
								<b>5</b> <span data-i18n="The return">{t('The return')}</span>
							</span>
						</button>
					</li>
				</ol>
			</div>
			<header className="mc-sitebar" id="top">
				<a
					className="mc-sitebar__brand"
					href="#hero"
					data-i18n-attr="aria-label:Minemories, back to the top"
					aria-label={t('Minemories, back to the top')}
				>
					<i className="mc-icon mc-icon--ember" aria-hidden="true" />
					<span>Minemories</span>
				</a>
				<nav className="site-nav" data-i18n-attr="aria-label:Site sections" aria-label={t('Site sections')}>
					<ul className="mc-sitebar__nav">
						<li>
							<a href="#steps" data-i18n="How it works">
								{t('How it works')}
							</a>
						</li>
						<li>
							<a href="#share" data-i18n="Sharing">
								{t('Sharing')}
							</a>
						</li>
						<li>
							<a href="#faq" data-i18n="FAQ">
								{t('FAQ')}
							</a>
						</li>
					</ul>
				</nav>
				<div className="mc-sitebar__end">
					<HeroAccount />
					<HeroLanguage className="site-lang" />
					<Link className="mc-btn mc-btn--primary mc-btn--auto mc-sitebar__cta" to="/installation">
						<span className="mc-icon mc-icon--ember cta-icon" aria-hidden="true" />
						<span className="cta-long" data-i18n="Install the mod">
							{t('Install the mod')}
						</span>
						<span className="cta-short" aria-hidden="true" data-i18n="Install it">
							{t('Install it')}
						</span>
					</Link>
					<button
						className="mc-btn mc-btn--tool site-menu__btn"
						type="button"
						id="site-menu-btn"
						aria-expanded="false"
						aria-controls="site-menu"
						data-i18n-attr="aria-label:Menu;title:Menu"
						aria-label={t('Menu')}
						title={t('Menu')}
					>
						<span className="mc-icon mc-icon--menu i-open" aria-hidden="true" />
						<span className="mc-icon mc-icon--cross i-close" aria-hidden="true" />
					</button>
				</div>
				<div className="site-menu" id="site-menu" hidden>
					<nav data-i18n-attr="aria-label:Site sections" aria-label={t('Site sections')}>
						<ul className="site-menu__links">
							<li>
								<a href="#steps" data-i18n="How it works">
									{t('How it works')}
								</a>
							</li>
							<li>
								<a href="#share" data-i18n="Sharing">
									{t('Sharing')}
								</a>
							</li>
							<li>
								<a href="#faq" data-i18n="FAQ">
									{t('FAQ')}
								</a>
							</li>
						</ul>
					</nav>
					<HeroAccount menu />
					<div className="site-menu__lang">
						<label className="mc-formlabel" htmlFor="lang-menu" data-i18n="Language">
							{t('Language')}
						</label>
						<HeroLanguage id="lang-menu" />
					</div>
				</div>
			</header>
			<div className="stage" id="stage">
				<picture className="poster">
					<source media="(max-aspect-ratio: 85/100) and (max-width: 639px)" srcSet="/hero/posters/poster-phone.jpg" />
					<source media="(max-aspect-ratio: 85/100)" srcSet="/hero/posters/poster-tablet.jpg" />
					<img src="/hero/posters/poster-wide.jpg" alt="" decoding="async" fetchPriority="high" />
				</picture>
				<canvas
					id="mm-scene"
					role="img"
					data-i18n-attr="aria-label:Silent film: a player and their dog by the fire, in front of a Minecraft chalet. The player tells the dog to stay, writes “stay, I'll be back soon...” and leaves the game. The dog turns toward you, sad, and lies down. The seasons pass, the world fades. An ember brightens the evening again: the player is back, the dog celebrates, exactly as it was."
					aria-describedby="w1 w2 w3 w4 w5 stage-help"
					aria-label={t(
						"Silent film: a player and their dog by the fire, in front of a Minecraft chalet. The player tells the dog to stay, writes “stay, I'll be back soon...” and leaves the game. The dog turns toward you, sad, and lies down. The seasons pass, the world fades. An ember brightens the evening again: the player is back, the dog celebrates, exactly as it was."
					)}
				/>
				<p
					className="mc-sr-only"
					id="stage-help"
					data-i18n="Scroll, swipe or use the arrow keys to move forward or back in the film. K pauses it."
				>
					{t('Scroll, swipe or use the arrow keys to move forward or back in the film. K pauses it.')}
				</p>
				<div className="anchor-layer" id="anchors" aria-hidden="true" />
			</div>
			<div className="scrim" aria-hidden="true" />
			<div className="veil-page" aria-hidden="true" />
			{/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: a 2D copy of the film's last frame, never focusable (the film code hides it from the accessibility tree). */}
			<canvas className="film-snap" id="film-snap" aria-hidden="true" />
			<div className="hud8 mc-film" aria-hidden="true">
				<div className="mc-say" data-hud="say" data-chapter="say">
					<span className="mc-say__typed" />
					<span className="mc-say__caret" data-on="1">
						_
					</span>
				</div>
				<div className="mc-guiscreen" data-hud="gui" data-panel="pause">
					<div className="mc-guiscreen__panel" data-p="pause">
						<span className="mc-guiscreen__btn" data-item="resume" data-i18n="Back to Game">
							{t('Back to Game')}
						</span>
						<span className="mc-guiscreen__btn" data-item="options" data-i18n="Options...">
							{t('Options...')}
						</span>
						<span className="mc-guiscreen__btn" data-item="quit" data-i18n="Save and Quit to Title">
							{t('Save and Quit to Title')}
						</span>
					</div>
					<i className="mc-cursor" />
				</div>
				<div className="mc-chat">
					<p
						className="mc-chat__line mc-chat__line--join is-fadeout"
						data-hud="chat"
						data-chapter="join"
						data-i18n={'{name} joined the game'}
					>
						{t('{name} joined the game')}
					</p>
					<p
						className="mc-chat__line mc-chat__line--join is-fadeout"
						data-hud="chat"
						data-chapter="rejoin"
						data-i18n={'{name} joined the game'}
					>
						{t('{name} joined the game')}
					</p>
					<p
						className="mc-chat__line mc-chat__line--mod"
						data-hud="chat"
						data-chapter="mod"
						data-i18n="Minemories: world capture done."
					>
						{t('Minemories: world capture done.')}
					</p>
					<p className="mc-chat__line mc-chat__line--player is-fadeout--slow" data-hud="chat" data-chapter="say">
						<span className="mc-chat__text" data-say-text>
							{"<Efe> stay, I'll be back soon..."}
						</span>
						<span
							className="mc-chat__line mc-chat__line--quit is-fadeout--slow"
							data-hud="chat"
							data-chapter="quit"
							data-i18n={'{name} left the game'}
						>
							{t('{name} left the game')}
						</span>
					</p>
				</div>
				<div className="mc-titlecmd" data-hud="title" data-chapter="t-evenings">
					<p>
						<span className="mc-titlecmd__title" data-i18n="There are evenings">
							{t('There are evenings')}
						</span>
					</p>
					<p>
						<span className="mc-titlecmd__sub" data-i18n="we wish we could keep.">
							{t('we wish we could keep.')}
						</span>
					</p>
				</div>
				<div className="mc-titlecmd" data-hud="title" data-chapter="t-keep">
					<p>
						<span className="mc-titlecmd__title" data-i18n="That evening">
							{t('That evening')}
						</span>
					</p>
					<p>
						<span className="mc-titlecmd__sub" data-i18n="was kept by Minemories.">
							{t('was kept by Minemories.')}
						</span>
					</p>
				</div>
				<div className="mc-hearts" data-hud="hearts" data-chapter="hearts" aria-hidden="true">
					<i className="mc-heart" />
					<i className="mc-heart" />
					<i className="mc-heart" />
					<i className="mc-heart" />
					<i className="mc-heart" />
					<i className="mc-heart" />
					<i className="mc-heart" />
					<i className="mc-heart" />
				</div>
			</div>
			<div className="mod-help" id="mod-help" hidden>
				<button className="mod-help__hit" id="mod-help-hit" type="button" aria-describedby="mod-help-tip" />
				<p
					className="mc-tip mod-help__tip"
					id="mod-help-tip"
					role="tooltip"
					data-i18n="AFK: you have not touched the game for 5 minutes. Locally: on your computer."
				>
					{t('AFK: you have not touched the game for 5 minutes. Locally: on your computer.')}
				</p>
			</div>
			<p className="mc-sr-only sig-say" role="status" aria-live="polite" aria-atomic="true" />
			<div className="site" id="site">
				<main id="main">
					<section className="site-hero" id="hero" aria-labelledby="hero-title">
						<div className="mc-hero">
							<span className="mc-hero__kicker" data-i18n="Minecraft Java mod · beta">
								{t('Minecraft Java mod · beta')}
							</span>
							<h1
								className="mc-hero__title"
								id="hero-title"
								tabIndex={-1}
								data-i18n="There are evenings we wish we could keep."
							>
								{t('There are evenings we wish we could keep.')}
							</h1>
							<p
								className="mc-hero__lead"
								data-i18n="Minemories keeps the corner of the world where you play, in 3D. Revisit it in your private gallery and share it with a simple link."
							>
								{t(
									'Minemories keeps the corner of the world where you play, in 3D. Revisit it in your private gallery and share it with a simple link.'
								)}
							</p>
							<div className="mc-hero__actions">
								<Link className="mc-btn mc-btn--primary" id="hero-install" to="/installation">
									<span className="mc-icon mc-icon--ember" aria-hidden="true" />
									<span data-i18n="Install the mod">{t('Install the mod')}</span>
								</Link>
								<button className="mc-btn" type="button" data-action="replay">
									<span className="mc-icon mc-icon--replay" aria-hidden="true" />
									<span data-i18n="Watch the film again">{t('Watch the film again')}</span>
								</button>
							</div>
							<p className="mc-hero__compat" data-i18n="Java 1.21.1 · NeoForge, Fabric, Forge">
								{t('Java 1.21.1 · NeoForge, Fabric, Forge')}
							</p>
						</div>
					</section>
					<section className="mc-section" id="steps" aria-labelledby="steps-title">
						<h2 className="mc-section__title" id="steps-title" data-i18n="How it works">
							{t('How it works')}
						</h2>
						<ol className="mc-steps">
							<li className="mc-step">
								<span className="mc-step__num">
									<span className="mc-slot mc-slot--digit" aria-hidden="true">
										1
									</span>
								</span>
								<h3 className="mc-step__title" data-i18n="Add the mod to your game">
									{t('Add the mod to your game')}
								</h3>
								<p className="mc-step__body" data-i18n="For Minecraft Java 1.21.1, with NeoForge, Fabric or Forge.">
									{t('For Minecraft Java 1.21.1, with NeoForge, Fabric or Forge.')}
								</p>
							</li>
							<li className="mc-step">
								<span className="mc-step__num">
									<span className="mc-slot mc-slot--digit" aria-hidden="true">
										2
									</span>
								</span>
								<h3 className="mc-step__title" data-i18n="Play, then stay still for a while">
									{t('Play, then stay still for a while')}
								</h3>
								<p
									className="mc-step__body"
									data-i18n="When you stay still for a few minutes, or press M, the mod keeps the area around you in 3D."
								>
									{t('When you stay still for a few minutes, or press M, the mod keeps the area around you in 3D.')}
								</p>
								<p
									className="mc-step__help"
									id="afk-help"
									data-i18n="AFK: you have not touched the game for 5 minutes. Locally: on your computer."
								>
									{t('AFK: you have not touched the game for 5 minutes. Locally: on your computer.')}
								</p>
								<details className="mc-step__more">
									<summary data-i18n="Details">{t('Details')}</summary>
									<p data-i18n="By default: after 5 minutes without moving, within 32 blocks around you, at most once every 4 hours. Press M to capture by hand or to turn it off. Until you link the game, memories stay on your computer.">
										{t(
											'By default: after 5 minutes without moving, within 32 blocks around you, at most once every 4 hours. Press M to capture by hand or to turn it off. Until you link the game, memories stay on your computer.'
										)}
									</p>
								</details>
							</li>
							<li className="mc-step">
								<span className="mc-step__num">
									<span className="mc-slot mc-slot--digit" aria-hidden="true">
										3
									</span>
								</span>
								<h3 className="mc-step__title" data-i18n="Link the game to your gallery">
									{t('Link the game to your gallery')}
								</h3>
								<p
									className="mc-step__body"
									data-i18n="A short code from the site links the game to your private gallery, where your memories then arrive."
								>
									{t(
										'A short code from the site links the game to your private gallery, where your memories then arrive.'
									)}
								</p>
								<details className="mc-step__more">
									<summary data-i18n="Details">{t('Details')}</summary>
									<p data-i18n="The gallery needs an account on the site. Ask there for a link code (6 digits, valid 5 minutes, one use), then type /minemories pair followed by the code in the game. Until then, memories stay on your computer.">
										{t(
											'The gallery needs an account on the site. Ask there for a link code (6 digits, valid 5 minutes, one use), then type /minemories pair followed by the code in the game. Until then, memories stay on your computer.'
										)}
									</p>
								</details>
							</li>
						</ol>
					</section>
					<section className="mc-section" id="share" aria-labelledby="share-title">
						<h2 className="mc-section__title" id="share-title" data-i18n="One link, that’s all">
							{t('One link, that’s all')}
						</h2>
						<p
							className="mc-section__text"
							data-i18n="Send a memory’s link: whoever opens it needs no account, no mod and no Minecraft. Your own gallery stays private, and needs an account."
						>
							{t(
								'Send a memory’s link: whoever opens it needs no account, no mod and no Minecraft. Your own gallery stays private, and needs an account.'
							)}
						</p>
					</section>
					<section className="mc-section" id="limits" aria-labelledby="limits-name">
						<aside className="mc-tip mc-limits">
							<h2 className="mc-tip__name" id="limits-name" data-i18n="What Minemories doesn’t do">
								{t('What Minemories doesn’t do')}
							</h2>
							<ul>
								<li data-i18n="It isn’t a backup of your world: a memory is a frozen 3D copy. You can turn around it, not play in it.">
									{t(
										'It isn’t a backup of your world: a memory is a frozen 3D copy. You can turn around it, not play in it.'
									)}
								</li>
								<li data-i18n="Nothing is kept before you install the mod.">
									{t('Nothing is kept before you install the mod.')}
								</li>
								<li data-i18n="At most one AFK memory every 4 hours, by default.">
									{t('At most one AFK memory every 4 hours, by default.')}
								</li>
								<li data-i18n="Java 1.21.1 only, in beta.">{t('Java 1.21.1 only, in beta.')}</li>
							</ul>
						</aside>
					</section>
					<HeroExtras />
					<section className="mc-section" id="faq" aria-labelledby="faq-title">
						<h2 className="mc-section__title" id="faq-title" data-i18n="FAQ">
							{t('FAQ')}
						</h2>
						<div className="mc-faq">
							<details className="mc-faq__item">
								<summary className="mc-faq__q" data-i18n="Do I need an account to view a shared memory?">
									{t('Do I need an account to view a shared memory?')}
								</summary>
								<p
									className="mc-faq__a"
									data-i18n="No. The link opens in a browser, with no account, no mod and no Minecraft. Only your own gallery needs an account."
								>
									{t(
										'No. The link opens in a browser, with no account, no mod and no Minecraft. Only your own gallery needs an account.'
									)}
								</p>
							</details>
							<details className="mc-faq__item">
								<summary className="mc-faq__q" data-i18n="Are my memories public?">
									{t('Are my memories public?')}
								</summary>
								<p className="mc-faq__a" data-i18n="No. Your gallery is private by default. You choose what you share.">
									{t('No. Your gallery is private by default. You choose what you share.')}
								</p>
							</details>
							<details className="mc-faq__item">
								<summary className="mc-faq__q" data-i18n="Does the mod upload anything without asking?">
									{t('Does the mod upload anything without asking?')}
								</summary>
								<p
									className="mc-faq__a"
									data-i18n="No. Nothing is sent before you link the game to your gallery with the code. Until then, memories stay in a folder on your computer."
								>
									{t(
										'No. Nothing is sent before you link the game to your gallery with the code. Until then, memories stay in a folder on your computer.'
									)}
								</p>
							</details>
							<details className="mc-faq__item">
								<summary className="mc-faq__q" data-i18n="Which versions does it work with?">
									{t('Which versions does it work with?')}
								</summary>
								<p
									className="mc-faq__a"
									data-i18n="Minecraft Java 1.21.1, with NeoForge, Fabric or Forge. It is a beta."
								>
									{t('Minecraft Java 1.21.1, with NeoForge, Fabric or Forge. It is a beta.')}
								</p>
							</details>
						</div>
					</section>
					<section className="film-words" id="words" aria-labelledby="words-note">
						<p
							className="fallback-note"
							id="words-note"
							data-i18n="Your browser does not show the 3D scene. Here is the story in words."
						>
							{t('Your browser does not show the 3D scene. Here is the story in words.')}
						</p>
						<details className="words-fold">
							<summary id="words-summary" data-i18n="The film, in words">
								{t('The film, in words')}
							</summary>
							<p
								className="words"
								id="w1"
								data-i18n={
									'An evening in Minecraft. A player, {name}, arrives near their chalet and the chat says they joined the game. They feed the fire and sit on the bench; their dog sits at their feet. They stop moving. After five minutes, the mod keeps the play area and says so in the chat. A spark from the fire stays hanging in the air: that is the memory, kept in 3D.'
								}
							>
								{t(
									'An evening in Minecraft. A player, {name}, arrives near their chalet and the chat says they joined the game. They feed the fire and sit on the bench; their dog sits at their feet. They stop moving. After five minutes, the mod keeps the play area and says so in the chat. A spark from the fire stays hanging in the air: that is the memory, kept in 3D.'
								)}
							</p>
							<p
								className="words"
								id="w2"
								data-i18n={
									"Night falls. {name} stands, tells their dog to stay, crouches and types “stay, I'll be back soon...”. They stand again, open the game menu and go straight to “Save and Quit to Title”. They disappear and the chat says they left the game. The dog turns toward you, sad, then lies down."
								}
							>
								{t(
									"Night falls. {name} stands, tells their dog to stay, crouches and types “stay, I'll be back soon...”. They stand again, open the game menu and go straight to “Save and Quit to Title”. They disappear and the chat says they left the game. The dog turns toward you, sad, then lies down."
								)}
							</p>
							<p
								className="words"
								id="w3"
								data-i18n="The sun rises on the empty bench, then the seasons pass, months, years: the house decays, the colours fade. The dog sits in the snow, and the ember still glows."
							>
								{t(
									'The sun rises on the empty bench, then the seasons pass, months, years: the house decays, the colours fade. The dog sits in the snow, and the ember still glows.'
								)}
							</p>
							<p
								className="words"
								id="w4"
								data-i18n="One grey morning the ember brightens and a warm wave leaves it: everything comes back, the colours, the fire. The bench stays empty for a moment, then the player appears on it and the chat says they joined the game. The dog jumps up and celebrates the return."
							>
								{t(
									'One grey morning the ember brightens and a warm wave leaves it: everything comes back, the colours, the fire. The bench stays empty for a moment, then the player appears on it and the chat says they joined the game. The dog jumps up and celebrates the return.'
								)}
							</p>
							<p
								className="words"
								id="w5"
								data-i18n="The memory is kept, the dog included. In your private gallery on the site, once the game is linked to your account, it can be revisited in 3D like a small model."
							>
								{t(
									'The memory is kept, the dog included. In your private gallery on the site, once the game is linked to your account, it can be revisited in 3D like a small model.'
								)}
							</p>
						</details>
					</section>
				</main>
				<div className="mc-band mc-bg-dirt" aria-hidden="true" />
				<footer className="mc-footer footer">
					<div className="mc-footer__inner">
						<div className="mc-footer__legal">
							<p
								className="mc-disclaimer"
								data-i18n="Not an official Minecraft product. Minemories is not approved by or associated with Mojang or Microsoft. Minecraft is a trademark of Mojang Synergies AB."
							>
								{t(
									'Not an official Minecraft product. Minemories is not approved by or associated with Mojang or Microsoft. Minecraft is a trademark of Mojang Synergies AB.'
								)}
							</p>
							<details className="mc-footer__notes">
								<summary className="mc-footer__summary" data-i18n="About this film">
									{t('About this film')}
								</summary>
								<p
									className="mc-footer__meta"
									data-i18n="The film is staged from real captures. In single player, the game shows no arrival or departure message; the typing bubble, the held screen, the dog’s gaze, his celebration on the return, the titles, the freeze frame and the return of the colours are effects of the film. Only the line “Minemories: world capture done.” is modelled on a message of the mod, which words it differently today (in French only)."
								>
									{t(
										'The film is staged from real captures. In single player, the game shows no arrival or departure message; the typing bubble, the held screen, the dog’s gaze, his celebration on the return, the titles, the freeze frame and the return of the colours are effects of the film. Only the line “Minemories: world capture done.” is modelled on a message of the mod, which words it differently today (in French only).'
									)}
								</p>
							</details>
						</div>
						<div className="mc-footer__right">
							<ul
								className="mc-footer__nav"
								data-i18n-attr="aria-label:Pages of the site"
								aria-label={t('Pages of the site')}
							>
								<HeroFooterLinks />
							</ul>
							<fieldset className="mc-fieldset opts">
								<legend className="mc-footer__ver" data-i18n="Accessibility">
									{t('Accessibility')}
								</legend>
								<label className="mc-check">
									<input type="checkbox" id="opt-font" />
									<span className="mc-check__box" aria-hidden="true" />
									<span data-i18n="Readable font">{t('Readable font')}</span>
								</label>
								<label className="mc-check">
									<input type="checkbox" id="opt-motion" />
									<span className="mc-check__box" aria-hidden="true" />
									<span data-i18n="Reduced motion">{t('Reduced motion')}</span>
								</label>
							</fieldset>
							<p className="mc-footer__ver" data-i18n="Minemories · beta">
								{t('Minemories · beta')}
							</p>
						</div>
					</div>
				</footer>
			</div>
			{/* biome-ignore lint/a11y/useSemanticElements: a <fieldset> groups form controls; this is the 3D panel, labelled and described for screen readers. */}
			<aside
				className="site-dock"
				id="dock"
				role="group"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: the 3D panel is a focusable group (arrows turn the model, Space stops it), as audited in the prototype.
				tabIndex={0}
				aria-labelledby="dock-title"
				aria-describedby="dock-hint dock-help"
				data-motion="moving"
			>
				{/* biome-ignore lint/performance/noImgElement: a static single-page app, no next/image: the still of the model shown when WebGL is absent. */}
				<img
					className="dock-still"
					loading="lazy"
					src="/hero/assets/mc/renders/end-diorama.jpg"
					width="672"
					height="629"
					data-i18n-attr="alt:The model of the chalet, seen from above: the corner of the world that was kept, the chalet, the fire lit and the forest, just as it was that evening."
					decoding="async"
					alt={t(
						'The model of the chalet, seen from above: the corner of the world that was kept, the chalet, the fire lit and the forest, just as it was that evening.'
					)}
				/>
				<p className="dock-loading" data-i18n="Loading the 3D memory…">
					{t('Loading the 3D memory…')}
				</p>
				<p className="dock-hint-badge" id="dock-badge" aria-hidden="true">
					<span className="mc-icon mc-icon--arrows-h" aria-hidden="true" />
					<span className="dock-hint-badge__text" data-i18n="Drag to turn">
						{t('Drag to turn')}
					</span>
				</p>
				<div className="mc-sr-only">
					<p id="dock-title" data-i18n="The memory from the film, in 3D">
						{t('The memory from the film, in 3D')}
					</p>
					<p id="dock-hint" data-i18n="Drag to turn it.">
						{t('Drag to turn it.')}
					</p>
					<p
						id="dock-help"
						data-i18n="Drag it or use the left and right arrow keys to turn it. Tap it, or press Space, to stop or restart its motion."
					>
						{t(
							'Drag it or use the left and right arrow keys to turn it. Tap it, or press Space, to stop or restart its motion.'
						)}
					</p>
				</div>
			</aside>
		</>
	)
})
