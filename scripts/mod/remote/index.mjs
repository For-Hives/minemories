// "PC" mode: instead of writing to S3 with the S3 keys, the tool UPLOADS each JAR to the API
// (`PUT {MOD_API_URL}/downloads/upload/<id>/<version>`), which writes to the bucket itself. The S3 keys stay on the
// server; only the MOD_UPLOAD_TOKEN token (environment variable or .env, never an argument) leaves the PC.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { builtByFrom } from '../build.mjs'
import { mapSequentially } from '../sequence.mjs'

export const DEFAULT_API_URL = 'https://api.minemories.net'
export const MIN_TOKEN_LENGTH = 32
export const MAX_ATTEMPTS = 4
const BACKOFF_MS = 1000
const CONFIRM_ATTEMPTS = 3
const REQUEST_TIMEOUT_MS = 5 * 60_000
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const trailingSlashes = /\/+$/
const shortFields = ['id', 'version', 'minecraft', 'loader', 'loaderVersion', 'java', 'fabricApi', 'commit', 'builtAt']

/** Masks the token in a text (log, error message, response body, notification). */
export function maskToken(text, token) {
	const value = String(text ?? '')
	return token ? value.split(token).join('[masked]') : value
}

/** API URL: `--api-url`, then MOD_API_URL, then production. Plain HTTP is refused outside the local machine. */
export function resolveApiUrl({ flag, env = process.env } = {}) {
	const raw = flag || env.MOD_API_URL || DEFAULT_API_URL
	let url
	try {
		url = new URL(raw)
	} catch {
		throw new Error(`Invalid API URL: ${maskToken(raw, env.MOD_UPLOAD_TOKEN)}`)
	}
	if (url.username || url.password) throw new Error('The API URL must not contain any credentials.')
	if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)))
		throw new Error('The API URL must use HTTPS (plain HTTP is only accepted for localhost).')
	return `${url.origin}${url.pathname.replace(trailingSlashes, '')}`
}

export function readToken(env = process.env) {
	const token = env.MOD_UPLOAD_TOKEN
	if (!token) throw new Error('MOD_UPLOAD_TOKEN is missing (environment variable or .env, never as an argument).')
	if (token.length < MIN_TOKEN_LENGTH)
		throw new Error(`MOD_UPLOAD_TOKEN is too short (${MIN_TOKEN_LENGTH} characters minimum).`)
	return token
}

/** Checks the URL and the token before a long build. */
export function resolveRemote({ apiUrl, env = process.env } = {}) {
	return { apiUrl: resolveApiUrl({ flag: apiUrl, env }), token: readToken(env) }
}

async function readManifest(file) {
	try {
		return JSON.parse(await readFile(join(dirname(file), 'manifest.json'), 'utf8'))
	} catch {
		throw new Error(`manifest.json not found next to ${file}: run "bun mod build" again.`)
	}
}

