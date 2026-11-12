// Types of the loading screen's look for the web app (apps/web/src/components/ChunkLoader.tsx imports it).

export const SEED: number
export const DIRT: number[][]
export const SHARES: number[]
export const MAP_COLORS: number[][]
export function dirtTile(seed: number): Uint8Array
export function bootConfig(): {
	n: number
	seed: number
	colors: number[][]
	at: number
	sections: string[]
	lead: number
	fill: number
	quick: number
	catchup: number
	hold: number
	out: number
	pop: number
	stop: number
	viewerStop: number
}
