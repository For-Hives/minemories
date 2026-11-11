import { expect, it } from 'vitest'
import { isCutout } from './glb-alpha'

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
