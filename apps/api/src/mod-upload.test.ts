import { afterAll, expect, spyOn, test } from 'bun:test'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ModIndex, modIndex } from '@minemories/api-contract'
import { createFakeClient } from '@minemories/mod-storage/fake-client'
import { Hono } from 'hono'
import { mapSequentially } from './test-support/sequence'

const directory = mkdtempSync(join(tmpdir(), 'minemories-mod-upload-test-'))
process.env.DATABASE_PATH = join(directory, 'test.sqlite')
process.env.LOCAL_OBJECTS_PATH = join(directory, 'objects')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.TRUSTED_PROXY_IPS = ''
process.env.BETTER_AUTH_SECRET = 'test-auth-secret-at-least-32-characters'
process.env.PAIRING_PEPPER = 'test-pairing-pepper-at-least-32-characters'

const { createModUploads, tokenMatches } = await import('./mod-upload')
const { app } = await import('./index')
const { database } = await import('./database')
const { makeJar, sha256Hex } = await import('./test-support/jar-fixture')

afterAll(() => {
	database.close()
	rmSync(directory, { recursive: true, force: true })
})

const TOKEN = 'a'.repeat(40)
const id = 'fabric-mc1.21.11'
const bucketEnv = { MOD_STORAGE_BUCKET: 'test-mods' }
const manifest = (extra: Record<string, unknown> = {}) => ({
	id,
	version: '0.5.0',
	minecraft: '1.21.11',
	loader: 'fabric',
	loaderVersion: '0.19.5',
	java: '21',
	fabricApi: '0.140.0+1.21.11',
	commit: 'abc1234def',
	builtAt: '2026-10-20T10:00:00.000Z',
	builtBy: 'pc',
	extra: 'ignored',
	...extra,
})
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

type Body = Uint8Array | ReadableStream<Uint8Array> | null
interface PutOptions {
	token?: string | null
	targetId?: string
	version?: string
	sha?: string | null
	manifest?: string | null
	length?: string | null
	query?: string
}
const orDefault = <T>(value: T | undefined, computed: T) => (value === undefined ? computed : value)
function uploadHeaders(bytes: Body, options: PutOptions) {
	const raw = bytes instanceof Uint8Array ? bytes : null
	const wanted: [string, string | null][] = [
		['Authorization', options.token === null ? null : `Bearer ${options.token ?? TOKEN}`],
		['X-Content-SHA256', orDefault(options.sha, raw ? sha256Hex(raw) : null)],
		['X-Mod-Manifest', orDefault(options.manifest, encode(manifest()))],
		['Content-Length', orDefault(options.length, raw ? String(raw.length) : null)],
	]
	const headers = new Headers()
	for (const [name, value] of wanted) if (value) headers.set(name, value)
	return headers
}

function harness(env: Record<string, string | undefined> = {}, extra: Record<string, unknown> = {}) {
	const client = createFakeClient()
	const stored: string[] = []
	let clock = 1_000_000
	const router = createModUploads({
		env: () => ({ ...bucketEnv, API_TOKEN: TOKEN, ...env }),
		client: () => client,
		onStored: () => stored.push('stored'),
		now: () => clock,
		...extra,
	})
	const mounted = new Hono()
	mounted.route('/downloads/upload', router)
	return {
		client,
		stored,
		advance: (ms: number) => {
			clock += ms
		},
		async index() {
			return modIndex.parse(
				JSON.parse((client.objects.get('index.json')?.body ?? Buffer.from('{}')).toString())
			) as ModIndex
		},
		put(bytes: Body, options: PutOptions = {}) {
			const request = new Request(
				`http://api.test/downloads/upload/${options.targetId ?? id}/${options.version ?? '0.5.0'}${options.query ?? ''}`,
				{
					method: 'PUT',
					headers: uploadHeaders(bytes, options),
					body: bytes as BodyInit | null,
					...(bytes instanceof ReadableStream ? { duplex: 'half' } : {}),
				}
			)
			return mounted.request(request)
		},
	}
}

const tempEntries = () =>
	readdirSync(tmpdir()).filter(name => name.startsWith('minemories-mod-upload-') && !name.includes('test'))

test('without a valid API_TOKEN the route answers 404 and reveals nothing', async () => {
	const jar = makeJar()
	await Promise.all(
		[undefined, '', 'short-token'].map(async token => {
			const h = harness({ API_TOKEN: token })
			const response = await h.put(jar, { token: token ?? 'x' })
			expect(response.status).toBe(404)
			expect(await response.json()).toEqual({ error: 'not_found' })
			expect(response.headers.get('cache-control')).toBe('no-store')
			expect(h.client.calls).toHaveLength(0)
		})
	)
})

