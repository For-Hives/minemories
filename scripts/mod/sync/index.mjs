// `bun mod sync --remote`: brings Modrinth and CurseForge in line with the releases stored on the Minemories API.
// The API index (`GET /downloads/index.json`) is the source of truth for what is released. For each wanted
// (target, version) the tool first asks the platform whether the file is already there; only the missing ones are
// downloaded (SHA-256 checked) and handed to the regular publishers, so nothing is uploaded twice and the platform
// APIs are called as little as possible.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { enabledTargets } from '../config.mjs'
import { errorDetail, errorMessage, findTarget, loadCatalogs, request } from '../publish/common.mjs'
import { fileUrl as curseForgeFileUrl } from '../publish/curseforge.mjs'
import { publishThirdParty } from '../publish/index.mjs'
import { MODRINTH_API, userAgent, versionNumber, versionUrl } from '../publish/modrinth.mjs'
import { resolveApiUrl } from '../remote/index.mjs'

export const PLATFORMS = ['modrinth', 'curseforge']
const CURSEFORGE_CORE_API = 'https://api.curseforge.com/v1'
const PAGE_SIZE = 50
const MAX_PAGES = 20

/** The release index published by the API. */
export async function fetchRemoteIndex({ apiUrl, fetchImpl = globalThis.fetch, env = process.env }) {
	const response = await request(fetchImpl, `${apiUrl}/downloads/index.json`, {
		headers: { Accept: 'application/json' },
	})
	if (!response.ok) throw new Error(`could not read the release index (${await errorDetail(response, env)})`)
	const index = await response.json()
	if (index?.schema !== 1 || typeof index.targets !== 'object') throw new Error('unexpected release index format')
	return index
}

/**
 * Releases to mirror: for every enabled target present in the index, its newest version (or all stored ones with
 * `all`). Grouped by version so each group is one publish call.
 */
export function selectReleases({ index, config, all = false, targetIds }) {
	const enabled = new Set(enabledTargets(config).map(target => target.id))
	const groups = new Map()
	for (const [targetId, entry] of Object.entries(index.targets)) {
		if (!enabled.has(targetId) || (targetIds && !targetIds.includes(targetId))) continue
		const versions = all ? entry.versions : entry.versions.filter(item => item.version === entry.latest)
		for (const item of versions) {
			const group = groups.get(item.version) ?? { version: item.version, commit: item.commit, items: [] }
			group.items.push({ targetId, ...item })
			groups.set(item.version, group)
		}
	}
	return [...groups.values()].toSorted((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }))
}

/** Every version of the Modrinth project (one request, paginated by the API only past hundreds of versions). */
export async function listModrinthVersions({ catalog, env, fetchImpl }) {
	const response = await request(fetchImpl, `${MODRINTH_API}/project/${catalog.projectId}/version`, {
		headers: { 'User-Agent': userAgent(catalog, 'sync'), Authorization: env.MODRINTH_TOKEN },
	})
	if (!response.ok) throw new Error(`Modrinth: could not list versions (${await errorDetail(response, env)})`)
	return await response.json()
}

/**
 * The remote Modrinth version matching a release, or null. Matches the number written by `bun mod publish`
 * (`<version>+<loader>-mc<minecraft>`) and the plain `<version>` of a version uploaded by hand, for the same loader
 * and Minecraft version.
 */
export function findModrinthVersion({ versions, catalog, catalogs, target, version }) {
	const loader = catalogs.mapping?.[target.loader]?.modrinth
	const numbers = new Set([versionNumber({ version }, target), version])
	const found = versions.find(
		remote =>
			numbers.has(remote.version_number) &&
			remote.loaders?.includes(loader) &&
			remote.game_versions?.includes(target.minecraft)
	)
	return found ? versionUrl(catalog, found) : null
}

/** Files of the CurseForge project through the Core API (needs a Core API key, distinct from the upload token). */
export async function listCurseForgeFiles({ catalog, env, fetchImpl }) {
	const files = []
	for (let page = 0; page < MAX_PAGES; page += 1) {
		const query = new URLSearchParams({ index: String(page * PAGE_SIZE), pageSize: String(PAGE_SIZE) })
		// biome-ignore lint/performance/noAwaitInLoops: pages must be read in order.
		const response = await request(fetchImpl, `${CURSEFORGE_CORE_API}/mods/${catalog.projectId}/files?${query}`, {
			headers: { 'x-api-key': env.CURSEFORGE_API_KEY, Accept: 'application/json' },
		})
		if (!response.ok) throw new Error(`CurseForge: could not list files (${await errorDetail(response, env)})`)
		const body = await response.json()
		files.push(...body.data)
		if (body.data.length < PAGE_SIZE) break
	}
	return files
}

