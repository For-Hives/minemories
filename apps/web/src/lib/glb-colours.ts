/** First Minemories GLB format whose material and light colours are linear, as glTF 2.0 requires. */
export const LINEAR_COLOURS_FORMAT = 3

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