test('a missing or wrong token yields a generic 401 without echoing the token, and nothing is logged', async () => {
	const logged = spyOn(console, 'error').mockImplementation(() => undefined)
	const h = harness()
	const jar = makeJar()
	await mapSequentially(['b'.repeat(40), 'a'.repeat(39), null], async token => {
		const response = await h.put(jar, { token })
		expect(response.status).toBe(401)
		const text = await response.text()
		expect(text).toBe('{"error":"unauthorized"}')
		expect(response.headers.get('cache-control')).toBe('no-store')
		expect(response.headers.get('access-control-allow-origin')).toBeNull()
	})
	expect(logged).not.toHaveBeenCalled()
	logged.mockRestore()
	expect(h.client.calls).toHaveLength(0)
})

test('authentication failures are rate limited per address, then the window reopens', async () => {
	const h = harness()
	const jar = makeJar()
	const failures = await mapSequentially(
		Array.from({ length: 10 }),
		async () => (await h.put(jar, { token: 'x'.repeat(40) })).status
	)
	expect(failures).toEqual(Array.from({ length: 10 }, () => 401))
	const blocked = await h.put(jar, { token: 'x'.repeat(40) })
	expect(blocked.status).toBe(429)
	expect(blocked.headers.get('retry-after')).toBe('60')
	expect((await h.put(jar)).status).toBe(429)
	h.advance(61_000)
	expect((await h.put(jar)).status).toBe(200)
})

test('a valid upload writes the JAR, latest, the index (builtBy) and the manifest, then cleans up the temporary file', async () => {
	const before = tempEntries()
	const h = harness()
	const jar = makeJar()
	const response = await h.put(jar)
	expect(response.status).toBe(200)
	expect(response.headers.get('cache-control')).toBe('no-store')
	expect(await response.json()).toEqual({
		ok: true,
		targetId: id,
		version: '0.5.0',
		sha256: sha256Hex(jar),
		bytes: jar.length,
		latest: true,
		replaced: false,
	})
	const index = await h.index()
	const entry = index.targets[id]?.versions[0]
	expect(entry).toMatchObject({ version: '0.5.0', builtBy: 'pc', commit: 'abc1234def', bytes: jar.length })
	expect(index.targets[id]).toMatchObject({ loaderVersion: '0.19.5', fabricApi: '0.140.0+1.21.11', latest: '0.5.0' })
	expect(h.client.objects.get(`mods/${id}/0.5.0/minemories-${id}-0.5.0.jar`)?.body.equals(jar)).toBe(true)
	expect(h.client.objects.has(`latest/${id}.jar`)).toBe(true)
	const sidecar = JSON.parse(h.client.objects.get(`mods/${id}/0.5.0/manifest.json`)?.body.toString() ?? '{}')
	expect(sidecar).toMatchObject({ id, sha256: sha256Hex(jar), bytes: jar.length, builtBy: 'pc' })
	expect(sidecar.extra).toBeUndefined()
	expect(h.stored).toEqual(['stored'])
	expect(tempEntries()).toEqual(before)
})

test('resending the same bytes is idempotent, different content yields 409 unless ?replace=1', async () => {
	const h = harness()
	const jar = makeJar()
	await h.put(jar)
	const again = await h.put(jar)
	expect(again.status).toBe(200)
	expect(await again.json()).toMatchObject({ ok: true, replaced: false, latest: true })
	expect(h.stored).toEqual(['stored'])
	const other = makeJar(['a/Other.class'])
	const conflict = await h.put(other)
	expect(conflict.status).toBe(409)
	expect(await conflict.json()).toEqual({ error: 'version_exists' })
	expect((await h.index()).targets[id]?.versions[0]?.bytes).toBe(jar.length)
	const replaced = await h.put(other, { query: '?replace=1' })
	expect(replaced.status).toBe(200)
	expect(await replaced.json()).toMatchObject({ replaced: true, sha256: sha256Hex(other) })
	expect((await h.index()).targets[id]?.versions[0]?.sha256).toBe(sha256Hex(other))
})

test('MOD_STORAGE_KEEP retention applies after an upload without touching latest', async () => {
	const h = harness({ MOD_STORAGE_KEEP: '2' })
	for (const n of [1, 2, 3]) {
		const version = `0.${n}.0`
		const jar = makeJar([`v${n}/Main.class`])
		// biome-ignore lint/performance/noAwaitInLoops: versions must arrive in order.
		const response = await h.put(jar, {
			version,
			manifest: encode(manifest({ version, builtAt: `2026-10-0${n}T00:00:00.000Z` })),
		})
		expect(response.status).toBe(200)
	}
	const versions = (await h.index()).targets[id]?.versions.map(item => item.version)
	expect(versions).toEqual(['0.3.0', '0.2.0'])
	expect(h.client.objects.has(`mods/${id}/0.1.0/minemories-${id}-0.1.0.jar`)).toBe(false)
	expect(h.client.objects.has(`latest/${id}.jar`)).toBe(true)
})

