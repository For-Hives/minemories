import { createHash, timingSafeEqual } from 'node:crypto'
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	type ModUploadManifest,
	modJarName,
	modTargetId,
	modUploadManifest,
	modVersion,
} from '@minemories/api-contract'
import {
	ModStorageConflictError,
	type S3Like,
	type StoreUploadOptions,
	type StoreUploadResult,
	storeUpload,
} from '@minemories/mod-storage'
import { Hono } from 'hono'
import { inspectJar } from './mod-jar'
import { pairingAddress } from './pairing-protection'
import { logApiFailure } from './safe-errors'
import { s3Target } from './storage-s3'

const MIN_TOKEN_LENGTH = 32
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024
const DEFAULT_KEEP = 3
const MANIFEST_HEADER_MAX = 4096
const FAILURE_WINDOW_MS = 60_000
const MAX_FAILURES = 10
const MAX_TRACKED_ADDRESSES = 4096
const MAX_CONCURRENT_RECEIVES = 2
const sha256Pattern = /^[a-f0-9]{64}$/
const base64urlPattern = /^[A-Za-z0-9_-]+$/
const digits = /^[0-9]+$/
const bearerPrefix = 'Bearer '

type Variables = { correlationId: string }
type Bindings = { peerAddress: string | undefined }
type Env = Record<string, string | undefined>

export interface ModUploadOptions {
	env?: () => Env
	/** Remplaçable en test ; par défaut le client S3 de l'API (mêmes identifiants que les téléchargements). */
	client?: () => S3Like
	store?: (options: StoreUploadOptions) => Promise<StoreUploadResult>
	/** Appelé après un envoi qui a modifié le bucket (invalide le cache de l'index public). */
	onStored?: () => void
	now?: () => number
}

/** Exclusion mutuelle des mises à jour de l'index : un seul écrivain à la fois dans ce processus. */
class Mutex {
	private tail: Promise<unknown> = Promise.resolve()
	run<T>(task: () => Promise<T>): Promise<T> {
		const result = this.tail.then(task, task)
		this.tail = result.catch(() => undefined)
		return result
	}
}

/** Tentatives d'authentification échouées par adresse : au-delà du plafond, la route répond 429. */
class FailureLimiter {
	private readonly windows = new Map<string, { startedAt: number; failures: number }>()

	blocked(address: string, now: number): boolean {
		const window = this.windows.get(address)
		if (!window) return false
		if (now - window.startedAt >= FAILURE_WINDOW_MS) {
			this.windows.delete(address)
			return false
		}
		return window.failures >= MAX_FAILURES
	}

	fail(address: string, now: number): void {
		const window = this.windows.get(address)
		if (window && now - window.startedAt < FAILURE_WINDOW_MS) {
			window.failures += 1
			return
		}
		if (this.windows.size >= MAX_TRACKED_ADDRESSES) this.windows.clear()
		this.windows.set(address, { startedAt: now, failures: 1 })
	}
}

function digest(value: string) {
	return createHash('sha256').update(value).digest()
}

/** Comparaison à temps constant (empreintes de même longueur). */
export function tokenMatches(supplied: string, expected: string): boolean {
	return timingSafeEqual(digest(supplied), digest(expected))
}

