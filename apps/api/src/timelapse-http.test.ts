import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { apiContract } from '@minemories/api-contract'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { minimalGlb } from './test-support/glb-fixture'
import { frameMetadata } from './test-support/timelapse-fixture'

const dir = mkdtempSync(join(tmpdir(), 'minemories-timelapse-http-'))
process.env.DATABASE_PATH = join(dir, 'db.sqlite')
process.env.LOCAL_OBJECTS_PATH = join(dir, 'objects')
const garageIntegration = process.env.RUN_GARAGE_HTTP_INTEGRATION === '1'
if (garageIntegration && !process.env.S3_BUCKET?.startsWith('minemories-integration'))
	throw new Error('Use a dedicated minemories-integration bucket')
process.env.STORAGE_DRIVER = garageIntegration ? 's3' : 'filesystem'
process.env.BETTER_AUTH_SECRET = 'timelapse-test-secret-with-at-least-32-characters'
process.env.PAIRING_PEPPER = 'timelapse-test-pepper-with-at-least-32-characters'
const { auth } = await import('./auth')
async function register(email: string) {
	const response = await auth.handler(
		new Request('http://localhost:3001/api/auth/sign-up/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
			body: JSON.stringify({ email, name: 'Tester', password: 'a-real-timelapse-password' }),
		})
	)
	expect(response.status).toBe(200)
	const data = (await response.json()) as { user: { id: string } }
	return { id: data.user.id, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' }
}
const owner = await register('owner@example.com'),
	other = await register('other@example.com')
process.env.PUBLIC_MODERATOR_IDS = other.id
const { readMemoryStream } = await import('./storage')
const { storageInventory } = await import('./storage-inventory')
const { collectReconciliationPlan } = await import('./storage-reconciliation-plan')
const { app, timelapseMaintenance } = await import('./index'),
	{ database } = await import('./database')
afterAll(async () => {
	await timelapseMaintenance.stop()
	database.close()
	rmSync(dir, { recursive: true, force: true })
})
function rpc(cookie: string): ContractRouterClient<typeof apiContract> {
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

test('real API routes serve deduplicated captures privately, by share and after public moderation, then reclaim them', async () => {
	const client = rpc(owner.cookie),
		pairing = await client.pairing.create()
	const paired = await app.request('/api/mod/pair', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ code: pairing.code }),
	})
	const { deviceToken } = (await paired.json()) as { deviceToken: string }
	const bin = Buffer.alloc(768 * 1024, 7),
		data = minimalGlb(bin, { asset: { version: '2.0' }, buffers: [{ byteLength: bin.length }] })
	const uploaded = await app.request('/api/mod/memories', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${deviceToken}`,
			'content-type': 'model/gltf-binary',
			'x-memory-metadata': JSON.stringify(frameMetadata),
		},
		body: Uint8Array.from(data).buffer,
	})
	expect(uploaded.status).toBe(201)
	const { id } = (await uploaded.json()) as { id: string }
	const original = (database.query('SELECT object_key FROM memories WHERE id=?').get(id) as { object_key: string })
		.object_key
	const timeline = await client.timelapse.frames({ memoryId: id })
	expect(timeline).toMatchObject({
		totalFrames: 1,
		mode: 'around',
		dimension: 'minecraft:overworld',
		frames: [{ id, timeSource: 'upload', origin: { x: 1, y: 1, z: 1 } }],
	})
	await expect(rpc(other.cookie).timelapse.frames({ memoryId: id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
	await expect(rpc('').timelapse.frames({ memoryId: id })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
	const shared = await client.memories.createShare({ id })
	const published = await client.discovery.publish({
		memoryId: id,
		title: 'Temporal capture',
		description: '',
		category: 'build',
		thumbnail: null,
		consent: true,
	})
	if (!published.id) throw new Error('Missing publication')
	await rpc(other.cookie).discovery.moderate({ id: published.id, decision: 'approved' })
	await timelapseMaintenance.maintain()
	await timelapseMaintenance.maintain()
	expect(database.query('SELECT COUNT(*) AS count FROM timelapse_frames').get()).toEqual({ count: 1 })
	await expect(readMemoryStream(original)).rejects.toThrow()
	const plan = await collectReconciliationPlan(database, storageInventory(), {
		databasePath: database.filename,
		prefix: `${owner.id}/`,
		now: Date.now() + 48 * 60 * 60 * 1000,
	})
	expect(plan.entries.length).toBeGreaterThan(0)
	expect(plan.entries.every(entry => entry.proposal.action === 'protected')).toBe(true)
	const opening = () => database.query('SELECT last_opened_at FROM memories WHERE id=?').get(id)
	expect(opening()).toEqual({ last_opened_at: null })
	expect((await app.request(`/api/shared/${shared.token}`)).status).toBe(200)
	expect(opening()).toEqual({ last_opened_at: null })
	async function checkDownload(path: string) {
		database.query('UPDATE memories SET last_opened_at=NULL WHERE id=?').run(id)
		const response = await app.request(path, { headers: { cookie: owner.cookie } })
		expect(response.status).toBe(200)
		expect(response.headers.get('cache-control')).toBe('private, no-store')
		expect(Buffer.from(await response.arrayBuffer()).equals(data)).toBe(true)
		expect(opening()).toEqual({ last_opened_at: expect.any(Number) })
	}
	await checkDownload(`/api/memories/${id}/file`)
	await checkDownload(`/api/shared/${shared.token}/file`)
	await checkDownload(`/api/public/${published.id}/file`)
	expect((await app.request(`/api/memories/${id}/file`, { headers: { cookie: other.cookie } })).status).toBe(404)
	expect((await app.request(`/api/memories/${id}/file`)).status).toBe(401)
	expect((await client.account.storage()).usedBytes).toBe(data.length)
	await client.memories.revokeShare({ id })
	await client.discovery.revoke({ memoryId: id })
	expect((await app.request(`/api/shared/${shared.token}/file`)).status).toBe(404)
	expect((await app.request(`/api/public/${published.id}/file`)).status).toBe(404)
	await client.memories.trash({ id })
	await expect(client.timelapse.frames({ memoryId: id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
	await client.memories.restore({ id })
	expect((await client.timelapse.frames({ memoryId: id })).totalFrames).toBe(1)
	const restored = await app.request(`/api/memories/${id}/file`, { headers: { cookie: owner.cookie } })
	expect(Buffer.from(await restored.arrayBuffer()).equals(data)).toBe(true)
	await client.memories.delete({ id })
	await expect(client.timelapse.frames({ memoryId: id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
	await timelapseMaintenance.maintain()
	expect((await client.account.storage()).usedBytes).toBe(0)
	expect(await Array.fromAsync(storageInventory().objects(`${owner.id}/`))).toEqual([])
})
