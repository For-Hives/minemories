import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { minimalGlb } from './test-support/glb-fixture'

const directory = mkdtempSync(join(tmpdir(), 'minemories-routes-'))
process.env.DATABASE_PATH = join(directory, 'test.sqlite')
process.env.LOCAL_OBJECTS_PATH = join(directory, 'objects')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.BETTER_AUTH_SECRET = 'test-auth-secret-at-least-32-characters'
process.env.PAIRING_PEPPER = 'test-pairing-pepper-at-least-32-characters'

const { app } = await import('./index')
const { database } = await import('./database')
const { createPairingCode, getDeviceFromToken } = await import('./pairing')

afterAll(() => {
	database.close()
	rmSync(directory, { recursive: true, force: true })
})

function pairRequest(body: unknown, address: string) {
	return app.request('/api/mod/pair', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-forwarded-for': address },
		body: JSON.stringify(body),
	})
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

	const response = await upload(glb, { 'x-memory-name': '  My capture  ' })
	expect(response.status).toBe(201)
	const memory = (await response.json()) as { id: string; name: string; size: number }
	expect(memory).toMatchObject({ name: 'My capture', size: glb.length })
	expect(readFileSync(join(directory, 'objects', 'upload-owner', `${memory.id}.glb`)).toString('hex')).toBe(
		glb.toString('hex')
	)
	expect((await app.request('/api/mod/status', { headers })).status).toBe(200)
})
