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
	/** The loading screen (#boot) still covers the page: a link to a section is already in 'site' phase under it. */
	readonly booting?: boolean | undefined
	/** This clip is the most visible one (ClipStage): only one clip plays by itself at a time. Absent means it is. */
	readonly foremost?: boolean | undefined
}

/** The page is there for the visitor: the film has handed over and the loading screen is gone. */
function pageShown(moment: Pick<ClipMoment, 'phase' | 'booting'>): boolean {
	return !(moment.booting || moment.phase === 'film' || moment.phase === 'glide')
}

/**
 * A clip plays only on screen, in a visible tab, once the film and the loading screen have handed over to the page, and when the visitor's settings
 * or choice allow it. By itself, only the foremost clip plays; the visitor's play button overrides that.
 */
export function clipShouldPlay(moment: ClipMoment): boolean {
	if (!(moment.inView && moment.pageVisible && pageShown(moment))) return false
	if (moment.choice) return moment.choice === 'play'
	return moment.mode === 'auto' && moment.foremost !== false
}

/** Whether a clip close to the screen may fetch its file ahead of time: only one that would start by itself, and never under the film or the loading screen. */
export function clipMayPreload(
	moment: Pick<ClipMoment, 'mode' | 'phase' | 'booting'> & { readonly near: boolean }
): boolean {
	return moment.near && moment.mode === 'auto' && pageShown(moment)
}

/** A clip cut from one place to another (the game, then the browser): which side a frame at `time` seconds is on. */
export function clipSide(time: number, cutAt: number): 'before' | 'after' {
	return time >= cutAt ? 'after' : 'before'
}

/**
 * The clips on the page and how much of each is on screen, so that only the most visible one plays by itself (several moving pictures at once
 * compete). A clip reports its visible ratio and how far its centre is from the screen's; `foremost()` is the clip with the largest ratio at or above
 * `seen`, and between clips about as visible (two whole clips on a tall screen), the one nearest the middle of the screen.
 */
export interface ClipStage {
	/** Registers a clip and returns its id. */
	add: () => number
	/** The clip's visible ratio (0 when off screen) and the distance (px) from its centre to the screen's. */
	report: (id: number, ratio: number, distance?: number) => void
	remove: (id: number) => void
	foremost: () => number | null
	/** Called on every change of the foremost clip; returns the unsubscribe function. */
	subscribe: (listener: () => void) => () => void
}

/** Two visible ratios closer than this are "about as visible": the distance to the middle of the screen decides. */
const sameRatio = 0.05

export function createClipStage(seen: number): ClipStage {
	const ratios = new Map<number, { ratio: number; distance: number }>()
	const listeners = new Set<() => void>()
	let next = 0
	let current: number | null = null
	const better = (a: { ratio: number; distance: number }, b: { ratio: number; distance: number }) =>
		Math.abs(a.ratio - b.ratio) < sameRatio ? a.distance < b.distance : a.ratio > b.ratio
	const pick = () => {
		let best: number | null = null
		let bestView = { ratio: 0, distance: 0 }
		for (const [id, view] of ratios)
			if (view.ratio >= seen && (best === null || better(view, bestView))) {
				best = id
				bestView = view
			}
		if (best === current) return
		current = best
		for (const listener of listeners) listener()
	}
	return {
		add: () => {
			next += 1
			ratios.set(next, { ratio: 0, distance: 0 })
			return next
		},
		report: (id, ratio, distance = 0) => {
			ratios.set(id, { ratio, distance })
			pick()
		},
		remove: id => {
			ratios.delete(id)
			pick()
		},
		foremost: () => current,
		subscribe: listener => {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
	}
}
