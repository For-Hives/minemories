import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { collectArtifacts, latestVersion, run as runPublish } from '../commands/publish.mjs'
import { loadCatalogs, releaseType } from './common.mjs'
import { buildMetadata, fileCache, getGameVersions, resolveGameVersionIds } from './curseforge.mjs'
import { publishThirdParty } from './index.mjs'
import { buildVersionData, userAgent, versionNumber } from './modrinth.mjs'

const MODRINTH_TOKEN = 'mrp_SECRETSECRETSECRET1234'
const CURSEFORGE_TOKEN = 'cf-secret-token-98765'
const JAR = Buffer.from('fake jar')
const SHA = createHash('sha256').update(JAR).digest('hex')
const TARGETS = [
	{ id: 'fabric-mc1.21.1', loader: 'fabric', minecraft: '1.21.1', java: '21' },
	{ id: 'neoforge-mc1.21.1', loader: 'neoforge', minecraft: '1.21.1', java: '21' },
]
const config = { targets: [...TARGETS, { id: 'mystery-mc1.21.1', loader: 'mystery', minecraft: '1.21.1' }] }
const release = (extra = {}) => ({
	version: '1.2.3-beta.4',
	commit: 'abc',
	changelog: 'Notes',
	artifacts: [{ targetId: 'fabric-mc1.21.1', filePath: '/build/fabric.jar', bytes: JAR.length, sha256: SHA }],
	...extra,
})
const readFileStub = () => Promise.resolve(JAR)
const json = (body, status = 200) => ({
	ok: status < 300,
	status,
	json: () => Promise.resolve(body),
	text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
})
const catalogsFull = () => ({
	modrinth: {
		enabled: true,
		projectId: 'AABBCCDD',
		slug: 'minemories',
		contact: 'https://example.test',
		dependencies: { fabric: [{ slug: 'fabric-api', type: 'required' }] },
	},
	curseforge: {
		enabled: true,
		projectId: 123456,
		slug: 'minemories',
		environment: 'Client',
		dependencies: { fabric: [{ slug: 'fabric-api', type: 'requiredDependency' }] },
	},
	mapping: {
		fabric: { modrinth: 'fabric', curseforge: 'Fabric' },
		neoforge: { modrinth: 'neoforge', curseforge: 10150 },
		forge: { modrinth: 'forge' },
	},
})
const GAME_VERSIONS = [
	{ id: 9990, name: '1.21.1' },
	{ id: 7499, name: 'Fabric' },
	{ id: 9638, name: 'Client' },
	{ id: 8000, name: 'Java 21' },
	{ id: 8001, name: 'Java 17' },
]
const memoryCache = (initial = null) => {
	const state = { value: initial, writes: 0 }
	return {
		state,
		read: () => Promise.resolve(state.value),
		write: value => {
			state.value = value
			state.writes += 1
			return Promise.resolve()
		},
	}
}
const noNetwork = () => assert.fail('no network expected')
const publish = options => publishThirdParty({ config, release: release(), ...options })

test('release types', () => {
	assert.equal(releaseType('1.2.3'), 'release')
	assert.equal(releaseType('1.2.3-beta.4'), 'beta')
	assert.equal(releaseType('1.2.3-rc.1'), 'beta')
	assert.equal(releaseType('1.2.3-alpha.1'), 'alpha')
})

/** The shipped catalogs as they were before the projects existed: nothing enabled, no project id. */
async function blankCatalogs() {
	const catalogs = await loadCatalogs()
	for (const platform of [catalogs.modrinth, catalogs.curseforge])
		Object.assign(platform, { enabled: false, projectId: null })
	return catalogs
}

test('shipped catalogs point at the real projects and map every loader of the targets', async () => {
	const catalogs = await loadCatalogs()
	assert.equal(catalogs.modrinth.projectId, 'q6vM8uLX')
	assert.equal(catalogs.modrinth.slug, 'minemories-3d')
	assert.equal(catalogs.curseforge.projectId, '1782364')
	assert.equal(catalogs.curseforge.slug, 'minemories')
	const targets = JSON.parse(await readFile(new URL('../../../mod/targets.json', import.meta.url), 'utf8'))
	for (const target of targets.targets) {
		assert.ok(catalogs.mapping[target.loader]?.modrinth, `Modrinth mapping missing for ${target.loader}`)
		assert.ok(catalogs.mapping[target.loader]?.curseforge, `CurseForge mapping missing for ${target.loader}`)
	}
})

