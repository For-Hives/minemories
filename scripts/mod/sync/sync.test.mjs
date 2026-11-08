import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { run } from '../commands/sync.mjs'
import {
	changelogFor,
	downloadJar,
	fetchRemoteIndex,
	fileLedger,
	findCurseForgeFile,
	findModrinthVersion,
	listCurseForgeFiles,
	selectReleases,
	syncRemote,
} from './index.mjs'

const JAR = Buffer.from('fake jar')
const SHA = createHash('sha256').update(JAR).digest('hex')
const API = 'https://api.example.test'
const fabric = {
	id: 'fabric-mc1.21.1',
	loader: 'fabric',
	minecraft: '1.21.1',
	java: '21',
	enabled: true,
	project: 'fabric',
	jar: 'x',
}
const neoforge = { ...fabric, id: 'neoforge-mc1.21.1', loader: 'neoforge', project: 'neoforge' }
const config = { targets: [fabric, neoforge, { ...fabric, id: 'forge-mc1.21.1', loader: 'forge', enabled: false }] }
const entry = version => ({ version, commit: 'abcdef123456', bytes: JAR.length, sha256: SHA })
const index = {
	schema: 1,
	targets: {
		'fabric-mc1.21.1': { latest: '2.0.0', versions: [entry('2.0.0'), entry('1.0.0')] },
		'neoforge-mc1.21.1': { latest: '2.0.0', versions: [entry('2.0.0')] },
		'forge-mc1.21.1': { latest: '2.0.0', versions: [entry('2.0.0')] },
	},
}
const catalogs = {
	modrinth: { enabled: true, projectId: 'MR', slug: 'mine', dependencies: {} },
	curseforge: { enabled: true, projectId: 7, slug: 'mine', dependencies: {} },
	mapping: {
		fabric: { modrinth: 'fabric', curseforge: 'Fabric' },
		neoforge: { modrinth: 'neoforge', curseforge: 'NeoForge' },
	},
}
const json = (body, status = 200) => ({
	ok: status < 300,
	status,
	json: async () => body,
	text: async () => JSON.stringify(body),
	arrayBuffer: async () => JAR,
})
const gameVersions = [
	{ id: 1, name: '1.21.1' },
	{ id: 2, name: 'Fabric' },
	{ id: 3, name: 'NeoForge' },
]
const cache = { read: async () => gameVersions, write: async () => {} }

function route(path, method, { modrinth, curseforge }) {
	if (path.endsWith('/downloads/index.json')) return json(index)
	if (path.includes('/downloads/')) return json(null)
	if (path.includes('/project/MR/version')) return json(modrinth)
	if (path.includes('api.curseforge.com')) return curseforge ? json({ data: curseforge }) : json('no', 403)
	if (method !== 'POST') return json('unexpected', 500)
	return json(path.endsWith('/upload-file') ? { id: 99 } : { id: 'NEW', project_id: 'MR' })
}

function fakeFetch({ modrinth = [], curseforge = null, calls = [] } = {}) {
	const impl = async (url, init = {}) => {
		calls.push({ url: String(url), method: init.method ?? 'GET' })
		return route(String(url), init.method ?? 'GET', { modrinth, curseforge })
	}
	impl.calls = calls
	return impl
}

const env = { MODRINTH_TOKEN: 'mrp_secret_token_1', CURSEFORGE_TOKEN: 'cf-secret-token-1' }
const memoryLedger = (data = {}) => ({
	load: async () => data,
	set: async (k, v) => {
		data[k] = v
	},
})

async function sync(options) {
	const root = await mkdtemp(join(tmpdir(), 'mod-sync-'))
	return syncRemote({
		config,
		env,
		root,
		apiUrl: API,
		deps: { catalogs, cache, ledger: memoryLedger(), tmpDir: root, ...options.deps },
		...options.rest,
	})
}

test('selectReleases keeps enabled targets and the latest version only, or all with --all', () => {
	const latest = selectReleases({ index, config })
	assert.deepEqual(
		latest.map(group => [group.version, group.items.map(item => item.targetId)]),
		[['2.0.0', ['fabric-mc1.21.1', 'neoforge-mc1.21.1']]]
	)
	const all = selectReleases({ index, config, all: true })
	assert.deepEqual(
		all.map(group => group.version),
		['1.0.0', '2.0.0']
	)
	assert.deepEqual(selectReleases({ index, config, targetIds: ['neoforge-mc1.21.1'] })[0].items.length, 1)
})

