import { describe, expect, it } from 'vitest'
import {
	emissiveToLegacy,
	hasLegacySrgbColours,
	LINEAR_COLOURS_FORMAT,
	legacyEmissiveToLinear,
	linearToSrgb,
	srgbToLinear,
} from './glb-colours'

const asset = (minemories: unknown) => ({ version: '2.0', generator: 'Minemories', extras: { minemories } })

describe('hasLegacySrgbColours', () => {
	it('treats format 3 and later captures as linear', () => {
		expect(LINEAR_COLOURS_FORMAT).toBe(3)
		expect(hasLegacySrgbColours(asset({ format: 3, chunkSize: 16 }))).toBe(false)
		expect(hasLegacySrgbColours(asset({ format: 4 }))).toBe(false)
	})

	it('treats older formats as sRGB', () => {
		expect(hasLegacySrgbColours(asset({ format: 2 }))).toBe(true)
		expect(hasLegacySrgbColours(asset({ format: 1 }))).toBe(true)
	})

	it('treats files without a Minemories format as sRGB', () => {
		expect(hasLegacySrgbColours(undefined)).toBe(true)
		expect(hasLegacySrgbColours(null)).toBe(true)
		expect(hasLegacySrgbColours({ version: '2.0', generator: 'glTF-Transform v4.5.1' })).toBe(true)
		expect(hasLegacySrgbColours({ version: '2.0', extras: null })).toBe(true)
		expect(hasLegacySrgbColours(asset(null))).toBe(true)
		expect(hasLegacySrgbColours(asset({ format: '3' }))).toBe(true)
		expect(hasLegacySrgbColours('format 3')).toBe(true)
	})
})

describe('sRGB transfer curves', () => {
	it('matches the mod on both segments', () => {
		// Grass tint 0xA4C954, as GlbColor writes it.
		expect(srgbToLinear(0xa4 / 255)).toBeCloseTo(0.371, 3)
		expect(srgbToLinear(0xc9 / 255)).toBeCloseTo(0.584, 3)
		expect(srgbToLinear(0x54 / 255)).toBeCloseTo(0.089, 3)
		expect(srgbToLinear(10 / 255)).toBeCloseTo(10 / 255 / 12.92, 9)
		expect(srgbToLinear(0)).toBe(0)
		expect(srgbToLinear(1)).toBe(1)
	})

	it('round-trips', () => {
		for (const value of [0, 0.002, 0.01, 0.2, 0.5, 1]) expect(linearToSrgb(srgbToLinear(value))).toBeCloseTo(value, 9)
	})
})

describe('emissive factors', () => {
	it('keeps the strength of an untinted glow and converts only the hue', () => {
		expect(legacyEmissiveToLinear([0.65, 0.65, 0.65])).toEqual([0.65, 0.65, 0.65])
		const [r, g, b] = legacyEmissiveToLinear([0.65, 0.65 * (0xaa / 255), 0.65 * (0x70 / 255)])
		expect(r).toBeCloseTo(0.65, 9)
		expect(g).toBeCloseTo(0.65 * srgbToLinear(0xaa / 255), 9)
		expect(b).toBeCloseTo(0.65 * srgbToLinear(0x70 / 255), 9)
	})

	it('keeps the brightest channel of a non-saturated tint, an approximation of what format 3 writes', () => {
		const tint = [0.8, 0.4, 0.2] as const
		const legacy = tint.map(channel => channel * 0.65) as [number, number, number]
		const [r, g, b] = legacyEmissiveToLinear(legacy)
		// The largest channel is read as the strength: 0.52 stays 0.52 and only the ratios go through the curve.
		expect(r).toBeCloseTo(0.52, 9)
		expect(g).toBeCloseTo(0.52 * srgbToLinear(0.5), 9)
		expect(b).toBeCloseTo(0.52 * srgbToLinear(0.25), 9)
		// Format 3 would write the linear tint times the strength, whose largest channel is dimmer (about 0.39).
		const exact = tint.map(channel => srgbToLinear(channel) * 0.65)
		expect(exact[0]).toBeCloseTo(0.39, 2)
		expect(Math.abs(r - (exact[0] ?? 0))).toBeGreaterThan(0.1)
	})

	it('inverts the conversion for format 3 files', () => {
		const legacy = [0.4, 0.3, 0.1] as const
		const back = emissiveToLegacy(legacyEmissiveToLinear(legacy))
		for (const [index, value] of legacy.entries()) expect(back[index]).toBeCloseTo(value, 9)
	})

	it('leaves a black emissive black', () => {
		expect(legacyEmissiveToLinear([0, 0, 0])).toEqual([0, 0, 0])
		expect(emissiveToLegacy([0, 0, 0])).toEqual([0, 0, 0])
	})
})
