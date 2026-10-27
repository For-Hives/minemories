import { afterAll, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { apiContract } from '@minemories/api-contract'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { minimalGlb } from './test-support/glb-fixture'
import { buildTileBundle, sha256Hex, tileGlb } from './test-support/tile-bundle-fixture'
import { frameMetadata } from './test-support/timelapse-fixture'

const dir = mkdtempSync(join(tmpdir(), 'minemories-tiles-http-'))
process.env.DATABASE_PATH = join(dir, 'db.sqlite')
process.env.UPLOADS_PATH = join(dir, 'uploads')
process.env.LOCAL_OBJECTS_PATH = join(dir, 'objects')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.BETTER_AUTH_SECRET = 'tiles-test-secret-with-at-least-32-characters'
process.env.PAIRING_PEPPER = 'tiles-test-pepper-with-at-least-32-characters'
const { auth } = await import('./auth')
async function register(email: string) {
	const response = await auth.handler(
		new Request('http://localhost:3001/api/auth/sign-up/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
			body: JSON.stringify({ email, name: 'Tester', password: 'a-real-tiles-password' }),
		})
	)
	expect(response.status).toBe(200)
	const data = (await response.json()) as { user: { id: string } }
	return { id: data.user.id, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' }
}
const owner = await register('tiles-owner@example.com'),
	other = await register('tiles-other@example.com')
const { app, timelapseMaintenance } = await import('./index')
const { database } = await import('./database')
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
async function pair(cookie: string): Promise<string> {
	const code = await rpc(cookie).pairing.create()
	const paired = await app.request('/api/mod/pair', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ code: code.code }),
	})
	return ((await paired.json()) as { deviceToken: string }).deviceToken
}
const token = await pair(owner.cookie)

/** Resumable upload: initialise, send one chunk (fixtures stay below the chunk size), then complete. */
async function upload(bytes: Buffer, metadata: unknown = frameMetadata) {
	const id = randomUUID()
	const authorization = `Bearer ${token}`
	const init = await app.request('/api/mod/uploads', {
		method: 'POST',
		headers: { authorization, 'content-type': 'application/json' },
		body: JSON.stringify({ id, size: bytes.length, sha256: sha256Hex(bytes), metadata }),
	})
	expect(init.status).toBe(201)
	const put = await app.request(`/api/mod/uploads/${id}`, {
		method: 'PUT',
		headers: { authorization, 'content-type': 'application/octet-stream', 'upload-offset': '0' },
		body: Uint8Array.from(bytes).buffer,
	})
	expect(put.status).toBe(200)
	return app.request(`/api/mod/uploads/${id}/complete`, { method: 'POST', headers: { authorization } })
}
function tileRequest(id: string, x: string | number, z: string | number, cookie?: string) {
	return app.request(`/api/memories/${id}/tiles/${x}/${z}`, { headers: cookie ? { cookie } : {} })
}
const tiles = [
	{ x: 0, z: 0, glb: tileGlb(1) },
	{ x: -1, z: 0, glb: tileGlb(2), quads: 9 },
	{ x: 0, z: -2, glb: tileGlb(3) },
]
/** Manifest order is ascending (x, z), which is also the order the API must list them in. */
const ordered = [
	{ x: -1, z: 0, glb: tileGlb(2) },
	{ x: 0, z: -2, glb: tileGlb(3) },
	{ x: 0, z: 0, glb: tileGlb(1) },
]

async function memoryIdFor(response: Response): Promise<string> {
	expect(response.status).toBe(201)
	return ((await response.json()) as { id: string }).id
}

