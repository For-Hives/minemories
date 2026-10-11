import { afterAll, expect, test } from 'bun:test'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { apiContract } from '@minemories/api-contract'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { minimalGlb } from './test-support/glb-fixture'
import { largeThumbnail } from './test-support/thumbnail-fixture'

const directory = mkdtempSync(join(tmpdir(), 'minemories-session-'))
process.env.DATABASE_PATH = join(directory, 'db.sqlite')
process.env.LOCAL_OBJECTS_PATH = join(directory, 'objects')
const garageIntegration = process.env.RUN_GARAGE_HTTP_INTEGRATION === '1'
if (garageIntegration && !process.env.S3_BUCKET?.startsWith('minemories-integration')) {
	throw new Error('Garage HTTP integration requires a dedicated minemories-integration bucket.')
}
process.env.STORAGE_DRIVER = garageIntegration ? 's3' : 'filesystem'
process.env.BETTER_AUTH_SECRET = 'session-test-secret-with-at-least-32-characters'
process.env.PAIRING_PEPPER = 'session-test-pepper-with-at-least-32-characters'
const { app } = await import('./index')
const { database } = await import('./database')
const { removeMemory, storeMemory } = await import('./storage')
afterAll(() => {
	database.close()
	rmSync(directory, { recursive: true, force: true })
})
function rpc(cookie = ''): ContractRouterClient<typeof apiContract> {
	return createORPCClient(
		new RPCLink({
			url: 'http://localhost:3001/rpc',
			fetch: async (request, init) => {
				const headers = new Headers(request.headers)
				headers.set('cookie', cookie)
				return app.fetch(new Request(request, { ...init, headers }))
			},
		})
	)
}
function authRequest(path: string, body: unknown, cookie = '') {
	return app.request(`/api/auth/${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', origin: 'http://localhost:5173', cookie },
		body: JSON.stringify(body),
	})
}
async function register(email: string) {
	const response = await authRequest('sign-up/email', { email, password: 'a-real-test-password', name: 'Tester' })
	expect(response.status).toBe(200)
	const cookie = response.headers.get('set-cookie')?.split(';')[0]
	if (!cookie) throw new Error('Registration did not create a session cookie')
	return cookie
}
test('real sessions enforce ownership and memory lifecycle through HTTP/oRPC', async () => {
	const cookie = await register('owner@example.com')
	const otherCookie = await register('other@example.com')
	const other = rpc(otherCookie)
	const owner = rpc(cookie)
	const anonymous = rpc()
	expect((await app.request('/rpc/not-a-procedure', { headers: { cookie } })).status).toBe(404)
	expect(await owner.pairing.status()).toEqual({ paired: false })
	const pairing = await owner.pairing.create()
	expect(await owner.pairing.check({ code: pairing.code })).toEqual({ status: 'pending' })
	const pair = await app.request('/api/mod/pair', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ code: pairing.code }),
	})
	const { deviceToken } = (await pair.json()) as { deviceToken: string }
	expect(await owner.pairing.check({ code: pairing.code })).toEqual({ status: 'paired' })
	expect(await owner.pairing.status()).toEqual({ paired: true })
	const glb = minimalGlb()
	const uploaded = await app.request('/api/mod/memories', {
		method: 'POST',
		headers: { authorization: `Bearer ${deviceToken}`, 'content-type': 'model/gltf-binary' },
		body: Uint8Array.from(glb).buffer,
	})
	expect(uploaded.status).toBe(201)
	const { id } = (await uploaded.json()) as { id: string }
	const input = { id }
	const image = largeThumbnail()
	expect(image.length).toBe(95_998)
	const operations = [
		(client: ReturnType<typeof rpc>) => client.pairing.create(),
		(client: ReturnType<typeof rpc>) => client.pairing.check({ code: pairing.code }),
		(client: ReturnType<typeof rpc>) => client.pairing.status(),
		(client: ReturnType<typeof rpc>) => client.memories.list(),
		(client: ReturnType<typeof rpc>) => client.memories.listTrash(),
		(client: ReturnType<typeof rpc>) => client.memories.rename({ id, name: 'Cabin' }),
		(client: ReturnType<typeof rpc>) => client.memories.trash(input),
		(client: ReturnType<typeof rpc>) => client.memories.restore(input),
		(client: ReturnType<typeof rpc>) => client.memories.delete(input),
		(client: ReturnType<typeof rpc>) => client.memories.setThumbnail({ id, thumbnail: image }),
		(client: ReturnType<typeof rpc>) => client.memories.createShare(input),
		(client: ReturnType<typeof rpc>) => client.memories.revokeShare(input),
		(client: ReturnType<typeof rpc>) => client.memories.shareStatus(input),
	]
	await Promise.all(
		operations.map(async operation => {
			await expect(operation(anonymous)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
		})
	)
	expect(await other.memories.list()).toEqual([])
	await Promise.all(
		operations.slice(5, 11).map(async operation => {
			await expect(operation(other)).rejects.toMatchObject({ code: 'NOT_FOUND' })
		})
	)
	expect((await app.request(`/api/memories/${id}/file`, { headers: { cookie: otherCookie } })).status).toBe(404)
	await expect(owner.memories.rename({ id, name: ' ' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
	await owner.memories.rename({ id, name: 'Cabin' })
	await owner.memories.setThumbnail({ id, thumbnail: image, icon: image })
	expect(await owner.memories.list()).toMatchObject([
		{ id, name: 'Cabin', metadata: { thumbnail: image, icon: image } },
	])
	const file = await app.request(`/api/memories/${id}/file`, { headers: { cookie } })
	expect(file.status).toBe(200)
	expect(file.headers.get('cache-control')).toBe('private, no-store')
	expect(Buffer.from(await file.arrayBuffer()).toString('hex')).toBe(glb.toString('hex'))
	const share = await owner.memories.createShare(input)
	const stored = database
		.query<{ object_key: string }, [string]>('SELECT object_key FROM memories WHERE id = ?')
		.get(id)
	if (!stored) throw new Error('Missing fixture memory')
	await removeMemory(stored.object_key)
	const unavailable = await app.request(`/api/memories/${id}/file`, { headers: { cookie } })
	expect(unavailable.status).toBe(503)
	expect(await unavailable.json()).toEqual({ error: 'memory_storage_unavailable' })
	const unavailableShare = await app.request(`/api/shared/${share.token}/file`)
	expect(unavailableShare.status).toBe(503)
	expect(await unavailableShare.json()).toEqual({ error: 'memory_storage_unavailable' })
	// Missing storage must neither delete metadata nor leak another account's existence.
	expect((await app.request(`/api/memories/${id}/file`, { headers: { cookie: otherCookie } })).status).toBe(404)
	expect(await owner.memories.list()).toMatchObject([{ id }])
	await storeMemory(stored.object_key, glb)
	const recovered = await app.request(`/api/memories/${id}/file`, { headers: { cookie } })
	expect(recovered.status).toBe(200)
	expect(Buffer.from(await recovered.arrayBuffer()).equals(glb)).toBe(true)
	const sharedFile = await app.request(`/api/shared/${share.token}/file`)
	expect(sharedFile.status).toBe(200)
	expect(sharedFile.headers.get('cache-control')).toBe('private, no-store')
	expect(Buffer.from(await sharedFile.arrayBuffer()).equals(glb)).toBe(true)
	const sharedMetadata = await app.request(`/api/shared/${share.token}`)
	expect(sharedMetadata.status).toBe(200)
	expect(sharedMetadata.headers.get('cache-control')).toBe('private, no-store')
	expect(await owner.memories.shareStatus(input)).toEqual({ shared: true })
	await other.memories.revokeShare(input)
	expect(await owner.memories.shareStatus(input)).toEqual({ shared: true })
	await owner.memories.revokeShare(input)
	expect((await app.request(`/api/shared/${share.token}/file`)).status).toBe(404)
	expect((await app.request(`/api/shared/${share.token}`)).status).toBe(404)
	await owner.memories.trash(input)
	expect(await owner.memories.list()).toEqual([])
	const trashed = await owner.memories.listTrash()
	expect(trashed).toMatchObject([{ id }])
	const trashEntry = trashed[0]
	if (!trashEntry?.purgeAt) throw new Error('Missing trash deadline from RPC contract')
	expect(Date.parse(trashEntry.purgeAt) - Date.parse(trashEntry.deletedAt)).toBe(2_592_000_000)
	expect((await app.request(`/api/memories/${id}/file`, { headers: { cookie } })).status).toBe(200)
	await owner.memories.restore(input)
	expect(await owner.memories.listTrash()).toEqual([])
	await owner.memories.delete(input)
	expect(await owner.memories.list()).toEqual([])
	expect((await authRequest('sign-out', {}, cookie)).status).toBe(200)
	await expect(owner.memories.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
})
test('login rejects invalid credentials and restores a real session', async () => {
	await register('login@example.com')
	expect((await authRequest('sign-in/email', { email: 'login@example.com', password: 'wrong-password' })).status).toBe(
		401
	)
	const response = await authRequest('sign-in/email', { email: 'login@example.com', password: 'a-real-test-password' })
	expect(response.status).toBe(200)
	expect(await rpc(response.headers.get('set-cookie')?.split(';')[0]).memories.list()).toEqual([])
	expect(
		(await authRequest('sign-up/email', { email: 'short@example.com', password: 'short', name: 'Tester' })).status
	).toBe(400)
})

test('authenticated readers recover a resumable mod capture across the 4 MiB chunk boundary', async () => {
	const cookie = await register('chunk-owner@example.com')
	const owner = rpc(cookie)
	const code = await owner.pairing.create()
	const paired = await app.request('/api/mod/pair', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ code: code.code }),
	})
	const { deviceToken } = (await paired.json()) as { deviceToken: string }
	const bytes = minimalGlb(Buffer.alloc(5 * 1024 * 1024, 17))
	const id = randomUUID()
	const initialized = await app.request('/api/mod/uploads', {
		method: 'POST',
		headers: { authorization: `Bearer ${deviceToken}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			id,
			size: bytes.length,
			sha256: createHash('sha256').update(bytes).digest('hex'),
			metadata: { worldName: 'Chunk test' },
		}),
	})
	expect(initialized.status).toBe(201)
	for (let offset = 0; offset < bytes.length; offset += 4 * 1024 * 1024) {
		const chunk = bytes.subarray(offset, Math.min(offset + 4 * 1024 * 1024, bytes.length))
		// biome-ignore lint/performance/noAwaitInLoops: offsets require each chunk to finish before the next one.
		const uploaded = await app.request(`/api/mod/uploads/${id}`, {
			method: 'PUT',
			headers: {
				authorization: `Bearer ${deviceToken}`,
				'content-type': 'application/octet-stream',
				'upload-offset': String(offset),
			},
			body: Uint8Array.from(chunk).buffer,
		})
		expect(uploaded.status).toBe(200)
	}
	const completed = await app.request(`/api/mod/uploads/${id}/complete`, {
		method: 'POST',
		headers: { authorization: `Bearer ${deviceToken}` },
	})
	expect(completed.status).toBe(201)
	const { id: memoryId } = (await completed.json()) as { id: string }
	const file = await app.request(`/api/memories/${memoryId}/file`, { headers: { cookie } })
	expect(file.status).toBe(200)
	expect(Buffer.from(await file.arrayBuffer()).equals(bytes)).toBe(true)
	await owner.memories.delete({ id: memoryId })
	expect((await app.request(`/api/memories/${memoryId}/file`, { headers: { cookie } })).status).toBe(404)
})
