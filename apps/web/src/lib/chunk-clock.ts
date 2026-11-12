import { bootPace } from '../../../../scripts/boot-screen/chunk-screen.mjs'

/**
 * The clock of the viewer's stage loader (components/ChunkLoader.tsx), the same rule as the loading screen of index.html on a viewer
 * (scripts/boot-screen/chunk-screen.mjs, bootScreen): the map stays black for `lead` ms, then fills over `quick` ms, waits at 95 % until the scene is
 * ready, catches up at twice that pace, and holds the clean map `hold` ms before the reveal. Frames count 50 ms at most, so a busy main thread (the GLB
 * being parsed) pauses the fill instead of skipping part of it.
 */
export type ChunkTimings = { lead: number; quick: number; hold: number }
export type ChunkClock = { clock: number; shown: number; fullAt: number }

/** How long a load must last before the loader shows: a capture already in memory never flashes the dirt. */
export const CHUNK_DELAY = 150

export function startChunkClock(): ChunkClock {
	return { clock: 0, shown: 0, fullAt: 0 }
}

export function stepChunkClock(s: ChunkClock, elapsed: number, ready: boolean, C: ChunkTimings): ChunkClock {
	const dt = Math.min(50, Math.max(0, elapsed))
	const clock = s.clock + dt
	const pace = bootPace(clock, { lead: C.lead, fill: C.quick })
	const next = ready ? s.shown + dt / (C.quick / 2) : Math.min(0.95, pace)
	const shown = Math.max(s.shown, Math.min(next, pace))
	return { clock, shown, fullAt: s.fullAt || (shown >= 1 ? clock : 0) }
}

/** The map to paint: the fill (0..1), then 1 to 2 over the hold, as the loading screen paints it (mapLevels). */
export function chunkFill(s: ChunkClock, C: ChunkTimings): number {
	return s.fullAt ? 1 + (s.clock - s.fullAt) / C.hold : s.shown
}

/** The hold after 100 % is over: the reveal starts. */
export function chunkHeld(s: ChunkClock, C: ChunkTimings): boolean {
	return s.fullAt > 0 && s.clock >= s.fullAt + C.hold
}
