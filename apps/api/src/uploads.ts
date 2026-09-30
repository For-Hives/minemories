import { mkdir, open, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import * as z from 'zod'
import { database } from './database'
import { parseMetadata } from './memory-metadata'
import { addMemory, getDeviceFromToken } from './pairing'
import { discardMemoryUpload, storeMemoryFile } from './storage'
import { MAX_UPLOAD_BYTES, readUploadChunk, UPLOAD_CHUNK_BYTES, validateUploadFile } from './upload-files'

const root = resolve(
	process.env.UPLOADS_PATH ?? join(dirname(process.env.DATABASE_PATH ?? './data/minemories.sqlite'), 'uploads')
)
const TTL = 24 * 3_600_000
const MAX_STAGED_BYTES = 2 * 1024 * 1024 * 1024
const locks = new Set<string>()
const offsetPattern = /^\d+$/
type Device = NonNullable<ReturnType<typeof getDeviceFromToken>>
interface Upload {
	id: string
	device_id: string
	user_id: string
	size: number
	sha256: string
	name: string
	metadata_json: string
	received: number
	expires_at: number
	completed: number
	storage_started: number
}
database.exec(`CREATE TABLE IF NOT EXISTS mod_uploads (
 id TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(id), user_id TEXT NOT NULL,
 size INTEGER NOT NULL, sha256 TEXT NOT NULL, name TEXT NOT NULL, metadata_json TEXT NOT NULL,
 received INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, completed INTEGER NOT NULL DEFAULT 0, storage_started INTEGER NOT NULL DEFAULT 0
); CREATE INDEX IF NOT EXISTS mod_uploads_expiry_idx ON mod_uploads(expires_at);`)

export const uploadRouter = new Hono<{ Variables: { device: Device } }>()
uploadRouter.onError((error, context) => {
	if (error instanceof HTTPException) return context.json({ error: error.message }, error.status)
	console.error('[chunk-upload]', error)
	return context.json({ error: 'upload_storage_unavailable' }, 503)
})
uploadRouter.use('*', async (context, next) => {
	const authorization = context.req.header('authorization') ?? ''
	const device = authorization.startsWith('Bearer ') ? getDeviceFromToken(authorization.slice(7)) : null
	if (!device) throw new HTTPException(401, { message: 'unauthorized' })
	context.set('device', device)
	await next()
})
function owned(id: string, device: Device): Upload {
	const upload = database
		.query('SELECT * FROM mod_uploads WHERE id = ? AND device_id = ?')
		.get(id, device.id) as Upload | null
	if (!upload || upload.expires_at <= Date.now())
		throw new HTTPException(404, { message: 'upload_not_found_or_expired' })
	return upload
}
function receipt(upload: Upload) {
	return {
		id: upload.id,
		offset: upload.received,
		size: upload.size,
		chunkSize: UPLOAD_CHUNK_BYTES,
		completed: upload.completed === 1,
		expiresAt: new Date(upload.expires_at).toISOString(),
	}
}
async function locked<T>(id: string, action: () => Promise<T>): Promise<T> {
	if (locks.has(id) || locks.size >= 4) throw new HTTPException(409, { message: 'upload_busy' })
	locks.add(id)
	try {
		return await action()
	} finally {
		locks.delete(id)
	}
}
const initialization = z.object({
	id: z.string().uuid(),
	size: z.number().int().min(20).max(MAX_UPLOAD_BYTES),
	sha256: z.string().regex(/^[a-f0-9]{64}$/),
	metadata: z.record(z.string(), z.unknown()).default({}),
})
uploadRouter.post('/', async context => {
	const body = await readUploadChunk(context.req.raw)
	let value: unknown = null
	try {
		value = body ? JSON.parse(body.toString('utf8')) : null
	} catch {
		throw new HTTPException(400, { message: 'invalid_upload' })
	}
	const parsed = initialization.safeParse(value)
	if (!parsed.success) throw new HTTPException(400, { message: 'invalid_upload' })
	const input = parsed.data
	const metadata = parseMetadata(JSON.stringify(input.metadata))
	if (!metadata) throw new HTTPException(400, { message: 'invalid_memory_metadata' })
	if (metadata.icon === null && metadata.thumbnail !== null) {
		metadata.icon = metadata.thumbnail
		metadata.thumbnail = null
	}
	const device = context.get('device')
	return locked('initialization', async () => {
		await cleanupUploads()
		const existing = database.query('SELECT * FROM mod_uploads WHERE id = ?').get(input.id) as Upload | null
		if (existing) {
			const upload = owned(input.id, device)
			if (upload.size !== input.size || upload.sha256 !== input.sha256)
				throw new HTTPException(409, { message: 'upload_parameters_changed' })
			return context.json(receipt(upload))
		}
		if (database.query('SELECT id FROM memories WHERE id = ?').get(input.id))
			throw new HTTPException(409, { message: 'upload_id_conflict' })
		const count = database
			.query('SELECT COUNT(*) AS count FROM mod_uploads WHERE device_id = ? AND completed = 0 AND expires_at > ?')
			.get(device.id, Date.now()) as { count: number }
		const quota = database
			.query('SELECT COALESCE(SUM(size), 0) AS bytes, COUNT(*) AS count FROM mod_uploads WHERE completed = 0')
			.get() as { bytes: number; count: number }
		if (count.count >= 2 || quota.count >= 128 || quota.bytes + input.size > MAX_STAGED_BYTES)
			throw new HTTPException(429, { message: 'upload_quota_exceeded' })
		await mkdir(root, { recursive: true })
		const file = await open(join(root, input.id), 'w', 0o600)
		await file.close()
		const name =
			(metadata.worldName ?? metadata.serverName ?? 'Souvenir Minecraft')
				.replace(/\p{Cc}/gu, '')
				.trim()
				.slice(0, 80) || 'Souvenir Minecraft'
		try {
			database
				.query(
					'INSERT INTO mod_uploads (id, device_id, user_id, size, sha256, name, metadata_json, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
				)
				.run(
					input.id,
					device.id,
					device.userId,
					input.size,
					input.sha256,
					name,
					JSON.stringify(metadata),
					Date.now() + TTL
				)
		} catch (error) {
			await rm(join(root, input.id), { force: true })
			throw error
		}
		return context.json(receipt(owned(input.id, device)), 201)
	})
})
uploadRouter.get('/:id', context => context.json(receipt(owned(context.req.param('id'), context.get('device')))))
uploadRouter.put('/:id', context => {
	const id = context.req.param('id')
	return locked(id, async () => {
		const upload = owned(id, context.get('device'))
		const rawOffset = context.req.header('upload-offset') ?? ''
		const offset = offsetPattern.test(rawOffset) ? Number(rawOffset) : -1
		if (
			!Number.isSafeInteger(offset) ||
			offset < 0 ||
			offset % UPLOAD_CHUNK_BYTES !== 0 ||
			offset >= upload.size ||
			upload.completed
		)
			throw new HTTPException(400, { message: 'invalid_upload_offset' })
		if (offset > upload.received) throw new HTTPException(409, { message: 'upload_offset_mismatch' })
		if (context.req.header('content-type')?.split(';')[0] !== 'application/octet-stream')
			throw new HTTPException(415, { message: 'unsupported_media_type' })
		const body = await readUploadChunk(context.req.raw)
		if (!body || body.length !== Math.min(UPLOAD_CHUNK_BYTES, upload.size - offset))
			throw new HTTPException(400, { message: 'invalid_chunk_size' })
		await writeChunk(upload, offset, body)
		return context.json(receipt(owned(id, context.get('device'))))
	})
})
async function writeChunk(upload: Upload, offset: number, body: Buffer) {
	const file = await open(join(root, upload.id), 'r+')
	try {
		if (offset < upload.received) {
			const previous = Buffer.alloc(body.length)
			await file.read(previous, 0, previous.length, offset)
			if (!previous.equals(body)) throw new HTTPException(409, { message: 'chunk_content_mismatch' })
			return
		}
		let written = 0
		while (written < body.length) {
			// biome-ignore lint/performance/noAwaitInLoops: ordered writes handle partial writes without buffering another chunk.
			const result = await file.write(body, written, body.length - written, offset + written)
			if (result.bytesWritten === 0) throw new Error('Could not write upload chunk')
			written += result.bytesWritten
		}
		await file.truncate(offset + body.length)
		await file.sync()
		database.query('UPDATE mod_uploads SET received = ? WHERE id = ?').run(offset + body.length, upload.id)
	} finally {
		await file.close()
	}
}
uploadRouter.post('/:id/complete', context => {
	const id = context.req.param('id')
	return locked(id, async () => {
		const upload = owned(id, context.get('device'))
		if (upload.completed) return context.json({ id, name: upload.name, size: upload.size })
		if (upload.received !== upload.size) throw new HTTPException(409, { message: 'upload_incomplete' })
		const path = join(root, id)
		if (!(await validateUploadFile(path, upload.size, upload.sha256)))
			throw new HTTPException(400, { message: 'invalid_glb_or_checksum' })
		const objectKey = `${upload.user_id}/${id}.glb`
		// The reserved UUID makes replacement of a previous uncommitted attempt safe.
		database.query('UPDATE mod_uploads SET storage_started = 1 WHERE id = ?').run(id)
		await storeMemoryFile(objectKey, path, upload.size)
		database.transaction(() => {
			addMemory({
				id,
				userId: upload.user_id,
				deviceId: upload.device_id,
				name: upload.name,
				objectKey,
				size: upload.size,
				metadata: JSON.parse(upload.metadata_json),
			})
			database.query('UPDATE mod_uploads SET completed = 1 WHERE id = ?').run(id)
		})()
		await rm(path, { force: true }).catch(() => undefined)
		return context.json({ id, name: upload.name, size: upload.size }, 201)
	})
})
uploadRouter.delete('/:id', context => {
	const id = context.req.param('id')
	return locked(id, async () => {
		const upload = owned(id, context.get('device'))
		if (!upload.completed && upload.storage_started) await discardMemoryUpload(`${upload.user_id}/${id}.glb`)
		await rm(join(root, id), { force: true })
		database.query('DELETE FROM mod_uploads WHERE id = ?').run(upload.id)
		return context.json({ ok: true })
	})
})
export async function cleanupUploads() {
	const expired = database.query('SELECT * FROM mod_uploads WHERE expires_at <= ?').all(Date.now()) as Upload[]
	for (const upload of expired) {
		const id = upload.id
		if (locks.has(id)) continue
		// biome-ignore lint/performance/noAwaitInLoops: serialize disk cleanup to bound filesystem pressure.
		await locked(id, async () => {
			if (!upload.completed && upload.storage_started) await discardMemoryUpload(`${upload.user_id}/${id}.glb`)
			await rm(join(root, id), { force: true })
			database.query('DELETE FROM mod_uploads WHERE id = ?').run(id)
		}).catch(error => console.error('[upload-cleanup]', error))
	}
}