/** The remote CurseForge file for a release, matched on the file name the JAR is uploaded with. */
export function findCurseForgeFile({ files, catalog, targetId, version }) {
	const wanted = `minemories-${targetId}-${version}.jar`
	const found = files.find(file => file.fileName === wanted)
	return found ? curseForgeFileUrl(catalog, found.id) : null
}

/**
 * CurseForge's upload token cannot list files. A local ledger remembers what this tool uploaded, so a second run
 * on the same machine does not upload again. It is a fallback: `CURSEFORGE_API_KEY` gives the real remote answer.
 */
export function fileLedger(path) {
	let loaded
	const load = async () => {
		loaded ??= await readFile(path, 'utf8').then(
			text => JSON.parse(text),
			() => ({})
		)
		return loaded
	}
	return {
		load,
		async set(key, url) {
			const data = await load()
			data[key] = url
			await mkdir(dirname(path), { recursive: true })
			await writeFile(path, `${JSON.stringify(data, null, '\t')}\n`)
		},
	}
}

/** Downloads a JAR from the API and refuses it if its digest differs from the index. */
export async function downloadJar({ apiUrl, item, dir, fetchImpl, env }) {
	const response = await request(fetchImpl, `${apiUrl}/downloads/${item.targetId}/${item.version}`, { headers: {} })
	if (!response.ok) throw new Error(`download failed (${await errorDetail(response, env)})`)
	const data = Buffer.from(await response.arrayBuffer())
	if (createHash('sha256').update(data).digest('hex') !== item.sha256) throw new Error('SHA-256 differs from the index')
	const filePath = join(dir, item.targetId, `minemories-${item.targetId}-${item.version}.jar`)
	await mkdir(dirname(filePath), { recursive: true })
	await writeFile(filePath, data)
	return { targetId: item.targetId, filePath, bytes: data.length, sha256: item.sha256 }
}

export function changelogFor(group) {
	const commit = group.commit ? ` (commit ${group.commit.slice(0, 7)})` : ''
	return `Minemories ${group.version}${commit}. Pre-release build: see https://minemories.net and https://github.com/For-Hives/minemories for details.`
}

/** Returns `(target, item) => url | null`: the answer of one platform for a release already online. */
async function buildLookup({ platform, catalog, catalogs, env, fetchImpl, remembered }) {
	if (platform === 'modrinth') {
		const versions = await listModrinthVersions({ catalog, env, fetchImpl })
		return (target, item) => findModrinthVersion({ versions, catalog, catalogs, target, version: item.version })
	}
	if (env.CURSEFORGE_API_KEY) {
		const files = await listCurseForgeFiles({ catalog, env, fetchImpl })
		return (_target, item) => findCurseForgeFile({ files, catalog, targetId: item.targetId, version: item.version })
	}
	return (_target, item) => item.published?.curseforge ?? remembered[ledgerKey(item.targetId, item.version)] ?? null
}

const ledgerKey = (targetId, version) => `curseforge:${targetId}@${version}`
const failure = (platform, targetId, version, error, env) => ({
	platform,
	targetId,
	version,
	status: 'failed',
	message: errorMessage(error, env),
})

function isConfigured(catalog, token) {
	return Boolean(catalog.enabled && catalog.projectId && token)
}

async function openPlatforms({ platforms, catalogs, env, fetchImpl, remembered, log, out }) {
	const states = {}
	for (const platform of platforms) {
		const catalog = catalogs[platform] ?? {}
		const token = platform === 'modrinth' ? env.MODRINTH_TOKEN : env.CURSEFORGE_TOKEN
		if (!isConfigured(catalog, token)) {
			log?.(
				`${platform}: skipped (needs "enabled" and "projectId" in mod/catalogs.json and its token in the environment)`
			)
			continue
		}
		try {
			// biome-ignore lint/performance/noAwaitInLoops: one listing request per platform.
			states[platform] = await buildLookup({ platform, catalog, catalogs, env, fetchImpl, remembered })
		} catch (error) {
			out.push(failure(platform, '*', '*', error, env))
		}
	}
	return states
}

