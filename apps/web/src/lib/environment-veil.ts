/**
 * Neutral grey veil drawn inside the sky when the viewer bakes its environment map.
 *
 * Faces turned away from the sun are lit almost only by that environment map. Built from the
 * blue sky alone, it tints every shaded face blue: saturated purples turn navy and wood turns
 * grey-green. A grey shell between the sky and the scene keeps the brightness of the sky but
 * removes most of its hue, so shaded faces keep their own colour.
 */

export type Rgb = readonly [number, number, number]

export interface SkyPalette {
	/** Overworld-like sky with a sun and moon. Other skies keep their own tinted ambient. */
	celestial: boolean
	dayZenith: Rgb
	dayHorizon: Rgb
	nightZenith: Rgb
	nightHorizon: Rgb
}

export interface EnvironmentVeil {
	/** Linear grey of the veil, 0 to 1. */
	grey: number
	/** Opacity of the veil over the sky, 0 to 1. */
	opacity: number
}

/** Brightens the veil above the sky's luminance by day, so shaded faces stay readable. */
const DAY_GAIN = 1.85
const NIGHT_GAIN = 1
/**
 * Opacity scales with daylight down to 0: a moonlit scene keeps its blue ambient and the veil
 * can never brighten the night.
 */
const DAY_OPACITY = 0.85
const MAX_GREY = 0.9
/** Overcast sky colour of the sky shader (`vec3(0.42, 0.49, 0.54)`) and its mix weight. */
const WEATHER_SKY: Rgb = [0.42, 0.49, 0.54]
const WEATHER_MIX = 0.72

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount
const luminance = ([red, green, blue]: Rgb) => red * 0.2126 + green * 0.7152 + blue * 0.0722

/**
 * Mean luminance of the sky the environment map is baked from, following the sky shader:
 * zenith and horizon blended from night to day, then towards the overcast grey in bad weather.
 */
export function skyLuminance(palette: SkyPalette, daylight: number, weather: number): number {
	const day = clamp01(daylight)
	const night = (luminance(palette.nightZenith) + luminance(palette.nightHorizon)) / 2
	const clear = lerp(night, (luminance(palette.dayZenith) + luminance(palette.dayHorizon)) / 2, day)
	const overcast = luminance(WEATHER_SKY) * (0.12 + day * 0.88)
	return lerp(clear, overcast, clamp01(weather) * WEATHER_MIX)
}

/**
 * Veil for the current sky: brighter and more opaque by day, gone at night. Skies without a sun
 * (Nether, End) get no veil, their tinted ambient is deliberate.
 */
export function environmentVeil(palette: SkyPalette, daylight: number, weather: number): EnvironmentVeil {
	const day = palette.celestial ? clamp01(daylight) : 0
	const grey = skyLuminance(palette, day, weather) * lerp(NIGHT_GAIN, DAY_GAIN, day)
	return { grey: Math.min(MAX_GREY, grey), opacity: DAY_OPACITY * day }
}
