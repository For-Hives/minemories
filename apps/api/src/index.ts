import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { apiContract, type CaptureStorageAccess, MAX_TILE_INDEX } from '@minemories/api-contract'
import { implement, ORPCError, onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { type Context, Hono } from 'hono'
import { cors } from 'hono/cors'
import * as z from 'zod'
import { AccountSecurity } from './account-security'
import { bootstrapTemporaryAdministrator } from './admin-bootstrap'
import { AdminMetrics } from './admin-metrics'
import { AdminRoles } from './admin-roles'
import { auth, billing, handleAuthRequest } from './auth'
import { BILLING_WEBHOOK_BODY_BYTES } from './billing'
import { AUTH_BODY_BYTES, RPC_BODY_BYTES, requestBodyLimit } from './body-limits'
import { recordCaptureOpening } from './capture-access'
import { openAuthorizedCapture } from './capture-downloads'
import { CaptureStorage } from './capture-storage'
import { ColdStorageMaintenance } from './cold-storage-maintenance'
import { coldStorageInactiveDays } from './cold-storage-policy'
import { S3ColdStorageProvider } from './cold-storage-s3'
import { coldStorageConfiguration, database } from './database'
import { DiagnosticsReview } from './diagnostics-review'
import { diagnosticsRouter } from './diagnostics-routes'
import { diagnostics } from './diagnostics-state'
import { PublicDiscovery } from './discovery'
import { isGlbContainer } from './glb'
import { parseMetadata } from './memory-metadata'
import { ObjectDeletionQueue } from './object-deletions'
import { CaptureArchivedError } from './object-tiers'
import type { MemoryMetadata } from './pairing'
import {
	addMemory,
	checkPairingCode,
	createPairingCode,
	createShareLink,
	deleteMemory,
	exchangePairingCode,
	getDeviceFromToken,
	getMemoryFile,
	getSharedMemory,
	hasPairedDevice,
	listMemories,
	listTrash,
	purgeDeletedMemories,
	renameMemory,
	restoreMemory,
	revokeShareLink,
	setMemoryThumbnail,
	shareStatus,
	trashMemory,
} from './pairing'
import { PairingAttemptLimiter, pairingAddress, readPairingBody } from './pairing-protection'
import { encodeBuffered } from './response-encoding'
import { logApiFailure, recordApiFailure, requestCorrelation } from './safe-errors'
import { discardMemoryUpload, readMemoryStream, removeMemory, storeMemory } from './storage'
import { accountStorageFits, accountStorageSummary } from './storage-quota'
import { s3Target } from './storage-s3'
import { TieredObjects } from './tiered-objects'
import { readAuthorizedTile, TILE_INTEGRITY_ERROR } from './tile-downloads'
import { TileIndex, type TileLocation } from './tile-index'
import { AssemblyTooLarge, assembleTiledCapture, captureOriginOf } from './tiled-capture'
import { TimelapseFiles } from './timelapse-files'
import { TimelapseIndex } from './timelapse-index'
import { TimelapseMaintenance } from './timelapse-maintenance'
import { cleanupUploads, uploadRouter } from './uploads'
import { webOrigins } from './web-origins'

const port = Number(process.env.API_PORT ?? 3001)
const MAX_MEMORY_BYTES = 100 * 1024 * 1024
const pairingCodePattern = /^\d{6}$/

interface ApiContext {
	userId: string | null
	correlationId: string
	sessionId: string | null
	headers: Headers
}

const os = implement(apiContract).$context<ApiContext>()
const accountSecurity = new AccountSecurity(database, (await auth.$context).password)
const adminRoles = new AdminRoles(database)
bootstrapTemporaryAdministrator(database, adminRoles)
const adminMetrics = new AdminMetrics(database, adminRoles)
const diagnosticsReview = new DiagnosticsReview(
	diagnostics,
	new Set(
		(process.env.DIAGNOSTICS_OPERATOR_IDS ?? '')
			.split(',')
			.map(id => id.trim())
			.filter(Boolean)
	)
)
const tieredObjects = new TieredObjects(database, { read: readMemoryStream, write: storeMemory }, removeMemory)
const objectDeletions = new ObjectDeletionQueue(database, (key, discardUpload) =>
	tieredObjects.remove(key, discardUpload ? discardMemoryUpload : removeMemory)
)
const temporalIndex = new TimelapseIndex(database)
const tileIndex = new TileIndex(database)
const captureFiles = new TimelapseFiles(database, tieredObjects)
export const coldStorageMaintenance = coldStorageConfiguration
	? new ColdStorageMaintenance(
			database,
			new S3ColdStorageProvider(s3Target().client, coldStorageConfiguration),
			removeMemory,
			coldStorageInactiveDays(process.env.COLD_STORAGE_INACTIVE_DAYS)
		)
	: null
const captureStorage = new CaptureStorage(database, coldStorageMaintenance !== null)
export const timelapseMaintenance = new TimelapseMaintenance(database, captureFiles, objectDeletions)
const discovery = new PublicDiscovery(
	database,
	new Set(
		(process.env.PUBLIC_MODERATOR_IDS ?? '')
			.split(',')
			.map(id => id.trim())
			.filter(Boolean)
	)
)
function authenticated(context: ApiContext) {
	if (!context.userId) throw new ORPCError('UNAUTHORIZED')
	return context.userId
}
function accountIdentity(context: ApiContext) {
	const userId = authenticated(context)
	if (!context.sessionId) throw new ORPCError('UNAUTHORIZED')
	const origin = context.headers.get('origin')
	if (origin && !webOrigins.includes(origin)) throw new ORPCError('FORBIDDEN')
	return { userId, sessionId: context.sessionId }
}
function captureObjectKey(access: CaptureStorageAccess, context: ApiContext): string | null {
	if (access.kind === 'owner') return getMemoryFile(authenticated(context), access.id)?.object_key ?? null
	if (access.kind === 'shared') return getSharedMemory(access.token)?.objectKey ?? null
	try {
		return discovery.file(access.id, context.userId).object_key
	} catch {
		return null
	}
}
function archivedAvailability(error: unknown, lookup: () => string | null) {
	if (!(error instanceof CaptureArchivedError)) return null
	try {
		return captureStorage.status(lookup)
	} catch {
		return null
	}
}
type AppContext = Context<{ Bindings: { peerAddress: string | undefined }; Variables: { correlationId: string } }>
function assembledFailure(context: AppContext, error: unknown, lookup: () => string | null): Response {
	if (error instanceof AssemblyTooLarge) return context.json({ error: 'capture_too_large_to_assemble' }, 413)
	const availability = archivedAvailability(error, lookup)
	if (availability) return context.json({ error: 'memory_restoration_required', availability }, 202)
	if (error instanceof Error && error.message === TILE_INTEGRITY_ERROR) {
		logApiFailure('tile_integrity_failed', context.get('correlationId'))
		return context.json({ error: 'tile_integrity_failed' }, 502)
	}
	logApiFailure('tile_download_failed', context.get('correlationId'))
	return context.json({ error: 'memory_storage_unavailable' }, 503)
}
/** Serves a tiled capture as one assembled GLB; `null` leaves captures without tiles on the streaming path. */
async function assembledCapture(
	context: AppContext,
	memoryId: string,
	access: () => string | null,
	includeTrashed = false
): Promise<Response | null> {
	const assembly = tileIndex.assembly(memoryId, includeTrashed)
	if (!assembly) return null
	if (!access()) return context.json({ error: 'memory_not_found' }, 404)
	const locate = (x: number, z: number): TileLocation | null =>
		access() ? tileIndex.locateTile(memoryId, x, z, includeTrashed) : null
	try {
		const glb = await assembleTiledCapture({
			files: captureFiles,
			locate,
			assembly,
			origin: captureOriginOf(assembly.metadataJson),
			signal: context.req.raw.signal,
		})
		const objectKey = access()
		if (!objectKey) return context.json({ error: 'memory_not_found' }, 404)
		recordCaptureOpening(database, objectKey)
		const encoded = await encodeBuffered(context.req.header('Accept-Encoding'), new Uint8Array(glb))
		return context.body(encoded.body, 200, {
			'Content-Type': 'model/gltf-binary',
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff',
			...encoded.headers,
		})
	} catch (error) {
		return assembledFailure(context, error, access)
	}
}
const router = os.router({
	admin: {
		access: os.admin.access.handler(({ context }) => ({ allowed: adminRoles.allowed(context.userId) })),
		summary: os.admin.summary.handler(({ context, input }) => adminMetrics.summary(context.userId, input.hours)),
		users: os.admin.users.handler(({ context, input }) => adminRoles.users(context.userId, input)),
		audit: os.admin.audit.handler(({ context }) => adminRoles.audit(context.userId)),
		setRole: os.admin.setRole.handler(({ context, input }) => {
			const actorId = adminRoles.require(context.userId)
			return accountSecurity.confirmed(accountIdentity(context), input.currentPassword, () =>
				adminRoles.setRole(actorId, input)
			)
		}),
	},
	captureStorage: {
		status: os.captureStorage.status.handler(({ context, input }) =>
			captureStorage.status(() => captureObjectKey(input, context))
		),
		restore: os.captureStorage.restore.handler(({ context, input }) =>
			captureStorage.status(() => captureObjectKey(input, context), true)
		),
	},
	diagnostics: {
		access: os.diagnostics.access.handler(({ context }) => ({ allowed: diagnosticsReview.allowed(context.userId) })),
		list: os.diagnostics.list.handler(({ context, input }) => diagnosticsReview.list(context.userId, input)),
		detail: os.diagnostics.detail.handler(({ context, input }) =>
			diagnosticsReview.detail(context.userId, input.fingerprint, input.page)
		),
		update: os.diagnostics.update.handler(({ context, input }) => diagnosticsReview.update(context.userId, input)),
	},
	timelapse: {
		frames: os.timelapse.frames.handler(({ context, input }) => temporalIndex.frames(authenticated(context), input)),
		tiles: os.timelapse.tiles.handler(({ context, input }) => {
			const user = authenticated(context)
			const tiles = input.cumulative
				? temporalIndex.cumulativeTiles(user, input.memoryId)
				: tileIndex.list(user, input.memoryId)
			if (!tiles) throw new ORPCError('NOT_FOUND')
			return tiles
		}),
	},
	discovery: {
		list: os.discovery.list.handler(({ context, input }) => discovery.list(context.userId, input)),
		review: os.discovery.review.handler(({ context, input }) => discovery.review(input.id, context.userId)),
		get: os.discovery.get.handler(({ context, input }) => discovery.get(input.id, context.userId)),
		publish: os.discovery.publish.handler(({ context, input }) => discovery.publish(authenticated(context), input)),
		status: os.discovery.status.handler(({ context, input }) =>
			discovery.status(authenticated(context), input.memoryId)
		),
		revoke: os.discovery.revoke.handler(({ context, input }) =>
			discovery.revoke(authenticated(context), input.memoryId)
		),
		vote: os.discovery.vote.handler(({ context, input }) =>
			discovery.vote(authenticated(context), input.id, input.voted)
		),
		report: os.discovery.report.handler(({ context, input }) =>
			discovery.report(authenticated(context), input.id, input.reason)
		),
		moderator: os.discovery.moderator.handler(({ context }) => ({ allowed: discovery.isModerator(context.userId) })),
		queue: os.discovery.queue.handler(({ context, input }) => discovery.queue(context.userId, input)),
		moderate: os.discovery.moderate.handler(({ context, input }) =>
			discovery.moderate(context.userId, input.id, input.decision, input.reason)
		),
	},
	account: {
		changeName: os.account.changeName.handler(({ context, input }) => {
			const identity = accountIdentity(context)
			database.query('UPDATE user SET name=?,updatedAt=? WHERE id=?').run(input.name, Date.now(), identity.userId)
			return { ok: true as const }
		}),
		changeEmail: os.account.changeEmail.handler(({ context, input }) =>
			accountSecurity.changeEmail(accountIdentity(context), input)
		),
		changePassword: os.account.changePassword.handler(({ context, input }) =>
			accountSecurity.changePassword(accountIdentity(context), input)
		),
		storage: os.account.storage.handler(({ context }) => {
			if (!context.userId) throw new ORPCError('UNAUTHORIZED')
			return accountStorageSummary(database, context.userId)
		}),
	},
	pairing: {
		create: os.pairing.create.handler(({ context }) => {
			if (!context.userId) throw new ORPCError('UNAUTHORIZED')
			return createPairingCode(context.userId)
		}),
		check: os.pairing.check.handler(({ context, input }) => {
			if (!context.userId) throw new ORPCError('UNAUTHORIZED')
			return checkPairingCode(context.userId, input.code)
		}),
		status: os.pairing.status.handler(({ context }) => {
			if (!context.userId) throw new ORPCError('UNAUTHORIZED')
			return hasPairedDevice(context.userId)
		}),
	},
	memories: {
		list: os.memories.list.handler(({ context }) => {
			if (!context.userId) throw new ORPCError('UNAUTHORIZED')
			const timelines = temporalIndex.timelines(context.userId)
			return listMemories(context.userId).map(memory => {
				const timeline = timelines.get(memory.id)
				return timeline ? { ...memory, timeline } : memory
			})
		}),
		listTrash: os.memories.listTrash.handler(({ context }) => {
			if (!context.userId) throw new ORPCError('UNAUTHORIZED')
			return listTrash(context.userId)
		}),
		rename: os.memories.rename.handler(({ context, input }) => {
			if (!context.userId) throw new ORPCError('UNAUTHORIZED')
			if (!renameMemory(context.userId, input.id, input.name)) throw new ORPCError('NOT_FOUND')
			return { ok: true as const }
		}),
		trash: os.memories.trash.handler(({ context, input }) => {
			if (!context.userId) throw new ORPCError('UNAUTHORIZED')
			if (!trashMemory(context.userId, input.id)) throw new ORPCError('NOT_FOUND')
			return { ok: true as const }
		}),
		restore: os.memories.restore.handler(({ context, input }) => {
			if (!context.userId) throw new ORPCError('UNAUTHORIZED')
			if (!restoreMemory(context.userId, input.id)) throw new ORPCError('NOT_FOUND')
			return { ok: true as const }
		}),
		delete: os.memories.delete.handler(async ({ context, input }) => {
			if (!context.userId) throw new ORPCError('UNAUTHORIZED')
			const objectKey = deleteMemory(context.userId, input.id)
			if (!objectKey) throw new ORPCError('NOT_FOUND')
			await objectDeletions.drain(objectKey)
			return { ok: true as const }
		}),
		createShare: os.memories.createShare.handler(({ context, input }) => {
			if (!context.userId) throw new ORPCError('UNAUTHORIZED')
			const link = createShareLink(context.userId, input.id)
			if (!link) throw new ORPCError('NOT_FOUND')
			return { token: link.token, urlPath: `/share/${link.token}` }
		}),
		revokeShare: os.memories.revokeShare.handler(({ context, input }) => {
			if (!context.userId) throw new ORPCError('UNAUTHORIZED')
			revokeShareLink(context.userId, input.id)
			return { ok: true as const }
		}),
		shareStatus: os.memories.shareStatus.handler(({ context, input }) => {
			if (!context.userId) throw new ORPCError('UNAUTHORIZED')
			return shareStatus(context.userId, input.id)
		}),
		setThumbnail: os.memories.setThumbnail.handler(({ context, input }) => {
			if (!context.userId) throw new ORPCError('UNAUTHORIZED')
			if (!setMemoryThumbnail(context.userId, input.id, input.thumbnail, input.icon ?? null))
				throw new ORPCError('NOT_FOUND')
			return { ok: true as const }
		}),
	},
})

const rpcHandler = new RPCHandler(router, {
	interceptors: [onError((_error, options) => logApiFailure('rpc_failed', options.context.correlationId))],
})
export const app = new Hono<{ Bindings: { peerAddress: string | undefined }; Variables: { correlationId: string } }>()
app.use('*', (context, next) => {
	const correlationId = requestCorrelation(context.req.raw)
	context.set('correlationId', correlationId)
	context.header('X-Minemories-Correlation', correlationId)
	return next()
})
app.onError((_error, context) => {
	logApiFailure('request_failed', context.get('correlationId'))
	return context.json({ error: 'request_failed' }, 500)
})

app.use(
	'*',
	cors({
		origin: webOrigins,
		credentials: true,
		allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
		allowHeaders: [
			'Content-Type',
			'Authorization',
			'X-Memory-Name',
			'X-Memory-Metadata',
			'Upload-Offset',
			'X-Minemories-Correlation',
			'X-Minemories-Diagnostics-Consent',
			'X-Minemories-Diagnostics-Permit',
		],
		exposeHeaders: ['X-Minemories-Correlation'],
	})
)

app.get('/api/auth-providers', context => context.json(Object.keys(auth.options.socialProviders ?? {})))

app.get('/healthz', context => context.json({ status: 'ok' as const }))
app.use('/api/auth/*', (context, next) =>
	requestBodyLimit(
		billing.config && context.req.path === '/api/auth/polar/webhooks' ? BILLING_WEBHOOK_BODY_BYTES : AUTH_BODY_BYTES
	)(context, next)
)
app.all('/api/auth/*', context => handleAuthRequest(context.req.raw))

app.use('/rpc/*', requestBodyLimit(RPC_BODY_BYTES))
app.use('/rpc/*', async (context, next) => {
	context.header('Cache-Control', 'private, no-store')
	const session = await auth.api.getSession({ headers: context.req.raw.headers })
	const { matched, response } = await rpcHandler.handle(context.req.raw, {
		prefix: '/rpc',
		context: {
			userId: session?.user.id ?? null,
			correlationId: context.get('correlationId'),
			sessionId: session?.session.id ?? null,
			headers: context.req.raw.headers,
		},
	})
	if (matched) return context.newResponse(response.body, response)
	return next()
})

const pairingLimiter = new PairingAttemptLimiter()
const trustedProxies = new Set(
	(process.env.TRUSTED_PROXY_IPS ?? '')
		.split(',')
		.map(address => address.trim())
		.filter(Boolean)
)
app.use('/api/mod/pair', (context, next) => {
	const address = pairingAddress(context.env?.peerAddress, context.req.raw.headers, trustedProxies)
	if (!pairingLimiter.allow(address, Date.now())) {
		return Promise.resolve(context.json({ error: 'too_many_attempts' }, 429, { 'Retry-After': '60' }))
	}
	return next()
})

app.post('/api/mod/pair', async context => {
	const body = await readPairingBody(context.req.raw)
	if (body.tooLarge) return context.json({ error: 'pairing_request_too_large' }, 413)
	const parsed = z
		.object({
			code: z.string().regex(pairingCodePattern),
			name: z.string().trim().min(1).max(80).optional(),
		})
		.safeParse(body.value)
	if (!parsed.success) return context.json({ error: 'invalid_pairing_code' }, 400)

	const paired = exchangePairingCode(parsed.data.code, parsed.data.name ?? 'Minecraft client')
	if (!paired) return context.json({ error: 'pairing_code_invalid_or_expired' }, 401)
	return context.json(paired)
})

app.get('/api/mod/status', context => {
	const authorization = context.req.header('authorization')
	const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
	if (!token) return context.json({ error: 'unauthorized' }, 401)
	const device = getDeviceFromToken(token)
	if (!device) return context.json({ error: 'unauthorized' }, 401)
	context.header('Cache-Control', 'private, no-store')
	return context.json({
		paired: true,
		device: { id: device.id, name: device.name },
		storage: accountStorageSummary(database, device.userId),
	})
})

app.use('/api/public/*', (context, next) => {
	context.header('Cache-Control', 'private, no-store')
	context.header('X-Content-Type-Options', 'nosniff')
	return next()
})
app.get('/api/public/:id/file', async context => {
	const session = await auth.api.getSession({ headers: context.req.raw.headers })
	const id = context.req.param('id')
	const current = () => {
		try {
			return discovery.file(id, session?.user.id ?? null)
		} catch {
			return null
		}
	}
	const lookup = () => current()?.object_key ?? null
	const file = current()
	if (!file) return context.json({ error: 'memory_not_found' }, 404)
	const assembled = await assembledCapture(context, file.memory_id, lookup)
	if (assembled) return assembled
	try {
		const contents = await openAuthorizedCapture(captureFiles, lookup, context.req.raw.signal, () =>
			recordCaptureOpening(database, lookup())
		)
		if (!contents) return context.json({ error: 'memory_not_found' }, 404)
		return context.body(Readable.toWeb(contents) as unknown as ReadableStream, 200, {
			'Content-Type': 'model/gltf-binary',
		})
	} catch (error) {
		const availability = archivedAvailability(error, lookup)
		if (availability) return context.json({ error: 'memory_restoration_required', availability }, 202)
		logApiFailure('public_download_failed', context.get('correlationId'))
		return context.json({ error: 'memory_storage_unavailable' }, 503)
	}
})

app.get('/api/shared/:token/file', async context => {
	context.header('Cache-Control', 'private, no-store')
	const token = context.req.param('token')
	const shared = getSharedMemory(token)
	if (!shared) return context.json({ error: 'memory_not_found' }, 404)
	const assembled = await assembledCapture(context, shared.id, () => getSharedMemory(token)?.objectKey ?? null)
	if (assembled) return assembled

	try {
		const contents = await openAuthorizedCapture(
			captureFiles,
			() => getSharedMemory(context.req.param('token'))?.objectKey ?? null,
			context.req.raw.signal,
			() => recordCaptureOpening(database, getSharedMemory(context.req.param('token'))?.objectKey ?? null)
		)
		if (!contents) return context.json({ error: 'memory_not_found' }, 404)
		return context.body(Readable.toWeb(contents) as unknown as ReadableStream, 200, {
			'Content-Type': 'model/gltf-binary',
			'Cache-Control': 'private, no-store',
		})
	} catch (error) {
		const availability = archivedAvailability(
			error,
			() => getSharedMemory(context.req.param('token'))?.objectKey ?? null
		)
		if (availability) return context.json({ error: 'memory_restoration_required', availability }, 202)
		logApiFailure('shared_download_failed', context.get('correlationId'))
		return context.json({ error: 'memory_storage_unavailable' }, 503)
	}
})

app.get('/api/shared/:token', context => {
	const shared = getSharedMemory(context.req.param('token'))
	if (!shared) return context.json({ error: 'memory_not_found' }, 404)
	const { objectKey, ...publicMemory } = shared
	context.header('Cache-Control', 'private, no-store')
	return context.json(publicMemory)
})

app.get('/api/memories/:id/file', async context => {
	context.header('Cache-Control', 'private, no-store')
	const session = await auth.api.getSession({ headers: context.req.raw.headers })
	if (!session) return context.json({ error: 'unauthorized' }, 401)

	const memory = getMemoryFile(session.user.id, context.req.param('id'))
	if (!memory) return context.json({ error: 'memory_not_found' }, 404)
	const id = context.req.param('id')
	const assembled = await assembledCapture(
		context,
		id,
		() => getMemoryFile(session.user.id, id)?.object_key ?? null,
		true
	)
	if (assembled) return assembled

	try {
		const contents = await openAuthorizedCapture(
			captureFiles,
			() => getMemoryFile(session.user.id, context.req.param('id'))?.object_key ?? null,
			context.req.raw.signal,
			() => recordCaptureOpening(database, getMemoryFile(session.user.id, context.req.param('id'))?.object_key ?? null)
		)
		if (!contents) return context.json({ error: 'memory_not_found' }, 404)
		return context.body(Readable.toWeb(contents) as unknown as ReadableStream, 200, {
			'Content-Type': 'model/gltf-binary',
			'Cache-Control': 'private, no-store',
		})
	} catch (error) {
		const availability = archivedAvailability(
			error,
			() => getMemoryFile(session.user.id, context.req.param('id'))?.object_key ?? null
		)
		if (availability) return context.json({ error: 'memory_restoration_required', availability }, 202)
		logApiFailure('memory_download_failed', context.get('correlationId'))
		return context.json({ error: 'memory_storage_unavailable' }, 503)
	}
})

const tileCoordinatePattern = /^-?\d{1,7}$/
function tileCoordinate(raw: string): number | null {
	if (!tileCoordinatePattern.test(raw)) return null
	const value = Number(raw)
	return Math.abs(value) <= MAX_TILE_INDEX ? value : null
}

app.get('/api/memories/:id/tiles/:x/:z', async context => {
	context.header('Cache-Control', 'private, no-store')
	const session = await auth.api.getSession({ headers: context.req.raw.headers })
	if (!session) return context.json({ error: 'unauthorized' }, 401)

	const x = tileCoordinate(context.req.param('x'))
	const z = tileCoordinate(context.req.param('z'))
	if (x === null || z === null) return context.json({ error: 'tile_not_found' }, 404)
	const id = context.req.param('id')
	const userId = session.user.id
	const locate = () => tileIndex.locate(userId, id, x, z)
	const lookup = () => locate()?.objectKey ?? null
	if (!locate()) return context.json({ error: 'tile_not_found' }, 404)

	try {
		const bytes = await readAuthorizedTile(captureFiles, locate, context.req.raw.signal)
		if (!bytes) return context.json({ error: 'tile_not_found' }, 404)
		const encoded = await encodeBuffered(context.req.header('Accept-Encoding'), new Uint8Array(bytes))
		return context.body(encoded.body, 200, {
			'Content-Type': 'model/gltf-binary',
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff',
			...encoded.headers,
		})
	} catch (error) {
		const availability = archivedAvailability(error, lookup)
		if (availability) return context.json({ error: 'memory_restoration_required', availability }, 202)
		if (error instanceof Error && error.message === TILE_INTEGRITY_ERROR) {
			logApiFailure('tile_integrity_failed', context.get('correlationId'))
			return context.json({ error: 'tile_integrity_failed' }, 502)
		}
		logApiFailure('tile_download_failed', context.get('correlationId'))
		return context.json({ error: 'memory_storage_unavailable' }, 503)
	}
})

function splitModImages(metadata: MemoryMetadata): void {
	if (metadata.icon === null && metadata.thumbnail !== null) {
		metadata.icon = metadata.thumbnail
		metadata.thumbnail = null
	}
}

app.route('/api/mod/uploads', uploadRouter)
app.route('/api/mod/diagnostics', diagnosticsRouter)

function reserveLegacyStorage(objectKey: string, userId: string, size: number): boolean {
	return database
		.transaction(() => {
			if (!accountStorageFits(database, userId, size)) return false
			database
				.query(
					'INSERT INTO object_deletions (object_key, created_at, user_id, size, discard_upload) VALUES (?, ?, ?, ?, 1)'
				)
				.run(objectKey, Date.now(), userId, size)
			return true
		})
		.immediate()
}

function captureName(requestedName: string | undefined, metadata: MemoryMetadata): string {
	const rawName =
		requestedName && requestedName !== 'Minecraft capture'
			? requestedName
			: (metadata.worldName ?? metadata.serverName ?? 'Souvenir Minecraft')
	return (
		rawName
			.replace(/\p{Cc}/gu, '')
			.trim()
			.slice(0, 80) || 'Souvenir Minecraft'
	)
}

app.post('/api/mod/memories', async context => {
	const authorization = context.req.header('authorization')
	const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
	const device = token ? getDeviceFromToken(token) : null
	if (!device) return context.json({ error: 'unauthorized' }, 401)

	const declaredSize = Number(context.req.header('content-length') ?? 0)
	if (declaredSize > MAX_MEMORY_BYTES) return context.json({ error: 'memory_too_large' }, 413)
	const contentType = context.req.header('content-type')?.split(';')[0]
	if (contentType !== 'model/gltf-binary' && contentType !== 'application/octet-stream') {
		return context.json({ error: 'unsupported_media_type' }, 415)
	}
	const contents = Buffer.from(await context.req.arrayBuffer())
	const contentError = await validateGlb(contents)
	if (contentError) return context.json({ error: contentError.error }, contentError.status)
	const metadata = parseMetadata(context.req.header('x-memory-metadata'))
	if (!metadata) return context.json({ error: 'invalid_memory_metadata' }, 400)
	splitModImages(metadata)

	const id = randomUUID()
	const objectKey = `${device.userId}/${id}.glb`
	const name = captureName(context.req.header('x-memory-name'), metadata)

	const release = objectDeletions.hold(objectKey)
	try {
		const reserved = reserveLegacyStorage(objectKey, device.userId, contents.byteLength)
		if (!reserved) return context.json({ error: 'storage_quota_exceeded' }, 413)
		await storeMemory(objectKey, contents)
		database
			.transaction(() => {
				addMemory({
					id,
					userId: device.userId,
					deviceId: device.id,
					name,
					objectKey,
					size: contents.byteLength,
					metadata,
				})
				database.query('DELETE FROM object_deletions WHERE object_key = ?').run(objectKey)
			})
			.immediate()
	} catch (error) {
		release()
		await objectDeletions.drain(objectKey).catch(() => undefined)
		recordApiFailure(context.req.raw, error)
		logApiFailure('memory_upload_failed', context.get('correlationId'))
		return context.json({ error: 'memory_storage_unavailable' }, 503)
	} finally {
		release()
	}

	return context.json({ id, name, size: contents.byteLength }, 201)
})

async function validateGlb(contents: Buffer): Promise<{ error: string; status: 400 | 413 } | null> {
	if (contents.byteLength === 0) return { error: 'invalid_memory_size', status: 400 }
	if (contents.byteLength > MAX_MEMORY_BYTES) return { error: 'invalid_memory_size', status: 413 }
	if (!(await isGlbContainer(contents))) return { error: 'invalid_glb', status: 400 }
	return null
}

export function fetchApi(request: Request, server: { requestIP(request: Request): { address: string } | null }) {
	return app.fetch(request, { peerAddress: server.requestIP(request)?.address })
}

if (import.meta.main) {
	const server = Bun.serve({
		port,
		fetch: fetchApi,
		maxRequestBodySize: MAX_MEMORY_BYTES,
	})
	let uploadCleanup: Promise<void> | null = null
	function maintainUploads(): Promise<void> {
		uploadCleanup ??= cleanupUploads()
			.catch(() => logApiFailure('upload_cleanup_failed'))
			.finally(() => {
				uploadCleanup = null
			})
		return uploadCleanup
	}
	void maintainUploads()
	console.warn(`Minemories API ready at ${server.url}`)

	purgeDeletedMemories()
	void objectDeletions.maintain()
	void timelapseMaintenance.maintain()
	void coldStorageMaintenance?.maintain()
	const intervals = [
		setInterval(() => void timelapseMaintenance.maintain(), 5000),
		setInterval(() => void coldStorageMaintenance?.maintain(), 60_000),
		setInterval(() => void maintainUploads(), 3_600_000),
		setInterval(() => void objectDeletions.maintain(), 60_000),
		setInterval(() => purgeDeletedMemories(), 3_600_000),
		setInterval(() => diagnostics.cleanup(), 3_600_000),
	]
	let shutdownPromise: Promise<void> | null = null
	const stopApi = async () => {
		for (const interval of intervals) clearInterval(interval)
		await Promise.all([
			server.stop(),
			timelapseMaintenance.stop(),
			coldStorageMaintenance?.stop(),
			objectDeletions.stop(),
			uploadCleanup,
		])
		database.close()
	}
	const shutdown = () => {
		shutdownPromise ??= stopApi()
		return shutdownPromise
	}
	process.on('SIGINT', shutdown)
	process.on('SIGTERM', shutdown)
}
