import { afterEach, expect, test, vi } from 'vitest'
import {
	browserStorage,
	FACE_SHADE,
	faceShade,
	faithfulSkyLight,
	isViewerLighting,
	readViewerLighting,
	STORM_DARKENING,
	srgbFactorToLinear,
	storeViewerLighting,
	viewerLightings,
} from './viewer-lighting'

afterEach(() => vi.unstubAllGlobals())

test('axis-aligned faces get the game shade: top 1, north/south 0.8, east/west 0.6, bottom 0.5', () => {
	expect(faceShade(0, 1, 0)).toBe(1)
	expect(faceShade(0, -1, 0)).toBe(0.5)
	expect(faceShade(0, 0, 1)).toBe(0.8)
	expect(faceShade(0, 0, -1)).toBe(0.8)
	expect(faceShade(1, 0, 0)).toBe(0.6)
	expect(faceShade(-1, 0, 0)).toBe(0.6)
	expect(FACE_SHADE.up).toBe(1)
})

test('slanted faces blend the neighbouring shades', () => {
	const diagonal = Math.SQRT1_2
	expect(faceShade(diagonal, 0, diagonal)).toBeCloseTo(0.7)
	expect(faceShade(0, diagonal, diagonal)).toBeCloseTo(0.9)
	expect(faceShade(0, -diagonal, diagonal)).toBeCloseTo(0.65)
})

test('sky light follows the game light map: white at noon, dim moonlit blue at night, darker in a storm', () => {
	const noon = faithfulSkyLight(1)
	for (const channel of noon) expect(channel).toBeCloseTo(0.99)
	const night = faithfulSkyLight(0)
	expect(night[0]).toBeCloseTo(0.271, 3)
	expect(night[1]).toBe(night[0])
	expect(night[2]).toBeCloseTo(0.465, 3)
	expect(faithfulSkyLight(-3)).toEqual(night)
	expect(faithfulSkyLight(4)).toEqual(noon)
	const dusk = faithfulSkyLight(0.5)
	expect(dusk[0]).toBeGreaterThan(night[0])
	expect(dusk[0]).toBeLessThan(noon[0])
	const storm = faithfulSkyLight(1, true)
	expect(storm[0]).toBeLessThan(noon[0])
	expect(storm[0]).toBeGreaterThan(night[0])
	expect(faithfulSkyLight(0, true)).toEqual(night)
	expect(STORM_DARKENING).toBe(5 / 16)
})

test('sRGB multipliers convert to linear light', () => {
	expect(srgbFactorToLinear(1)).toBe(1)
	expect(srgbFactorToLinear(0.5)).toBeCloseTo(0.2176, 4)
})

test('lighting styles are validated', () => {
	expect(viewerLightings).toEqual(['realistic', 'faithful'])
	expect(isViewerLighting('faithful')).toBe(true)
	expect(isViewerLighting('realistic')).toBe(true)
	expect(isViewerLighting('flat')).toBe(false)
	expect(isViewerLighting(null)).toBe(false)
})

test('the chosen style is remembered on this device and survives blocked storage', () => {
	const values = new Map<string, string>()
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => void values.set(key, value),
	}
	expect(readViewerLighting(storage)).toBe('realistic')
	storeViewerLighting(storage, 'faithful')
	expect(readViewerLighting(storage)).toBe('faithful')
	values.set('minemories-viewer-lighting', 'neon')
	expect(readViewerLighting(storage)).toBe('realistic')
	expect(readViewerLighting(undefined)).toBe('realistic')
	storeViewerLighting(undefined, 'faithful')
	const blocked = {
		getItem: () => {
			throw new Error('blocked')
		},
		setItem: () => {
			throw new Error('blocked')
		},
	}
	expect(readViewerLighting(blocked)).toBe('realistic')
	expect(() => storeViewerLighting(blocked, 'faithful')).not.toThrow()
})

test('browser storage is optional', () => {
	const storage = { getItem: () => null, setItem: () => undefined }
	vi.stubGlobal('localStorage', storage)
	expect(browserStorage()).toBe(storage)
	vi.stubGlobal('localStorage', undefined)
	expect(browserStorage()).toBeUndefined()
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		get() {
			throw new Error('SecurityError')
		},
	})
	expect(browserStorage()).toBeUndefined()
	Reflect.deleteProperty(globalThis, 'localStorage')
})