test('invalid parameters and headers are rejected before any write', async () => {
	const h = harness()
	const jar = makeJar()
	const status = async (promise: Promise<Response> | Response) => (await promise).status
	expect(await status(h.put(jar, { targetId: 'Fabric_1.21' }))).toBe(400)
	expect(await status(h.put(jar, { version: 'v..x' }))).toBe(400)
	expect(await status(h.put(jar, { sha: null }))).toBe(400)
	expect(await status(h.put(jar, { sha: 'F'.repeat(64) }))).toBe(400)
	expect(await status(h.put(jar, { manifest: null }))).toBe(400)
	expect(await status(h.put(jar, { manifest: '***' }))).toBe(400)
	expect(await status(h.put(jar, { manifest: Buffer.from('{').toString('base64url') }))).toBe(400)
	expect(await status(h.put(jar, { manifest: 'A'.repeat(5000) }))).toBe(400)
	expect(await status(h.put(jar, { manifest: encode(manifest({ builtBy: 'laptop' })) }))).toBe(400)
	expect(await status(h.put(jar, { manifest: encode(manifest({ commit: 'not a commit' })) }))).toBe(400)
	expect(await status(h.put(new Uint8Array(), { sha: sha256Hex(jar) }))).toBe(400)
	expect(await status(h.put(jar, { length: 'abc' }))).toBe(400)
	expect(h.client.calls).toHaveLength(0)
})

test('the manifest must match the URL and itself', async () => {
	const h = harness()
	const jar = makeJar()
	const mismatches = [
		manifest({ id: 'forge-mc1.21.11' }),
		manifest({ version: '0.6.0' }),
		manifest({ loader: 'forge' }),
		manifest({ minecraft: '1.20.1' }),
	]
	for (const value of mismatches) {
		// biome-ignore lint/performance/noAwaitInLoops: a few requests in sequence.
		const response = await h.put(jar, { manifest: encode(value) })
		expect(response.status).toBe(422)
		expect(await response.json()).toEqual({ error: 'manifest_mismatch' })
	}
	expect(h.client.calls).toHaveLength(0)
})

test('size: Content-Length required, configurable cap, declared length verified', async () => {
	const h = harness({ MOD_UPLOAD_MAX_BYTES: '4000' })
	const jar = makeJar()
	const stream = (bytes: Uint8Array) =>
		new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(bytes)
				controller.close()
			},
		})
	const chunked = await h.put(stream(jar), { sha: sha256Hex(jar) })
	expect(chunked.status).toBe(411)
	const big = makeJar(['a/Big.class'], 5000)
	const tooBig = await h.put(big)
	expect(tooBig.status).toBe(413)
	const larger = await h.put(stream(jar), { sha: sha256Hex(jar), length: String(jar.length - 1) })
	expect(larger.status).toBe(413)
	const shorter = await h.put(stream(jar), { sha: sha256Hex(jar), length: String(jar.length + 10) })
	expect(shorter.status).toBe(400)
	expect(await shorter.json()).toEqual({ error: 'length_mismatch' })
	expect(h.client.calls).toHaveLength(0)
})

test('wrong digest, invalid archive or no class: 422 and nothing is written', async () => {
	const before = tempEntries()
	const h = harness()
	const jar = makeJar()
	const wrong = await h.put(jar, { sha: 'e'.repeat(64) })
	expect(wrong.status).toBe(422)
	expect(await wrong.json()).toEqual({ error: 'sha256_mismatch' })
	const text = new TextEncoder().encode('this is plainly not a jar archive')
	for (const bytes of [text, makeJar(['fabric.mod.json'])]) {
		// biome-ignore lint/performance/noAwaitInLoops: two requests in sequence.
		const response = await h.put(bytes)
		expect(response.status).toBe(422)
		expect(await response.json()).toEqual({ error: 'invalid_jar' })
	}
	expect(h.client.calls).toHaveLength(0)
	expect(tempEntries()).toEqual(before)
})

