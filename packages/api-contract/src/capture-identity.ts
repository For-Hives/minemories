import * as z from 'zod'

const coordinate = z.number().int().min(-2_147_483_648).max(2_147_483_647)
export const captureBounds = z
	.object({
		minX: coordinate,
		minY: coordinate,
		minZ: coordinate,
		maxX: coordinate,
		maxY: coordinate,
		maxZ: coordinate,
	})
	.refine(bounds => {
		const x = bounds.maxX - bounds.minX + 1,
			y = bounds.maxY - bounds.minY + 1,
			z = bounds.maxZ - bounds.minZ + 1
		return x > 0 && y > 0 && z > 0 && x <= 257 && y <= 1024 && z <= 257 && x * y * z <= 70_000_000
	}, 'Invalid capture volume')
export const captureOrigin = z.object({ x: coordinate, y: coordinate, z: coordinate })
const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const captureIdentityFields = {
	worldId: hash.optional(),
	zoneId: hash.optional(),
	captureMode: z.enum(['around', 'selection']).optional(),
	captureBounds: captureBounds.optional(),
	captureOrigin: captureOrigin.optional(),
}
export type CaptureIdentity = z.infer<typeof completeCaptureIdentity>
export const completeCaptureIdentity = z
	.object({
		worldId: hash,
		zoneId: hash,
		captureMode: z.enum(['around', 'selection']),
		captureBounds,
		captureOrigin,
	})
	.refine(value => {
		const b = value.captureBounds,
			p = value.captureOrigin
		return (
			p.x === Math.trunc((b.minX + b.maxX) / 2) &&
			p.y === Math.trunc((b.minY + b.maxY) / 2) &&
			p.z === Math.trunc((b.minZ + b.maxZ) / 2)
		)
	}, 'Capture origin must match the captured volume')
/** Old metadata stays valid; a partially tagged frame must never be grouped as a complete identity. */
export function validCaptureIdentity(value: Record<string, unknown>): boolean {
	return (
		!Object.keys(captureIdentityFields).some(key => value[key] !== undefined) ||
		completeCaptureIdentity.safeParse(value).success
	)
}
