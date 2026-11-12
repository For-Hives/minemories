import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const directory = mkdtempSync(join(tmpdir(), 'minemories-mcp-admin-test-'))
process.env.DATABASE_PATH = join(directory, 'test.sqlite')
process.env.LOCAL_OBJECTS_PATH = join(directory, 'objects')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.TRUSTED_PROXY_IPS = ''
process.env.BETTER_AUTH_SECRET = 'test-auth-secret-at-least-32-characters'
process.env.PAIRING_PEPPER = 'test-pairing-pepper-at-least-32-characters'

const { createMcpRoute } = await import('./mcp')
const { database } = await import('./database')
await import('./uploads')
const { renameMemory, trashMemory, restoreMemory } = await import('./pairing')
const { AdminRoles } = await import('./admin-roles')
const { AdminAccounts } = await import('./admin-accounts')
const { AdminMetrics } = await import('./admin-metrics')
const { AdminInsightsReader } = await import('./admin-insights')
const { DiagnosticsReview } = await import('./diagnostics-review')
const { PublicDiscovery } = await import('./discovery')
const { diagnostics } = await import('./diagnostics-state')

afterAll(() => {
	database.close()
	rmSync(directory, { recursive: true, force: true })
})

const TOKEN = 'c'.repeat(40)
database.exec(
	`CREATE TABLE IF NOT EXISTS user(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,emailVerified INTEGER,image TEXT,createdAt INTEGER,updatedAt INTEGER)`
)
database.exec('CREATE TABLE IF NOT EXISTS session(id TEXT PRIMARY KEY,userId TEXT,createdAt INTEGER,expiresAt INTEGER)')
const roles = new AdminRoles(database)
const operators = { has: (id: string) => roles.allowed(id) }
const admin = {
	roles,
	accounts: new AdminAccounts(database, roles),
	metrics: new AdminMetrics(database, roles),
	insights: new AdminInsightsReader(database, roles),
	diagnostics: new DiagnosticsReview(diagnostics, operators),
	discovery: new PublicDiscovery(database, operators),
}
const app = createMcpRoute({
	database,
	memories: { rename: renameMemory, trash: trashMemory, restore: restoreMemory },
	admin,
	env: () => ({ API_TOKEN: TOKEN }),
})
const tool = async (name: string, args: Record<string, unknown> = {}) => {
	const response = await app.request('/', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
			authorization: `Bearer ${TOKEN}`,
		},
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
	})
	const payload = (await response.json()) as { result: { isError?: boolean; content: { text: string }[] } }
	const body = payload.result.content[0]?.text ?? ''
	return { error: payload.result.isError === true, text: body, json: () => JSON.parse(body) }
}

const now = Date.now()
for (const [id, name] of [
	['u1', 'One'],
	['u2', 'Two'],
	['u3', 'Three'],
] as const)
	database
		.query('INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)')
		.run(id, name, `${id}@example.test`, 0, now, now)
database
	.query('INSERT INTO devices(id,user_id,name,token_hash,created_at) VALUES (?,?,?,?,?)')
	.run('d1', 'u2', 'PC', 'h1', now)
const memoryId = '11111111-1111-4111-8111-111111111111'
database
	.query('INSERT INTO memories(id,user_id,device_id,name,object_key,size,created_at) VALUES (?,?,?,?,?,?,?)')
	.run(memoryId, 'u2', 'd1', 'Castle', 'u2/castle.glb', 10, now)

test('the admin views answer without an administrator account', async () => {
	expect((await tool('admin_summary', { hours: 24 })).json().totals.users).toBe(3)
	expect((await tool('admin_insights')).error).toBe(false)
	expect((await tool('admin_list_users', { query: 'u2@' })).json().users[0].id).toBe('u2')
	expect((await tool('admin_role_audit')).json()).toEqual([])
})

test('roles, e-mails, images and devices can be edited', async () => {
	expect((await tool('set_user_role', { userId: 'u1', role: 'admin' })).error).toBe(false)
	expect((await tool('set_user_role', { userId: 'u1', role: 'user' })).error).toBe(true) // last administrator
	expect((await tool('set_user_role', { userId: 'nobody', role: 'admin' })).error).toBe(true)
	expect((await tool('admin_role_audit')).json()).toHaveLength(1)

	expect((await tool('set_user_email', { userId: 'u2', email: 'New@Example.test', emailVerified: true })).error).toBe(
		false
	)
	expect(database.query('SELECT email,emailVerified FROM user WHERE id=?').get('u2')).toEqual({
		email: 'new@example.test',
		emailVerified: 1,
	})
	expect((await tool('set_user_email', { userId: 'u2', email: 'u1@example.test' })).error).toBe(true)
	expect((await tool('set_user_email', { userId: 'nobody', email: 'x@example.test' })).error).toBe(true)
	expect((await tool('set_user_image', { userId: 'u2', image: 'https://example.test/a.png' })).error).toBe(false)
	expect((await tool('set_user_image', { userId: 'nobody', image: null })).error).toBe(true)

	expect((await tool('revoke_device', { deviceId: 'd1' })).error).toBe(false)
	expect((await tool('revoke_device', { deviceId: 'd1' })).error).toBe(true)
})