test('findModrinthVersion matches our number and a hand-made plain number for the same loader and game version', () => {
	const catalog = catalogs.modrinth
	const base = { catalog, catalogs, target: fabric, version: '2.0.0' }
	const ours = { id: 'a', version_number: '2.0.0+fabric-mc1.21.1', loaders: ['fabric'], game_versions: ['1.21.1'] }
	const plain = { id: 'b', version_number: '2.0.0', loaders: ['fabric'], game_versions: ['1.21.1'] }
	assert.match(findModrinthVersion({ ...base, versions: [ours] }), /version\/a$/)
	assert.match(findModrinthVersion({ ...base, versions: [plain] }), /version\/b$/)
	assert.equal(findModrinthVersion({ ...base, versions: [{ ...plain, loaders: ['forge'] }] }), null)
	assert.equal(findModrinthVersion({ ...base, versions: [{ ...plain, game_versions: ['1.20.1'] }] }), null)
})

test('findCurseForgeFile matches the uploaded file name', () => {
	const files = [{ id: 5, fileName: 'minemories-fabric-mc1.21.1-2.0.0.jar' }]
	assert.match(
		findCurseForgeFile({ files, catalog: catalogs.curseforge, targetId: 'fabric-mc1.21.1', version: '2.0.0' }),
		/files\/5$/
	)
	assert.equal(
		findCurseForgeFile({ files, catalog: catalogs.curseforge, targetId: 'fabric-mc1.21.1', version: '9' }),
		null
	)
})

test('fetchRemoteIndex validates the response', async () => {
	assert.equal((await fetchRemoteIndex({ apiUrl: API, fetchImpl: async () => json(index) })).schema, 1)
	await assert.rejects(
		fetchRemoteIndex({ apiUrl: API, fetchImpl: async () => json('boom', 503), env: {} }),
		/release index/
	)
	await assert.rejects(fetchRemoteIndex({ apiUrl: API, fetchImpl: async () => json({ schema: 2 }) }), /format/)
})

test('downloadJar verifies the digest', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mod-dl-'))
	const item = { targetId: 'fabric-mc1.21.1', version: '2.0.0', sha256: SHA }
	const artifact = await downloadJar({ apiUrl: API, item, dir, fetchImpl: fakeFetch(), env })
	assert.deepEqual(await readFile(artifact.filePath), JAR)
	await assert.rejects(
		downloadJar({ apiUrl: API, item: { ...item, sha256: 'bad' }, dir, fetchImpl: fakeFetch(), env }),
		/SHA-256/
	)
	await assert.rejects(
		downloadJar({ apiUrl: API, item, dir, fetchImpl: async () => json('x', 404), env }),
		/download failed/
	)
})

test('fileLedger persists and tolerates a missing file', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mod-ledger-'))
	const path = join(dir, 'nested', 'ledger.json')
	const ledger = fileLedger(path)
	assert.deepEqual(await ledger.load(), {})
	await ledger.set('k', 'v')
	assert.deepEqual(await fileLedger(path).load(), { k: 'v' })
})

test('listCurseForgeFiles pages through the Core API and reports failures', async () => {
	const page = Array.from({ length: 50 }, (_, i) => ({ id: i }))
	let calls = 0
	const fetchImpl = async () => json({ data: calls++ === 0 ? page : [{ id: 99 }] })
	const files = await listCurseForgeFiles({ catalog: catalogs.curseforge, env: { CURSEFORGE_API_KEY: 'k' }, fetchImpl })
	assert.equal(files.length, 51)
	await assert.rejects(
		listCurseForgeFiles({ catalog: catalogs.curseforge, env: {}, fetchImpl: async () => json('no', 403) }),
		/list files/
	)
})

test('changelogFor mentions the version and short commit', () => {
	assert.match(changelogFor({ version: '1.0.0', commit: 'abcdef123456' }), /1\.0\.0 \(commit abcdef1\)/)
	assert.match(changelogFor({ version: '1.0.0' }), /^Minemories 1\.0\.0\./)
})

