import { expect, test } from 'vitest'
import { CHUNK_DELAY, chunkFill, chunkHeld, startChunkClock, stepChunkClock } from './chunk-clock'

const C = { lead: 350, quick: 1200, hold: 400 }
function run(ms: number, ready: boolean, from = startChunkClock(), frame = 16) {
	let s = from
	for (let t = 0; t < ms; t += frame) s = stepChunkClock(s, frame, ready, C)
	return s
}

test('a load starts black, fills over the quick pace, and waits at 95 % while it lasts', () => {
	expect(startChunkClock()).toEqual({ clock: 0, shown: 0, fullAt: 0 })
	expect(run(C.lead - 20, false).shown).toBe(0) // the black map first
	expect(run(C.lead + C.quick / 2, false).shown).toBeCloseTo(0.5, 1)
	const waiting = run(60_000, false)
	expect(waiting.shown).toBe(0.95)
	expect(waiting.fullAt).toBe(0)
	expect(chunkHeld(waiting, C)).toBe(false)
	expect(CHUNK_DELAY).toBeLessThan(C.lead) // a quick load leaves before the map would even start
})

test('a ready scene catches up at twice the pace, never jumps, holds the clean map, then lets the reveal start', () => {
	const waiting = run(5000, false)
	let s = stepChunkClock(waiting, 16, true, C)
	expect(s.shown - waiting.shown).toBeCloseTo(16 / (C.quick / 2), 5)
	while (s.shown < 1) s = stepChunkClock(s, 16, true, C)
	expect(s.fullAt).toBeGreaterThan(0)
	expect(chunkFill(s, C)).toBeGreaterThanOrEqual(1) // the hold: 1 to 2
	expect(chunkHeld(s, C)).toBe(false)
	s = run(C.hold, true, s)
	expect(chunkHeld(s, C)).toBe(true)
	expect(chunkFill(s, C)).toBeGreaterThanOrEqual(2)
})

test('a scene ready at once still plays the whole quick fill: never faster than the pace', () => {
	const s = run(C.lead + C.quick - 40, true)
	expect(s.shown).toBeLessThan(1)
	expect(chunkFill(s, C)).toBe(s.shown)
	expect(run(C.lead + C.quick + 40, true).shown).toBe(1)
})

test('a busy main thread pauses the fill: a frame counts 50 ms at most, and time never runs backwards', () => {
	const stalled = stepChunkClock(startChunkClock(), 2000, false, C)
	expect(stalled.clock).toBe(50)
	expect(stepChunkClock(stalled, -30, false, C)).toEqual(stalled)
})
