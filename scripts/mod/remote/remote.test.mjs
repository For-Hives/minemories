import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { run as push } from '../commands/push.mjs'
import { run as statusCommand } from '../commands/status.mjs'
import { readConfig } from '../config.mjs'
import { loadRemoteReport } from '../status.mjs'
import { propertiesPath } from '../version.mjs'
import {
	DEFAULT_API_URL,
	encodeManifest,
	fetchPublicIndex,
	maskToken,
	readToken,
	remoteReport,
	resolveApiUrl,
	resolveRemote,
	summarizeUpload,
	uploadRelease,
} from './index.mjs'

const TOKEN = 't0ken-'.repeat(8)
const env = { MOD_UPLOAD_TOKEN: TOKEN }
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const manifestOf = (id, version, extra = {}) => ({
	id,
	version,
	minecraft: '1.21.1',
	loader: id.split('-')[0],
	loaderVersion: '1.0',
	java: '21',
	commit: 'abc1234',
	builtAt: '2026-10-20T10:00:00.000Z',
	file: 'x.jar',
	bytes: 1,
	sha256: 'f'.repeat(64),
	dirty: false,
	...extra,
})

async function dist(version, ids = ['fabric-mc1.21.1', 'forge-mc1.21.1'], manifestExtra = {}) {
	const root = await mkdtemp(join(tmpdir(), 'mod-remote-'))
	const artifacts = []
	for (const id of ids) {
		const dir = join(root, 'build', 'mod-dist', version, id)
		await mkdir(dir, { recursive: true })
		const bytes = Buffer.from(`PK-jar-${id}`)
		const file = join(dir, `minemories-${id}-${version}.jar`)
		await writeFile(file, bytes)
		await writeFile(
			join(dir, 'manifest.json'),
			JSON.stringify(manifestOf(id, version, { sha256: sha(bytes), ...manifestExtra }))
		)
		artifacts.push({ targetId: id, filePath: file, bytes: bytes.length, sha256: sha(bytes) })
	}
	return { root, artifacts }
}

/** Fake server: records uploads, answers according to `behave` and serves the matching public index. */
function server({ behave = () => null, indexVisibleAfter = 0 } = {}) {
	const calls = []
	const published = {}
	let indexReads = 0
	const fetchImpl = async (url, init = {}) => {
		const path = new URL(url).pathname
		if (init.method === 'PUT') {
			const body = Buffer.from(init.body)
			const call = { url, headers: init.headers, body }
			calls.push(call)
			const override = behave(call, calls.length)
			if (override instanceof Error) throw override
			if (override) return new Response(JSON.stringify(override.body ?? {}), { status: override.status })
			const [, , , targetId, version] = path.split('/')
			published[targetId] = { version, sha256: sha(body), bytes: body.length }
			return Response.json({
				ok: true,
				targetId,
				version,
				sha256: sha(body),
				bytes: body.length,
				latest: true,
				replaced: false,
			})
		}
		indexReads += 1
		const visible = indexReads > indexVisibleAfter
		const targets = Object.fromEntries(
			Object.entries(published).map(([id, entry]) => [
				id,
				{
					latest: entry.version,
					versions: visible ? [{ version: entry.version, sha256: entry.sha256, bytes: entry.bytes }] : [],
				},
			])
		)
		return Response.json({ schema: 1, targets })
	}
	return { fetchImpl, calls, published, reads: () => indexReads }
}

const silent = () => {
	const lines = { info: [], warn: [], error: [] }
	return {
		lines,
		log: { info: m => lines.info.push(m), warn: m => lines.warn.push(m), error: m => lines.error.push(m) },
		all: () => [...lines.info, ...lines.warn, ...lines.error].join('\n'),
	}
}
const noSleep = () => {
	const waits = []
	return { waits, sleep: async ms => waits.push(ms) }
}

test('resolveApiUrl: production by default, MOD_API_URL, option, plain HTTP only locally', () => {
	assert.equal(resolveApiUrl({ env: {} }), DEFAULT_API_URL)
	assert.equal(resolveApiUrl({ env: { MOD_API_URL: 'https://api.example.org/' } }), 'https://api.example.org')
	assert.equal(
		resolveApiUrl({ flag: 'http://localhost:3001', env: { MOD_API_URL: 'https://x.org' } }),
		'http://localhost:3001'
	)
	assert.equal(resolveApiUrl({ flag: 'http://127.0.0.1:3001/' }), 'http://127.0.0.1:3001')
	assert.equal(resolveApiUrl({ flag: 'http://[::1]:3001' }), 'http://[::1]:3001')
	assert.throws(() => resolveApiUrl({ flag: 'http://api.example.org' }), /HTTPS/)
	assert.throws(() => resolveApiUrl({ flag: 'ftp://localhost' }), /HTTPS/)
	assert.throws(() => resolveApiUrl({ flag: 'not a url' }), /Invalid API URL/)
	assert.throws(() => resolveApiUrl({ flag: 'https://user:pw@api.example.org' }), /credentials/)
})

