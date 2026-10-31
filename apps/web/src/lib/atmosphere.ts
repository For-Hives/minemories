const dryBiome = /desert|badlands|savanna/
const coldBiome = /snow|frozen|ice|:grove$/
const humidBiome = /swamp|jungle/
export interface Atmosphere {
	dayZenith: [number, number, number]
	dayHorizon: [number, number, number]
	nightZenith: [number, number, number]
	nightHorizon: [number, number, number]
	starAlpha: number
	celestial: boolean
	fixedDaylight: number | null
	daylightScale: number
}

const OVERWORLD: Atmosphere = {
	dayZenith: [0.055, 0.24, 0.52],
	dayHorizon: [0.36, 0.57, 0.7],
	nightZenith: [0.018, 0.028, 0.075],
	nightHorizon: [0.1, 0.12, 0.2],
	starAlpha: 1,
	celestial: true,
	fixedDaylight: null,
	daylightScale: 1,
}

export function getAtmosphere(dimension: string | null, biome: string | null): Atmosphere {
	if (dimension === 'minecraft:the_nether') {
		return {
			dayZenith: [0.16, 0.03, 0.03],
			dayHorizon: [0.38, 0.1, 0.07],
			nightZenith: [0.12, 0.02, 0.02],
			nightHorizon: [0.3, 0.08, 0.06],
			starAlpha: 0,
			celestial: false,
			fixedDaylight: 0.85,
			daylightScale: 1,
		}
	}
	if (dimension === 'minecraft:the_end') {
		return {
			dayZenith: [0.02, 0.02, 0.06],
			dayHorizon: [0.08, 0.06, 0.14],
			nightZenith: [0.01, 0.01, 0.04],
			nightHorizon: [0.06, 0.05, 0.12],
			starAlpha: 1,
			celestial: false,
			fixedDaylight: 0,
			daylightScale: 1,
		}
	}
	if (biome?.includes('deep_dark')) {
		return { ...OVERWORLD, fixedDaylight: 0, starAlpha: 0.4, daylightScale: 1 }
	}
	if (biome && dryBiome.test(biome)) {
		return { ...OVERWORLD, dayZenith: [0.28, 0.48, 0.64], dayHorizon: [0.91, 0.73, 0.49] }
	}
	if (biome && coldBiome.test(biome)) {
		return { ...OVERWORLD, dayZenith: [0.25, 0.45, 0.72], dayHorizon: [0.76, 0.86, 0.95] }
	}
	if (biome && humidBiome.test(biome)) {
		return { ...OVERWORLD, dayZenith: [0.22, 0.43, 0.46], dayHorizon: [0.62, 0.76, 0.62] }
	}
	return OVERWORLD
}