test('an owner reads each tile of an uploaded bundle while other accounts and anonymous callers cannot', async () => {
	const built = buildTileBundle(tiles)
	const id = await memoryIdFor(await upload(built.bytes))
	const client = rpc(owner.cookie)

	for (const tile of ordered) {
		// biome-ignore lint/performance/noAwaitInLoops: requests stay sequential so assertions name the failing tile.
		const response = await tileRequest(id, tile.x, tile.z, owner.cookie)
		expect(response.status).toBe(200)
		expect(response.headers.get('cache-control')).toBe('private, no-store')
		expect(response.headers.get('content-type')).toBe('model/gltf-binary')
		expect(response.headers.get('x-content-type-options')).toBe('nosniff')
		const body = Buffer.from(await response.arrayBuffer())
		expect(body.equals(tile.glb)).toBe(true)
		const entry = built.manifest.tiles.find(candidate => candidate.x === tile.x && candidate.z === tile.z)
		if (!entry) throw new Error('Missing manifest tile')
		expect(sha256Hex(body)).toBe(entry.sha256)
	}

	expect(await client.timelapse.tiles({ memoryId: id })).toEqual({
		memoryId: id,
		tileChunks: 8,
		tiles: built.manifest.tiles.map(({ x, z, size, sha256, quads }) => ({ x, z, size, sha256, quads })),
	})
	expect((await client.timelapse.tiles({ memoryId: id })).tiles.map(tile => [tile.x, tile.z])).toEqual([
		[-1, 0],
		[0, -2],
		[0, 0],
	])
	expect((await client.timelapse.frames({ memoryId: id })).frames[0]).toMatchObject({ id, tileCount: 3 })

	expect((await tileRequest(id, 9, 9, owner.cookie)).status).toBe(404)
	expect(await (await tileRequest(id, 'abc', 0, owner.cookie)).json()).toEqual({ error: 'tile_not_found' })
	expect((await tileRequest(id, 9999999, 0, owner.cookie)).status).toBe(404)
	expect((await tileRequest(id, 99999999, 0, owner.cookie)).status).toBe(404)

	const anonymous = await tileRequest(id, 0, 0)
	expect(anonymous.status).toBe(401)
	expect(await anonymous.json()).toEqual({ error: 'unauthorized' })

	expect((await tileRequest(id, 0, 0, other.cookie)).status).toBe(404)
	await expect(rpc(other.cookie).timelapse.tiles({ memoryId: id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
	await expect(rpc(other.cookie).timelapse.frames({ memoryId: id })).rejects.toMatchObject({ code: 'NOT_FOUND' })

	await client.memories.trash({ id })
	expect((await tileRequest(id, 0, 0, owner.cookie)).status).toBe(404)
	await expect(client.timelapse.tiles({ memoryId: id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
	await client.memories.restore({ id })
	expect((await tileRequest(id, 0, 0, owner.cookie)).status).toBe(200)
})

test('a bundle with one altered tile byte is refused at completion and no memory is created', async () => {
	const built = buildTileBundle(tiles)
	const altered = Buffer.from(built.bytes)
	const firstTile = built.manifest.tiles[0]
	if (!firstTile) throw new Error('Missing fixture tile')
	const lastByte = 12 + built.bytes.readUInt32LE(8) + firstTile.offset + firstTile.size - 1
	altered[lastByte] = (altered[lastByte] ?? 0) ^ 0xff
	const before = database.query('SELECT COUNT(*) AS count FROM memories').get()
	const id = randomUUID()
	const authorization = `Bearer ${token}`
	await app.request('/api/mod/uploads', {
		method: 'POST',
		headers: { authorization, 'content-type': 'application/json' },
		body: JSON.stringify({ id, size: altered.length, sha256: sha256Hex(altered), metadata: frameMetadata }),
	})
	await app.request(`/api/mod/uploads/${id}`, {
		method: 'PUT',
		headers: { authorization, 'content-type': 'application/octet-stream', 'upload-offset': '0' },
		body: Uint8Array.from(altered).buffer,
	})
	const complete = await app.request(`/api/mod/uploads/${id}/complete`, { method: 'POST', headers: { authorization } })
	expect(complete.status).toBe(400)
	expect(await complete.json()).toEqual({ error: 'invalid_glb_or_checksum' })
	expect(database.query('SELECT COUNT(*) AS count FROM memories').get()).toEqual(before)
	expect(database.query('SELECT completed FROM mod_uploads WHERE id = ?').get(id)).toEqual({ completed: 0 })
})

test('plain GLB uploads still complete without tile rows or tile routes', async () => {
	const bin = Buffer.alloc(64 * 1024, 9)
	const glb = minimalGlb(bin, { asset: { version: '2.0' }, buffers: [{ byteLength: bin.length }] })
	const id = await memoryIdFor(await upload(glb, { worldName: 'Plain world' }))
	expect(database.query('SELECT COUNT(*) AS count FROM memory_tiles WHERE memory_id = ?').get(id)).toEqual({ count: 0 })
	expect((await tileRequest(id, 0, 0, owner.cookie)).status).toBe(404)
	await expect(rpc(owner.cookie).timelapse.tiles({ memoryId: id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
})

test('tiles remain byte-identical after timelapse conversion of their stored bundle', async () => {
	const built = buildTileBundle(tiles)
	const id = await memoryIdFor(await upload(built.bytes))
	await timelapseMaintenance.maintain()
	await timelapseMaintenance.maintain()
	expect(database.query('SELECT COUNT(*) AS count FROM timelapse_frames WHERE memory_id = ?').get(id)).toEqual({
		count: 1,
	})
	const original = database.query('SELECT object_key FROM memories WHERE id = ?').get(id) as { object_key: string }
	expect(original.object_key).toBeString()
	for (const tile of ordered) {
		// biome-ignore lint/performance/noAwaitInLoops: requests stay sequential so assertions name the failing tile.
		const response = await tileRequest(id, tile.x, tile.z, owner.cookie)
		expect(response.status).toBe(200)
		expect(Buffer.from(await response.arrayBuffer()).equals(tile.glb)).toBe(true)
	}
})

test('a stored tile whose bytes no longer match its digest answers 502 without serving them', async () => {
	const built = buildTileBundle(tiles)
	const id = await memoryIdFor(await upload(built.bytes))
	const { object_key: key } = database.query('SELECT object_key FROM memories WHERE id = ?').get(id) as {
		object_key: string
	}
	const stored = join(dir, 'objects', key)
	const bytes = Buffer.from(await Bun.file(stored).arrayBuffer())
	const firstTile = built.manifest.tiles[0]
	if (!firstTile) throw new Error('Missing fixture tile')
	const tampered = 12 + built.bytes.readUInt32LE(8) + firstTile.offset + firstTile.size - 1
	bytes[tampered] = (bytes[tampered] ?? 0) ^ 0xff
	await Bun.write(stored, bytes)
	const response = await tileRequest(id, firstTile.x, firstTile.z, owner.cookie)
	expect(response.status).toBe(502)
	expect(await response.json()).toEqual({ error: 'tile_integrity_failed' })
	expect(response.headers.get('cache-control')).toBe('private, no-store')
})
