/**
 * Reference for the atmosphere pass's screen-space occlusion (`viewer-atmosphere-pass.ts`): the shader inlines the same
 * formulas with the same constants, and these functions pin the behaviour down in tests.
 */

/** Samples whose direction is within this cosine of the surface plane do not occlude (self-shadowing on flat walls). */
export const FACING_BIAS = 0.12
/** Number of taps; the final sum is divided by it. */
export const AO_SAMPLES = 12

/** Share of a tap's occlusion kept at `distance` from the shaded point: 1 at contact, 0 at `radius`, quadratic. */
export function occlusionFalloff(distance: number, radius: number): number {
	const linear = 1 - Math.min(Math.max(distance / radius, 0), 1)
	return linear * linear
}

/** How much a tap at direction cosine `cosine` (against the surface normal) counts as an occluder. */
export function occlusionFacing(cosine: number): number {
	return Math.max(cosine - FACING_BIAS, 0)
}

/**
 * Picks, for one screen axis, the neighbour difference that stays on the same surface. At a silhouette one side jumps
 * to a far background: crossing it gives a garbage normal and a dark or light rim around the near object.
 */
export function surfaceDifference(before: number, here: number, after: number): number {
	const backward = here - before
	const forward = after - here
	return Math.abs(forward) < Math.abs(backward) ? forward : backward
}
