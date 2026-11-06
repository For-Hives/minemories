import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { GetObjectCommand, S3ServiceException } from '@aws-sdk/client-s3'
import { type ModIndex, modIndex, modJarName, modTargetId, modVersion } from '@minemories/api-contract'
import { type Context, Hono } from 'hono'
import { logApiFailure } from './safe-errors'
import { s3Target } from './storage-s3'

/** Bucket des JAR du mod, distinct des captures des utilisateurs (même endpoint et mêmes identifiants). */
export const modBucket = process.env.MOD_STORAGE_BUCKET || 'minemories-mods'
const INDEX_KEY = 'index.json'
const INDEX_TTL_MS = 15_000
const IMMUTABLE = 'public, max-age=31536000, immutable'
const SHORT = 'public, max-age=60, must-revalidate'

export interface ModObject {
	body: ReadableStream<Uint8Array>
	bytes: number
}
/** Lecture seule du bucket des JAR ; remplaçable en test. */
export interface ModObjectSource {
	readText(key: string, signal?: AbortSignal): Promise<string | null>
	open(key: string, signal?: AbortSignal): Promise<ModObject | null>
}

function missing(error: unknown) {
	return error instanceof S3ServiceException && (error.name === 'NoSuchKey' || error.$metadata.httpStatusCode === 404)
}

async function s3Body(key: string, signal?: AbortSignal) {
	const { client } = s3Target()
	try {
		const response = await client.send(
			new GetObjectCommand({ Bucket: modBucket, Key: key }),
			signal ? { abortSignal: signal } : {}
		)
		return response.Body instanceof Readable ? response : null
	} catch (error) {
		if (missing(error)) return null
		throw error
	}
}

export const s3ModSource: ModObjectSource = {
	async readText(key, signal) {
		const response = await s3Body(key, signal)
		if (!response) return null
		const chunks: Buffer[] = []
		for await (const chunk of response.Body as Readable) chunks.push(Buffer.from(chunk))
		return Buffer.concat(chunks).toString('utf8')
	},
	async open(key, signal) {
		const response = await s3Body(key, signal)
		if (!response) return null
		return {
			body: Readable.toWeb(response.Body as Readable) as unknown as ReadableStream<Uint8Array>,
			bytes: response.ContentLength ?? 0,
		}
	},
}

const emptyIndex = (): ModIndex => ({ schema: 1, generatedAt: new Date(0).toISOString(), targets: {} })

/**
 * Routes publiques de téléchargement du mod, sans authentification. Seules les versions listées dans
 * l'index sont servies, et la clé d'objet vient de l'index (jamais des paramètres de l'URL).
 */
export function createModDownloads(source: () => ModObjectSource, ttlMs = INDEX_TTL_MS) {
	const router = new Hono<{ Variables: { correlationId: string } }>()
	let cached: { text: string; etag: string; at: number } | null = null

	async function indexText(signal?: AbortSignal) {
		if (cached && Date.now() - cached.at < ttlMs) return cached
		const text = await source().readText(INDEX_KEY, signal)
		const body = text ?? JSON.stringify(emptyIndex())
		cached = { text: body, etag: `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"`, at: Date.now() }
		return cached
	}
	async function loadIndex(signal?: AbortSignal) {
		const { text } = await indexText(signal)
		return modIndex.parse(JSON.parse(text))
	}

	router.use('*', async (context, next) => {
		await next()
		context.header('X-Content-Type-Options', 'nosniff')
	})
	router.onError((_error, context) => {
		logApiFailure('mod_download_failed', context.get('correlationId'))
		return context.json({ error: 'downloads_unavailable' }, 503, { 'Cache-Control': 'no-store' })
	})

	router.get('/index.json', async context => {
		const { text, etag } = await indexText(context.req.raw.signal)
		modIndex.parse(JSON.parse(text))
		if (context.req.header('If-None-Match') === etag)
			return context.body(null, 304, { ETag: etag, 'Cache-Control': SHORT })
		return context.body(text, 200, {
			'Content-Type': 'application/json; charset=utf-8',
			ETag: etag,
			'Cache-Control': SHORT,
		})
	})

	async function serve(context: Context<{ Variables: { correlationId: string } }>, targetId: string, wanted: string) {
		if (!(modTargetId.safeParse(targetId).success && (wanted === 'latest' || modVersion.safeParse(wanted).success)))
			return context.json({ error: 'invalid_parameter' }, 400)
		const target = (await loadIndex(context.req.raw.signal)).targets[targetId]
		const version = wanted === 'latest' ? target?.latest : wanted
		const entry = target?.versions.find(item => item.version === version)
		if (!entry) return context.json({ error: 'not_found' }, 404)
		const etag = `"${entry.sha256}"`
		const headers = {
			ETag: etag,
			'Cache-Control': wanted === 'latest' ? SHORT : IMMUTABLE,
			'Content-Disposition': `attachment; filename="${modJarName(targetId, entry.version)}"`,
			'Content-Type': 'application/java-archive',
			'X-Content-SHA256': entry.sha256,
			'X-Minemories-Version': entry.version,
		}
		if (context.req.header('If-None-Match') === etag) return context.body(null, 304, headers)
		const object = await source().open(entry.key, context.req.raw.signal)
		if (!object) return context.json({ error: 'not_found' }, 404)
		return context.body(object.body, 200, { ...headers, 'Content-Length': String(entry.bytes) })
	}
	router.get('/:targetId/latest', context => serve(context, context.req.param('targetId'), 'latest'))
	router.get('/:targetId/:version', context =>
		serve(context, context.req.param('targetId'), context.req.param('version'))
	)
	return router
}

export const modDownloads = createModDownloads(() => s3ModSource)
