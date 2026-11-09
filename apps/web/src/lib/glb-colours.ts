/** First Minemories GLB format whose material and light colours are linear, as glTF 2.0 requires. */
export const LINEAR_COLOURS_FORMAT = 3

type Rgb = readonly [number, number, number]

function field(value: unknown, key: string): unknown {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined
}

/**
 * Whether a GLB's `asset` object describes a capture written before format 3, whose `baseColorFactor`,
 * `emissiveFactor` and `KHR_lights_punctual` colours hold 8-bit sRGB values instead of linear ones.
 * Files without a Minemories format (older captures, or the landing assets re-baked by glTF-Transform)
 * count as legacy.
 */
export function hasLegacySrgbColours(asset: unknown): boolean {
	const format = field(field(field(asset, 'extras'), 'minemories'), 'format')
	return !(typeof format === 'number' && format >= LINEAR_COLOURS_FORMAT)
}

/** IEC 61966-2-1 curves, the ones the mod's `GlbColor` and three.js use. */
export function srgbToLinear(value: number): number {
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

export function linearToSrgb(value: number): number {
	return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
}

/**
 * The mod writes `emissiveFactor` as the tint times a strength (`emission × 0.65`), and only the tint is a colour:
 * the strength must not go through the transfer curve. Emissive blocks are untinted (white) in practice, so the
 * largest channel is the strength; the remaining hue is converted and the strength kept.
 */
function convertEmissive(rgb: Rgb, curve: (value: number) => number): [number, number, number] {
	const strength = Math.max(...rgb)
	if (strength <= 0) return [0, 0, 0]
	return [curve(rgb[0] / strength) * strength, curve(rgb[1] / strength) * strength, curve(rgb[2] / strength) * strength]
}

/** A pre-format-3 `emissiveFactor` (sRGB tint × strength) as format 3 writes it (linear tint × strength). */
export function legacyEmissiveToLinear(rgb: Rgb): [number, number, number] {
	return convertEmissive(rgb, srgbToLinear)
}

/** The inverse: a format-3 `emissiveFactor` as a pre-format-3 file held it. */
export function emissiveToLegacy(rgb: Rgb): [number, number, number] {
	return convertEmissive(rgb, linearToSrgb)
}