test('everything is skipped with the exact checklist while accounts are missing', async () => {
	const results = await publish({ env: {}, deps: { catalogs: await blankCatalogs(), fetch: noNetwork } })
	assert.deepEqual(
		results.map(r => [r.platform, r.status]),
		[
			['modrinth', 'skipped'],
			['curseforge', 'skipped'],
		]
	)
	assert.equal(
		results[0].message,
		'Modrinth not published, still to do: set "modrinth.enabled" to true in mod/catalogs.json; fill in "modrinth.projectId" in mod/catalogs.json (create the project first); define MODRINTH_TOKEN in the environment (never in a repository file)'
	)
	assert.ok(results[1].message.includes('CURSEFORGE_TOKEN'))
	const onlyToken = await publish({
		env: { MODRINTH_TOKEN },
		deps: { catalogs: await blankCatalogs(), fetch: noNetwork },
	})
	assert.ok(!onlyToken[0].message.includes('MODRINTH_TOKEN'))
})

test('modrinth: creates the version with the right multipart request', async () => {
	const calls = []
	const fetchStub = (url, init) => {
		calls.push({ url, init })
		if (url.includes('/project/fabric-api')) return Promise.resolve(json({ id: 'P7dR8mSH' }))
		if (url.includes('/version?')) return Promise.resolve(json([{ version_number: 'other', id: 'x' }]))
		return Promise.resolve(json({ id: 'VERID', project_id: 'AABBCCDD' }, 200))
	}
	const catalogs = catalogsFull()
	catalogs.curseforge.enabled = false
	const results = await publish({
		env: { MODRINTH_TOKEN },
		deps: { catalogs, fetch: fetchStub, readFile: readFileStub, cache: memoryCache() },
	})
	const modrinth = results.find(r => r.platform === 'modrinth')
	assert.deepEqual(modrinth, {
		platform: 'modrinth',
		targetId: 'fabric-mc1.21.1',
		status: 'published',
		url: 'https://modrinth.com/mod/minemories/version/VERID',
		message: '1.2.3-beta.4+fabric-mc1.21.1',
	})
	const post = calls.at(-1)
	assert.equal(post.url, 'https://api.modrinth.com/v2/version')
	assert.equal(post.init.headers.Authorization, MODRINTH_TOKEN)
	assert.equal(post.init.headers['User-Agent'], 'For-Hives/minemories/1.2.3-beta.4 (https://example.test)')
	const data = JSON.parse(post.init.body.get('data'))
	assert.deepEqual(data, {
		project_id: 'AABBCCDD',
		name: 'Minemories 1.2.3-beta.4 (fabric 1.21.1)',
		version_number: '1.2.3-beta.4+fabric-mc1.21.1',
		changelog: 'Notes',
		dependencies: [{ project_id: 'P7dR8mSH', dependency_type: 'required' }],
		game_versions: ['1.21.1'],
		version_type: 'beta',
		loaders: ['fabric'],
		featured: true,
		status: 'listed',
		file_parts: ['file'],
		primary_file: 'file',
	})
	assert.equal(post.init.body.get('file').name, 'fabric.jar')
	assert.ok(calls[0].url.includes('/project/AABBCCDD/version?'))
	assert.ok(calls[0].url.includes('loaders=%5B%22fabric%22%5D'))
})

