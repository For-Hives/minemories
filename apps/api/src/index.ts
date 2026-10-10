import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { apiContract } from '@minemories/api-contract'
import { implement, ORPCError, onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import * as z from 'zod'
import { auth } from './auth'
import { database } from './database'
import { isGlbContainer } from './glb'
import { parseMetadata } from './memory-metadata'
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
import { readMemoryStream, removeMemory, storeMemory } from './storage'
import { cleanupUploads, uploadRouter } from './uploads'
import { webOrigins } from './web-origins'

const port = Number(process.env.API_PORT ?? 3001)
const MAX_MEMORY_BYTES = 100 * 1024 * 1024
const pairingCodePattern = /^\d{6}$/

interface ApiContext {
	userId: string | null
}

const os = implement(apiContract).$context<ApiContext>()
const router = os.router({
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
			return listMemories(context.userId)
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
			await removeMemory(objectKey).catch(() => undefined)
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
	interceptors: [onError(error => console.error('[oRPC]', error))],
})
export const app = new Hono<{ Bindings: { peerAddress: string | undefined } }>()

app.use(
	'*',
	cors({
		origin: webOrigins,
		credentials: true,
		allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'Authorization', 'X-Memory-Name', 'X-Memory-Metadata', 'Upload-Offset'],
	})
)

app.get('/healthz', context => context.json({ status: 'ok' as const }))
app.all('/api/auth/*', context => auth.handler(context.req.raw))

app.use('/rpc/*', async (context, next) => {
	const session = await auth.api.getSession({ headers: context.req.raw.headers })
	const { matched, response } = await rpcHandler.handle(context.req.raw, {
		prefix: '/rpc',
		context: { userId: session?.user.id ?? null },
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
	return context.json({ paired: true, device: { id: device.id, name: device.name } })
})

app.get('/api/shared/:token/file', async context => {
	const shared = getSharedMemory(context.req.param('token'))
	if (!shared) return context.json({ error: 'memory_not_found' }, 404)

	try {
		const contents = await readMemoryStream(shared.objectKey)
		return context.body(Readable.toWeb(contents) as unknown as ReadableStream, 200, {
			'Content-Type': 'model/gltf-binary',
			'Cache-Control': 'private, no-store',
		})
	} catch (error) {
		console.error('[shared-download] failed to read memory', error)
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
	const session = await auth.api.getSession({ headers: context.req.raw.headers })
	if (!session) return context.json({ error: 'unauthorized' }, 401)

	const memory = getMemoryFile(session.user.id, context.req.param('id'))
	if (!memory) return context.json({ error: 'memory_not_found' }, 404)

	try {
		const contents = await readMemoryStream(memory.object_key)
		return context.body(Readable.toWeb(contents) as unknown as ReadableStream, 200, {
			'Content-Type': 'model/gltf-binary',
			'Cache-Control': 'private, no-store',
		})
	} catch (error) {
		console.error('[memory-download] failed to read memory', error)
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
	const contentError = validateGlb(contents)
	if (contentError) return context.json({ error: contentError.error }, contentError.status)
	const metadata = parseMetadata(context.req.header('x-memory-metadata'))
	if (!metadata) return context.json({ error: 'invalid_memory_metadata' }, 400)
	splitModImages(metadata)

	const id = randomUUID()
	const objectKey = `${device.userId}/${id}.glb`
	const requestedName = context.req.header('x-memory-name')
	const rawName =
		requestedName && requestedName !== 'Minecraft capture'
			? requestedName
			: (metadata.worldName ?? metadata.serverName ?? 'Souvenir Minecraft')
	const name =
		rawName
			.replace(/\p{Cc}/gu, '')
			.trim()
			.slice(0, 80) || 'Souvenir Minecraft'

	try {
		await storeMemory(objectKey, contents)
		addMemory({
			id,
			userId: device.userId,
			deviceId: device.id,
			name,
			objectKey,
			size: contents.byteLength,
			metadata,
		})
	} catch (error) {
		await removeMemory(objectKey).catch(() => undefined)
		console.error('[memory-upload] failed to save memory', error)
		return context.json({ error: 'memory_storage_unavailable' }, 503)
	}

	return context.json({ id, name, size: contents.byteLength }, 201)
})

function validateGlb(contents: Buffer): { error: string; status: 400 | 413 } | null {
	if (contents.byteLength === 0) return { error: 'invalid_memory_size', status: 400 }
	if (contents.byteLength > MAX_MEMORY_BYTES) return { error: 'invalid_memory_size', status: 413 }
	if (!isGlbContainer(contents)) return { error: 'invalid_glb', status: 400 }
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
	void cleanupUploads()
	setInterval(() => void cleanupUploads(), 3_600_000)
	console.warn(`Minemories API ready at ${server.url}`)

	for (const objectKey of purgeDeletedMemories()) {
		removeMemory(objectKey).catch(() => undefined)
	}
	setInterval(() => {
		for (const objectKey of purgeDeletedMemories()) {
			removeMemory(objectKey).catch(() => undefined)
		}
	}, 3_600_000)

	process.on('SIGINT', () => {
		server.stop()
		database.close()
	})
	process.on('SIGTERM', () => {
		server.stop()
		database.close()
	})
}