test('syncRemote uploads only what is missing on each platform', async () => {
	const calls = []
	const fetchImpl = fakeFetch({
		calls,
		modrinth: [{ id: 'm1', version_number: '2.0.0', loaders: ['fabric'], game_versions: ['1.21.1'] }],
	})
	const ledger = memoryLedger()
	const results = await sync({ deps: { fetch: fetchImpl, ledger }, rest: {} })
	const by = (platform, targetId) => results.find(r => r.platform === platform && r.targetId === targetId)
	assert.equal(by('modrinth', 'fabric-mc1.21.1').status, 'present')
	assert.equal(by('modrinth', 'neoforge-mc1.21.1').status, 'published')
	assert.equal(by('curseforge', 'fabric-mc1.21.1').status, 'published')
	assert.equal(by('curseforge', 'neoforge-mc1.21.1').status, 'published')
	const posts = calls.filter(call => call.method === 'POST')
	assert.equal(posts.filter(call => call.url.endsWith('/version')).length, 1)
	assert.equal(posts.filter(call => call.url.endsWith('/upload-file')).length, 2)
	assert.equal(Object.keys(ledger.load ? await ledger.load() : {}).length, 2)
})

test('syncRemote does not upload to CurseForge again when the ledger or the Core API knows the file', async () => {
	const ledger = memoryLedger({
		'curseforge:fabric-mc1.21.1@2.0.0': 'https://cf/1',
		'curseforge:neoforge-mc1.21.1@2.0.0': 'https://cf/2',
	})
	const calls = []
	const results = await sync({ deps: { fetch: fakeFetch({ calls }), ledger }, rest: { platforms: ['curseforge'] } })
	assert.deepEqual(
		results.map(r => r.status),
		['present', 'present']
	)
	assert.equal(calls.filter(call => call.method === 'POST').length, 0)

	const files = [{ id: 5, fileName: 'minemories-fabric-mc1.21.1-2.0.0.jar' }]
	const viaApi = await sync({
		deps: { fetch: fakeFetch({ curseforge: files }) },
		rest: { platforms: ['curseforge'], env: { ...env, CURSEFORGE_API_KEY: 'k' } },
	})
	assert.deepEqual(
		viaApi.map(r => `${r.targetId}:${r.status}`),
		['fabric-mc1.21.1:present', 'neoforge-mc1.21.1:published']
	)
})

test('syncRemote --dry-run downloads and uploads nothing', async () => {
	const calls = []
	const results = await sync({ deps: { fetch: fakeFetch({ calls }) }, rest: { dryRun: true } })
	assert.ok(results.length > 0)
	assert.ok(results.every(r => r.status === 'skipped' && r.message.startsWith('dry-run')))
	assert.equal(calls.filter(call => call.method === 'POST' || call.url.includes('/downloads/fabric')).length, 0)
})

test('syncRemote skips platforms without configuration and reports lookup and download failures', async () => {
	const messages = []
	const none = await sync({ deps: { fetch: fakeFetch() }, rest: { env: {}, log: m => messages.push(m) } })
	assert.deepEqual(none, [])
	assert.equal(messages.length, 2)

	const failing = await sync({
		deps: { fetch: async url => (String(url).endsWith('/downloads/index.json') ? json(index) : json('no', 500)) },
		rest: { platforms: ['modrinth'] },
	})
	assert.equal(failing[0].status, 'failed')
	assert.match(failing[0].message, /list versions/)

	const badDownload = await sync({
		deps: { fetch: async url => (String(url).endsWith('/downloads/index.json') ? json(index) : json('gone', 404)) },
		rest: { platforms: ['curseforge'] },
	})
	assert.ok(badDownload.length > 0 && badDownload.every(r => r.status === 'failed'))
})

test('the sync command requires --remote, validates --platform and sets the exit code', async () => {
	const lines = []
	const ctx = { config, env, root: await mkdtemp(join(tmpdir(), 'mod-cmd-')), log: m => lines.push(m) }
	assert.equal(await run([], ctx), 1)
	assert.equal(await run(['--remote', '--platform', 'nope'], ctx), 1)
	assert.match(lines.join('\n'), /needs --remote[\s\S]*Unknown platform/)
})