/** Splits a version group into what the platforms already have and what is missing. */
function compare({ group, states, config }) {
	const present = { modrinth: {}, curseforge: {} }
	const found = []
	const missing = []
	for (const item of group.items) {
		const target = findTarget(config, item.targetId)
		for (const [platform, lookup] of Object.entries(states)) {
			const url = lookup(target, item)
			if (url) {
				present[platform][item.targetId] = url
				found.push({ platform, targetId: item.targetId, version: group.version, status: 'present', url })
			} else missing.push({ platform, item })
		}
	}
	return { present, found, missing }
}

async function downloadMissing({ items, apiUrl, dir, fetchImpl, env }) {
	const artifacts = []
	const failed = new Map()
	for (const item of items) {
		try {
			// biome-ignore lint/performance/noAwaitInLoops: sequential downloads keep memory and bandwidth bounded.
			artifacts.push(await downloadJar({ apiUrl, item, dir, fetchImpl, env }))
		} catch (error) {
			failed.set(item.targetId, error)
		}
	}
	return { artifacts, failed }
}

function dryRunArtifacts(items) {
	return items.map(item => ({
		targetId: item.targetId,
		filePath: `${item.targetId}.jar`,
		bytes: item.bytes,
		sha256: item.sha256,
	}))
}

async function publishMissing({ group, missing, present, ctx }) {
	const { config, catalogs, env, dryRun, fetchImpl, apiUrl, dir, ledger, deps } = ctx
	const items = [...new Map(missing.map(({ item }) => [item.targetId, item])).values()]
	const { artifacts, failed } = dryRun
		? { artifacts: dryRunArtifacts(items), failed: new Map() }
		: await downloadMissing({ items, apiUrl, dir, fetchImpl, env })
	const results = missing
		.filter(({ item }) => failed.has(item.targetId))
		.map(({ platform, item }) => failure(platform, item.targetId, group.version, failed.get(item.targetId), env))
	if (artifacts.length === 0) return results
	// What a platform already has (or does not lack) is declared published so the publishers skip it.
	const published = structuredClone(present)
	for (const { targetId } of artifacts)
		for (const platform of PLATFORMS) {
			const lacks = missing.some(entry => entry.platform === platform && entry.item.targetId === targetId)
			if (!lacks) published[platform][targetId] ??= 'n/a'
		}
	const release = {
		version: group.version,
		commit: group.commit,
		changelog: changelogFor(group),
		published,
		artifacts,
	}
	const outcomes = await publishThirdParty({
		config,
		release,
		env,
		dryRun,
		deps: { ...deps, catalogs, fetch: fetchImpl },
	})
	for (const outcome of outcomes) {
		if (!missing.some(entry => entry.platform === outcome.platform && entry.item.targetId === outcome.targetId))
			continue
		results.push({ ...outcome, version: group.version })
		if (outcome.status === 'published' && outcome.platform === 'curseforge')
			await ledger.set(ledgerKey(outcome.targetId, group.version), outcome.url)
	}
	return results
}

/**
 * @returns {Promise<{platform:string, targetId:string, version:string, status:'present'|'published'|'skipped'|'failed',
 *   url?:string, message?:string, request?:string}[]>}
 */
export async function syncRemote({
	config,
	env = process.env,
	root,
	apiUrl,
	all = false,
	dryRun = false,
	platforms = PLATFORMS,
	targetIds,
	log,
	deps = {},
}) {
	const fetchImpl = deps.fetch ?? globalThis.fetch
	const catalogs = deps.catalogs ?? (await loadCatalogs(root))
	const api = resolveApiUrl({ flag: apiUrl, env })
	const releases = selectReleases({
		index: await fetchRemoteIndex({ apiUrl: api, fetchImpl, env }),
		config,
		all,
		targetIds,
	})
	const ledger = deps.ledger ?? fileLedger(join(root, 'build', 'mod-cache', 'sync-ledger.json'))
	const out = []
	const states = await openPlatforms({ platforms, catalogs, env, fetchImpl, remembered: await ledger.load(), log, out })
	const ctx = {
		config,
		catalogs,
		env,
		dryRun,
		fetchImpl,
		apiUrl: api,
		dir: deps.tmpDir ?? join(root, 'build', 'mod-cache', 'sync'),
		ledger,
		deps,
	}
	for (const group of releases) {
		const { present, found, missing } = compare({ group, states, config })
		out.push(...found)
		if (missing.length === 0) continue
		// biome-ignore lint/performance/noAwaitInLoops: versions are published one after the other, oldest first.
		out.push(...(await publishMissing({ group, missing, present, ctx })))
	}
	return out
}
