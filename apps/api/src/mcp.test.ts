import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const directory = mkdtempSync(join(tmpdir(), 'minemories-mcp-test-'))
process.env.DATABASE_PATH = join(directory, 'test.sqlite')
process.env.LOCAL_OBJECTS_PATH = join(directory, 'objects')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.TRUSTED_PROXY_IPS = ''
process.env.BETTER_AUTH_SECRET = 'test-auth-secret-at-least-32-characters'
process.env.PAIRING_PEPPER = 'test-pairing-pepper-at-least-32-characters'

const { createMcpRoute } = await import('./mcp')
const { database } = await import('./database')
await import('./uploads') // creates the upload tables the usage query reads
const { renameMemory, trashMemory, restoreMemory } = await import('./pairing')

afterAll(() => {
	database.close()
	rmSync(directory, { recursive: true, force: true })
})

const TOKEN = 'b'.repeat(40)
const memoryId = '11111111-1111-4111-8111-111111111111'
const memories = { rename: renameMemory, trash: trashMemory, restore: restoreMemory }
let clock = 1_000_000
const route = (env: Record<string, string | undefined> = { API_TOKEN: TOKEN }) =>
	createMcpRoute({ database, memories, env: () => env, now: () => clock })

database.exec(`CREATE TABLE IF NOT EXISTS user(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL,emailVerified INTEGER,image TEXT,createdAt INTEGER,updatedAt INTEGER);
 CREATE TABLE IF NOT EXISTS user_roles(user_id TEXT PRIMARY KEY);`)
database
	.query('INSERT INTO devices(id,user_id,name,token_hash,created_at) VALUES (?,?,?,?,?)')
	.run('device-1', 'owner-1', 'PC', 'hash', Date.now())
database
	.query('INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)')
	.run('owner-1', 'Owner', 'owner@example.test', 1, Date.now(), Date.now())
database
	.query(
		'INSERT INTO memories(id,user_id,device_id,name,object_key,size,created_at,metadata_json) VALUES (?,?,?,?,?,?,?,?)'
	)
	.run(
		memoryId,
		'owner-1',
		'device-1',
		'Castle',
		'owner-1/castle.glb',
		10,
		Date.now(),
		JSON.stringify({ worldName: 'W', thumbnail: 'data:x' })
	)

const call = (app: ReturnType<typeof route>, body: unknown, headers: Record<string, string> = {}, method = 'POST') =>
	app.request('/', {
		method,
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
			authorization: `Bearer ${TOKEN}`,
			...headers,
		},
		...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
	})
const tool = async (name: string, args: Record<string, unknown> = {}) => {
	const response = await call(route(), {
		jsonrpc: '2.0',
		id: 1,
		method: 'tools/call',
		params: { name, arguments: args },
	})
	expect(response.status).toBe(200)
	const payload = (await response.json()) as { result: { isError?: boolean; content: { text: string }[] } }
	return { error: payload.result.isError === true, text: payload.result.content[0]?.text ?? '' }
}

test('the route does not exist without a long enough release token', async () => {
	expect((await call(route({ API_TOKEN: 'short' }), {})).status).toBe(404)
	expect((await call(route({}), {})).status).toBe(404)
})

test('it refuses a missing or wrong token, browsers and non-POST methods', async () => {
	expect((await call(route(), {}, { authorization: '' })).status).toBe(401)
	expect((await call(route(), {}, { authorization: 'Bearer nope' })).status).toBe(401)
	expect((await call(route(), {}, { origin: 'https://evil.example' })).status).toBe(403)
	expect((await call(route(), {}, {}, 'GET')).status).toBe(405)
	const big = await call(route(), {}, { 'content-length': String(10 * 1024 * 1024) })
	expect(big.status).toBe(413)
})

test('repeated bad tokens are rate limited', async () => {
	const app = route()
	for (let i = 0; i < 10; i++) await call(app, {}, { authorization: 'Bearer bad' })
	expect((await call(app, {}, { authorization: 'Bearer bad' })).status).toBe(429)
	clock += 61_000
	expect((await call(app, {}, { authorization: 'Bearer bad' })).status).toBe(401)
})

test('it lists the tools over JSON-RPC', async () => {
	const response = await call(route(), { jsonrpc: '2.0', id: 1, method: 'tools/list' })
	const payload = (await response.json()) as { result: { tools: { name: string }[] } }
	expect(payload.result.tools.map(item => item.name)).toEqual(
		expect.arrayContaining(['platform_summary', 'list_memories', 'rename_memory', 'set_user_minecraft_head'])
	)
})

test('read tools return accounts and captures without inline images', async () => {
	expect(JSON.parse((await tool('platform_summary')).text).users).toBe(1)
	expect(JSON.parse((await tool('list_users', { query: 'owner@' })).text)[0].id).toBe('owner-1')
	expect(JSON.parse((await tool('get_user', { userId: 'owner-1' })).text).role).toBe('user')
	expect((await tool('get_user', { userId: 'missing' })).error).toBe(true)
	const listed = JSON.parse((await tool('list_memories', { userId: 'owner-1' })).text)
	expect(listed[0].metadata).toEqual({ worldName: 'W' })
	expect(JSON.parse((await tool('get_memory', { id: memoryId })).text).name).toBe('Castle')
	expect((await tool('get_memory', { id: '22222222-2222-4222-8222-222222222222' })).error).toBe(true)
})

test('edit tools rename, trash, restore and set account fields', async () => {
	expect((await tool('rename_memory', { id: memoryId, name: 'Keep' })).error).toBe(false)
	expect((await tool('restore_memory', { id: memoryId })).error).toBe(true)
	expect((await tool('trash_memory', { id: memoryId })).error).toBe(false)
	expect(JSON.parse((await tool('list_memories', { trashed: true })).text)).toHaveLength(1)
	expect((await tool('restore_memory', { id: memoryId })).error).toBe(false)
	expect((await tool('rename_memory', { id: '22222222-2222-4222-8222-222222222222', name: 'x' })).error).toBe(true)

	expect((await tool('set_user_name', { userId: 'owner-1', name: 'Renamed' })).error).toBe(false)
	expect((await tool('set_user_name', { userId: 'nobody', name: 'x' })).error).toBe(true)
	expect(
		JSON.parse((await tool('set_user_minecraft_head', { userId: 'owner-1', username: 'Steve' })).text).image
	).toContain('Steve')
	expect(
		JSON.parse((await tool('set_user_minecraft_head', { userId: 'owner-1', username: null })).text).image
	).toBeNull()
	expect((await tool('set_user_minecraft_head', { userId: 'nobody', username: 'Steve' })).error).toBe(true)
})
