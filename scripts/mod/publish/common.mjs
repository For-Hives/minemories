// Shared helpers of the third-party publishers: catalog file, release type, request description for --dry-run.
import { readFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { redactSecrets } from '../notify.mjs'

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const BETA = /-(?:beta|alpha|rc)(?:\.|$)/
const ALPHA = /-alpha(?:\.|$)/
const REQUEST_TIMEOUT_MS = 120_000

export async function loadCatalogs(root = repositoryRoot) {
	return JSON.parse(await readFile(join(root, 'mod', 'catalogs.json'), 'utf8'))
}

/** 'release' for a plain version, 'beta' for -beta.N / -rc.N, 'alpha' for -alpha.N. */
export function releaseType(version) {
	if (ALPHA.test(version)) return 'alpha'
	return BETA.test(version) ? 'beta' : 'release'
}

/** The loader + Minecraft version of a target, from the configuration. */
export function findTarget(config, targetId) {
	return (config?.targets ?? []).find(target => target.id === targetId) ?? null
}

/** Human checklist of what is missing for a platform; empty when it can publish. */
export function missingItems({ name, settings, tokenName, env }) {
	const missing = []
	if (settings?.enabled !== true) missing.push(`set "${name}.enabled" to true in mod/catalogs.json`)
	if (!settings?.projectId) missing.push(`fill in "${name}.projectId" in mod/catalogs.json (create the project first)`)
	if (!env[tokenName]) missing.push(`define ${tokenName} in the environment (never in a repository file)`)
	return missing
}

export function skippedMessage(platformLabel, missing) {
	return `${platformLabel} not published, still to do: ${missing.join('; ')}`
}

export async function readArtifact(artifact, readImpl = readFile) {
	const data = await readImpl(artifact.filePath)
	return { data, name: basename(artifact.filePath) }
}

/** Masks every value that could be a secret in a printed request. */
export function maskedHeaders(headers, secrets) {
	const out = {}
	for (const [name, value] of Object.entries(headers)) {
		out[name] = secrets.some(secret => secret && String(value).includes(secret)) ? '***' : value
	}
	return out
}

/** A request description that is safe to print: headers masked, file reduced to its name and size. */
export function describeRequest({ method, url, headers, fields = {}, artifact }, env) {
	const secrets = [env.MODRINTH_TOKEN, env.CURSEFORGE_TOKEN]
	return redactSecrets(
		JSON.stringify(
			{
				method,
				url,
				headers: maskedHeaders(headers, secrets),
				fields,
				file: artifact
					? { name: basename(artifact.filePath), bytes: artifact.bytes, sha256: artifact.sha256 }
					: undefined,
			},
			null,
			2
		),
		env
	)
}

/** fetch with a timeout and a readable error; the caller decides what to do with non-2xx. */
export async function request(fetchImpl, url, init) {
	return await fetchImpl(url, { ...init, signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
}

export async function errorDetail(response, env) {
	let body = ''
	try {
		body = await response.text()
	} catch {
		body = ''
	}
	return redactSecrets(`HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}`, env)
}

/** Fails soft: converts an exception into a message without any secret. */
export function errorMessage(error, env) {
	return redactSecrets(error?.message ?? String(error), env)
}
