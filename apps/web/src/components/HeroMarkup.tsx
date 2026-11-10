import { memo } from 'react'
import { Link } from 'react-router'
import { translate } from '../i18n/catalog'
import type { TranslateValues } from '../lib/hero-i18n'
import { supportedMinecraft } from '../pages/mod-releases'
import { BrandMark } from './BrandMark'
import { HeroAccount, HeroFooterLinks, HeroLanguage, HeroNavLinks, HeroQuestions } from './HeroParts'

/**
 * The film's page, as JSX (the markup of the prototype's hero.html, same classes and ids: the film code and its CSS address it as is).
 * It is rendered once and never re-rendered (no props, memoised): the prerender, the hydration and the first client render are all French (the site's prerender language),
 * and the film's own `apply()` writes the visitor's language into the `data-i18n` elements once it starts. React and the film therefore never write the same node twice.
 * What depends on the session or the language is in HeroParts.tsx, as separate components that update themselves.
 */
const t = (key: string, values?: TranslateValues) => translate('fr', key, { name: 'Efe', ...values })
/** The published Minecraft versions, from mod/targets.json; the film's translation bridge re-reads them from `data-i18n-values`. */
const supported = supportedMinecraft()
const supportedValues = JSON.stringify(supported)
/** The experimental versions, after the validated ones; nothing when every published version is validated. */
function Experimental() {
	if (!supported.experimental) return null
	return (
		<>
			{' · '}
			<span data-i18n="{experimental} experimental" data-i18n-values={supportedValues}>
				{t('{experimental} experimental', supported)}
			</span>
		</>
	)
}

/** One card of the landing's three steps: a short title and one sentence, both translated by the film's bridge. */
function Step({ number, title, body }: { number: number; title: string; body: string }) {
	return (
		<li className="mc-step">
			<span className="mc-step__num">
				<span className="mc-slot mc-slot--digit" aria-hidden="true">
					{number}
				</span>
			</span>
			<h3 className="mc-step__title" data-i18n={title}>
				{t(title)}
			</h3>
			<p className="mc-step__body" data-i18n={body}>
				{t(body)}
			</p>
		</li>
	)
}

