import { afterAll, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { externalGlbs, malformedGeometryGlbs, minimalGlb } from './test-support/glb-fixture'

const directory = mkdtempSync(join(tmpdir(), 'minemories-routes-'))
process.env.DATABASE_PATH = join(directory, 'test.sqlite')
process.env.LOCAL_OBJECTS_PATH = join(directory, 'objects')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.TRUSTED_PROXY_IPS = ''
process.env.BETTER_AUTH_SECRET = 'test-auth-secret-at-least-32-characters'
process.env.PAIRING_PEPPER = 'test-pairing-pepper-at-least-32-characters'

const { app, fetchApi } = await import('./index')
const { database } = await import('./database')
const { createPairingCode, getDeviceFromToken } = await import('./pairing')

afterAll(() => {
	database.close()
	rmSync(directory, { recursive: true, force: true })
})

function pairRequest(body: unknown, address: string) {
	return app.request(
		'/api/mod/pair',
		{
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-forwarded-for': address },
			body: JSON.stringify(body),
		},
		{ peerAddress: address }
	)
}

test('health and CORS keep the web origin explicit', async () => {
	const response = await app.request('/healthz', {
		headers: { origin: 'http://localhost:5173' },
	})
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ status: 'ok' })
	expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
})

test('pairing rejects malformed inputs and only accepts an unused code', async () => {
	const invalid = [null, {}, { code: '12' }, { code: 'abcdef' }, { code: '123456', name: '  ' }]
	const responses = await Promise.all(invalid.map((body, index) => pairRequest(body, `invalid-${index}`)))
	for (const response of responses) {
		expect(response.status).toBe(400)
	}
	expect((await pairRequest({ code: '000000' }, 'absent')).status).toBe(401)

	const { code } = createPairingCode('owner')
	const response = await pairRequest({ code, name: '  Client Minecraft  ' }, 'valid')
	expect(response.status).toBe(200)
	const paired = (await response.json()) as { deviceId: string; deviceToken: string }
	expect(getDeviceFromToken(paired.deviceToken)).toMatchObject({
		id: paired.deviceId,
		userId: 'owner',
		name: 'Client Minecraft',
	})
	expect((await pairRequest({ code }, 'replay')).status).toBe(401)
})

test('pairing throttles a ninth attempt from one address', async () => {
	for (let attempt = 0; attempt < 8; attempt += 1) {
		// biome-ignore lint/performance/noAwaitInLoops: rate limit attempts must arrive in order.
		expect((await pairRequest({ code: '000000' }, 'throttled')).status).toBe(401)
	}
	const response = await pairRequest({ code: '000000' }, 'throttled')
	expect(response.status).toBe(429)
	expect(response.headers.get('retry-after')).toBe('60')
})

test('status and upload require a valid device token', async () => {
	expect((await app.request('/api/mod/status')).status).toBe(401)
	expect((await app.request('/api/mod/status', { headers: { authorization: 'Bearer invalid' } })).status).toBe(401)
	expect((await app.request('/api/mod/memories', { method: 'POST' })).status).toBe(401)
	expect((await app.request('/api/memories/missing/file')).status).toBe(401)
})

test('network requests enforce JSON limits on auth, RPC and initialization while preserving larger binary uploads', async () => {
	const { code } = createPairingCode('body-limit-wire-owner')
	const paired = await pairRequest({ code }, 'body-limit-wire-pair')
	const { deviceToken } = (await paired.json()) as { deviceToken: string }
	const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: fetchApi })
	const endpoints: Array<[string, number]> = [
		['/api/auth/sign-up/email', 16_384],
		['/rpc/memories/list', 262_144],
		['/api/mod/uploads', 262_144],
	]
	try {
		await Promise.all(
			endpoints.map(async ([path, maximum]) => {
				const chunks = [new Uint8Array(maximum), new Uint8Array(1)]
				const body = new ReadableStream<Uint8Array>({
					start(controller) {
						for (const chunk of chunks) controller.enqueue(chunk)
						controller.close()
					},
				})
				const response = await fetch(new URL(path, server.url), {
					method: 'POST',
					body,
					headers: {
						'content-type': 'application/json',
						authorization: `Bearer ${deviceToken}`,
						origin: 'http://localhost:5173',
					},
				})
				expect(response.status).toBe(413)
				expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
				expect(await response.json()).toEqual({ error: 'request_body_too_large' })
			})
		)
		const glb = minimalGlb(Buffer.alloc(262_148))
		const response = await fetch(new URL('/api/mod/memories', server.url), {
			method: 'POST',
			body: Uint8Array.from(glb).buffer,
			headers: { 'content-type': 'model/gltf-binary', authorization: `Bearer ${deviceToken}` },
		})
		expect(response.status).toBe(201)
		const { id } = (await response.json()) as { id: string }
		expect(readFileSync(join(directory, 'objects', 'body-limit-wire-owner', `${id}.glb`)).equals(glb)).toBe(true)
	} finally {
		await server.stop(true)
	}
})

