import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { apiContract } from '@minemories/api-contract'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { minimalGlb } from './test-support/glb-fixture'

const directory = mkdtempSync(join(tmpdir(), 'minemories-session-'))
process.env.DATABASE_PATH = join(directory, 'db.sqlite')
process.env.LOCAL_OBJECTS_PATH = join(directory, 'objects')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.BETTER_AUTH_SECRET = 'session-test-secret-with-at-least-32-characters'
process.env.PAIRING_PEPPER = 'session-test-pepper-with-at-least-32-characters'
const { app } = await import('./index')
const { database } = await import('./database')
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
	const image = 'data:image/png;base64,AAAA'
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
	expect(await owner.memories.shareStatus(input)).toEqual({ shared: true })
	await other.memories.revokeShare(input)
	expect(await owner.memories.shareStatus(input)).toEqual({ shared: true })
	await owner.memories.revokeShare(input)
	expect((await app.request(`/api/shared/${share.token}/file`)).status).toBe(404)
	await owner.memories.trash(input)
	expect(await owner.memories.list()).toEqual([])
	expect(await owner.memories.listTrash()).toMatchObject([{ id }])
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
