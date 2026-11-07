// CurseForge publisher, upload API (https://support.curseforge.com/en/support/solutions/articles/9000197321).
// POST https://minecraft.curseforge.com/api/projects/{id}/upload-file, multipart: `metadata` (JSON) + `file`,
// header `X-Api-Token`. Game version ids (Minecraft version, loader, Java, environment) come from
// GET /api/game/versions and are cached on disk for a day.
//
// The upload API has no "list files" call usable with an upload token: idempotence relies on `release.published`
// (the site index remembers the file URLs) rather than on a remote lookup.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
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

export const CURSEFORGE_API = 'https://minecraft.curseforge.com/api'
const PLACEHOLDER_PROJECT = '<projectId>'
const CACHE_TTL_MS = 24 * 3600 * 1000
const JAVA_NAME = /^Java (\d+)$/

/** File cache for the game versions list (replaced in tests). */
export function fileCache(path, now = () => Date.now()) {
	return {
		async read() {
			try {
				const info = await stat(path)
				if (now() - info.mtimeMs > CACHE_TTL_MS) return null
				return JSON.parse(await readFile(path, 'utf8'))
			} catch {
				return null
			}
		},
		async write(versions) {
			await mkdir(dirname(path), { recursive: true })
			await writeFile(path, JSON.stringify(versions))
		},
	}
}

/** Game versions with cache; throws a readable error when the API refuses. */
export async function getGameVersions({ fetchImpl, env, cache }) {
	const cached = await cache.read()
	if (Array.isArray(cached) && cached.length > 0) return cached
	const response = await request(fetchImpl, `${CURSEFORGE_API}/game/versions`, {
		headers: { 'X-Api-Token': env.CURSEFORGE_TOKEN },
	})
	if (!response.ok) throw new Error(`could not list game versions (${await errorDetail(response, env)})`)
	const versions = await response.json()
	await cache.write(versions)
	return versions
}

function byName(versions, name) {
	const wanted = String(name).toLowerCase()
	return versions.find(version => String(version.name).toLowerCase() === wanted)
}

/**
 * Game version ids for a target: Minecraft version and loader are required, Java and environment are added when
 * CurseForge knows them. `mapping.curseforge` is a loader name ("Fabric") or a numeric id.
 */
export function resolveGameVersionIds({ versions, target, mapping, catalog }) {
	const minecraft = byName(versions, target.minecraft)
	if (!minecraft) throw new Error(`Minecraft version ${target.minecraft} unknown to CurseForge`)
	const loaderKey = mapping.curseforge
	const loader = typeof loaderKey === 'number' ? { id: loaderKey } : byName(versions, loaderKey)
	if (!loader) throw new Error(`loader ${loaderKey} unknown to CurseForge`)
	const ids = [minecraft.id, loader.id]
	const java = versions.find(version => JAVA_NAME.exec(version.name)?.[1] === String(target.java))
	if (java) ids.push(java.id)
	const environment = catalog.environment ? byName(versions, catalog.environment) : null
	if (environment) ids.push(environment.id)
	return [...new Set(ids)]
}

/** The `metadata` JSON of the upload. */
export function buildMetadata({ catalog, release, target, gameVersions }) {
	const projects = (catalog.dependencies?.[target.loader] ?? []).map(dependency => ({
		slug: dependency.slug,
		type: dependency.type ?? 'requiredDependency',
	}))
	return {
		changelog: release.changelog ?? '',
		changelogType: catalog.changelogType ?? 'markdown',
		displayName: `Minemories ${release.version} (${target.loader} ${target.minecraft})`,
		gameVersions,
		releaseType: releaseType(release.version),
		...(projects.length > 0 ? { relations: { projects } } : {}),
	}
}

export function fileUrl(catalog, fileId) {
	return `https://www.curseforge.com/minecraft/mc-mods/${catalog.slug ?? catalog.projectId}/files/${fileId}`
}

async function publishOne(context, artifact) {
	const { config, catalog, catalogs, release, env, dryRun, fetchImpl, readImpl, missing, versionsLoader } = context
	const result = fields => ({ platform: 'curseforge', targetId: artifact.targetId, ...fields })
	const target = findTarget(config, artifact.targetId)
	if (!target) return result({ status: 'failed', message: `unknown target: ${artifact.targetId}` })
	const mapping = catalogs.mapping?.[target.loader]
	if (mapping?.curseforge === undefined || mapping.curseforge === null) {
		return result({
			status: 'skipped',
			message: `no CurseForge loader for "${target.loader}" in mod/catalogs.json (mapping)`,
		})
	}
	const known = release.published?.curseforge?.[artifact.targetId]
	if (known) return result({ status: 'skipped', url: known, message: 'already published (site index)' })
	if (missing.length > 0 && !dryRun)
		return result({ status: 'skipped', message: skippedMessage('CurseForge', missing) })
	const projectId = catalog.projectId ?? PLACEHOLDER_PROJECT
	const url = `${CURSEFORGE_API}/projects/${projectId}/upload-file`
	const headers = { 'X-Api-Token': env.CURSEFORGE_TOKEN ?? '<CURSEFORGE_TOKEN>' }
	try {
		if (dryRun) {
			// A dry run never touches the network: it uses the cached game versions when there are some.
			const versions = await context.cache.read()
			const ids = versions
				? resolveGameVersionIds({ versions, target, mapping, catalog })
				: ['<ids resolved by GET /game/versions>']
			const fields = { metadata: buildMetadata({ catalog, release, target, gameVersions: ids }) }
			const note = missing.length > 0 ? ` (real publishing impossible: ${missing.join('; ')})` : ''
			const description = describeRequest({ method: 'POST', url, headers, fields, artifact }, env)
			return result({ status: 'skipped', message: `dry-run: request built${note}`, request: description })
		}
		const versions = await versionsLoader()
		const gameVersions = resolveGameVersionIds({ versions, target, mapping, catalog })
		const metadata = buildMetadata({ catalog, release, target, gameVersions })
		const file = await readArtifact(artifact, readImpl)
		const form = new FormData()
		form.set('metadata', JSON.stringify(metadata))
		form.set('file', new Blob([file.data], { type: 'application/java-archive' }), file.name)
		const response = await request(fetchImpl, url, { method: 'POST', headers, body: form })
		if (!response.ok) return result({ status: 'failed', message: await errorDetail(response, env) })
		const created = await response.json()
		return result({ status: 'published', url: fileUrl(catalog, created.id), message: `file ${created.id}` })
	} catch (error) {
		return result({ status: 'failed', message: errorMessage(error, env) })
	}
}

/** Publishes every artifact to CurseForge (sequentially). Never throws. */
export async function publishCurseForge({ config, catalogs, release, env, dryRun, fetchImpl, readImpl, cache }) {
	const catalog = catalogs.curseforge ?? {}
	const missing = missingItems({ name: 'curseforge', settings: catalog, tokenName: 'CURSEFORGE_TOKEN', env })
	let loaded
	const versionsLoader = () => {
		loaded ??= getGameVersions({ fetchImpl, env, cache })
		return loaded
	}
	const context = {
		config,
		catalog,
		catalogs,
		release,
		env,
		dryRun,
		fetchImpl,
		readImpl,
		missing,
		versionsLoader,
		cache,
	}
	const results = []
	for (const artifact of release.artifacts) {
		// biome-ignore lint/performance/noAwaitInLoops: uploads are sequential to respect rate limits and memory.
		results.push(await publishOne(context, artifact))
	}
	return results
}