test('legacy upload refuses external resources, replacing JSON and incoherent geometry before storing any capture', async () => {
	const { code } = createPairingCode('external-owner')
	const paired = await pairRequest({ code }, 'external-resource-fixture')
	const { deviceToken } = (await paired.json()) as { deviceToken: string }
	await Promise.all(
		[...externalGlbs(), ...malformedGeometryGlbs()].map(async bytes => {
			const response = await app.request('/api/mod/memories', {
				method: 'POST',
				headers: { authorization: `Bearer ${deviceToken}`, 'content-type': 'model/gltf-binary' },
				body: Uint8Array.from(bytes).buffer,
			})
			expect(response.status).toBe(400)
			expect(await response.json()).toEqual({ error: 'invalid_glb' })
		})
	)
	const { listMemories } = await import('./pairing')
	expect(listMemories('external-owner')).toEqual([])
	expect(existsSync(join(directory, 'objects', 'external-owner'))).toBe(false)
})

test('upload checks size and type, stores the bytes and returns metadata', async () => {
	const { code } = createPairingCode('upload-owner')
	const paired = await pairRequest({ code }, 'upload-pair')
	const { deviceToken } = (await paired.json()) as { deviceToken: string }
	const headers = { authorization: `Bearer ${deviceToken}`, 'content-type': 'model/gltf-binary' }
	const upload = (body: Buffer, extraHeaders: Record<string, string> = {}) =>
		app.request('/api/mod/memories', {
			method: 'POST',
			headers: { ...headers, ...extraHeaders },
			body: Uint8Array.from(body).buffer,
		})

	const glb = minimalGlb()
	expect((await upload(glb, { 'content-type': 'text/plain' })).status).toBe(415)
	expect((await upload(Buffer.alloc(0))).status).toBe(400)
	expect((await upload(glb, { 'content-length': String(100 * 1024 * 1024 + 1) })).status).toBe(413)
	expect((await upload(Buffer.from('glTF-payload'))).status).toBe(400)

	const metadata = JSON.stringify({ x: 12.5, y: 64, z: -4, worldName: 'Test world', seed: '42', raining: false })
	const response = await upload(glb, {
		'x-memory-name': 'Minecraft capture',
		'x-memory-metadata': Buffer.from(metadata).toString('base64url'),
	})
	expect(response.status).toBe(201)
	const memory = (await response.json()) as { id: string; name: string; size: number }
	expect(memory).toMatchObject({ name: 'Test world', size: glb.length })
	const { listMemories } = await import('./pairing')
	expect(listMemories('upload-owner')[0]?.metadata).toMatchObject({
		x: 12.5,
		worldName: 'Test world',
		seed: '42',
		raining: false,
	})
	expect(readFileSync(join(directory, 'objects', 'upload-owner', `${memory.id}.glb`)).toString('hex')).toBe(
		glb.toString('hex')
	)
	expect((await upload(glb, { 'x-memory-metadata': '{invalid' })).status).toBe(400)
	expect((await app.request('/api/mod/status', { headers })).status).toBe(200)
	database.exec(`CREATE TRIGGER reject_test_memory BEFORE INSERT ON memories
		WHEN NEW.name = 'Reject fixture' BEGIN SELECT RAISE(ABORT, 'fixture insert failure'); END`)
	try {
		const failed = await upload(glb, { 'x-memory-name': 'Reject fixture' })
		expect(failed.status).toBe(503)
		expect(await failed.json()).toEqual({ error: 'memory_storage_unavailable' })
		expect(readdirSync(join(directory, 'objects', 'upload-owner'))).toEqual([`${memory.id}.glb`])
		expect(listMemories('upload-owner')).toHaveLength(1)
	} finally {
		database.exec('DROP TRIGGER reject_test_memory')
	}
})

