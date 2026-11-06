// Mode « PC » : au lieu d'écrire dans S3 avec les clés S3, l'outil ENVOIE chaque JAR à l'API
// (`PUT {MOD_API_URL}/downloads/upload/<id>/<version>`), qui écrit elle-même dans le bucket. Les clés S3 restent sur
// le serveur ; seul le jeton MOD_UPLOAD_TOKEN (variable d'environnement ou .env, jamais un argument) quitte le PC.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { builtByFrom } from '../build.mjs'

export const DEFAULT_API_URL = 'https://api.minemories.net'
export const MIN_TOKEN_LENGTH = 32
export const MAX_ATTEMPTS = 4
const BACKOFF_MS = 1000
const CONFIRM_ATTEMPTS = 3
const REQUEST_TIMEOUT_MS = 5 * 60_000
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const trailingSlashes = /\/+$/
const shortFields = ['id', 'version', 'minecraft', 'loader', 'loaderVersion', 'java', 'fabricApi', 'commit', 'builtAt']

/** Masque le jeton dans un texte (journal, message d'erreur, corps de réponse, notification). */
export function maskToken(text, token) {
	const value = String(text ?? '')
	return token ? value.split(token).join('[masqué]') : value
}

/** URL de l'API : `--api-url`, puis MOD_API_URL, puis la production. HTTP clair refusé hors machine locale. */
export function resolveApiUrl({ flag, env = process.env } = {}) {
	const raw = flag || env.MOD_API_URL || DEFAULT_API_URL
	let url
	try {
		url = new URL(raw)
	} catch {
		throw new Error(`URL de l'API invalide : ${maskToken(raw, env.MOD_UPLOAD_TOKEN)}`)
	}
	if (url.username || url.password) throw new Error("L'URL de l'API ne doit contenir aucun identifiant.")
	if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)))
		throw new Error("L'URL de l'API doit être en HTTPS (HTTP clair accepté seulement pour localhost).")
	return `${url.origin}${url.pathname.replace(trailingSlashes, '')}`
}

export function readToken(env = process.env) {
	const token = env.MOD_UPLOAD_TOKEN
	if (!token) throw new Error("MOD_UPLOAD_TOKEN est absent (variable d'environnement ou .env, jamais en argument).")
	if (token.length < MIN_TOKEN_LENGTH)
		throw new Error(`MOD_UPLOAD_TOKEN est trop court (${MIN_TOKEN_LENGTH} caractères au minimum).`)
	return token
}

/** Vérifie l'URL et le jeton avant un long build. */
export function resolveRemote({ apiUrl, env = process.env } = {}) {
	return { apiUrl: resolveApiUrl({ flag: apiUrl, env }), token: readToken(env) }
}

async function readManifest(file) {
	try {
		return JSON.parse(await readFile(join(dirname(file), 'manifest.json'), 'utf8'))
	} catch {
		throw new Error(`manifest.json introuvable à côté de ${file} : relancer « bun mod build ».`)
	}
}

/** Sous-ensemble du manifest de build envoyé à l'API (en-tête X-Mod-Manifest, JSON en base64url). */
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
			// corps non JSON : seul le statut compte
		}
		return { status: response.status, json }
	} catch (error) {
		return { network: error.message }
	}
}

const describeFailure = result =>
	result.network ?? `HTTP ${result.status}${result.json?.error ? ` (${result.json.error})` : ''}`

async function sendWithRetry(request, { sleep, attempts, log }) {
	let result
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		result = await sendOnce(request)
		if (!(result.network || retryable(result.status))) return result
		if (attempt < attempts) {
			log.warn(`  nouvelle tentative ${attempt}/${attempts - 1} : ${describeFailure(result)}`)
			await sleep(BACKOFF_MS * 2 ** (attempt - 1))
		}
	}
	return result
}

async function uploadOne({ artifact, version, apiUrl, token, env, fetchImpl, sleep, attempts, replace, log }) {
	const { targetId } = artifact
	const file = artifact.file ?? artifact.filePath
	const bytes = await readFile(file)
	const sha256 = createHash('sha256').update(bytes).digest('hex')
	if (artifact.sha256 && artifact.sha256 !== sha256) throw new Error(`sha256 inattendu pour ${file}.`)
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
		throw new Error("l'API a renvoyé un SHA-256 différent de celui du fichier.")
	return { sha256, bytes: bytes.length, latest: Boolean(result.json.latest), replaced: Boolean(result.json.replaced) }
}

/** Index public de l'API (ce que voit le site), sans cache. */
export async function fetchPublicIndex({ apiUrl, fetchImpl = fetch }) {
	const response = await fetchImpl(`${apiUrl}/downloads/index.json?t=${Date.now()}`, {
		headers: { 'Cache-Control': 'no-cache' },
		redirect: 'error',
		signal: AbortSignal.timeout(30_000),
	})
	if (response.status !== 200) throw new Error(`Lecture de l'index publié impossible : HTTP ${response.status}.`)
	return response.json()
}

/** Même forme que `storageReport` pour que `bun mod status --remote` réutilise l'affichage. */
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
	for (let attempt = 1; attempt <= CONFIRM_ATTEMPTS && pending().length > 0; attempt += 1) {
		try {
			const index = await fetchPublicIndex({ apiUrl, fetchImpl })
			for (const result of pending()) result.confirmed = published(index, { ...result, version })
		} catch (error) {
			for (const result of pending()) result.confirmError = error.message
		}
		if (pending().length > 0 && attempt < CONFIRM_ATTEMPTS) await sleep(BACKOFF_MS * attempt)
	}
	for (const result of pending()) {
		result.status = 'failed'
		result.message = result.confirmError ?? "version absente de l'index publié après l'envoi."
		log.error(`✗ ${result.targetId} : ${result.message}`)
	}
}

/**
 * Envoie chaque JAR à l'API. L'échec d'une cible n'empêche pas les autres. Résout
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
	log.info(`Envoi vers ${apiUrl} : ${artifacts.length} artefact(s).`)
	const results = []
	for (const artifact of artifacts) {
		const { targetId } = artifact
		log.info(`▶ envoi ${targetId} ${version}`)
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
			results.push({ targetId, status: 'sent', ...sent })
		} catch (error) {
			const message = maskToken(error.message, token)
			log.error(`✗ ${targetId} : ${message}`)
			results.push({ targetId, status: 'failed', message })
		}
	}
	await confirm({ results, version, apiUrl, fetchImpl, sleep, log })
	for (const result of results.filter(r => r.status === 'sent'))
		log.info(`✓ ${result.targetId} publié${result.latest ? ' (latest)' : ''}${result.replaced ? ' (remplacé)' : ''}`)
	return { ok: results.every(result => result.status === 'sent'), apiUrl, results }
}

/** Résumé en une ligne par cible, pour la fin d'une release ou d'un push. */
export function summarizeUpload({ results }) {
	const sent = results.filter(result => result.status === 'sent')
	const failed = results.filter(result => result.status === 'failed')
	const lines = results.map(result =>
		result.status === 'sent' ? `  ✓ ${result.targetId}` : `  ✗ ${result.targetId} : ${result.message}`
	)
	return [...lines, '', `${sent.length} cible(s) envoyée(s), ${failed.length} échec(s).`].join('\n')
}
