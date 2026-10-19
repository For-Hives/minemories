import { oc } from '@orpc/contract'
import * as z from 'zod'
import { adminContract } from './admin'
import { captureIdentityFields } from './capture-identity'
import { captureStorageContract } from './capture-storage'
import { captureTime } from './capture-time'
import { diagnosticsContract } from './diagnostics'
import { discoveryContract } from './discovery'
import { timelapseContract } from './timelapse'

export {
	type CaptureIdentity,
	captureIdentityFields,
	completeCaptureIdentity,
	temporalIdentity,
	validCaptureIdentity,
} from './capture-identity'
export { type CaptureAvailability, type CaptureStorageAccess, captureAvailability } from './capture-storage'
export { captureTime, captureTimeKey } from './capture-time'
export {
	type ApiDiagnostic,
	DIAGNOSTIC_BODY_BYTES,
	diagnosticSubmission,
	type ModDiagnostic,
	storedDiagnostic,
} from './diagnostics'
export { type TemporalFrame, type TemporalWindow, TIMELAPSE_PAGE_FRAMES } from './timelapse'

export const thumbnailDataUrl = z
	.string()
	.max(96_000)
	.regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]*={0,2}$/)

export const DAY_MS = 24 * 60 * 60 * 1000
export const TRASH_RETENTION_MS = 30 * DAY_MS

const memorySchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	size: z.number().int().nonnegative(),
	createdAt: z.string().datetime(),
	metadata: z.object({
		...captureIdentityFields,
		seed: z.string().nullable(),
		x: z.number().nullable(),
		y: z.number().nullable(),
		z: z.number().nullable(),
		dimension: z.string().nullable(),
		worldName: z.string().nullable(),
		serverName: z.string().nullable(),
		biome: z.string().nullable(),
		dayTime: z.number().int().nullable(),
		raining: z.boolean().nullable(),
		thundering: z.boolean().nullable(),
		thumbnail: z.string().nullable(),
		icon: z.string().nullable(),
		capturedAt: captureTime.nullable(),
		captureStartedAt: captureTime.nullable().optional(),
		captureFinishedAt: captureTime.nullable().optional(),
	}),
})

export type { AdminSummary, AdminUser } from './admin'

export const apiContract = {
	admin: adminContract,
	captureStorage: captureStorageContract,
	diagnostics: diagnosticsContract,
	discovery: discoveryContract,
	timelapse: timelapseContract,
	account: {
		changeName: oc
			.input(z.object({ name: z.string().trim().min(1).max(80) }))
			.output(z.object({ ok: z.literal(true) })),
		changeEmail: oc
			.input(z.object({ email: z.email().trim().toLowerCase().max(254), currentPassword: z.string().min(1).max(128) }))
			.output(z.object({ ok: z.literal(true) })),
		changePassword: oc
			.input(z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(12).max(128) }))
			.output(z.object({ ok: z.literal(true) })),
		storage: oc.output(
			z.object({
				usedBytes: z.number().int().nonnegative(),
				limitBytes: z.number().int().positive(),
				availableBytes: z.number().int().nonnegative(),
				reservedBytes: z.number().int().nonnegative(),
				pendingDeletionBytes: z.number().int().nonnegative(),
			})
		),
	},
	pairing: {
		create: oc.output(
			z.object({
				code: z.string().regex(/^\d{6}$/),
				expiresAt: z.string().datetime(),
			})
		),
		check: oc
			.input(z.object({ code: z.string().regex(/^\d{6}$/) }))
			.output(z.object({ status: z.enum(['pending', 'paired', 'expired']) })),
		status: oc.output(z.object({ paired: z.boolean() })),
	},
	memories: {
		list: oc.output(z.array(memorySchema)),
		listTrash: oc.output(
			z.array(
				memorySchema.extend({
					deletedAt: z.string().datetime(),
					purgeAt: z.string().datetime().optional(),
				})
			)
		),
		rename: oc
			.input(z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80) }))
			.output(z.object({ ok: z.literal(true) })),
		trash: oc.input(z.object({ id: z.string().uuid() })).output(z.object({ ok: z.literal(true) })),
		restore: oc.input(z.object({ id: z.string().uuid() })).output(z.object({ ok: z.literal(true) })),
		delete: oc.input(z.object({ id: z.string().uuid() })).output(z.object({ ok: z.literal(true) })),
		setThumbnail: oc
			.input(z.object({ id: z.string().uuid(), thumbnail: thumbnailDataUrl, icon: thumbnailDataUrl.nullish() }))
			.output(z.object({ ok: z.literal(true) })),
		createShare: oc
			.input(z.object({ id: z.string().uuid() }))
			.output(z.object({ token: z.string().min(20), urlPath: z.string().min(1) })),
		revokeShare: oc.input(z.object({ id: z.string().uuid() })).output(z.object({ ok: z.literal(true) })),
		shareStatus: oc
			.input(z.object({ id: z.string().uuid() }))
			.output(z.object({ shared: z.boolean(), urlPath: z.string().optional() })),
	},
}