/** Subset of the build manifest sent to the API (X-Mod-Manifest header, base64url JSON). */
export async function encodeManifest(artifact, version, env) {
	const manifest = artifact.manifest ?? (await readManifest(artifact.file ?? artifact.filePath))
	const picked = Object.fromEntries(shortFields.filter(key => manifest[key] != null).map(key => [key, manifest[key]]))
	const built = { ...picked, version, builtBy: manifest.builtBy ?? builtByFrom(env) }
	return Buffer.from(JSON.stringify(built)).toString('base64url')
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const retryable = status => status >= 500

async function sendOnce({ fetchImpl, url, headers, body }) {
	try {
		const response = await fetchImpl(url, {
			method: 'PUT',
			headers,
			body,
			redirect: 'error',
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		})
		const text = await response.text()
		let json = null
		try {
			json = JSON.parse(text)
		} catch {
			// non-JSON body: only the status matters
		}
		return { status: response.status, json }
	} catch (error) {
		return { network: error.message }
	}
}

const describeFailure = result =>
	result.network ?? `HTTP ${result.status}${result.json?.error ? ` (${result.json.error})` : ''}`

function sendWithRetry(request, { sleep, attempts, log }) {
	const send = async attempt => {
		const result = await sendOnce(request)
		if (!(result.network || retryable(result.status)) || attempt >= attempts) return result
		log.warn(`  retry ${attempt}/${attempts - 1}: ${describeFailure(result)}`)
		await sleep(BACKOFF_MS * 2 ** (attempt - 1))
		return send(attempt + 1)
	}
	return attempts >= 1 ? send(1) : undefined
}

async function uploadOne({ artifact, version, apiUrl, token, env, fetchImpl, sleep, attempts, replace, log }) {
	const { targetId } = artifact
	const file = artifact.file ?? artifact.filePath
	const bytes = await readFile(file)
	const sha256 = createHash('sha256').update(bytes).digest('hex')
	if (artifact.sha256 && artifact.sha256 !== sha256) throw new Error(`unexpected sha256 for ${file}.`)
	const headers = {
		Authorization: `Bearer ${token}`,
		'Content-Type': 'application/java-archive',
		'X-Content-SHA256': sha256,
		'X-Mod-Manifest': await encodeManifest(artifact, version, env),
	}
	const url = `${apiUrl}/downloads/upload/${encodeURIComponent(targetId)}/${encodeURIComponent(version)}${replace ? '?replace=1' : ''}`
	const result = await sendWithRetry({ fetchImpl, url, headers, body: bytes }, { sleep, attempts, log })
	if (result.status !== 200) throw new Error(describeFailure(result))
	if (!(result.json?.ok === true && result.json.sha256 === sha256))
		throw new Error('the API returned a SHA-256 that does not match the file.')
	return { sha256, bytes: bytes.length, latest: Boolean(result.json.latest), replaced: Boolean(result.json.replaced) }
}

/** Public index of the API (what the site sees), uncached. */
export async function fetchPublicIndex({ apiUrl, fetchImpl = fetch }) {
	const response = await fetchImpl(`${apiUrl}/downloads/index.json?t=${Date.now()}`, {
		headers: { 'Cache-Control': 'no-cache' },
		redirect: 'error',
		signal: AbortSignal.timeout(30_000),
	})
	if (response.status !== 200) throw new Error(`Could not read the published index: HTTP ${response.status}.`)
	return response.json()
}

/** Same shape as `storageReport` so that `bun mod status --remote` reuses the display. */
export async function remoteReport({ apiUrl, fetchImpl }) {
	const index = await fetchPublicIndex({ apiUrl, fetchImpl })
	const perTarget = {}
	let totalBytes = 0
	for (const [id, target] of Object.entries(index.targets ?? {})) {
		const bytes = target.versions.reduce((sum, entry) => sum + entry.bytes, 0)
		perTarget[id] = { versions: target.versions.length, bytes, latest: target.latest }
		totalBytes += bytes
	}
	return { totalBytes, perTarget }
}

const published = (index, { targetId, version, sha256 }) =>
	index.targets?.[targetId]?.versions?.some(entry => entry.version === version && entry.sha256 === sha256) === true

async function confirm({ results, version, apiUrl, fetchImpl, sleep, log }) {
	const pending = () => results.filter(result => result.status === 'sent' && !result.confirmed)
	const poll = async attempt => {
		if (attempt > CONFIRM_ATTEMPTS || pending().length === 0) return
		try {
			const index = await fetchPublicIndex({ apiUrl, fetchImpl })
			for (const result of pending()) result.confirmed = published(index, { ...result, version })
		} catch (error) {
			for (const result of pending()) result.confirmError = error.message
		}
		if (pending().length > 0 && attempt < CONFIRM_ATTEMPTS) await sleep(BACKOFF_MS * attempt)
		await poll(attempt + 1)
	}
	await poll(1)
	for (const result of pending()) {
		result.status = 'failed'
		result.message = result.confirmError ?? 'version missing from the published index after the upload.'
		log.error(`✗ ${result.targetId}: ${result.message}`)
	}
}

/**
 * Uploads each JAR to the API. A failing target does not stop the others. Resolves
 * `{ ok, apiUrl, results: [{ targetId, status: 'sent' | 'failed', confirmed?, message?, sha256?, bytes?, latest?, replaced? }] }`.
 * @param {{ config?: object, version: string, artifacts: { targetId: string, file?: string, filePath?: string,
 *   bytes?: number, sha256?: string, manifest?: object }[], env?: Record<string, string|undefined>,
 *   fetchImpl?: typeof fetch, apiUrl?: string, replace?: boolean, sleep?: (ms: number) => Promise<void>,
 *   attempts?: number, log?: { info: Function, warn: Function, error: Function } }} options
 */
export async function uploadRelease({
	version,
	artifacts,
	env = process.env,
	fetchImpl = fetch,
	apiUrl: apiUrlOption,
	replace = false,
	sleep = wait,
	attempts = MAX_ATTEMPTS,
	log: rawLog = console,
}) {
	const { apiUrl, token } = resolveRemote({ apiUrl: apiUrlOption, env })
	const log = {
		info: message => rawLog.info(maskToken(message, token)),
		warn: message => rawLog.warn(maskToken(message, token)),
		error: message => rawLog.error(maskToken(message, token)),
	}
	log.info(`Uploading to ${apiUrl}: ${artifacts.length} artifact(s).`)
	const results = await mapSequentially(artifacts, async artifact => {
		const { targetId } = artifact
		log.info(`▶ uploading ${targetId} ${version}`)
		try {
			const sent = await uploadOne({
				artifact,
				version,
				apiUrl,
				token,
				env,
				fetchImpl,
				sleep,
				attempts,
				replace,
				log,
			})
			return { targetId, status: 'sent', ...sent }
		} catch (error) {
			const message = maskToken(error.message, token)
			log.error(`✗ ${targetId}: ${message}`)
			return { targetId, status: 'failed', message }
		}
	})
	await confirm({ results, version, apiUrl, fetchImpl, sleep, log })
	for (const result of results.filter(r => r.status === 'sent'))
		log.info(`✓ ${result.targetId} published${result.latest ? ' (latest)' : ''}${result.replaced ? ' (replaced)' : ''}`)
	return { ok: results.every(result => result.status === 'sent'), apiUrl, results }
}

/** One-line-per-target summary, for the end of a release or a push. */
export function summarizeUpload({ results }) {
	const sent = results.filter(result => result.status === 'sent')
	const failed = results.filter(result => result.status === 'failed')
	const lines = results.map(result =>
		result.status === 'sent' ? `  ✓ ${result.targetId}` : `  ✗ ${result.targetId}: ${result.message}`
	)
	return [...lines, '', `${sent.length} target(s) uploaded, ${failed.length} failed.`].join('\n')
}
