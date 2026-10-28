// Curves of the film's animation (anim/curves.js): pure functions, the state of the film is a function of time only.
import { expect, test } from 'vitest'
import { clamp, EASE, lerp, lag, phaseOf, smooth, spring, springStep, springWindow, track, window4 } from './anim/curves.js'

test('clamp, lerp and the quintic smoothstep', () => {
	expect(clamp(5, 0, 1)).toBe(1)
	expect(clamp(-5, 0, 1)).toBe(0)
	expect(lerp(2, 4, 0.5)).toBe(3)
	expect(smooth(0)).toBe(0)
	expect(smooth(1)).toBe(1)
	expect(smooth(0.5)).toBeCloseTo(0.5, 9)
	let previous = -1
	for (let k = 0; k <= 1; k += 0.01) {
		expect(smooth(k)).toBeGreaterThanOrEqual(previous)
		previous = smooth(k)
	}
})

test('a track interpolates its keys and holds the ends, with every easing', () => {
	const t = track([
		[0, 0],
		[2, 10],
		[4, 10],
	])
	expect(t(-1)).toBe(0)
	expect(t(0)).toBe(0)
	expect(t(2)).toBeCloseTo(10, 9)
	expect(t(3)).toBeCloseTo(10, 9)
	expect(t(99)).toBeCloseTo(10, 9)
	// the named easings (factories such as outBack(os, k1) are called with their defaults)
	for (const e of [EASE.outBack(), EASE.anticipate(), EASE.outSettle]) {
		expect(e(0)).toBeCloseTo(0, 6)
		expect(e(1)).toBeCloseTo(1, 6)
	}
	for (const [name, e] of Object.entries(EASE)) {
		if (['outBack', 'anticipate', 'outSettle'].includes(name)) continue
		expect(e(0), name).toBeCloseTo(0, 6)
		expect(e(1), name).toBeCloseTo(1, 6)
	}
})

test('purity: the same instant gives the same value, in any order', () => {
	const t = track([
		[0, 1],
		[1, 3],
		[2.5, -2],
		[5, 0],
	])
	const instants = Array.from({ length: 300 }, (_, i) => (i * 7919) % 500).map(i => i / 100)
	const first = instants.map(t)
	const reversed = [...instants].reverse().map(t).reverse()
	expect(reversed).toEqual(first)
	expect(instants.map(t)).toEqual(first)
	const w = [0, 1, 2, 3].map(x => window4(x, 0.5, 1, 2, 2.5))
	expect(w[0]).toBe(0)
	expect(w[1]).toBe(1)
	expect(w[3]).toBe(0)
})

test('springs are deterministic, damped and settle', () => {
	const window = springWindow(3, 0.6)
	expect(window).toBeGreaterThan(0)
	expect(springStep(0, 3, 0.6, window)).toBeCloseTo(0, 6)
	expect(springStep(window * 4, 3, 0.6, window)).toBeCloseTo(1, 1)
	expect(spring(0, [[0, 0]])).toBeCloseTo(0, 6)
	expect(spring(10, [[0, 0], [1, 5]])).toBeCloseTo(5, 1)
	expect(lag(3, 0)).toBeCloseTo(lag(3, 0), 9)
	const phase = phaseOf([[0, 1], [10, 2]])
	expect(phase(10)).toBeGreaterThan(phase(0))
	expect(phase(5)).toBe(phase(5))
})