function positiveInteger(value: string | undefined, fallback: number) {
	const parsed = Number(value)
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function decodeManifest(header: string | null | undefined) {
	if (!header || header.length > MANIFEST_HEADER_MAX || !base64urlPattern.test(header)) return null
	try {
		return modUploadManifest.safeParse(JSON.parse(Buffer.from(header, 'base64url').toString('utf8')))
	} catch {
		return null
	}
}

type Received = { bytes: number; sha256: string } | 'too_large' | 'length_mismatch'

/** Écrit le corps en flux dans `file` en le hachant ; ne garde jamais plus d'un morceau en mémoire. */
async function receive(body: ReadableStream<Uint8Array>, file: string, declared: number): Promise<Received> {
	const hash = createHash('sha256')
	const handle = await open(file, 'w', 0o600)
	const reader = body.getReader()
	let bytes = 0
	try {
		while (true) {
			// biome-ignore lint/performance/noAwaitInLoops: la lecture séquentielle borne la mémoire et la taille.
			const { value, done } = await reader.read()
			if (done) break
			bytes += value.byteLength
			if (bytes > declared) {
				await reader.cancel().catch(() => undefined)
				return 'too_large'
			}
			hash.update(value)
			await handle.write(value)
		}
	} finally {
		await handle.close()
	}
	return bytes === declared ? { bytes, sha256: hash.digest('hex') } : 'length_mismatch'
}

const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }

type Status = 400 | 401 | 404 | 409 | 411 | 413 | 422 | 429 | 503
interface Failure {
	status: Status
	error: string
	retryAfter?: string
}
const fail = (status: Status, error: string, retryAfter?: string): Failure => ({
	status,
	error,
	...(retryAfter ? { retryAfter } : {}),
})

interface Accepted {
	targetId: string
	version: string
	declared: number
	sha256: string
	manifest: ModUploadManifest
	replace: boolean
	keep: number
}

/** Valide les paramètres, les en-têtes et le manifeste ; ne lit pas le corps. */
function validate(request: Request, params: { targetId: string; version: string }, env: Env): Failure | Accepted {
	const { targetId, version } = params
	if (!(modTargetId.safeParse(targetId).success && modVersion.safeParse(version).success))
		return fail(400, 'invalid_parameter')
	const rawLength = request.headers.get('content-length')
	if (!rawLength) return fail(411, 'length_required')
	const declared = digits.test(rawLength) ? Number(rawLength) : 0
	if (declared < 1 || !request.body) return fail(400, 'invalid_length')
	if (declared > positiveInteger(env.MOD_UPLOAD_MAX_BYTES, DEFAULT_MAX_BYTES)) return fail(413, 'too_large')
	const sha256 = request.headers.get('x-content-sha256') ?? ''
	if (!sha256Pattern.test(sha256)) return fail(400, 'invalid_sha256')
	const parsed = decodeManifest(request.headers.get('x-mod-manifest'))
	if (!parsed?.success) return fail(400, 'invalid_manifest')
	const manifest = parsed.data
	if (
		manifest.id !== targetId ||
		manifest.version !== version ||
		`${manifest.loader}-mc${manifest.minecraft}` !== targetId
	)
		return fail(422, 'manifest_mismatch')
	return {
		targetId,
		version,
		declared,
		sha256,
		manifest,
		replace: new URL(request.url).searchParams.get('replace') === '1',
		keep: positiveInteger(env.MOD_STORAGE_KEEP, DEFAULT_KEEP),
	}
}

/**
 * Envoi d'un JAR depuis le PC du propriétaire : `PUT /:targetId/:version`, corps = octets du JAR. L'API écrit
 * elle-même dans S3 : les clés S3 ne quittent jamais le serveur. La route n'existe (404) que si `MOD_UPLOAD_TOKEN`
 * (32 caractères minimum) est défini. Une seule instance d'API doit servir cette route (le verrou est en mémoire).
 */