test('modrinth: idempotence, site index, errors and guards', async () => {
	const catalogs = catalogsFull()
	catalogs.curseforge.enabled = false
	const base = { env: { MODRINTH_TOKEN }, deps: { catalogs, readFile: readFileStub, cache: memoryCache() } }
	const pick = async options => (await publish(options)).find(r => r.platform === 'modrinth')

	const already = await pick({
		...base,
		deps: {
			...base.deps,
			fetch: url =>
				Promise.resolve(
					url.includes('/version?')
						? json([{ version_number: '1.2.3-beta.4+fabric-mc1.21.1', id: 'OLD', project_id: 'AABBCCDD' }])
						: json({ id: 'P7dR8mSH' })
				),
		},
	})
	assert.equal(already.status, 'skipped')
	assert.equal(already.url, 'https://modrinth.com/mod/minemories/version/OLD')

	const indexed = await pick({
		...base,
		release: release({ published: { modrinth: { 'fabric-mc1.21.1': 'https://x/y' } } }),
		deps: { ...base.deps, fetch: noNetwork },
	})
	assert.equal(indexed.url, 'https://x/y')

	const failing = await pick({
		...base,
		deps: {
			...base.deps,
			fetch: url => {
				if (url.includes('/version?')) return Promise.resolve(json([]))
				if (url.includes('/project/')) return Promise.resolve(json({ id: 'P' }))
				return Promise.resolve(json(`bad ${MODRINTH_TOKEN}`, 400))
			},
		},
	})
	assert.equal(failing.status, 'failed')
	assert.ok(failing.message.startsWith('HTTP 400'))
	assert.ok(!failing.message.includes(MODRINTH_TOKEN))

	const listFails = await pick({ ...base, deps: { ...base.deps, fetch: () => Promise.resolve(json('nope', 500)) } })
	assert.ok(listFails.message.includes('could not list versions'))

	const noDependency = await pick({
		...base,
		deps: {
			...base.deps,
			fetch: url => Promise.resolve(url.includes('/version?') ? json([]) : json('not found', 404)),
		},
	})
	assert.ok(noDependency.message.includes('dependency fabric-api not found'))

	const badDigest = await pick({
		...base,
		release: release({ artifacts: [{ targetId: 'fabric-mc1.21.1', filePath: '/b.jar', sha256: 'deadbeef' }] }),
		deps: { ...base.deps, fetch: url => Promise.resolve(url.includes('/version?') ? json([]) : json({ id: 'P' })) },
	})
	assert.ok(badDigest.message.includes('SHA-256'))

	const networkDown = await pick({
		...base,
		deps: { ...base.deps, fetch: () => Promise.reject(new Error(`down ${MODRINTH_TOKEN}`)) },
	})
	assert.equal(networkDown.status, 'failed')
	assert.ok(!networkDown.message.includes(MODRINTH_TOKEN))

	const unknownTarget = await pick({
		...base,
		release: release({ artifacts: [{ targetId: 'ghost', filePath: '/g.jar' }] }),
		deps: { ...base.deps, fetch: noNetwork },
	})
	assert.ok(unknownTarget.message.includes('unknown target'))
	const noMapping = await pick({
		...base,
		release: release({ artifacts: [{ targetId: 'mystery-mc1.21.1', filePath: '/g.jar' }] }),
		deps: { ...base.deps, fetch: noNetwork },
	})
	assert.ok(noMapping.message.includes('no Modrinth loader'))
})

test('modrinth helpers', () => {
	const target = TARGETS[1]
	assert.equal(versionNumber(release(), target), '1.2.3-beta.4+neoforge-mc1.21.1')
	assert.ok(userAgent({}, '1.0.0').startsWith('For-Hives/minemories/1.0.0 ('))
	const data = buildVersionData({
		catalog: { featured: false },
		mapping: { modrinth: 'neoforge' },
		release: release({ version: '2.0.0', changelog: undefined }),
		target,
		projectId: 'P',
		dependencies: [],
	})
	assert.equal(data.version_type, 'release')
	assert.equal(data.featured, false)
	assert.equal(data.changelog, '')
})

test('dry run builds masked requests, sends nothing and still lists what is missing', async () => {
	const results = await publish({
		env: { MODRINTH_TOKEN, CURSEFORGE_TOKEN },
		dryRun: true,
		deps: { catalogs: await blankCatalogs(), fetch: noNetwork, readFile: noNetwork, cache: memoryCache(GAME_VERSIONS) },
	})
	assert.equal(results.length, 2)
	for (const result of results) {
		assert.equal(result.status, 'skipped')
		assert.ok(result.message.startsWith('dry-run: request built (real publishing impossible'))
		assert.ok(!result.request.includes(MODRINTH_TOKEN))
		assert.ok(!result.request.includes(CURSEFORGE_TOKEN))
		assert.ok(result.request.includes('"***"'))
	}
	assert.ok(results[0].request.includes('"project_id": "<projectId>"'))
	assert.ok(results[0].request.includes('fabric-api'))
	assert.ok(results[1].request.includes('9990'))
	assert.ok(results[1].request.includes('"name": "fabric.jar"'))
})

test('dry run without token or cache uses placeholders', async () => {
	const results = await publish({
		env: {},
		dryRun: true,
		deps: { catalogs: catalogsFull(), fetch: noNetwork, cache: memoryCache() },
	})
	assert.ok(results[0].request.includes('<MODRINTH_TOKEN>'))
	assert.ok(results[1].request.includes('<ids resolved by GET /game/versions>'))
	assert.ok(results[1].message.startsWith('dry-run: request built'))
})

