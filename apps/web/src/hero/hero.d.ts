import type { HeroI18n } from '../lib/hero-i18n'

export interface HeroHost {
	/** The app's translation bridge (`createHeroI18n`). */
	i18n: HeroI18n
	/** Folder of the GLB captures, served as static files. */
	capturesUrl: string
}
/** Starts the film on the markup rendered by HeroFilm; returns the function that takes everything back. */
export function mountHero(host: HeroHost): () => void
