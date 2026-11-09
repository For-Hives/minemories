import { describe, expect, it } from 'vitest'
import { getAtmosphere } from './atmosphere'
import { environmentVeil, skyLuminance } from './environment-veil'

const overworld = getAtmosphere(null, null)

describe('skyLuminance', () => {
	it('is brighter by day than at night and clamps daylight', () => {
		const night = skyLuminance(overworld, 0, 0)
		const day = skyLuminance(overworld, 1, 0)
		expect(day).toBeGreaterThan(night * 4)
		expect(skyLuminance(overworld, -1, 0)).toBe(night)
		expect(skyLuminance(overworld, 2, 0)).toBe(day)
	})

	it('moves towards the overcast grey in bad weather', () => {
		const clear = skyLuminance(overworld, 1, 0)
		const overcast = skyLuminance(overworld, 1, 1)
		expect(overcast).toBeGreaterThan(clear)
		expect(skyLuminance(overworld, 1, 3)).toBe(overcast)
		expect(skyLuminance(overworld, 0, 1)).toBeLessThan(skyLuminance(overworld, 0, 0))
	})
})

describe('environmentVeil', () => {
	it('lays a light, mostly opaque grey over the clear day sky', () => {
		const veil = environmentVeil(overworld, 1, 0)
		expect(veil.grey).toBeCloseTo(0.7, 1)
		expect(veil.opacity).toBe(0.85)
	})

	it('vanishes at night so moonlight keeps its blue and nothing gets brighter', () => {
		expect(environmentVeil(overworld, 0, 0).opacity).toBe(0)
		expect(environmentVeil(overworld, -0.5, 1).opacity).toBe(0)
	})

	it('grows with daylight through sunset', () => {
		const levels = [0, 0.15, 0.5, 1].map(daylight => environmentVeil(overworld, daylight, 0))
		const greys = levels.map(veil => veil.grey)
		const opacities = levels.map(veil => veil.opacity)
		expect(greys).toEqual([...greys].sort((a, b) => a - b))
		expect(new Set(greys).size).toBe(4)
		expect(opacities).toEqual([...opacities].sort((a, b) => a - b))
		expect(new Set(opacities).size).toBe(4)
		expect(environmentVeil(overworld, 5, 0)).toEqual(levels[3])
	})

	it('caps the grey under bright cold skies', () => {
		expect(environmentVeil(getAtmosphere(null, 'minecraft:snowy_plains'), 1, 0).grey).toBe(0.9)
	})

	it('leaves skies without a sun to their own tinted ambient', () => {
		expect(environmentVeil(getAtmosphere('minecraft:the_nether', null), 0.85, 0).opacity).toBe(0)
		expect(environmentVeil(getAtmosphere('minecraft:the_end', null), 1, 0).opacity).toBe(0)
	})
})
