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
	dayZenith: [0.2, 0.53, 0.88],
	dayHorizon: [0.64, 0.8, 0.94],
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
	return OVERWORLD
}
