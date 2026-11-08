import type { GlbFetcher } from './capture-delta'

/**
 * How far the landing's first load has come, for the loading screen of index.html (scripts/boot-screen/gen.mjs): `window` receives
 * `new CustomEvent('mm:boot-progress', { detail })` with a floor between 0 and 1. The screen never goes back, eases towards the next milestone between
 * reports, and only reaches 100 % on `mm:ready` (the film's first image is drawn). Reports are free when nothing listens (any other page, or a later visit).
 */
export const BOOT_PROGRESS_EVENT = 'mm:boot-progress'

/** The milestones the landing reports, in order. */
export const BOOT_STEPS = {
	/** the app is mounted on the landing */
	app: 0.15,
	/** the film's code has arrived */
	film: 0.3,
	/** the scene is built and asks for its first capture */
	scene: 0.5,
	/** the first capture (S0) is downloaded; what remains is parsing it and drawing the first image */
	captures: 0.8,
} as const

export function reportBootProgress(value: number, target: EventTarget): void {
	target.dispatchEvent(new CustomEvent(BOOT_PROGRESS_EVENT, { detail: value }))
}

/**
 * The film's capture downloader, reporting the `scene` milestone on its first request and `captures` once the first capture has arrived, whichever it is
 * (S0 from the top of the film, another one when the landing opens on a link to a section).
 */
export function withBootProgress(fetchGlb: GlbFetcher, report: (value: number) => void): GlbFetcher {
	let asked = false
	let arrived = false
	return async (base, name) => {
		if (!asked) {
			asked = true
			report(BOOT_STEPS.scene)
		}
		const glb = await fetchGlb(base, name)
		if (!arrived) {
			arrived = true
			report(BOOT_STEPS.captures)
		}
		return glb
	}
}

/**
 * The page is on screen: the loading screen fills to 100 % and leaves (the same pair as hero.js `signalReady`). Also sent when the film cannot start
 * (its code failed to arrive), so the page under the screen is shown at once rather than after the screen's 20 s safety stop.
 */
export function signalPageReady(root: { dataset: DOMStringMap }, target: EventTarget): void {
	root.dataset.mmReady = '1'
	target.dispatchEvent(new Event('mm:ready'))
}
