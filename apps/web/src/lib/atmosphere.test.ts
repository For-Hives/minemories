import { expect, it } from 'vitest'
import { getAtmosphere } from './atmosphere'

it('uses the overworld palette by default', () => {
	const atmosphere = getAtmosphere(null, null)
	expect(atmosphere.celestial).toBe(true)
	expect(atmosphere.fixedDaylight).toBeNull()
	expect(atmosphere.starAlpha).toBe(1)
	expect(atmosphere.sky).toBe('overworld')
	expect(getAtmosphere('minecraft:overworld', 'minecraft:plains')).toEqual(atmosphere)
})

it('paints the nether as a fixed ember glow without stars', () => {
	const atmosphere = getAtmosphere('minecraft:the_nether', null)
	expect(atmosphere.celestial).toBe(false)
	expect(atmosphere.starAlpha).toBe(0)
	expect(atmosphere.fixedDaylight).toBe(0.85)
	expect(atmosphere.sky).toBe('nether')
	expect(atmosphere.dayHorizon[0]).toBeGreaterThan(atmosphere.dayHorizon[2])
})

it('keeps the end in starlit darkness', () => {
	const atmosphere = getAtmosphere('minecraft:the_end', null)
	expect(atmosphere.celestial).toBe(false)
	expect(atmosphere.fixedDaylight).toBe(0)
	expect(atmosphere.starAlpha).toBe(1)
	expect(atmosphere.sky).toBe('end')
})

it('darkens the deep dark even in the overworld', () => {
	const atmosphere = getAtmosphere('minecraft:overworld', 'minecraft:deep_dark')
	expect(atmosphere.fixedDaylight).toBe(0)
	expect(atmosphere.starAlpha).toBe(0.4)
	expect(atmosphere.sky).toBe('underground')
})

it.each(['desert', 'snowy_plains', 'mangrove_swamp'])(
	'adapts the atmosphere to %s without changing the day cycle',
	biome => {
		const result = getAtmosphere('minecraft:overworld', `minecraft:${biome}`)
		expect(result.dayHorizon).not.toEqual(getAtmosphere(null, null).dayHorizon)
		expect(result.fixedDaylight).toBeNull()
		expect(result.sky).toBe('overworld')
	}
)
