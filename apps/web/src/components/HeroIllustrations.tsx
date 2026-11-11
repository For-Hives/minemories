import { translate } from '../i18n/catalog'
import { HeroClip } from './HeroClip'

/**
 * The pictures of the landing's "Show your base to your friends" and "Server shutting down?" sections (hero/illus.css). Every picture is real footage of real use,
 * cropped and scaled only (public/hero/clips and public/hero/illus, sources in docs/features/landing-film.md): a first-person walk in the real viewer, the HD
 * postcard its own Postcard button exported, and one spot of an old modded server in Minecraft then in the viewer. Nothing is drawn on top; the words are
 * HTML captions, so they are translated and crisp.
 * Same contract as HeroMarkup: rendered once in French, the film's bridge rewrites `data-i18n` / `data-i18n-attr` in the visitor's language.
 */
const t = (key: string) => translate('fr', key)

const postcardAlt = 'The HD postcard of the same base, downloaded with the viewer’s Postcard button.'
const walkAlt = 'A first-person walk along a path of a real base, in the Minemories viewer.'
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

/** "Show your base to your friends": a first-person walk in the real viewer, and the HD postcard its Postcard button exported from the same base. */
export function ShareIllustration() {
	return (
		<figure className="mm-illus mm-illus--share">
			<div className="mm-illus__frame">
				<HeroClip name="walk" width={640} height={512} alt={walkAlt} />
				<p className="mm-illus__label" data-i18n="Walk around inside, in first person">
					{t('Walk around inside, in first person')}
				</p>
			</div>
			<div className="mm-illus__print">
				<Shot src="/hero/illus/postcard-hd.webp" alt={postcardAlt} width={640} height={360} />
				<p className="mm-illus__label" data-i18n="HD postcard">
					{t('HD postcard')}
				</p>
			</div>
		</figure>
	)
}

/** "Server shutting down?": one spot of a real server in Minecraft, then the same camera move in the real viewer. */
export function ClosingIllustration() {
	return (
		<figure className="mm-illus mm-illus--closing">
			<div className="mm-illus__frame">
				<HeroClip name="game-browser" width={540} height={676} alt={gameBrowserAlt} />
				<p className="mm-illus__label">
					<span data-i18n="In Minecraft, then in your browser.">{t('In Minecraft, then in your browser.')}</span>{' '}
					<span data-i18n="You don’t even need to be admin.">{t('You don’t even need to be admin.')}</span>
				</p>
			</div>
		</figure>
	)
}