test('curseforge: resolves game versions once, caches them and uploads', async () => {
	const calls = []
	const cache = memoryCache()
	const fetchStub = (url, init) => {
		calls.push({ url, init })
		return Promise.resolve(url.endsWith('/game/versions') ? json(GAME_VERSIONS) : json({ id: 777 }))
	}
	const catalogs = catalogsFull()
	catalogs.modrinth.enabled = false
	const two = release({
		artifacts: [...release().artifacts, { targetId: 'neoforge-mc1.21.1', filePath: '/build/neo.jar', sha256: SHA }],
	})
	const results = await publish({
		env: { CURSEFORGE_TOKEN },
		release: two,
		deps: { catalogs, fetch: fetchStub, readFile: readFileStub, cache },
	})
	const cf = results.filter(r => r.platform === 'curseforge')
	assert.equal(cf[0].status, 'published')
	assert.equal(cf[0].url, 'https://www.curseforge.com/minecraft/mc-mods/minemories/files/777')
	assert.equal(calls.filter(c => c.url.endsWith('/game/versions')).length, 1)
	assert.equal(cache.state.writes, 1)
	const upload = calls.find(c => c.url.endsWith('/projects/123456/upload-file'))
	assert.equal(upload.init.headers['X-Api-Token'], CURSEFORGE_TOKEN)
	assert.deepEqual(JSON.parse(upload.init.body.get('metadata')), {
		changelog: 'Notes',
		changelogType: 'markdown',
		displayName: 'Minemories 1.2.3-beta.4 (fabric 1.21.1)',
		gameVersions: [9990, 7499, 8000, 9638],
		releaseType: 'beta',
		relations: { projects: [{ slug: 'fabric-api', type: 'requiredDependency' }] },
	})
	assert.equal(upload.init.body.get('file').name, 'fabric.jar')
	// NeoForge uses the numeric id of the mapping and has no relations.
	const neo = calls.filter(c => c.url.endsWith('/upload-file')).at(-1)
	const neoMetadata = JSON.parse(neo.init.body.get('metadata'))
	assert.ok(neoMetadata.gameVersions.includes(10150))
	assert.equal(neoMetadata.relations, undefined)
})

test('curseforge: errors and guards', async () => {
	const catalogs = catalogsFull()
	catalogs.modrinth.enabled = false
	const pick = async options =>
		(await publish({ env: { CURSEFORGE_TOKEN }, ...options })).find(r => r.platform === 'curseforge')
	const deps = { catalogs, readFile: readFileStub }

	const versionsDown = await pick({
		deps: { ...deps, cache: memoryCache(), fetch: () => Promise.resolve(json('no', 403)) },
	})
	assert.ok(versionsDown.message.includes('could not list game versions'))

	const uploadFails = await pick({
		deps: {
			...deps,
			cache: memoryCache(GAME_VERSIONS),
			fetch: () => Promise.resolve(json(`refus ${CURSEFORGE_TOKEN}`, 422)),
		},
	})
	assert.equal(uploadFails.status, 'failed')
	assert.ok(!uploadFails.message.includes(CURSEFORGE_TOKEN))

	const unknownMinecraft = await pick({
		deps: { ...deps, cache: memoryCache([{ id: 1, name: 'Fabric' }]), fetch: noNetwork },
	})
	assert.ok(unknownMinecraft.message.includes('Minecraft version 1.21.1 unknown'))
	const unknownLoader = await pick({
		deps: { ...deps, cache: memoryCache([{ id: 1, name: '1.21.1' }]), fetch: noNetwork },
	})
	assert.ok(unknownLoader.message.includes('loader Fabric unknown'))

	const indexed = await pick({
		release: release({ published: { curseforge: { 'fabric-mc1.21.1': 'https://cf/1' } } }),
		deps: { ...deps, cache: memoryCache(), fetch: noNetwork },
	})
	assert.equal(indexed.url, 'https://cf/1')
	const unknownTarget = await pick({
		release: release({ artifacts: [{ targetId: 'ghost', filePath: '/g' }] }),
		deps: { ...deps, cache: memoryCache(), fetch: noNetwork },
	})
	assert.ok(unknownTarget.message.includes('unknown target'))
	const noMapping = await pick({
		release: release({ artifacts: [{ targetId: 'mystery-mc1.21.1', filePath: '/g' }] }),
		deps: { ...deps, cache: memoryCache(), fetch: noNetwork },
	})
	assert.ok(noMapping.message.includes('no CurseForge loader'))
	const noCurseMapping = await pick({
		release: release({ artifacts: [{ targetId: 'fabric-mc1.21.1', filePath: '/g' }] }),
		deps: {
			...deps,
			catalogs: { ...catalogs, mapping: { forge: { modrinth: 'forge' } } },
			cache: memoryCache(),
			fetch: noNetwork,
		},
	})
	assert.ok(noCurseMapping.message.includes('no CurseForge loader'))
})

