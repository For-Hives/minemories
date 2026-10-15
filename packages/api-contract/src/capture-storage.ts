import { oc } from '@orpc/contract'
import * as z from 'zod'

export const captureStorageAccess = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('owner'), id: z.string().uuid() }),
	z.object({
		kind: z.literal('shared'),
		token: z
			.string()
			.min(20)
			.max(200)
			.regex(/^[A-Za-z0-9_-]+$/),
	}),
	z.object({ kind: z.literal('public'), id: z.string().uuid() }),
])
export const captureAvailability = z.object({
	state: z.enum(['ready', 'archiving', 'cold', 'restoring']),
	readyObjects: z.number().int().nonnegative(),
	totalObjects: z.number().int().positive(),
	restorationAvailable: z.boolean(),
	retryAfterSeconds: z.number().int().min(1).max(3600).nullable(),
})
export type CaptureStorageAccess = z.infer<typeof captureStorageAccess>
export type CaptureAvailability = z.infer<typeof captureAvailability>
export const captureStorageContract = {
	status: oc.input(captureStorageAccess).output(captureAvailability),
	restore: oc.input(captureStorageAccess).output(captureAvailability),
}