/** The timeline on the right edge of the film (charter.css section 11; wired by hero.js `wireRail`): the five chapters are marks, the thumb is a vertical slider. */
function FilmRail() {
	return (
		<div className="film-rail" id="film-rail">
			<div className="film-rail__track" data-rail-track>
				<span className="film-rail__fill" aria-hidden="true" />
				<button
					className="film-rail__node"
					type="button"
					data-rail-chapter="0"
					data-i18n-attr="aria-label:The evening"
					aria-label={t('The evening')}
				/>
				<button
					className="film-rail__node"
					type="button"
					data-rail-chapter="1"
					data-i18n-attr="aria-label:Leaving"
					aria-label={t('Leaving')}
				/>
				<button
					className="film-rail__node"
					type="button"
					data-rail-chapter="2"
					data-i18n-attr="aria-label:The wait"
					aria-label={t('The wait')}
				/>
				<button
					className="film-rail__node"
					type="button"
					data-rail-chapter="3"
					data-i18n-attr="aria-label:The kept memory"
					aria-label={t('The kept memory')}
				/>
				<button
					className="film-rail__node"
					type="button"
					data-rail-chapter="4"
					data-i18n-attr="aria-label:The return"
					aria-label={t('The return')}
				/>
				<span
					className="film-rail__thumb"
					role="slider"
					tabIndex={0}
					aria-orientation="vertical"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={0}
					data-i18n-attr="aria-label:Film chapters (keys 1 to 5)"
					aria-label={t('Film chapters (keys 1 to 5)')}
				/>
			</div>
		</div>
	)
}

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
					<BrandMark solo />
				</a>
				<nav className="site-nav" data-i18n-attr="aria-label:Site sections" aria-label={t('Site sections')}>
					<ul className="mc-sitebar__nav">
						<HeroNavLinks />
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
							<HeroNavLinks />
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
			<FilmRail />
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
							<span className="mc-hero__kicker" data-i18n="There are evenings we wish we could keep.">
								{t('There are evenings we wish we could keep.')}
							</span>
							<h1 className="mc-hero__title" id="hero-title" tabIndex={-1} data-i18n="Keep your Minecraft builds in 3D">
								{t('Keep your Minecraft builds in 3D')}
							</h1>
							<p
								className="mc-hero__lead"
								data-i18n="The mod keeps the area around you in 3D. You revisit it in your browser, and show it to whoever you want."
							>
								{t(
									'The mod keeps the area around you in 3D. You revisit it in your browser, and show it to whoever you want.'
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
							<p className="mc-hero__compat">
								<span data-i18n="Minecraft Java {versions}" data-i18n-values={supportedValues}>
									{t('Minecraft Java {versions}', supported)}
								</span>
								<Experimental />
								{' · '}
								<span data-i18n="Fabric, Forge, NeoForge · single player and servers · beta">
									{t('Fabric, Forge, NeoForge · single player and servers · beta')}
								</span>
							</p>
							<p
								className="mc-hero__compat"
								data-i18n="Does not change your world · Nothing leaves before you connect the game · Private gallery"
							>
								{t('Does not change your world · Nothing leaves before you connect the game · Private gallery')}
							</p>
						</div>
					</section>
					<section className="mc-section" id="steps" aria-labelledby="steps-title">
						<h2 className="mc-section__title" id="steps-title" data-i18n="How it works">
							{t('How it works')}
						</h2>
						<ol className="mc-steps">
							<Step
								number={1}
								title="Install."
								body="From the CurseForge app, or a file to drop into the mods folder."
							/>
							<Step
								number={2}
								title="Play."
								body="Press M → Take a memory. Otherwise, the mod takes one on its own when you stay AFK."
							/>
							<Step
								number={3}
								title="Revisit."
								body="Connect the game to your gallery and walk around your world in 3D."
							/>
						</ol>
					</section>
					<section className="mc-section" id="share" aria-labelledby="share-title">
						<h2 className="mc-section__title" id="share-title" data-i18n="Show it to the group">
							{t('Show it to the group')}
						</h2>
						<p
							className="mc-section__text"
							data-i18n="Turn around your base, frame it, and download an HD postcard for Discord. Or send a link: your friend visits in 3D, without Minecraft."
						>
							{t(
								'Turn around your base, frame it, and download an HD postcard for Discord. Or send a link: your friend visits in 3D, without Minecraft.'
							)}
						</p>
						<ul className="site-links">
							<li>
								<Link className="mc-link" to="/sharing">
									<span data-i18n="Share by link">{t('Share by link')}</span>
								</Link>
							</li>
						</ul>
					</section>
					<section className="mc-section" id="server-closing" aria-labelledby="server-closing-title">
						<h2 className="mc-section__title" id="server-closing-title" data-i18n="Your server is closing?">
							{t('Your server is closing?')}
						</h2>
						<p className="mc-section__text" data-i18n="Take your base before the season ends.">
							{t('Take your base before the season ends.')}
						</p>
						<ul className="site-links">
							<li>
								<Link className="mc-link" to="/server-closing">
									<span data-i18n="Server closing">{t('Server closing')}</span>
								</Link>
							</li>
						</ul>
					</section>
					<section className="mc-section" id="faq" aria-labelledby="faq-title">
						<h2 className="mc-section__title" id="faq-title" data-i18n="FAQ">
							{t('FAQ')}
						</h2>
						<HeroQuestions />
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
								data-i18n="Minemories is not an official Minecraft product. Not approved by or associated with Mojang or Microsoft."
							>
								{t(
									'Minemories is not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.'
								)}
							</p>
							<details className="mc-footer__notes">
								<summary className="mc-footer__summary" data-i18n="About this film">
									{t('About this film')}
								</summary>
								<p
									className="mc-footer__meta"
									data-i18n="The film is staged from real captures. In single player, the game shows no arrival or departure message; the typing bubble, the held screen, the dog’s gaze, his celebration on the return, the titles, the freeze frame and the return of the colours are effects of the film. Only the line “Minemories: world capture done.” is modelled on a message of the mod, which words it differently today (in English only)."
								>
									{t(
										'The film is staged from real captures. In single player, the game shows no arrival or departure message; the typing bubble, the held screen, the dog’s gaze, his celebration on the return, the titles, the freeze frame and the return of the colours are effects of the film. Only the line “Minemories: world capture done.” is modelled on a message of the mod, which words it differently today (in English only).'
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
