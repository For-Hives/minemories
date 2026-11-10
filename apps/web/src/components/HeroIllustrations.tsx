import { translate } from '../i18n/catalog'

/**
 * The pictures of the landing's "Show it to the group" and "Your server is closing?" sections (hero/illus.css), built from real renders of the landing's
 * world (public/hero/illus: two crops of the chalet capture's render, and a dusk frame of the landing film) and HTML text, so every word is translated and crisp.
 * Same contract as HeroMarkup: rendered once in French, the film's bridge rewrites `data-i18n` / `data-i18n-attr` in the visitor's language.
 * Each picture is one image for assistive technologies (role="img" + a translated label); the section's own text says the same thing.
 * The game words are the mod's own (lang/<locale>.json: minemories.hub.connected, connected_hint, take, sent); a test keeps them equal.
 */
const t = (key: string) => translate('fr', key)

const shareLabel =
	'In a group chat, you post a share link to the base, which opens in 3D in a browser with no Minecraft and no account, then its HD postcard. Lina answers: That’s our base! I’m spinning it around.'
const closingLabel =
	'A frame of the landing’s world at dusk, the server announcing in the chat that it closes. Over it, the mod’s M menu, connected: Take a memory, and its answer Memory saved and sent!'

/** "Show it to the group": you post the share link (it opens in 3D, no Minecraft, no account) and the HD postcard in the group chat; a friend answers. */
export function ShareIllustration() {
	return (
		<div
			className="mm-illus mm-illus--share"
			role="img"
			aria-label={t(shareLabel)}
			data-i18n-attr={`aria-label:${shareLabel}`}
		>
			<p className="mm-illus__titlebar">
				<span className="mc-icon mc-icon--share" />
				<span data-i18n="Group chat">{t('Group chat')}</span>
			</p>
			<div className="mm-illus__msg">
				<span className="mm-illus__avatar" />
				<div className="mm-illus__body">
					<span className="mm-illus__who" data-i18n="You">
						{t('You')}
					</span>
					{/* the viewer's real share route is /share/:token; the token itself is never shown */}
					<p className="mm-illus__url">
						<span className="mm-illus__addr">minemories.net/share/…</span>
						<span className="mm-illus__copy" />
					</p>
					<p className="mm-illus__desc">
						<span className="mc-icon mc-icon--check" />
						<span data-i18n="No Minecraft, no account">{t('No Minecraft, no account')}</span>
					</p>
					<div className="mm-illus__attach">
						<div className="mm-illus__link">
							<div className="mm-illus__thumb">
								<img
									src="/hero/illus/share-link.webp"
									alt=""
									width={416}
									height={260}
									loading="lazy"
									decoding="async"
								/>
								<span className="mm-illus__drag">
									<span className="mc-icon mc-icon--arrows-h" />
									<span data-i18n="Drag to turn">{t('Drag to turn')}</span>
								</span>
							</div>
						</div>
						<div className="mm-illus__postcard">
							<img src="/hero/illus/postcard.webp" alt="" width={256} height={144} loading="lazy" decoding="async" />
							<span className="mm-illus__stamp">HD</span>
						</div>
					</div>
				</div>
			</div>
			<div className="mm-illus__msg">
				<span className="mm-illus__avatar mm-illus__avatar--friend" />
				<div className="mm-illus__body">
					<span className="mm-illus__who">Lina</span>
					<p className="mm-illus__said" data-i18n="That’s our base! I’m spinning it around.">
						{t('That’s our base! I’m spinning it around.')}
					</p>
				</div>
			</div>
		</div>
	)
}

/**
 * "Your server is closing?": a dusk frame of the landing's world with the server's announcement in the chat, the M key, and a small drawing of the mod's
 * M menu (SimpleHubScreen, connected) with "Take a memory" hovered and its answer at the bottom, in the menu's own colours (UiTheme).
 * The mod's item icons are Mojang's: the site's own glyphs stand in for them, and the two other tiles keep their icon only.
 */
export function ClosingIllustration() {
	return (
		<div
			className="mm-illus mm-illus--closing"
			role="img"
			aria-label={t(closingLabel)}
			data-i18n-attr={`aria-label:${closingLabel}`}
		>
			<img
				className="mm-illus__scene"
				src="/hero/illus/closing.webp"
				alt=""
				width={1120}
				height={700}
				loading="lazy"
				decoding="async"
			/>
			<div className="mm-illus__over">
				<span className="mm-illus__press">
					<span className="mm-illus__key">M</span>
					<span className="mc-icon mc-icon--arrow-r" />
				</span>
				<div className="mm-illus__hub">
					<p className="mm-illus__hubtitle">
						<img
							className="mm-brand-mark"
							src="/brand/minemories-mark.svg"
							alt=""
							width={16}
							height={16}
							loading="lazy"
							decoding="async"
						/>
						<span>Minemories</span>
					</p>
					<div className="mm-illus__status">
						<p className="mm-illus__ok">
							<span data-i18n="Connected">{t('Connected')}</span>
							{/* the mod draws an emerald here (a Mojang item): the site's check stands in for it */}
							<span className="mc-icon mc-icon--check" />
						</p>
						<p className="mm-illus__hint" data-i18n="Your memories go to your gallery on their own.">
							{t('Your memories go to your gallery on their own.')}
						</p>
					</div>
					<div className="mm-illus__tiles">
						<span className="mm-illus__tile is-hover">
							<span className="mc-icon mc-icon--mod" />
							<span data-i18n="Take a memory">{t('Take a memory')}</span>
						</span>
						<span className="mm-illus__tile">
							<span className="mc-icon mc-icon--clock" />
						</span>
						<span className="mm-illus__tile">
							<span className="mc-icon mc-icon--album" />
						</span>
					</div>
					<p className="mm-illus__sent" data-i18n="Memory saved and sent!">
						{t('Memory saved and sent!')}
					</p>
				</div>
			</div>
			<p className="mm-illus__chat" data-i18n="[Server] The server closes on December 1st.">
				{t('[Server] The server closes on December 1st.')}
			</p>
		</div>
	)
}
