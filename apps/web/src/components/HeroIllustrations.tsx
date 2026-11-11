import { translate } from '../i18n/catalog'
import { HeroClip } from './HeroClip'

/**
 * The pictures of the landing's "Show your base to your friends" and "Server shutting down?" sections (hero/illus.css). Every picture is real footage of real use,
 * cropped, scaled and cut only (public/hero/clips and public/hero/illus, sources in docs/features/landing-film.md): the real viewer turning around a base and
 * going from morning to sunset, the HD postcard its own Postcard button exported, and one spot of an old modded server in Minecraft then in the viewer.
 * Nothing is burned into the pictures; the words (clip captions, the game/browser chip) are HTML, so they are translated and crisp.
 * Same contract as HeroMarkup: rendered once in French, the film's bridge rewrites `data-i18n` / `data-i18n-attr` in the visitor's language.
 */
const t = (key: string) => translate('fr', key)

const postcardAlt = 'The HD postcard of the same base, downloaded with the viewer’s Postcard button.'
const viewerAlt =
	'A real base in the Minemories viewer: the view turns around it, then the time of day goes from morning to sunset.'
const gameBrowserAlt = 'A beach house on a real server in Minecraft, then the same spot in the Minemories viewer.'

interface ShotProps {
	readonly src: string
	readonly alt: string
	readonly width: number
	readonly height: number
}

/** One real screenshot: lazy, of known size, with its description translated by the bridge. */
function Shot({ src, alt, width, height }: ShotProps) {
	return (
		<img
			src={src}
			alt={t(alt)}
			data-i18n-attr={`alt:${alt}`}
			width={width}
			height={height}
			loading="lazy"
			decoding="async"
		/>
	)
}

/** "Show your base to your friends": the real viewer turning around a base and changing its hour, and the HD postcard its Postcard button exported. */
export function ShareIllustration() {
	return (
		<figure className="mm-illus mm-illus--share">
			<div className="mm-illus__frame">
				<HeroClip name="viewer-time" width={720} height={550} posterAt={4.5} alt={viewerAlt} />
				<p className="mm-clip__caption" data-i18n="Pick the hour, from morning to sunset">
					{t('Pick the hour, from morning to sunset')}
				</p>
			</div>
			<div className="mm-illus__print">
				<Shot src="/hero/illus/postcard-hd.webp" alt={postcardAlt} width={640} height={360} />
			</div>
		</figure>
	)
}

/** The game-to-browser clip cuts at 2.5 s: a chip names the side on screen. */
const gameToBrowser = { at: 2.5, before: 'In Minecraft', after: 'In your browser' }

/** "Server shutting down?": one spot of a real server in Minecraft, then the same camera move in the real viewer, a chip naming each side. */
export function ClosingIllustration() {
	return (
		<figure className="mm-illus mm-illus--closing">
			<div className="mm-illus__frame">
				<HeroClip name="game-browser" width={540} height={676} cut={gameToBrowser} alt={gameBrowserAlt} />
				<p className="mm-clip__caption" data-i18n="You don’t need to be the server admin.">
					{t('You don’t need to be the server admin.')}
				</p>
			</div>
		</figure>
	)
}
