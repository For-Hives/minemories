/**
 * The decisions behind the landing's short clips (components/HeroClip.tsx): which file a language sees, whether a clip may start by itself, and whether
 * it plays right now. The component only wires the browser's signals into these functions.
 */

/** A clip whose frames show in-game text exists in French and in English; the others have one file. */
export type ClipName = string | { readonly fr: string; readonly en: string }

/** Where the clips live (public/hero/clips): `<name>.mp4` and its poster frame `<name>.webp`. */
export const clipBase = '/hero/clips/'

const french = /^fr\b/i

/** French and Canadian French read the French take; every other language reads the English one. */
export function clipFile(name: ClipName, lang: string): string {
	if (typeof name === 'string') return name
	return french.test(lang) ? name.fr : name.en
}

export interface ClipSources {
	readonly video: string
	readonly poster: string
}

export function clipSources(name: ClipName, lang: string): ClipSources {
	const file = clipBase + clipFile(name, lang)
	return { video: `${file}.mp4`, poster: `${file}.webp` }
}

export interface ClipEnvironment {
	/** `prefers-reduced-motion: reduce` matches. */
	readonly reducedMotion: boolean
	/** `html[data-mc-motion]`: the site's own reduced-motion option ('reduced' when on). */
	readonly motionOption?: string | undefined
	/** `navigator.connection.saveData`. */
	readonly saveData?: boolean | undefined
	/** `navigator.connection.effectiveType`. */
	readonly effectiveType?: string | undefined
}

/** Connections too slow for half a megabyte of video per clip. */
const slowConnections = new Set(['slow-2g', '2g', '3g'])

/** 'auto': the clip starts by itself when seen. 'poster': it shows its poster frame and waits for the play button. */
export function clipMode(environment: ClipEnvironment): 'auto' | 'poster' {
	if (environment.reducedMotion || environment.motionOption === 'reduced') return 'poster'
	if (environment.saveData || slowConnections.has(environment.effectiveType ?? '')) return 'poster'
	return 'auto'
}

export interface ClipMoment {
	readonly mode: 'auto' | 'poster'
	/** What the visitor asked with the play/pause button, if anything. */
	readonly choice: 'play' | 'pause' | null
	/** The clip is on screen. */
	readonly inView: boolean
	/** The tab is visible. */
	readonly pageVisible: boolean
	/** `html[data-phase]`: 'film' and 'glide' while the landing's film runs; absent or 'site' once the page is there. */
	readonly phase?: string | undefined
}

/** A clip plays only on screen, in a visible tab, once the film has handed over to the page, and when the visitor's settings or choice allow it. */
export function clipShouldPlay(moment: ClipMoment): boolean {
	if (!(moment.inView && moment.pageVisible)) return false
	if (moment.phase === 'film' || moment.phase === 'glide') return false
	if (moment.choice) return moment.choice === 'play'
	return moment.mode === 'auto'
}