test('the token comes from the environment: missing or too short is refused, never shown', () => {
	assert.equal(readToken(env), TOKEN)
	assert.throws(() => readToken({}), /MOD_UPLOAD_TOKEN is missing/)
	assert.throws(
		() => readToken({ MOD_UPLOAD_TOKEN: 'tiny-x' }),
		error => error.message.includes('too short') && !error.message.includes('tiny-x')
	)
	assert.deepEqual(resolveRemote({ apiUrl: 'http://localhost:1', env }), { apiUrl: 'http://localhost:1', token: TOKEN })
	assert.equal(maskToken(`Bearer ${TOKEN} and ${TOKEN}`, TOKEN), 'Bearer [masked] and [masked]')
	assert.equal(maskToken('nothing', undefined), 'nothing')
})

test('a successful upload: headers, manifest, bytes, confirmation through the public index', async () => {
	const { artifacts } = await dist('0.9.0')
	const s = server()
	const out = silent()
	const result = await uploadRelease({
		version: '0.9.0',
		artifacts,
		env,
		apiUrl: 'https://api.example.org',
		fetchImpl: s.fetchImpl,
		log: out.log,
	})
	assert.equal(result.ok, true)
	assert.deepEqual(
		result.results.map(r => [r.targetId, r.status, r.confirmed, r.latest]),
		[
			['fabric-mc1.21.1', 'sent', true, true],
			['forge-mc1.21.1', 'sent', true, true],
		]
	)
	const [first] = s.calls
	assert.equal(first.url, 'https://api.example.org/downloads/upload/fabric-mc1.21.1/0.9.0')
	assert.equal(first.headers.Authorization, `Bearer ${TOKEN}`)
	assert.equal(first.headers['X-Content-SHA256'], sha(first.body))
	assert.equal(first.body.toString(), 'PK-jar-fabric-mc1.21.1')
	const manifest = JSON.parse(Buffer.from(first.headers['X-Mod-Manifest'], 'base64url').toString())
	assert.deepEqual(Object.keys(manifest).sort(), [
		'builtAt',
		'builtBy',
		'commit',
		'id',
		'java',
		'loader',
		'loaderVersion',
		'minecraft',
		'version',
	])
	assert.equal(manifest.builtBy, 'pc')
	assert.ok(!out.all().includes(TOKEN))
	assert.match(summarizeUpload(result), /2 target\(s\) uploaded, 0 failed/)
})

test('builtBy comes from the manifest or MOD_BUILT_BY, and ?replace=1 is passed on', async () => {
	const { artifacts } = await dist('0.9.0', ['fabric-mc1.21.1'], { builtBy: 'vps' })
	const s = server()
	await uploadRelease({ version: '0.9.0', artifacts, env, fetchImpl: s.fetchImpl, replace: true, log: silent().log })
	assert.ok(s.calls[0].url.endsWith('/0.9.0?replace=1'))
	assert.equal(JSON.parse(Buffer.from(s.calls[0].headers['X-Mod-Manifest'], 'base64url').toString()).builtBy, 'vps')
	const inline = await encodeManifest({ manifest: manifestOf('fabric-mc1.21.1', '1.0.0') }, '1.0.0', {
		MOD_BUILT_BY: 'vps',
	})
	assert.equal(JSON.parse(Buffer.from(inline, 'base64url').toString()).builtBy, 'vps')
	await assert.rejects(encodeManifest({ file: '/nonexistent/x.jar' }, '1', {}), /manifest\.json not found/)
})

test('401, 409 and 422 are never retried; a failing target does not stop the others', async () => {
	for (const status of [401, 409, 422]) {
		const { artifacts } = await dist('0.9.0')
		const s = server({ behave: call => (call.url.includes('fabric') ? { status, body: { error: 'nope' } } : null) })
		const out = silent()
		const waits = noSleep()
		const result = await uploadRelease({
			version: '0.9.0',
			artifacts,
			env,
			fetchImpl: s.fetchImpl,
			sleep: waits.sleep,
			log: out.log,
		})
		assert.equal(result.ok, false)
		assert.equal(s.calls.filter(call => call.url.includes('fabric')).length, 1)
		assert.deepEqual(waits.waits, [])
		assert.deepEqual(
			result.results.map(r => [r.targetId, r.status]),
			[
				['fabric-mc1.21.1', 'failed'],
				['forge-mc1.21.1', 'sent'],
			]
		)
		assert.equal(result.results[0].message, `HTTP ${status} (nope)`)
		assert.match(summarizeUpload(result), /1 target\(s\) uploaded, 1 failed/)
	}
})