test('mod screenshots become folder icons while 3D thumbnails stay empty', async () => {
	const { code } = createPairingCode('icon-owner')
	const paired = await pairRequest({ code }, 'icon-pair')
	const { deviceToken } = (await paired.json()) as { deviceToken: string }
	const icon = `data:image/png;base64,${'A'.repeat(64)}`
	const response = await app.request('/api/mod/memories', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${deviceToken}`,
			'content-type': 'model/gltf-binary',
			'x-memory-metadata': Buffer.from(JSON.stringify({ worldName: 'Icon world', thumbnail: icon })).toString(
				'base64url'
			),
		},
		body: Uint8Array.from(minimalGlb()).buffer,
	})
	expect(response.status).toBe(201)
	const { listMemories } = await import('./pairing')
	expect(listMemories('icon-owner')[0]).toMatchObject({ metadata: { icon, thumbnail: null } })
})

test('shared snapshots open without an account until revoked', async () => {
	const { addMemory, createShareLink } = await import('./pairing')
	const { storeMemory } = await import('./storage')
	const { code } = createPairingCode('share-owner')
	const paired = await pairRequest({ code }, 'share-pair')
	const { deviceToken } = (await paired.json()) as { deviceToken: string }
	const { id: deviceId } = getDeviceFromToken(deviceToken) as { id: string }
	const glb = minimalGlb()
	addMemory({
		id: '19e2b9a5-9c9c-4c9c-8c9c-9c9c9c9c9c9c',
		userId: 'share-owner',
		deviceId,
		name: 'Shared build',
		objectKey: 'share-owner/shared.glb',
		size: glb.length,
	})
	await storeMemory('share-owner/shared.glb', glb)

	expect((await app.request('/api/shared/unknown-token-that-is-long-enough')).status).toBe(404)
	const missing = createShareLink('share-owner', '19e2b9a5-9c9c-4c9c-8c9c-9c9c9c9c9c9c')
	if (!missing) throw new Error('Share link creation unexpectedly failed.')

	const metadata = await app.request(`/api/shared/${missing.token}`)
	expect(metadata.status).toBe(200)
	expect(await metadata.json()).toMatchObject({ id: '19e2b9a5-9c9c-4c9c-8c9c-9c9c9c9c9c9c', name: 'Shared build' })
	const file = await app.request(`/api/shared/${missing.token}/file`)
	expect(file.status).toBe(200)
	expect(file.headers.get('content-type')).toBe('model/gltf-binary')
	expect((await file.arrayBuffer()).byteLength).toBe(glb.length)
})

test('pairing rejects oversized JSON even with a forged small Content-Length', async () => {
	for (const declaredLength of ['9999', '1']) {
		// biome-ignore lint/performance/noAwaitInLoops: exercise both early rejection and streaming enforcement.
		const response = await app.request(
			'/api/mod/pair',
			{
				method: 'POST',
				headers: { 'content-type': 'application/json', 'content-length': declaredLength },
				body: JSON.stringify({ code: '123456', padding: 'a'.repeat(4096) }),
			},
			{ peerAddress: `body-limit-${declaredLength}` }
		)
		expect(response.status).toBe(413)
		expect(await response.json()).toEqual({ error: 'pairing_request_too_large' })
	}
})

test('spoofed proxy headers cannot reset a direct client pairing limit', async () => {
	for (let attempt = 0; attempt < 9; attempt += 1) {
		// biome-ignore lint/performance/noAwaitInLoops: requests from the same peer must be counted in order.
		const response = await app.request(
			'/api/mod/pair',
			{
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-forwarded-for': `198.51.100.${attempt}`,
					'cf-connecting-ip': `203.0.113.${attempt}`,
				},
				body: JSON.stringify({ code: 'abcdef' }),
			},
			{ peerAddress: '192.0.2.77' }
		)
		expect(response.status).toBe(attempt < 8 ? 400 : 429)
	}
	expect((await pairRequest({ code: 'abcdef' }, '192.0.2.78')).status).toBe(400)
})

test('the actual Bun HTTP server obtains the peer IP instead of trusting request headers', async () => {
	const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: fetchApi })
	try {
		for (let attempt = 0; attempt < 9; attempt += 1) {
			// biome-ignore lint/performance/noAwaitInLoops: real socket requests exercise one client window.
			const response = await fetch(new URL('/api/mod/pair', server.url), {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${attempt}` },
				body: JSON.stringify({ code: 'abcdef' }),
			})
			expect(response.status).toBe(attempt < 8 ? 400 : 429)
			await response.body?.cancel()
		}
		const unknownPeer = await fetchApi(new Request('http://localhost/healthz'), { requestIP: () => null })
		expect(unknownPeer.status).toBe(200)
	} finally {
		server.stop(true)
	}
})