test('curseforge helpers: ids without Java/environment, metadata defaults, cache TTL', async () => {
	const ids = resolveGameVersionIds({
		versions: [
			{ id: 1, name: '1.21.1' },
			{ id: 2, name: 'Fabric' },
		],
		target: TARGETS[0],
		mapping: { curseforge: 'Fabric' },
		catalog: {},
	})
	assert.deepEqual(ids, [1, 2])
	const metadata = buildMetadata({
		catalog: {},
		release: release({ version: '3.0.0', changelog: undefined }),
		target: TARGETS[0],
		gameVersions: [1],
	})
	assert.equal(metadata.releaseType, 'release')
	assert.equal(metadata.changelogType, 'markdown')
	assert.equal(metadata.relations, undefined)

	const dir = await mkdtemp(join(tmpdir(), 'mm-cf-'))
	const path = join(dir, 'sub', 'versions.json')
	let now = Date.now()
	const cache = fileCache(path, () => now)
	assert.equal(await cache.read(), null)
	await cache.write(GAME_VERSIONS)
	assert.deepEqual(await cache.read(), GAME_VERSIONS)
	now += 25 * 3600 * 1000
	assert.equal(await cache.read(), null)
	await writeFile(path, 'not json')
	now = Date.now()
	assert.equal(await cache.read(), null)
	await rm(dir, { recursive: true })

	const viaCache = await getGameVersions({ fetchImpl: noNetwork, env: {}, cache: memoryCache(GAME_VERSIONS) })
	assert.equal(viaCache.length, GAME_VERSIONS.length)
	const empty = await getGameVersions({
		fetchImpl: () => Promise.resolve(json(GAME_VERSIONS)),
		env: {},
		cache: memoryCache([]),
	})
	assert.equal(empty.length, GAME_VERSIONS.length)
})

async function distSandbox() {
	const root = await mkdtemp(join(tmpdir(), 'mm-dist-'))
	const make = async (version, id, files) => {
		const dir = join(root, 'build', 'mod-dist', version, id)
		await mkdir(dir, { recursive: true })
		await Promise.all(Object.entries(files).map(([name, content]) => writeFile(join(dir, name), content)))
	}
	return { root, make }
}

test('publish command: latest build, artifacts, dry run and failures', async () => {
	const { root, make } = await distSandbox()
	const lines = []
	const ctx = { config, env: {}, log: m => lines.push(m), root }
	assert.equal(await latestVersion(root), null)
	assert.equal(await runPublish([], ctx), 1)
	assert.ok(lines.at(-1).includes('No local build'))

	await make('0.1.0-beta.1', 'fabric-mc1.21.1', { 'minemories-fabric.jar': 'old' })
	await make('0.2.0-beta.1', 'fabric-mc1.21.1', {
		'minemories-fabric.jar': 'jar!',
		'minemories-fabric-sources.jar': 's',
		'manifest.json': JSON.stringify({ sha256: 'abc' }),
	})
	await make('0.2.0-beta.1', 'forge-mc1.21.1', { 'notes.txt': 'no jar' })
	await make('0.2.0-beta.1', 'neoforge-mc1.21.1', { 'a.jar': 'x', 'manifest.json': 'broken' })
	await utimes(join(root, 'build', 'mod-dist', '0.1.0-beta.1'), new Date(1000), new Date(1000))
	assert.equal(await latestVersion(root), '0.2.0-beta.1')

	const artifacts = await collectArtifacts(root, '0.2.0-beta.1')
	assert.deepEqual(
		artifacts.map(a => [a.targetId, a.bytes, a.sha256]),
		[
			['fabric-mc1.21.1', 4, 'abc'],
			['neoforge-mc1.21.1', 1, undefined],
		]
	)

	assert.equal(await runPublish(['--dry-run'], ctx), 0)
	assert.ok(lines.some(l => l.startsWith('modrinth fabric-mc1.21.1: skipped')))
	assert.ok(lines.some(l => l.includes('"method": "POST"')))
	assert.equal(await runPublish(['--version', '0.2.0-beta.1'], ctx), 0)
	assert.equal(await runPublish(['--version', '9.9.9'], ctx), 1)
	assert.ok(lines.at(-1).includes('No JAR'))
	await rm(root, { recursive: true })
})