test('network errors and 5xx are retried with growing delays, within a limit', async () => {
	const { artifacts } = await dist('0.9.0', ['fabric-mc1.21.1'])
	const failures = [new Error('ECONNRESET'), { status: 503 }]
	const flaky = server({ behave: (_call, n) => failures[n - 1] ?? null })
	const waits = noSleep()
	const out = silent()
	const ok = await uploadRelease({
		version: '0.9.0',
		artifacts,
		env,
		fetchImpl: flaky.fetchImpl,
		sleep: waits.sleep,
		log: out.log,
	})
	assert.equal(ok.ok, true)
	assert.equal(flaky.calls.length, 3)
	assert.deepEqual(waits.waits, [1000, 2000])
	assert.equal(out.lines.warn.length, 2)

	const down = server({ behave: () => ({ status: 502 }) })
	const failed = await uploadRelease({
		version: '0.9.0',
		artifacts,
		env,
		fetchImpl: down.fetchImpl,
		sleep: noSleep().sleep,
		attempts: 3,
		log: silent().log,
	})
	assert.equal(down.calls.length, 3)
	assert.equal(failed.results[0].message, 'HTTP 502')
})

test('the token never shows up in any message, even when echoed by a network error', async () => {
	const { artifacts } = await dist('0.9.0', ['fabric-mc1.21.1'])
	const leaky = server({ behave: () => new Error(`socket closed for Bearer ${TOKEN}`) })
	const out = silent()
	const result = await uploadRelease({
		version: '0.9.0',
		artifacts,
		env,
		fetchImpl: leaky.fetchImpl,
		sleep: noSleep().sleep,
		attempts: 2,
		log: out.log,
	})
	assert.equal(result.ok, false)
	assert.ok(!out.all().includes(TOKEN))
	assert.ok(!JSON.stringify(result).includes(TOKEN))
	assert.match(result.results[0].message, /\[masked\]/)
})

test('a different returned SHA-256, a tampered file or a missing manifest are failures', async () => {
	const { artifacts } = await dist('0.9.0', ['fabric-mc1.21.1', 'forge-mc1.21.1'])
	const liar = server({ behave: () => ({ status: 200, body: { ok: true, sha256: 'a'.repeat(64) } }) })
	const mismatch = await uploadRelease({
		version: '0.9.0',
		artifacts,
		env,
		fetchImpl: liar.fetchImpl,
		log: silent().log,
	})
	assert.match(mismatch.results[0].message, /SHA-256 that does not match/)
	const tampered = [
		{ ...artifacts[0], sha256: 'b'.repeat(64) },
		{ targetId: 'x-mc1.0', filePath: join(tmpdir(), 'missing.jar') },
	]
	const s = server()
	const result = await uploadRelease({
		version: '0.9.0',
		artifacts: tampered,
		env,
		fetchImpl: s.fetchImpl,
		log: silent().log,
	})
	assert.match(result.results[0].message, /unexpected sha256/)
	assert.equal(result.results[1].status, 'failed')
	assert.equal(s.calls.length, 0)
})

test('confirmation patiently rereads the public index, then fails if the version stays missing', async () => {
	const { artifacts } = await dist('0.9.0', ['fabric-mc1.21.1'])
	const slow = server({ indexVisibleAfter: 2 })
	const waits = noSleep()
	const ok = await uploadRelease({
		version: '0.9.0',
		artifacts,
		env,
		fetchImpl: slow.fetchImpl,
		sleep: waits.sleep,
		log: silent().log,
	})
	assert.equal(ok.ok, true)
	assert.equal(slow.reads(), 3)
	assert.deepEqual(waits.waits, [1000, 2000])

	const never = server({ indexVisibleAfter: 99 })
	const out = silent()
	const missing = await uploadRelease({
		version: '0.9.0',
		artifacts,
		env,
		fetchImpl: never.fetchImpl,
		sleep: noSleep().sleep,
		log: out.log,
	})
	assert.equal(missing.ok, false)
	assert.match(missing.results[0].message, /missing from the published index/)
	assert.ok(out.lines.error.some(m => m.includes('missing from the published index')))

	const broken = server()
	const fetchBroken = async (url, init) =>
		init?.method === 'PUT' ? broken.fetchImpl(url, init) : new Response('', { status: 500 })
	const unreadable = await uploadRelease({
		version: '0.9.0',
		artifacts,
		env,
		fetchImpl: fetchBroken,
		sleep: noSleep().sleep,
		log: silent().log,
	})
	assert.match(unreadable.results[0].message, /HTTP 500/)
})

