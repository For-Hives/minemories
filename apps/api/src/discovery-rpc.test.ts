import { afterAll, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { apiContract } from '@minemories/api-contract'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { minimalGlb } from './test-support/glb-fixture'

const directory = mkdtempSync(join(tmpdir(), 'minemories-discovery-rpc-'))
process.env.DATABASE_PATH = join(directory, 'db.sqlite')
process.env.LOCAL_OBJECTS_PATH = join(directory, 'objects')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.BETTER_AUTH_SECRET = 'discovery-test-secret-with-at-least-32-characters'
process.env.PAIRING_PEPPER = 'discovery-test-pepper-with-at-least-32-characters'
const { auth } = await import('./auth')
async function register(email: string) {
	const response = await auth.handler(
		new Request('http://localhost:3001/api/auth/sign-up/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
			body: JSON.stringify({ email, name: 'Tester', password: 'a-real-discovery-password' }),
		})
	)
	expect(response.status).toBe(200)
	const data = (await response.json()) as { user: { id: string } }
	return { id: data.user.id, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' }
}
const moderator = await register('moderator@example.com')
const owner = await register('owner@example.com')
const voter = await register('voter@example.com')
process.env.PUBLIC_MODERATOR_IDS = moderator.id
const storage = await import('./storage')
const originalRead = storage.readMemoryStream
let failStorage = false
let hold: Promise<void> | null = null
let entered = () => {}
mock.module('./storage', () => ({
	...storage,
	readMemoryStream: async (key: string) => {
		if (failStorage) throw new Error('private-storage-path')
		const stream = await originalRead(key)
		entered()
		if (hold) await hold
		return stream
	},
}))
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
				const response = await app.fetch(new Request(request, { ...init, headers }))
				expect(response.headers.get('cache-control')).toBe('private, no-store')
				return response
			},
		})
	)
}
const ownerApi = rpc(owner.cookie)
const voterApi = rpc(voter.cookie)
const moderatorApi = rpc(moderator.cookie)
const anonymous = rpc()
async function capture() {
	const pairing = await ownerApi.pairing.create()
	const paired = await app.request('/api/mod/pair', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ code: pairing.code }),
	})
	const token = ((await paired.json()) as { deviceToken: string }).deviceToken
	const response = await app.request('/api/mod/memories', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${token}`,
			'content-type': 'model/gltf-binary',
			'x-memory-name': 'Private world',
			'x-memory-metadata': JSON.stringify({ seed: 'secret-seed', worldName: 'private-server', x: 123 }),
		},
		body: Uint8Array.from(minimalGlb()).buffer,
	})
	expect(response.status).toBe(201)
	return ((await response.json()) as { id: string }).id
}
function candidate(memoryId: string) {
	return {
		memoryId,
		title: 'Public village',
		description: 'Chosen description',
		category: 'build' as const,
		thumbnail: null,
		consent: true as const,
	}
}

test('real HTTP/oRPC publication requires consent, ownership and moderation; private fields stay private', async () => {
	const memoryId = await capture()
	expect(await ownerApi.discovery.status({ memoryId })).toMatchObject({ state: 'private' })
	expect(await anonymous.discovery.list({})).toEqual({ items: [], hasMore: false })
	await expect(anonymous.discovery.publish(candidate(memoryId))).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
	await expect(voterApi.discovery.publish(candidate(memoryId))).rejects.toMatchObject({ code: 'NOT_FOUND' })
	await expect(ownerApi.discovery.publish({ ...candidate(memoryId), consent: false } as never)).rejects.toMatchObject({
		code: 'BAD_REQUEST',
	})
	const publication = await ownerApi.discovery.publish(candidate(memoryId))
	const id = publication.id as string
	expect(await anonymous.discovery.moderator()).toEqual({ allowed: false })
	expect(await moderatorApi.discovery.moderator()).toEqual({ allowed: true })
	await expect(ownerApi.discovery.queue({})).rejects.toMatchObject({ code: 'FORBIDDEN' })
	await expect(ownerApi.discovery.review({ id })).rejects.toMatchObject({ code: 'FORBIDDEN' })
	await expect(ownerApi.discovery.moderate({ id, decision: 'approved' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
	await expect(anonymous.discovery.get({ id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
	expect((await app.request(`/api/public/${id}/file`)).status).toBe(404)
	expect(await moderatorApi.discovery.review({ id })).toMatchObject({ title: 'Public village' })
	expect((await moderatorApi.discovery.queue({})).items).toHaveLength(1)
	const reviewFile = await app.request(`/api/public/${id}/file`, { headers: { cookie: moderator.cookie } })
	expect(reviewFile.status).toBe(200)
	expect(new Uint8Array(await reviewFile.arrayBuffer())).toEqual(Uint8Array.from(minimalGlb()))
	await moderatorApi.discovery.moderate({ id, decision: 'approved' })
	const catalogue = await anonymous.discovery.list({ query: 'village', category: 'build', sort: 'votes' })
	expect(catalogue.items).toHaveLength(1)
	const publicJson = JSON.stringify(catalogue)
	for (const secret of ['secret-seed', 'private-server', owner.id, memoryId, 'object_key', 'metadata'])
		expect(publicJson).not.toContain(secret)
	const file = await app.request(`/api/public/${id}/file`)
	expect(file.headers.get('cache-control')).toBe('private, no-store')
	expect(file.headers.get('x-content-type-options')).toBe('nosniff')
	expect(new Uint8Array(await file.arrayBuffer())).toEqual(Uint8Array.from(minimalGlb()))
	await expect(anonymous.discovery.vote({ id, voted: true })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
	const votes = await Promise.all(Array.from({ length: 12 }, () => voterApi.discovery.vote({ id, voted: true })))
	expect(votes.every(vote => vote.votes === 1)).toBe(true)
	expect((await voterApi.discovery.get({ id })).voted).toBe(true)
	await voterApi.discovery.report({ id, reason: 'Please inspect a sign' })
	expect((await moderatorApi.discovery.queue({ state: 'reported' })).items[0]?.reports).toHaveLength(1)
	await expect(anonymous.discovery.report({ id, reason: 'No session' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
	await expect(voterApi.discovery.revoke({ memoryId })).rejects.toMatchObject({ code: 'NOT_FOUND' })
	await ownerApi.discovery.revoke({ memoryId })
	expect((await app.request(`/api/public/${id}/file`)).status).toBe(404)
	await expect(anonymous.discovery.get({ id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
})

test('storage failures are sanitized and revocation wins while opening a public stream', async () => {
	const memoryId = await capture()
	const publication = await ownerApi.discovery.publish(candidate(memoryId))
	const id = publication.id as string
	await moderatorApi.discovery.moderate({ id, decision: 'approved' })
	failStorage = true
	const failure = await app.request(`/api/public/${id}/file`)
	expect(failure.status).toBe(503)
	expect(await failure.json()).toEqual({ error: 'memory_storage_unavailable' })
	failStorage = false
	let release = () => {}
	hold = new Promise<void>(resolve => {
		release = resolve
	})
	const opened = new Promise<void>(resolve => {
		entered = resolve
	})
	const pending = app.request(`/api/public/${id}/file`)
	await opened
	await ownerApi.discovery.revoke({ memoryId })
	release()
	const revoked = await pending
	expect(revoked.status).toBe(404)
	expect(revoked.headers.get('cache-control')).toBe('private, no-store')
	hold = null
	entered = () => {}
})

test('trash/restore through owner RPC never silently republishes an approved capture', async () => {
	const memoryId = await capture()
	const publication = await ownerApi.discovery.publish(candidate(memoryId))
	const id = publication.id as string
	await moderatorApi.discovery.moderate({ id, decision: 'approved' })
	await ownerApi.memories.trash({ id: memoryId })
	expect((await app.request(`/api/public/${id}/file`)).status).toBe(404)
	await ownerApi.memories.restore({ id: memoryId })
	expect((await ownerApi.discovery.status({ memoryId })).state).toBe('revoked')
})
