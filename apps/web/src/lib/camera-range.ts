/** Closest the near plane ever gets: first person and tight zooms. */
export const MIN_NEAR = 0.02
/** Share of the camera-to-pivot distance kept clear in front of the lens while orbiting. */
export const ORBIT_NEAR_RATIO = 0.03

/**
 * Near plane for the camera, recomputed every frame.
 *
 * A depth buffer's resolution at distance z is about `z² / (near · 2^bits)`: with a fixed 0.02 near plane and a
 * 24-bit buffer, depth steps reach a block at 500 units. Everything that reads depth (z-testing, ambient occlusion,
 * haze) then shows stair-stepped surfaces that crawl as the camera orbits. Orbiting keeps near proportional to the
 * pivot distance instead, which keeps precision constant relative to what is on screen; walking keeps the small
 * value so nothing clips against the lens.
 */
export function cameraNear(pivotDistance: number, walking: boolean): number {
	if (walking || !Number.isFinite(pivotDistance)) return MIN_NEAR
	return Math.max(MIN_NEAR, pivotDistance * ORBIT_NEAR_RATIO)
}

/** Depth-buffer step, in world units, at distance `z` for a perspective camera. */
export function depthStep(near: number, far: number, z: number, bits = 24): number {
	return (z * z * (1 - near / far)) / (near * 2 ** bits)
}
