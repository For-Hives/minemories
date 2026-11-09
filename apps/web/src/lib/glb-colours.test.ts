import { describe, expect, it } from 'vitest'
import { hasLegacySrgbColours, LINEAR_COLOURS_FORMAT } from './glb-colours'

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
