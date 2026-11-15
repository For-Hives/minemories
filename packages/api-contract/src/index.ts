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
export { publicationStatus, publicationSubmission } from './discovery'
export {
	type ModIndex,
	type ModIndexTarget,
	type ModIndexVersion,
	type ModUploadManifest,
	modBuiltBy,
	modIndex,
	modIndexTarget,
	modIndexVersion,
	modJarName,
	modTargetId,
	modUploadManifest,
	modVersion,
} from './mod-downloads'
export {
	ROADMAP_COLUMN_LIMIT,
	ROADMAP_DONE_DAYS,
	ROADMAP_RELEASE_NOTES_LIMIT,
	type RoadmapArea,
	type RoadmapColumn,
	type RoadmapItem,
	type RoadmapLatestRelease,
	type RoadmapReleaseNote,
	type RoadmapReleaseNotesSource,
	type RoadmapReleaseNoteType,
	type RoadmapResponse,
	roadmapArea,
	roadmapColumn,
	roadmapItem,
	roadmapLatestRelease,
	roadmapReleaseNote,
	roadmapReleaseNotesSource,
	roadmapReleaseNoteType,
	roadmapResponse,
} from './roadmap'
export {
	type TemporalFrame,
	type TemporalWindow,
	TIMELAPSE_PAGE_FRAMES,
	WORLD_EVOLUTION_FRAMES,
	type WorldEvolution,
} from './timelapse'

export const thumbnailDataUrl = z
	.string()
	.max(96_000)
	.regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]*={0,2}$/)

/**
 * The gallery's server (or single-player world) a capture belongs to: a world by name and seed, else a server by
 * name. The web gallery groups by it and the API keys the owner's server profile (name, picture) by it.
 */
export function serverKey(metadata: {
	worldName: string | null
	serverName: string | null
	seed: string | null
}): string {
	return JSON.stringify(
		metadata.worldName ? ['world', metadata.worldName, metadata.seed] : ['server', metadata.serverName]
	)
}

/** The name the gallery shows before the owner names a server. */
export function defaultServerName(metadata: { worldName: string | null; serverName: string | null }): string {
	return metadata.worldName || metadata.serverName || 'Other captures'
}

export const serverProfileKey = z.string().min(2).max(600)
export const serverProfileName = z.string().trim().min(1).max(80)
/** What the owner chose for one server: its name and its picture, `null` until chosen. */
export const serverProfile = z.object({
	key: serverProfileKey,
	name: z.string().nullable(),
	cover: z.string().nullable(),
})
export type ServerProfile = z.infer<typeof serverProfile>

/** A share link opens one snapshot ("memory") or every snapshot of its evolving world ("world"). */
export const shareScope = z.enum(['memory', 'world']).default('memory')
export type ShareScope = z.infer<typeof shareScope>

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

export {
	MAX_ROLE_STORAGE_BYTES,
	type RoleStorage,
	roleStorage,
	roleStorageBytes,
	type StorageRole,
	storageRole,
} from './account-roles'
export type { AdminAnalytics, AdminInsights, AdminSummary, AdminUser, AdminUserSort } from './admin'

/** Java Edition usernames: 3 to 16 letters, digits and underscores. */
export const minecraftUsername = z
	.string()
	.trim()
	.regex(/^\w{3,16}$/)
/** Face of a Minecraft account, served by head.sttr.io from the username. */
export const minecraftHeadUrl = (username: string) => `https://head.sttr.io/face/${encodeURIComponent(username)}`

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
		/** Uses the Minecraft head of this player as the account image; `null` goes back to the initial. */
		setMinecraftHead: oc
			.input(z.object({ username: minecraftUsername.nullable() }))
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
				/** Captures in the trash: they count until they are deleted for good. An older API omits it. */
				trashBytes: z.number().int().nonnegative().default(0),
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
		/** Deletes every capture in the trash for good; `deleted` counts them. */
		emptyTrash: oc.output(z.object({ deleted: z.number().int().nonnegative() })),
		/** The viewer's automatic preview; ignored once the owner has chosen this capture's picture (`setCover`). */
		setThumbnail: oc
			.input(z.object({ id: z.string().uuid(), thumbnail: thumbnailDataUrl, icon: thumbnailDataUrl.nullish() }))
			.output(z.object({ ok: z.literal(true) })),
		/** Profiles the owner gave their servers (name, picture), for the gallery. */
		serverProfiles: oc.output(z.array(serverProfile)),
		/** The server profile of one capture, with the name the gallery shows without one. */
		serverProfile: oc
			.input(z.object({ id: z.string().uuid() }))
			.output(serverProfile.extend({ defaultName: z.string() })),
		/** Renames a server; `null` goes back to the name from the game. */
		renameServer: oc
			.input(z.object({ key: serverProfileKey, name: serverProfileName.nullable() }))
			.output(z.object({ ok: z.literal(true) })),
		/**
		 * A view picked in the viewer becomes this capture's picture (kept for good, used when it is published) and
		 * its server's picture in the gallery; `name`, when given, renames the server at the same time.
		 */
		setCover: oc
			.input(
				z.object({ id: z.string().uuid(), image: thumbnailDataUrl, name: serverProfileName.nullable().optional() })
			)
			.output(z.object({ ok: z.literal(true) })),
		createShare: oc
			.input(z.object({ id: z.string().uuid(), scope: shareScope }))
			.output(z.object({ token: z.string().min(20), urlPath: z.string().min(1) })),
		revokeShare: oc
			.input(z.object({ id: z.string().uuid(), scope: shareScope }))
			.output(z.object({ ok: z.literal(true) })),
		shareStatus: oc
			.input(z.object({ id: z.string().uuid(), scope: shareScope }))
			.output(z.object({ shared: z.boolean(), urlPath: z.string().optional() })),
	},
}
