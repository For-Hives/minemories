// Modrinth publisher (API v2, https://docs.modrinth.com/api/operations/createversion/).
// POST /v2/version, multipart: `data` (JSON) + the file(s) named by `file_parts`. The token goes in the
// `Authorization` header as is (no "Bearer"); a descriptive User-Agent is mandatory.
import { createHash } from 'node:crypto'
import {
	describeRequest,
	errorDetail,
	errorMessage,
	findTarget,
	missingItems,
	readArtifact,
	releaseType,
	request,
	skippedMessage,
} from './common.mjs'

export const MODRINTH_API = 'https://api.modrinth.com/v2'
const PLACEHOLDER_PROJECT = '<projectId>'
const FILE_PART = 'file'

export function userAgent(catalog, version) {
	return `For-Hives/minemories/${version} (${catalog.contact ?? 'https://github.com/For-Hives/minemories'})`
}

/** Unique per Minecraft version and loader: Modrinth lists versions of all loaders in one project. */
export function versionNumber(release, target) {
	return `${release.version}+${target.loader}-mc${target.minecraft}`
}

export function versionName(release, target, label = 'Minemories') {
	return `${label} ${release.version} (${target.loader} ${target.minecraft})`
}

/** The `data` JSON of POST /v2/version. */
export function buildVersionData({ catalog, mapping, release, target, projectId, dependencies }) {
	return {
		project_id: projectId,
		name: versionName(release, target),
		version_number: versionNumber(release, target),
		changelog: release.changelog ?? '',
		dependencies,
		game_versions: [target.minecraft],
		version_type: releaseType(release.version),
		loaders: [mapping.modrinth],
		featured: catalog.featured !== false,
		status: 'listed',
		file_parts: [FILE_PART],
		primary_file: FILE_PART,
	}
}

export function versionUrl(catalog, created) {
	return `https://modrinth.com/mod/${catalog.slug ?? created.project_id}/version/${created.id}`
}

async function resolveDependencies({ catalog, loader, env, dryRun, fetchImpl, cache }) {
	const wanted = catalog.dependencies?.[loader] ?? []
	const out = []
	for (const dependency of wanted) {
		let projectId = dependency.slug
		if (!dryRun) {
			if (!cache.has(dependency.slug)) {
				// biome-ignore lint/performance/noAwaitInLoops: at most one or two dependencies, resolved once.
				const response = await request(fetchImpl, `${MODRINTH_API}/project/${encodeURIComponent(dependency.slug)}`, {
					headers: { 'User-Agent': 'minemories', Authorization: env.MODRINTH_TOKEN },
				})
				if (!response.ok)
					throw new Error(`dépendance ${dependency.slug} introuvable (${await errorDetail(response, env)})`)
				cache.set(dependency.slug, (await response.json()).id)
			}
			projectId = cache.get(dependency.slug)
		}
		out.push({ project_id: projectId, dependency_type: dependency.type ?? 'required' })
	}
	return out
}

/** The existing version with the same number for this loader and Minecraft version, or null. */
export async function findExistingVersion({ projectId, target, mapping, number, headers, fetchImpl, env }) {
	const query = new URLSearchParams({
		loaders: JSON.stringify([mapping.modrinth]),
		game_versions: JSON.stringify([target.minecraft]),
	})
	const response = await request(fetchImpl, `${MODRINTH_API}/project/${projectId}/version?${query}`, { headers })
	if (!response.ok) throw new Error(`liste des versions impossible (${await errorDetail(response, env)})`)
	const versions = await response.json()
	return versions.find(version => version.version_number === number) ?? null
}

async function upload({ artifact, data, headers, readImpl, fetchImpl, env, catalog, number }) {
	const file = await readArtifact(artifact, readImpl)
	if (artifact.sha256 && createHash('sha256').update(file.data).digest('hex') !== artifact.sha256) {
		return { status: 'failed', message: 'empreinte SHA-256 différente de celle du build, envoi annulé' }
	}
	const form = new FormData()
	form.set('data', JSON.stringify(data))
	form.set(FILE_PART, new Blob([file.data], { type: 'application/java-archive' }), file.name)
	const response = await request(fetchImpl, `${MODRINTH_API}/version`, { method: 'POST', headers, body: form })
	if (!response.ok) return { status: 'failed', message: await errorDetail(response, env) }
	const created = await response.json()
	return { status: 'published', url: versionUrl(catalog, created), message: number }
}

async function publishOne(context, artifact) {
	const { config, catalog, catalogs, release, env, dryRun, fetchImpl, readImpl, missing, depCache } = context
	const result = fields => ({ platform: 'modrinth', targetId: artifact.targetId, ...fields })
	const target = findTarget(config, artifact.targetId)
	if (!target) return result({ status: 'failed', message: `cible inconnue : ${artifact.targetId}` })
	const mapping = catalogs.mapping?.[target.loader]
	if (!mapping?.modrinth) {
		return result({
			status: 'skipped',
			message: `aucun chargeur Modrinth pour "${target.loader}" dans mod/catalogs.json (mapping)`,
		})
	}
	if (release.published?.modrinth?.[artifact.targetId]) {
		return result({
			status: 'skipped',
			url: release.published.modrinth[artifact.targetId],
			message: 'déjà publié (index du site)',
		})
	}
	if (missing.length > 0 && !dryRun) return result({ status: 'skipped', message: skippedMessage('Modrinth', missing) })
	const projectId = catalog.projectId ?? PLACEHOLDER_PROJECT
	const headers = {
		'User-Agent': userAgent(catalog, release.version),
		Authorization: env.MODRINTH_TOKEN ?? '<MODRINTH_TOKEN>',
	}
	try {
		const number = versionNumber(release, target)
		if (!dryRun) {
			const existing = await findExistingVersion({ projectId, target, mapping, number, headers, fetchImpl, env })
			if (existing) {
				return result({ status: 'skipped', url: versionUrl(catalog, existing), message: `déjà publié (${number})` })
			}
		}
		const dependencies = await resolveDependencies({
			catalog,
			loader: target.loader,
			env,
			dryRun,
			fetchImpl,
			cache: depCache,
		})
		const data = buildVersionData({ catalog, mapping, release, target, projectId, dependencies })
		if (dryRun) {
			const description = describeRequest(
				{ method: 'POST', url: `${MODRINTH_API}/version`, headers, fields: { data }, artifact },
				env
			)
			const note = missing.length > 0 ? ` (publication réelle impossible : ${missing.join(' ; ')})` : ''
			return result({ status: 'skipped', message: `dry-run : requête construite${note}`, request: description })
		}
		return result(await upload({ artifact, data, headers, readImpl, fetchImpl, env, catalog, number }))
	} catch (error) {
		return result({ status: 'failed', message: errorMessage(error, env) })
	}
}

/** Publishes every artifact to Modrinth (sequentially). Never throws. */
export async function publishModrinth({ config, catalogs, release, env, dryRun, fetchImpl, readImpl }) {
	const catalog = catalogs.modrinth ?? {}
	const missing = missingItems({ name: 'modrinth', settings: catalog, tokenName: 'MODRINTH_TOKEN', env })
	const context = { config, catalog, catalogs, release, env, dryRun, fetchImpl, readImpl, missing, depCache: new Map() }
	const results = []
	for (const artifact of release.artifacts) {
		// biome-ignore lint/performance/noAwaitInLoops: uploads are sequential to respect rate limits and memory.
		results.push(await publishOne(context, artifact))
	}
	return results
}
