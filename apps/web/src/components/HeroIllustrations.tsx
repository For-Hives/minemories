import { translate } from '../i18n/catalog'

/**
 * The pictures of the landing's "Show your base to your friends" and "Server shutting down?" sections (hero/illus.css). Every picture is a real screenshot of real use,
 * cropped and scaled only (public/hero/illus, sources in docs/features/landing-film.md): the mod's M menu over a real base of an old modded server, the same
 * tower in Minecraft and in the viewer, the viewer showing a real memory, and the HD postcard its own Postcard button exported. Nothing is drawn on top; the
 * words are HTML captions, so they are translated and crisp.
 * Same contract as HeroMarkup: rendered once in French, the film's bridge rewrites `data-i18n` / `data-i18n-attr` in the visitor's language. The in-game frame
 * exists in French and in English: CSS shows the French one under `:lang(fr)` (fr, fr-CA) and the English one elsewhere, from the page's own `lang`.
 */
const t = (key: string) => translate('fr', key)

const viewerAlt =
	'The Minemories viewer in a browser, showing a real memory of a Minecraft base at 17:15, with its toolbar and its time of day.'
const postcardAlt = 'The HD postcard of the same base, downloaded with the viewer’s Postcard button.'
const menuAlt = 'The mod’s M menu open over a real base in Minecraft, the pointer on Take a memory.'
const gameAlt = 'A tower in Minecraft.'
const browserAlt = 'The same tower in the Minemories viewer.'

interface ShotProps {
	readonly src: string
	readonly alt: string
	readonly width: number
	readonly height: number
	readonly className?: string
}

/** One real screenshot: lazy, of known size, with its description translated by the bridge. */
function Shot({ src, alt, width, height, className }: ShotProps) {
	return (
		<img
			className={className}
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

/** "Show your base to your friends": the real viewer turning around a real memory, and the HD postcard its Postcard button exported from it. */
export function ShareIllustration() {
	return (
		<figure className="mm-illus mm-illus--share">
			<div className="mm-illus__frame">
				<Shot src="/hero/illus/viewer-base.webp" alt={viewerAlt} width={960} height={734} />
				<p className="mm-illus__label" data-i18n="In the browser">
					{t('In the browser')}
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

/** "Server shutting down?": the mod's real M menu over a real base (French or English frame), then the same tower in Minecraft and in the viewer. */
export function ClosingIllustration() {
	return (
		<figure className="mm-illus mm-illus--closing">
			<div className="mm-illus__frame">
				<Shot
					className="mm-illus__menu mm-illus__menu--fr"
					src="/hero/illus/menu-fr.webp"
					alt={menuAlt}
					width={760}
					height={650}
				/>
				<Shot
					className="mm-illus__menu mm-illus__menu--en"
					src="/hero/illus/menu-en.webp"
					alt={menuAlt}
					width={760}
					height={650}
				/>
				<p className="mm-illus__label" data-i18n="Press M → Take a memory.">
					{t('Press M → Take a memory.')}
				</p>
			</div>
			<div className="mm-illus__pair">
				<div className="mm-illus__frame">
					<Shot src="/hero/illus/game-tower.webp" alt={gameAlt} width={540} height={560} />
					<p className="mm-illus__label" data-i18n="In Minecraft">
						{t('In Minecraft')}
					</p>
				</div>
				<div className="mm-illus__frame">
					<Shot src="/hero/illus/viewer-tower.webp" alt={browserAlt} width={540} height={560} />
					<p className="mm-illus__label" data-i18n="In the browser">
						{t('In the browser')}
					</p>
				</div>
			</div>
		</figure>
	)
}
