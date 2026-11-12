import { describe, expect, it } from 'vitest'

import { FACING_BIAS, occlusionFacing, occlusionFalloff, surfaceDifference } from './ambient-occlusion'

describe('occlusionFalloff', () => {
	it('is full at contact and gone at and beyond the radius', () => {
		expect(occlusionFalloff(0, 2)).toBe(1)
		expect(occlusionFalloff(2, 2)).toBe(0)
		expect(occlusionFalloff(9, 2)).toBe(0)
		expect(occlusionFalloff(-1, 2)).toBe(1)
	})

	it('fades quickly: a body a block behind a wall barely darkens it', () => {
		expect(occlusionFalloff(1.2, 1.8)).toBeLessThan(0.12)
		expect(occlusionFalloff(0.3, 1.8)).toBeGreaterThan(0.69)
	})
})

describe('occlusionFacing', () => {
	it('ignores directions along the surface and counts the ones above it', () => {
		expect(occlusionFacing(FACING_BIAS)).toBe(0)
		expect(occlusionFacing(-1)).toBe(0)
		expect(occlusionFacing(1)).toBeCloseTo(1 - FACING_BIAS)
	})
})

describe('surfaceDifference', () => {
	it('takes the smaller side so a silhouette jump is never used', () => {
		expect(surfaceDifference(1, 1.1, 90)).toBeCloseTo(0.1)
		expect(surfaceDifference(90, 1, 1.1)).toBeCloseTo(0.1)
	})

	it('falls back to the backward side when both are equal', () => {
		expect(surfaceDifference(0, 1, 2)).toBe(1)
	})
})
