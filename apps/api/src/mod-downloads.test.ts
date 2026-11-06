import { afterAll, expect, spyOn, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { S3ServiceException } from '@aws-sdk/client-s3'
import { type ModIndex, modIndex } from '@minemories/api-contract'
import { Hono } from 'hono'

const directory = mkdtempSync(join(tmpdir(), 'minemories-mod-downloads-'))
process.env.DATABASE_PATH = join(directory, 'test.sqlite')
process.env.LOCAL_OBJECTS_PATH = join(directory, 'objects')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.TRUSTED_PROXY_IPS = ''
process.env.BETTER_AUTH_SECRET = 'test-auth-secret-at-least-32-characters'
process.env.PAIRING_PEPPER = 'test-pairing-pepper-at-least-32-characters'

const { createModDownloads, s3ModSource, modBucket } = await import('./mod-downloads')
const { app } = await import('./index')
const { database } = await import('./database')
const { s3Target } = await import('./storage-s3')

afterAll(() => {
	database.close()
	rmSync(directory, { recursive: true, force: true })
})

const sha = 'a'.repeat(64)
const jar = new TextEncoder().encode('fake-jar-bytes')
const id = 'fabric-mc1.21.11'
const entry = (version: string, key = `mods/${id}/${version}/minemories-${id}-${version}.jar`) => ({
	version,
	builtAt: '2026-10-01T00:00:00Z',
	commit: 'abc1234',
	bytes: jar.length,
	sha256: sha,
	key,
})
const index: ModIndex = {
	schema: 1,
	generatedAt: '2026-10-01T00:00:00Z',
	targets: {
		[id]: {
			loader: 'fabric',
			minecraft: '1.21.11',
			loaderVersion: '0.19.5',
			java: '21',
			fabricApi: '0.1+1.21.11',
			latest: '0.2.0',
			versions: [entry('0.2.0'), entry('0.1.0')],
		},
	},
}

function fakeSource(files: Record<string, string>, opened: string[] = []) {
	return {
		readText: async (key: string) => files[key] ?? null,
		open: async (key: string) => {
			opened.push(key)
			return key.endsWith('.jar') && files[key] !== undefined
				? { body: new Response(jar).body as ReadableStream<Uint8Array>, bytes: jar.length }
				: null
		},
	}
}
function mount(files: Record<string, string>, opened: string[] = [], ttl = 0) {
	const router = new Hono()
	router.route(
		'/downloads',
		createModDownloads(() => fakeSource(files, opened), ttl)
	)
	return router
}
const withIndex = (value: unknown = index) => ({
	'index.json': JSON.stringify(value),
	[`mods/${id}/0.2.0/minemories-${id}-0.2.0.jar`]: 'x',
	[`mods/${id}/0.1.0/minemories-${id}-0.1.0.jar`]: 'x',
})

test('index.json est public, valide, avec ETag et cache court, et répond 304', async () => {
	const router = mount(withIndex())
	const response = await router.request('/downloads/index.json')
	expect(response.status).toBe(200)
	modIndex.parse(await response.json())
	expect(response.headers.get('content-type')).toContain('application/json')
	expect(response.headers.get('cache-control')).toBe('public, max-age=60, must-revalidate')
	expect(response.headers.get('x-content-type-options')).toBe('nosniff')
	const etag = response.headers.get('etag') ?? ''
	const again = await router.request('/downloads/index.json', { headers: { 'If-None-Match': etag } })
	expect(again.status).toBe(304)
	expect(await again.text()).toBe('')
})

test('un bucket sans index donne un index vide, un index invalide donne 503', async () => {
	const empty = await mount({}).request('/downloads/index.json')
	expect(empty.status).toBe(200)
	expect((await empty.json()).targets).toEqual({})
	const silenced = spyOn(console, 'error').mockImplementation(() => undefined)
	const broken = await mount({ 'index.json': '{"schema":9}' }).request('/downloads/index.json')
	expect(broken.status).toBe(503)
	expect(await broken.json()).toEqual({ error: 'downloads_unavailable' })
	expect(broken.headers.get('cache-control')).toBe('no-store')
	silenced.mockRestore()
})

test('latest et une version précise sont servies en flux avec les en-têtes de distribution', async () => {
	const opened: string[] = []
	const router = mount(withIndex(), opened)
	const latest = await router.request(`/downloads/${id}/latest`)
	expect(latest.status).toBe(200)
	expect(new Uint8Array(await latest.arrayBuffer())).toEqual(jar)
	expect(latest.headers.get('content-type')).toBe('application/java-archive')
	expect(latest.headers.get('content-disposition')).toBe(`attachment; filename="minemories-${id}-0.2.0.jar"`)
	expect(latest.headers.get('x-content-sha256')).toBe(sha)
	expect(latest.headers.get('x-minemories-version')).toBe('0.2.0')
	expect(latest.headers.get('content-length')).toBe(String(jar.length))
	expect(latest.headers.get('cache-control')).toBe('public, max-age=60, must-revalidate')
	const old = await router.request(`/downloads/${id}/0.1.0`)
	expect(old.headers.get('content-disposition')).toContain('-0.1.0.jar')
	expect(old.headers.get('cache-control')).toContain('immutable')
	expect(opened).toEqual([`mods/${id}/0.2.0/minemories-${id}-0.2.0.jar`, `mods/${id}/0.1.0/minemories-${id}-0.1.0.jar`])
	await old.arrayBuffer()
})

test('If-None-Match évite de rouvrir le JAR; HEAD ne renvoie pas de corps', async () => {
	const opened: string[] = []
	const router = mount(withIndex(), opened)
	const cached = await router.request(`/downloads/${id}/0.2.0`, { headers: { 'If-None-Match': `"${sha}"` } })
	expect(cached.status).toBe(304)
	expect(opened).toEqual([])
	const head = await router.request(`/downloads/${id}/0.2.0`, { method: 'HEAD' })
	expect(head.status).toBe(200)
	expect(await head.text()).toBe('')
})

test('cible ou version inconnue, ou JAR absent du bucket : 404 propre', async () => {
	const router = mount(withIndex())
	const paths = [`${id}/9.9.9`, 'forge-mc1.20.1/latest', 'forge-mc1.20.1/0.1.0']
	const responses = await Promise.all(paths.map(path => router.request(`/downloads/${path}`)))
	for (const response of responses) expect(response.status).toBe(404)
	expect(await responses[0]?.json()).toEqual({ error: 'not_found' })
	const noObject = mount({ 'index.json': JSON.stringify(index) })
	expect((await noObject.request(`/downloads/${id}/0.2.0`)).status).toBe(404)
})

test('paramètres invalides ou path traversal : 400 sans lire le bucket', async () => {
	const opened: string[] = []
	const router = mount(withIndex(), opened)
	const paths = [
		'..%2F..%2Fetc/latest',
		`${id}/..%2Findex.json`,
		`${id}/%2e%2e`,
		`${id}/0.1.0%00`,
		'Fabric-mc1/latest',
		`${id}/latest.jar`,
		`${id}/1.0/../../x`,
	]
	const responses = await Promise.all(paths.map(path => router.request(`/downloads/${path}`)))
	for (const response of responses) expect([400, 404]).toContain(response.status)
	expect(opened).toEqual([])
	expect((await router.request(`/downloads/${id}/..%2Findex.json`)).status).toBe(400)
	expect((await router.request('/downloads/BAD/latest')).status).toBe(400)
})

test('le cache de l’index évite de relire le bucket dans la fenêtre de validité', async () => {
	let reads = 0
	const router = new Hono()
	router.route(
		'/downloads',
		createModDownloads(
			() => ({
				readText: async () => {
					reads += 1
					return JSON.stringify(index)
				},
				open: async () => null,
			}),
			60_000
		)
	)
	await router.request('/downloads/index.json')
	await router.request('/downloads/index.json')
	expect(reads).toBe(1)
})

test('s3ModSource lit le bucket des mods, distinct de celui des captures', async () => {
	expect(modBucket).toBe('minemories-mods')
	expect(modBucket).not.toBe(s3Target().bucket)
	const calls: { bucket: string; key: string }[] = []
	const send = spyOn(s3Target().client, 'send').mockImplementation((async (command: {
		input: { Bucket: string; Key: string }
	}) => {
		calls.push({ bucket: command.input.Bucket, key: command.input.Key })
		if (command.input.Key === 'missing') {
			throw new S3ServiceException({
				name: 'NoSuchKey',
				$fault: 'client',
				$metadata: { httpStatusCode: 404 },
				message: 'x',
			})
		}
		if (command.input.Key === 'boom') throw new Error('network')
		if (command.input.Key === 'odd') return { Body: 'not-a-stream' }
		return { Body: Readable.from([Buffer.from('he'), Buffer.from('llo')]), ContentLength: 5 }
	}) as never)
	expect(await s3ModSource.readText('index.json')).toBe('hello')
	expect(await s3ModSource.readText('missing')).toBeNull()
	expect(await s3ModSource.open('odd')).toBeNull()
	await expect(s3ModSource.open('boom')).rejects.toThrow('network')
	const opened = await s3ModSource.open('mods/x.jar', new AbortController().signal)
	expect(opened?.bytes).toBe(5)
	expect(await new Response(opened?.body).text()).toBe('hello')
	expect(calls.every(call => call.bucket === 'minemories-mods')).toBe(true)
	send.mockRestore()
})

test('l’application monte /downloads publiquement, sans session', async () => {
	const send = spyOn(s3Target().client, 'send').mockImplementation((async () => {
		throw new S3ServiceException({
			name: 'NoSuchKey',
			$fault: 'client',
			$metadata: { httpStatusCode: 404 },
			message: 'x',
		})
	}) as never)
	const response = await app.request('/downloads/index.json', { headers: { origin: 'http://localhost:5173' } })
	expect(response.status).toBe(200)
	expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
	expect((await response.json()).targets).toEqual({})
	send.mockRestore()
})

const prefixed = (files: Record<string, string>) =>
	Object.fromEntries(Object.entries(files).map(([key, value]) => [`public-mods/${key}`, value]))
function mountPrefixed(files: Record<string, string>, opened: string[] = []) {
	const router = new Hono()
	router.route(
		'/downloads',
		createModDownloads(() => fakeSource(files, opened), 0, 'public-mods/')
	)
	return router
}

test('avec un préfixe, l’index et les JAR sont lus sous le préfixe, la clé venant de l’index', async () => {
	const opened: string[] = []
	const router = mountPrefixed(prefixed(withIndex()), opened)
	expect((await router.request('/downloads/index.json')).status).toBe(200)
	expect((await router.request(`/downloads/${id}/latest`)).status).toBe(200)
	expect((await router.request(`/downloads/${id}/0.1.0`)).status).toBe(200)
	expect(opened).toEqual([
		`public-mods/mods/${id}/0.2.0/minemories-${id}-0.2.0.jar`,
		`public-mods/mods/${id}/0.1.0/minemories-${id}-0.1.0.jar`,
	])
	// Les mêmes objets sans le préfixe ne sont jamais lus : l'index est vide, donc 404.
	const bare = mountPrefixed(withIndex())
	expect((await bare.request('/downloads/index.json')).status).toBe(200)
	expect((await bare.request(`/downloads/${id}/latest`)).status).toBe(404)
})

test('un index corrompu ne peut pas faire servir un objet hors de mods/ ou latest/', async () => {
	const keys = [
		'../users/abc/1.glb',
		'users/abc/1.glb',
		'index.json',
		'/mods/x.jar',
		'mods/../users/a.jar',
		'mods//x.jar',
		'mods/',
		'',
	]
	for (const key of keys) {
		const opened: string[] = []
		const corrupted = { ...index, targets: { [id]: { ...index.targets[id], versions: [entry('0.2.0', key)] } } }
		const files = { ...prefixed({ 'index.json': JSON.stringify(corrupted) }), [`public-mods/${key}`]: 'x', [key]: 'x' }
		// 404 (clé refusée) ou 503 (index rejeté par le schéma) : jamais 200.
		expect([404, 503]).toContain((await mountPrefixed(files, opened).request(`/downloads/${id}/0.2.0`)).status)
		expect(opened).toEqual([])
	}
	const allowed = {
		...index,
		targets: { [id]: { ...index.targets[id], versions: [entry('0.2.0', `latest/${id}.jar`)] } },
	}
	const opened: string[] = []
	const router = mountPrefixed(prefixed({ 'index.json': JSON.stringify(allowed), [`latest/${id}.jar`]: 'x' }), opened)
	expect((await router.request(`/downloads/${id}/0.2.0`)).status).toBe(200)
	expect(opened).toEqual([`public-mods/latest/${id}.jar`])
})

test('l’URL ne construit jamais une clé : seuls des paramètres valides atteignent la source', async () => {
	const opened: string[] = []
	const router = mountPrefixed(prefixed(withIndex()), opened)
	for (const path of [`/downloads/${id}/..%2f..%2fusers`, '/downloads/..%2fusers/latest', `/downloads/${id}/0.9.9`])
		expect([400, 404]).toContain((await router.request(path)).status)
	expect(opened).toEqual([])
})

test('un préfixe invalide empêche le chargement du module de téléchargement', () => {
	const script = "await import('./src/mod-downloads.ts')"
	const result = Bun.spawnSync(['bun', '-e', script], {
		cwd: join(import.meta.dir, '..'),
		stderr: 'pipe',
		env: { ...process.env, MOD_STORAGE_PREFIX: '../x/' },
	})
	expect(result.exitCode).not.toBe(0)
	expect(result.stderr.toString()).toContain('MOD_STORAGE_PREFIX invalide')
})
