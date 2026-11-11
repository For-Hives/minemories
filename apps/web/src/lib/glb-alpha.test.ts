import { describe, expect, it, vi } from 'vitest'
import { blendPlan, isCutout } from './glb-alpha'

const texels = (...alphas: number[]) => alphas.flatMap(alpha => [10, 20, 30, alpha])

it('accepts binary alpha, with or without transparent texels', () => {
	expect(isCutout(texels(255, 0, 255, 0))).toBe(true)
	expect(isCutout(texels(255, 255))).toBe(true)
	expect(isCutout(texels())).toBe(true)
})

it('tolerates a stray antialiased texel, like the creeper skin', () => {
	expect(isCutout(texels(...new Array(64).fill(255), 0, 128))).toBe(true)
})

it('keeps real translucency (glass, water, slime) blended', () => {
	expect(isCutout(texels(128, 128, 255, 0))).toBe(false)
	expect(isCutout(texels(...new Array(8).fill(255), 90, 90, 90))).toBe(false)
})

describe('blendPlan', () => {
	const base = { transparent: true, opacity: 1, alphaTest: 0, hasMap: true }
	it('leaves opaque and alpha-tested materials alone without reading texels', () => {
		const read = vi.fn(() => true)
		expect(blendPlan({ ...base, transparent: false }, read)).toBe('keep')
		expect(blendPlan({ ...base, alphaTest: 0.5 }, read)).toBe('keep')
		expect(read).not.toHaveBeenCalled()
	})
	it('cuts out a blended material whose texels are binary', () => {
		expect(blendPlan(base, () => true)).toBe('cutout')
	})
	it('keeps real translucency blended, with depth writes', () => {
		expect(blendPlan(base, () => false)).toBe('translucent')
		expect(blendPlan({ ...base, opacity: 0.72 }, () => true)).toBe('translucent')
		expect(blendPlan({ ...base, hasMap: false }, () => true)).toBe('translucent')
	})
})
