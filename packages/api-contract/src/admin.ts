import { oc } from '@orpc/contract'
import * as z from 'zod'

const role = z.enum(['user', 'admin'])
export const adminUser = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	emailVerified: z.boolean(),
	createdAt: z.number(),
	role,
	captures: z.number().int().nonnegative(),
	storedBytes: z.number().nonnegative(),
	devices: z.number().int().nonnegative(),
})
export const adminSummary = z.object({
	trackingStartedAt: z.number(),
	from: z.number(),
	to: z.number(),
	totals: z.object({
		users: z.number(),
		admins: z.number(),
		memories: z.number(),
		storedBytes: z.number(),
		trashBytes: z.number(),
		pendingDeletionBytes: z.number(),
		reservedBytes: z.number(),
		sessions: z.number(),
		devices: z.number(),
		publicCaptures: z.number(),
		coldObjects: z.number(),
		restoringObjects: z.number(),
	}),
	period: z.object({ signups: z.number(), uploads: z.number(), uploadedBytes: z.number() }),
	series: z.array(
		z.object({
			at: z.number(),
			signups: z.number(),
			uploads: z.number(),
			uploadedBytes: z.number(),
			coverage: z.enum(['none', 'partial', 'full']),
		})
	),
})
export const adminContract = {
	access: oc.output(z.object({ allowed: z.boolean() })),
	summary: oc.input(z.object({ hours: z.union([z.literal(24), z.literal(168), z.literal(720)]) })).output(adminSummary),
	users: oc
		.input(
			z.object({
				query: z.string().trim().max(100),
				role: z.enum(['all', 'user', 'admin']),
				page: z.number().int().min(1).max(100000),
			})
		)
		.output(z.object({ users: z.array(adminUser), total: z.number(), page: z.number(), pageSize: z.literal(25) })),
	setRole: oc
		.input(z.object({ userId: z.string().min(1).max(200), role, currentPassword: z.string().min(1).max(128) }))
		.output(z.object({ ok: z.literal(true) })),
	audit: oc.output(
		z.array(
			z.object({
				id: z.number(),
				at: z.number(),
				actorName: z.string().nullable(),
				targetName: z.string().nullable(),
				role,
			})
		)
	),
}
export type AdminSummary = z.infer<typeof adminSummary>
export type AdminUser = z.infer<typeof adminUser>
