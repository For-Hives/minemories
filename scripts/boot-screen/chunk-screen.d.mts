// Types of the loading screen's runtime for the web app (apps/web/src/components/ChunkLoader.tsx imports it): only what the app uses.

/** The map's seeded plan (mapPlan): computed once, then painted at each fill. */
export type MapPlan = { n: number; seed: number; at: number; steps: [number, boolean][] }
/** What bootDissolve reads from the screen's config. */
export type RevealConfig = { n: number; seed: number; out: number; pop: number }

export function mapPlan(n: number, seed: number, at: number): MapPlan
export function mapLevels(q: number, plan: MapPlan, tick: number): Uint8Array
export function paintMap(image: ImageData, levels: Uint8Array, colors: number[][]): ImageData
export function bootPace(t: number, C: { lead: number; fill: number }): number
export function bootDissolve(
	boot: HTMLElement,
	win: Window,
	C: RevealConfig,
	tile: HTMLImageElement,
	done: () => void
): void
export function bootFade(boot: HTMLElement, win: Window, done: () => void): void
