import type { GlbFetcher } from '../lib/capture-delta'
import type { HeroI18n } from '../lib/hero-i18n'

export interface HeroHost {
	/** The app's translation bridge (`createHeroI18n`). */
	i18n: HeroI18n
	/** Folder of the GLB captures, served as static files. */
	capturesUrl: string
	/** Download of the GLB captures (optimised delivery with the plain file as fallback); omitted = plain `<name>.glb` files. */
	fetchGlb?: GlbFetcher | null
}
/** Starts the film on the markup rendered by HeroFilm; returns the function that takes everything back. */
export function mountHero(host: HeroHost): () => void