export function createModUploads(options: ModUploadOptions = {}) {
	const readEnv = options.env ?? (() => process.env)
	const store = options.store ?? storeUpload
	const client = options.client ?? (() => s3Target().client as S3Like)
	const now = options.now ?? Date.now
	const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()
	const limiter = new FailureLimiter()
	const mutex = new Mutex()
	let receiving = 0

	function authenticate(request: Request, peerAddress: string | undefined, env: Env): Failure | null {
		const token = env.MOD_UPLOAD_TOKEN ?? ''
		if (token.length < MIN_TOKEN_LENGTH) return fail(404, 'not_found')
		const trusted = new Set(
			(env.TRUSTED_PROXY_IPS ?? '')
				.split(',')
				.map(item => item.trim())
				.filter(Boolean)
		)
		const address = pairingAddress(peerAddress, request.headers, trusted)
		if (limiter.blocked(address, now())) return fail(429, 'too_many_attempts', '60')
		const authorization = request.headers.get('authorization') ?? ''
		const supplied = authorization.startsWith(bearerPrefix) ? authorization.slice(bearerPrefix.length) : ''
		if (supplied && tokenMatches(supplied, token)) return null
		limiter.fail(address, now())
		return fail(401, 'unauthorized')
	}

	async function handle(
		accepted: Accepted,
		body: ReadableStream<Uint8Array>,
		env: Env
	): Promise<Failure | (StoreUploadResult & { bytes: number })> {
		const { targetId, version, manifest } = accepted
		const directory = await mkdtemp(join(tmpdir(), 'minemories-mod-upload-'))
		try {
			const name = modJarName(targetId, version)
			const file = join(directory, name)
			const received = await receive(body, file, accepted.declared)
			if (received === 'too_large') return fail(413, 'too_large')
			if (received === 'length_mismatch') return fail(400, 'length_mismatch')
			if (received.sha256 !== accepted.sha256) return fail(422, 'sha256_mismatch')
			if ((await inspectJar(file)) !== 'ok') return fail(422, 'invalid_jar')
			await writeFile(`${file}.sha256`, `${received.sha256}  ${name}\n`)
			const sidecar = { ...manifest, file: name, bytes: received.bytes, sha256: received.sha256 }
			await writeFile(join(directory, 'manifest.json'), `${JSON.stringify(sidecar, null, '\t')}\n`)
			const result = await mutex.run(() =>
				store({
					target: {
						id: manifest.id,
						loader: manifest.loader,
						minecraft: manifest.minecraft,
						loaderVersion: manifest.loaderVersion,
						java: manifest.java,
						...(manifest.fabricApi ? { fabricApi: manifest.fabricApi } : {}),
					},
					version,
					commit: manifest.commit,
					builtAt: manifest.builtAt,
					builtBy: manifest.builtBy,
					file,
					bytes: received.bytes,
					sha256: received.sha256,
					replace: accepted.replace,
					keep: accepted.keep,
					env,
					client: client(),
				})
			)
			if (!result.unchanged) options.onStored?.()
			return { ...result, bytes: received.bytes }
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	}

	router.put('/:targetId/:version', async context => {
		const env = readEnv()
		const request = context.req.raw
		const reply = (failure: Failure) => {
			if (failure.retryAfter) context.header('Retry-After', failure.retryAfter)
			return context.json({ error: failure.error }, failure.status, noStore)
		}
		const denied = authenticate(request, context.env?.peerAddress, env)
		if (denied) return reply(denied)
		const accepted = validate(request, context.req.param(), env)
		if ('status' in accepted) return reply(accepted)
		if (!request.body || receiving >= MAX_CONCURRENT_RECEIVES) return reply(fail(503, 'busy', '5'))
		receiving += 1
		try {
			const outcome = await handle(accepted, request.body, env)
			if ('status' in outcome) return reply(outcome)
			return context.json(
				{
					ok: true,
					targetId: accepted.targetId,
					version: accepted.version,
					sha256: accepted.sha256,
					bytes: outcome.bytes,
					latest: outcome.latest,
					replaced: outcome.replaced,
				},
				200,
				noStore
			)
		} catch (error) {
			if (error instanceof ModStorageConflictError) return reply(fail(409, 'version_exists'))
			throw error
		} finally {
			receiving -= 1
		}
	})

	router.onError((_error, context) => {
		logApiFailure('mod_upload_failed', context.get('correlationId'))
		return context.json({ error: 'upload_unavailable' }, 503, noStore)
	})
	return router
}
