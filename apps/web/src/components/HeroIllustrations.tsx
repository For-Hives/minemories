import { translate } from '../i18n/catalog'

/**
 * The pictures of the landing's "Show it to the group" and "Your server is closing?" sections (hero/illus.css), built from real frames of the landing's world
 * (public/hero/illus: the film's poster and the chalet's diorama, both real Minemories captures) and HTML text, so every word is translated and crisp.
 * Same contract as HeroMarkup: rendered once in French, the film's bridge rewrites `data-i18n` / `data-i18n-attr` in the visitor's language.
 * Each picture is one image for assistive technologies (role="img" + a translated label); the section's own text says the same thing.
 * The game labels are the mod's own (lang/<locale>.json: minemories.hub.take, minemories.hub.sent); a test keeps them equal.
 */
const t = (key: string) => translate('fr', key)

const shareLabel =
	'A share link opens the base in 3D in a browser, and an HD postcard of it is posted in the group chat.'
const closingLabel =
	'In the game, the server announces it is closing. The player presses M, then Take a memory, and the mod answers Memory saved and sent!'

/** "Show it to the group": the shared link open in a browser (the diorama), the HD postcard dropped in the group chat, a friend answering. */
export function ShareIllustration() {
	return (
		<div
			className="mm-illus mm-illus--share"
			role="img"
			aria-label={t(shareLabel)}
			data-i18n-attr={`aria-label:${shareLabel}`}
		>
			<div className="mm-illus__browser">
				<div className="mm-illus__bar">
					<span className="mm-illus__dots" />
					<span className="mm-illus__url">minemories.net/share/…</span>
					<span className="mc-icon mc-icon--link" />
				</div>
				<div className="mm-illus__view">
					<img
						className="mm-illus__diorama"
						src="/hero/illus/diorama.webp"
						alt=""
						width={560}
						height={451}
						loading="lazy"
						decoding="async"
					/>
					<span className="mm-illus__tag">
						<span className="mc-icon mc-icon--rotate" />
						<span data-i18n="No Minecraft, no account">{t('No Minecraft, no account')}</span>
					</span>
				</div>
			</div>
			<div className="mm-illus__chatcard">
				<div className="mm-illus__postcard">
					<img src="/hero/illus/postcard.webp" alt="" width={540} height={310} loading="lazy" decoding="async" />
					<span className="mm-illus__stamp">HD</span>
				</div>
				<p className="mm-illus__bubble">
					<span className="mm-illus__who">Lina</span>
					<span data-i18n="That's our base! I'm turning around it on my phone.">
						{t("That's our base! I'm turning around it on my phone.")}
					</span>
				</p>
			</div>
		</div>
	)
}

/** "Your server is closing?": a game frame of the chalet, the server's announcement in the chat, and the M menu that keeps the base. */
export function ClosingIllustration() {
	return (
		<div
			className="mm-illus mm-illus--closing"
			role="img"
			aria-label={t(closingLabel)}
			data-i18n-attr={`aria-label:${closingLabel}`}
		>
			<div className="mm-illus__game">
				<img
					className="mm-illus__scene"
					src="/hero/illus/closing.webp"
					alt=""
					width={800}
					height={500}
					loading="lazy"
					decoding="async"
				/>
				<p className="mm-illus__chat" data-i18n="[Server] The server closes on December 1st.">
					{t('[Server] The server closes on December 1st.')}
				</p>
			</div>
			<div className="mm-illus__hub">
				<p className="mm-illus__hubtitle">
					<span className="mm-illus__key">M</span>
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
				<span className="mm-illus__take">
					<span className="mc-icon mm-illus__frame" />
					<span data-i18n="Take a memory">{t('Take a memory')}</span>
				</span>
				<p className="mm-illus__sent">
					<span className="mc-icon mc-icon--check" />
					<span data-i18n="Memory saved and sent!">{t('Memory saved and sent!')}</span>
				</p>
			</div>
		</div>
	)
}