test('a storage failure yields 503 with a generic event, without token or details', async () => {
	const logged = spyOn(console, 'error').mockImplementation(() => undefined)
	const before = tempEntries()
	const h = harness({}, { store: () => Promise.reject(new Error(`boom with ${TOKEN}`)) })
	const response = await h.put(makeJar())
	expect(response.status).toBe(503)
	expect(await response.json()).toEqual({ error: 'upload_unavailable' })
	expect(logged).toHaveBeenCalledTimes(1)
	const line = String(logged.mock.calls[0]?.[0])
	expect(JSON.parse(line).event).toBe('mod_upload_failed')
	expect(line).not.toContain(TOKEN)
	logged.mockRestore()
	expect(tempEntries()).toEqual(before)
})

test('index updates are serialized and at most two uploads are received in parallel', async () => {
	let active = 0
	let peak = 0
	const h = harness(
		{},
		{
			store: async () => {
				active += 1
				peak = Math.max(peak, active)
				await new Promise(resolve => setTimeout(resolve, 20))
				active -= 1
				return { latest: true, replaced: false, unchanged: false, index: { schema: 1, generatedAt: '', targets: {} } }
			},
		}
	)
	const jar = makeJar()
	const responses = await Promise.all([h.put(jar), h.put(jar)])
	expect(responses.map(response => response.status).sort()).toEqual([200, 200])
	expect(peak).toBe(1)

	const stalled: ReadableStreamDefaultController<Uint8Array>[] = []
	const hanging = () =>
		new ReadableStream<Uint8Array>({
			start(controller) {
				stalled.push(controller)
			},
		})
	const pending = [
		h.put(hanging(), { sha: sha256Hex(jar), length: String(jar.length) }),
		h.put(hanging(), { sha: sha256Hex(jar), length: String(jar.length) }),
	]
	await new Promise(resolve => setTimeout(resolve, 30))
	const busy = await h.put(jar)
	expect(busy.status).toBe(503)
	expect(busy.headers.get('retry-after')).toBe('5')
	for (const controller of stalled) {
		controller.enqueue(jar)
		controller.close()
	}
	expect((await Promise.all(pending)).map(response => response.status)).toEqual([200, 200])
})

test('constant-time token comparison: equal only for the same text', () => {
	expect(tokenMatches(TOKEN, TOKEN)).toBe(true)
	expect(tokenMatches(`${TOKEN}x`, TOKEN)).toBe(false)
	expect(tokenMatches('', TOKEN)).toBe(false)
})

test('in the real API the route is disabled by default, without CORS, and requires the token', async () => {
	const original = process.env.API_TOKEN
	try {
		delete process.env.API_TOKEN
		const origin = { Origin: 'http://localhost:5173' }
		const off = await app.request(`/downloads/upload/${id}/0.5.0`, { method: 'PUT', headers: origin })
		expect(off.status).toBe(404)
		process.env.API_TOKEN = TOKEN
		const denied = await app.request(`/downloads/upload/${id}/0.5.0`, { method: 'PUT', headers: origin })
		expect(denied.status).toBe(401)
		expect(denied.headers.get('access-control-allow-origin')).toBeNull()
		const preflight = await app.request(`/downloads/upload/${id}/0.5.0`, {
			method: 'OPTIONS',
			headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'PUT' },
		})
		expect(preflight.headers.get('access-control-allow-origin')).toBeNull()
		// Public download reads are not affected.
		expect((await app.request('/downloads/upload')).status).toBe(404)
	} finally {
		if (original === undefined) delete process.env.API_TOKEN
		else process.env.API_TOKEN = original
	}
})

test('with a prefix, the route writes under the prefix without touching foreign objects', async () => {
	const prefix = 'public-mods/'
	const { client, put, stored } = harness({ MOD_STORAGE_PREFIX: prefix })
	for (const key of ['users/a/1.glb', 'abc/tiers/x.glb', 'public-mods../x', 'index.json'])
		client.objects.set(key, { body: Buffer.from('foreign'), contentType: 'x', metadata: {} })
	const before = new Map([...client.objects].map(([key, value]) => [key, value.body.toString()]))
	const response = await put(makeJar(['dev/minemories/A.class']))
	expect(response.status).toBe(200)
	expect(stored).toEqual(['stored'])
	for (const [key, text] of before) expect(client.objects.get(key)?.body.toString()).toBe(text)
	const added = [...client.objects.keys()].filter(key => !before.has(key))
	expect(added.length).toBeGreaterThan(0)
	expect(added.every(key => key.startsWith(prefix))).toBe(true)
	expect(added).toContain(`${prefix}index.json`)
})

test('an invalid prefix prevents mounting the upload route', () => {
	expect(() => createModUploads({ env: () => ({ MOD_STORAGE_PREFIX: 'a/../' }) })).toThrow('MOD_STORAGE_PREFIX')
})
