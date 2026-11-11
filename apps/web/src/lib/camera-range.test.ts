import { describe, expect, it } from 'vitest'

import { cameraNear, depthStep, MIN_NEAR } from './camera-range'

describe('cameraNear', () => {
	it('keeps the small plane while walking or when the distance is unusable', () => {
		expect(cameraNear(500, true)).toBe(MIN_NEAR)
		expect(cameraNear(Number.NaN, false)).toBe(MIN_NEAR)
	})

	it('never goes below the minimum when zoomed in', () => {
		expect(cameraNear(0.1, false)).toBe(MIN_NEAR)
	})

	it('scales with the pivot distance while orbiting', () => {
		expect(cameraNear(200, false)).toBeCloseTo(6)
	})

	it('holds the depth step under a hundredth of the pivot distance across an orbit', () => {
		for (const distance of [5, 50, 200, 500, 2000]) {
			const near = cameraNear(distance, false)
			// Geometry up to twice the pivot distance away.
			expect(depthStep(near, 4000, distance * 2)).toBeLessThan(distance * 0.01)
		}
	})
})

describe('depthStep', () => {
	it('reproduces the fixed-near problem: close to a block at 500 units', () => {
		expect(depthStep(0.02, 4000, 500)).toBeGreaterThan(0.7)
		expect(depthStep(0.02, 4000, 100)).toBeCloseTo(0.03, 1)
	})
})