test('a plain HTTP URL is refused before any upload, as is a missing token', async () => {
	const { artifacts } = await dist('0.9.0', ['fabric-mc1.21.1'])
	const s = server()
	await assert.rejects(
		uploadRelease({
			version: '0.9.0',
			artifacts,
			env,
			apiUrl: 'http://api.example.org',
			fetchImpl: s.fetchImpl,
			log: silent().log,
		}),
		/HTTPS/
	)
	await assert.rejects(
		uploadRelease({ version: '0.9.0', artifacts, env: {}, fetchImpl: s.fetchImpl, log: silent().log }),
		/MOD_UPLOAD_TOKEN/
	)
	assert.equal(s.calls.length, 0)
})

test('reading the public index: per-target report, HTTP error, unreachable API', async () => {
	const index = {
		schema: 1,
		targets: {
			'fabric-mc1.21.1': {
				latest: '2',
				versions: [
					{ version: '2', bytes: 10 },
					{ version: '1', bytes: 5 },
				],
			},
		},
	}
	const fetchImpl = async () => Response.json(index)
	assert.deepEqual(await remoteReport({ apiUrl: 'https://a.test', fetchImpl }), {
		totalBytes: 15,
		perTarget: { 'fabric-mc1.21.1': { versions: 2, bytes: 15, latest: '2' } },
	})
	await assert.rejects(
		fetchPublicIndex({ apiUrl: 'https://a.test', fetchImpl: async () => new Response('', { status: 503 }) }),
		/HTTP 503/
	)
	assert.equal(
		await loadRemoteReport({ apiUrl: 'https://a.test', fetchImpl: async () => new Response('', { status: 503 }) }),
		null
	)
	assert.deepEqual((await loadRemoteReport({ apiUrl: 'https://a.test', fetchImpl })).totalBytes, 15)
	assert.deepEqual(
		await remoteReport({ apiUrl: 'https://a.test', fetchImpl: async () => Response.json({ schema: 1 }) }),
		{
			totalBytes: 0,
			perTarget: {},
		}
	)
})

test('bun mod push uploads build/mod-dist/<version>/; --dry-run never touches the network', async () => {
	const { root } = await dist('0.9.0')
	await mkdir(join(root, 'mod/1.21.1'), { recursive: true })
	await writeFile(join(root, propertiesPath), 'mod_version=0.9.0\n')
	const s = server()
	const out = silent()
	const ctx = {
		env: { ...env, MOD_API_URL: 'https://api.example.org' },
		log: out.log,
		root,
		fetchImpl: s.fetchImpl,
		sleep: noSleep().sleep,
	}
	assert.equal(await push(['--dry-run'], ctx), 0)
	assert.equal(s.calls.length, 0)
	assert.ok(out.lines.info.some(m => m.includes('[dry-run] 2 artifact(s) 0.9.0 to https://api.example.org')))
	assert.equal(await push(['0.9.0', '--replace'], ctx), 0)
	assert.equal(s.calls.length, 2)
	assert.ok(s.calls[0].url.endsWith('?replace=1'))
	assert.ok(out.lines.info.some(m => m.includes('2 target(s) uploaded')))

	const failing = server({ behave: () => ({ status: 401 }) })
	assert.equal(await push(['0.9.0', '--api-url', 'http://localhost:3001'], { ...ctx, fetchImpl: failing.fetchImpl }), 1)
	assert.equal(await push(['1.2.3'], ctx), 1)
	assert.ok(out.lines.error.some(m => m.includes('No JAR')))
	assert.ok(!out.all().includes(TOKEN))
})

test('bun mod status --remote reads the public index without S3 keys; an HTTP URL is refused', async () => {
	const root = join(import.meta.dirname, '..', '..', '..')
	const config = await readConfig(root)
	const out = silent()
	const real = globalThis.fetch
	const urls = []
	globalThis.fetch = async url => {
		urls.push(String(url))
		return Response.json({
			schema: 1,
			targets: { 'fabric-mc1.21.1': { latest: '0.1.0', versions: [{ version: '0.1.0', bytes: 2048 }] } },
		})
	}
	try {
		assert.equal(await statusCommand(['--remote'], { config, env: { NO_COLOR: '1' }, log: out.log, root }), 0)
		assert.ok(urls[0].startsWith('https://api.minemories.net/downloads/index.json'))
		assert.ok(out.lines.info[0].includes('Published (API): 2 KB'))
		await assert.rejects(
			statusCommand(['--api-url', 'http://api.example.org'], { config, env: {}, log: out.log, root }),
			/HTTPS/
		)
	} finally {
		globalThis.fetch = real
	}
})
