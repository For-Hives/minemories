import { oc } from '@orpc/contract'
import * as z from 'zod'
import { roleStorage, roleStorageBytes, storageRole } from './account-roles'

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
	/** Bytes counted against the account quota: captures, upload reservations and pending deletions. */
	usedBytes: z.number().nonnegative(),
	/** Part of `usedBytes` held by unfinished or discarded uploads. */
	reservedBytes: z.number().nonnegative(),
	/** Part of `usedBytes` still awaiting object deletion. */
	pendingDeletionBytes: z.number().nonnegative(),
	devices: z.number().int().nonnegative(),
	/** The account's own limit: the largest limit among the roles it holds (see `storageRole`). */
	quotaBytes: z.number().int().positive(),
})
export const adminUserSort = z.enum(['registered_desc', 'registered_asc', 'storage_desc', 'storage_asc'])
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
const versionCount = z.object({ version: z.string(), devices: z.number().int().nonnegative() })
export const adminActivityLevel = z.enum(['high', 'medium', 'low'])
/** Usage figures that need no new tracking: versions come from consented diagnostics, the rest from existing records. */
export const adminInsights = z.object({
	windowDays: z.number().int().positive(),
	versions: z.object({
		/** Devices whose latest consented diagnostic report gave the versions below. */
		reportingDevices: z.number().int().nonnegative(),
		minecraft: z.array(versionCount),
		loader: z.array(versionCount),
		mod: z.array(versionCount),
	}),
	shares: z.object({
		links: z.number().int().nonnegative(),
		activeLinks: z.number().int().nonnegative(),
		revokedLinks: z.number().int().nonnegative(),
		worldLinks: z.number().int().nonnegative(),
		openedLinks: z.number().int().nonnegative(),
		opens: z.number().int().nonnegative(),
		top: z.array(
			z.object({
				name: z.string(),
				owner: z.string().nullable(),
				scope: z.enum(['memory', 'world']),
				opens: z.number().int().nonnegative(),
				lastOpenedAt: z.number().nullable(),
				revoked: z.boolean(),
			})
		),
	}),
	activity: z.object({
		activeUsers: z.number().int().nonnegative(),
		users: z.array(
			z.object({
				id: z.string(),
				name: z.string(),
				email: z.string(),
				level: adminActivityLevel,
				score: z.number().int().nonnegative(),
				logins: z.number().int().nonnegative(),
				uploads: z.number().int().nonnegative(),
				lastActiveAt: z.number().nullable(),
			})
		),
	}),
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
				sort: adminUserSort.optional(),
			})
		)
		.output(
			z.object({
				users: z.array(adminUser),
				total: z.number(),
				page: z.number(),
				pageSize: z.literal(25),
				/** Base limit every account gets (the `user` role); an account's own limit is its `quotaBytes`. */
				quotaBytes: z.number().positive(),
				/** Counts over every account, whatever the filter or page; "near" compares with each account's own limit. */
				overview: z.object({
					accounts: z.number().int().nonnegative(),
					usedBytes: z.number().nonnegative(),
					nearQuotaAccounts: z.number().int().nonnegative(),
				}),
			})
		),
	setRole: oc
		.input(z.object({ userId: z.string().min(1).max(200), role, currentPassword: z.string().min(1).max(128) }))
		.output(z.object({ ok: z.literal(true) })),
	insights: oc.output(adminInsights),
	/** Storage limit of every role, with its holders. */
	storageRoles: oc.output(z.array(roleStorage)),
	/** Sets a role's limit in bytes; `null` removes it (for `user`, back to `ACCOUNT_STORAGE_BYTES`). Deletes nothing. */
	setRoleStorage: oc
		.input(z.object({ role: storageRole, quotaBytes: roleStorageBytes.nullable() }))
		.output(z.object({ ok: z.literal(true) })),
	deleteUser: oc
		.input(z.object({ userId: z.string().min(1).max(200), currentPassword: z.string().min(1).max(128) }))
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
export type AdminUserSort = z.infer<typeof adminUserSort>
export type AdminUser = z.infer<typeof adminUser>
export type AdminInsights = z.infer<typeof adminInsights>