test('share links are listed and revoked', async () => {
	database
		.query('INSERT INTO share_links(token_hash,memory_id,user_id,created_at) VALUES (?,?,?,?)')
		.run('link-1', memoryId, 'u2', now)
	expect((await tool('list_share_links', { activeOnly: true })).json()).toHaveLength(1)
	expect((await tool('revoke_share_link', { id: 'link-1' })).error).toBe(false)
	expect((await tool('revoke_share_link', { id: 'link-1' })).error).toBe(true)
	expect((await tool('list_share_links', { userId: 'u2', activeOnly: true })).json()).toHaveLength(0)
})

test('diagnostics issues can be read and triaged', async () => {
	database
		.query('INSERT INTO devices(id,user_id,name,token_hash,created_at) VALUES (?,?,?,?,?)')
		.run('d2', 'u2', 'Laptop', 'h2', now)
	const permit = diagnostics.beginConsent('d2') as string
	diagnostics.accept(
		{ id: 'd2', userId: 'u2' },
		{
			id: crypto.randomUUID(),
			occurredAt: new Date().toISOString(),
			source: 'mod',
			phase: 'capture',
			versions: { mod: '0.2.1-beta.1', minecraft: '1.21.1', loader: 'neoforge-21.1.248' },
			correlationId: crypto.randomUUID(),
			exception: {
				type: 'java.io.IOException',
				frames: [{ className: 'dev.minemories.core.GlbScene', methodName: 'write' }],
			},
			breadcrumbs: [{ step: 'capture_failed', elapsedMs: 10 }],
		},
		permit
	)
	const listed = (await tool('list_diagnostics', { state: 'open' })).json().items
	expect(listed).toHaveLength(1)
	const fingerprint = listed[0].fingerprint
	expect((await tool('get_diagnostic', { fingerprint })).json().items).toHaveLength(1)
	expect((await tool('get_diagnostic', { fingerprint: 'unknown' })).error).toBe(true)
	expect((await tool('set_diagnostic_state', { fingerprint: 'unknown', state: 'resolved' })).error).toBe(true)
	expect((await tool('set_diagnostic_state', { fingerprint, state: 'resolved' })).error).toBe(false)
	expect(database.query('SELECT state,revision FROM diagnostic_issues WHERE fingerprint=?').get(fingerprint)).toEqual({
		state: 'resolved',
		revision: 2,
	})
})

test('publications can be moderated and unpublished', async () => {
	const published = admin.discovery.publish('u2', {
		memoryId,
		title: 'Castle',
		description: 'A castle',
		category: 'building',
		thumbnail: 'data:image/png;base64,AA==',
	} as never)
	expect((await tool('moderation_summary')).json().pending).toBe(1)
	expect((await tool('moderation_queue', {})).json().items[0].id).toBe(published.id)
	expect((await tool('moderate_publication', { id: published.id, decision: 'approved' })).error).toBe(false)
	expect(
		(await tool('moderate_publication', { id: '22222222-2222-4222-8222-222222222222', decision: 'approved' })).error
	).toBe(true)
	expect((await tool('unpublish_memory', { memoryId })).error).toBe(false)
	expect((await tool('unpublish_memory', { memoryId: '22222222-2222-4222-8222-222222222222' })).error).toBe(true)
})

test('deleting an account needs the confirmation and spares administrators', async () => {
	expect((await tool('delete_user', { userId: 'u3', confirm: 'nope' })).error).toBe(true)
	expect((await tool('delete_user', { userId: 'u1', confirm: 'u1' })).error).toBe(true) // administrator
	expect((await tool('delete_user', { userId: 'nobody', confirm: 'nobody' })).error).toBe(true)
	expect((await tool('delete_user', { userId: 'u3', confirm: 'u3' })).error).toBe(false)
	expect(database.query('SELECT 1 FROM user WHERE id=?').get('u3')).toBeNull()
})
