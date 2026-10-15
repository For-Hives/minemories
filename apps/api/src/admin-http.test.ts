import { afterAll, expect, test } from 'bun:test'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { apiContract } from '@minemories/api-contract'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { promoteAdministrator, runAdminCli } from './admin-cli'
import { AdminRoles } from './admin-roles'
import { minimalGlb } from './test-support/glb-fixture'

const root = mkdtempSync(join(tmpdir(), 'minemories-admin-'))
process.env.DATABASE_PATH = join(root, 'db.sqlite')
process.env.LOCAL_OBJECTS_PATH = join(root, 'objects')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.COLD_STORAGE_PROVIDER = 'off'
process.env.BETTER_AUTH_SECRET = 'admin-http-test-secret-at-least32-characters'
process.env.PAIRING_PEPPER = 'admin-http-test-pepper-at-least32-characters'
const { app } = await import('./index'),
	{ database } = await import('./database')
afterAll(() => {
	database.close()
	rmSync(root, { recursive: true, force: true })
})
function rpc(cookie = ''): ContractRouterClient<typeof apiContract> {
	return createORPCClient(
		new RPCLink({
			url: 'http://localhost:3001/rpc',
			fetch: (request, init) => {
				const headers = new Headers(request.headers)
				headers.set('cookie', cookie)
				headers.set('origin', 'http://localhost:5173')
				return Promise.resolve(app.fetch(new Request(request, { ...init, headers })))
			},
		})
	)
}
async function register(email: string) {
	const password = 'admin-fixture-password'
	const response = await app.request('/api/auth/sign-up/email', {
		method: 'POST',
		headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
		body: JSON.stringify({ email, password, name: email.split('@')[0] }),
	})
	expect(response.status).toBe(200)
	const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? ''
	const { user } = (await response.json()) as { user: { id: string } }
	return { id: user.id, email, password, cookie, client: rpc(cookie) }
}
test('real sessions isolate admin data, require password confirmation, preserve the last admin and revoke permission immediately', async () => {
	const owner = await register('owner-admin@example.com'),
		other = await register('candidate-admin@example.com'),
		ordinary = await register('ordinary@example.com')
	expect(await rpc().admin.access()).toEqual({ allowed: false })
	await expect(rpc().admin.summary({ hours: 24 })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
	await expect(ordinary.client.admin.users({ query: '', role: 'all', page: 1 })).rejects.toMatchObject({
		code: 'FORBIDDEN',
	})
	expect(await owner.client.admin.access()).toEqual({ allowed: false })
	promoteAdministrator(['--email', owner.email], process.env)
	expect(await owner.client.admin.access()).toEqual({ allowed: true })
	await expect(
		owner.client.admin.setRole({ userId: other.id, role: 'admin', currentPassword: 'wrong' })
	).rejects.toMatchObject({ code: 'BAD_REQUEST' })
	expect(await other.client.admin.access()).toEqual({ allowed: false })
	await owner.client.admin.setRole({ userId: other.id, role: 'admin', currentPassword: owner.password })
	expect(await other.client.admin.access()).toEqual({ allowed: true })
	expect((await other.client.admin.users({ query: 'owner-admin', role: 'admin', page: 1 })).users[0]?.id).toBe(owner.id)
	await other.client.admin.setRole({ userId: owner.id, role: 'user', currentPassword: other.password })
	expect(await owner.client.admin.access()).toEqual({ allowed: false })
	await expect(owner.client.admin.audit()).rejects.toMatchObject({ code: 'FORBIDDEN' })
	await expect(
		other.client.admin.setRole({ userId: other.id, role: 'user', currentPassword: other.password })
	).rejects.toMatchObject({ code: 'CONFLICT' })
	expect((await other.client.admin.audit()).map(row => row.role)).toEqual(['user', 'admin', 'admin'])
	new AdminRoles(database).bootstrap(owner.email)
	const pairing = await owner.client.pairing.create()
	const paired = await app.request('/api/mod/pair', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ code: pairing.code }),
	})
	const { deviceToken } = (await paired.json()) as { deviceToken: string }
	const glb = minimalGlb(),
		headers = { authorization: `Bearer ${deviceToken}`, 'content-type': 'model/gltf-binary' }
	expect(
		(await app.request('/api/mod/memories', { method: 'POST', headers, body: Uint8Array.from(glb).buffer })).status
	).toBe(201)
	const id = randomUUID(),
		sha256 = createHash('sha256').update(glb).digest('hex')
	expect(
		(
			await app.request('/api/mod/uploads', {
				method: 'POST',
				headers: { ...headers, 'content-type': 'application/json' },
				body: JSON.stringify({ id, size: glb.length, sha256 }),
			})
		).status
	).toBe(201)
	expect(
		(
			await app.request(`/api/mod/uploads/${id}`, {
				method: 'PUT',
				headers: { ...headers, 'content-type': 'application/octet-stream', 'upload-offset': '0' },
				body: Uint8Array.from(glb).buffer,
			})
		).status
	).toBe(200)
	expect((await app.request(`/api/mod/uploads/${id}/complete`, { method: 'POST', headers })).status).toBe(201)
	expect((await app.request(`/api/mod/uploads/${id}/complete`, { method: 'POST', headers })).status).toBe(200)
	const metrics = await owner.client.admin.summary({ hours: 24 })
	expect(metrics.period).toMatchObject({ signups: 3, uploads: 2, uploadedBytes: glb.length * 2 })
	expect(metrics.totals).toMatchObject({ users: 3, admins: 2, memories: 2, storedBytes: glb.length * 2, devices: 1 })
	expect((await app.request(`/api/memories/${id}/file`, { headers: { cookie: other.cookie } })).status).toBe(404)
	await owner.client.memories.delete({ id })
	expect((await owner.client.admin.summary({ hours: 24 })).period.uploads).toBe(2)
}, 15000)

test('console bootstrap needs an existing database/account and is idempotent', () => {
	expect(() => promoteAdministrator([], {})).toThrow('Usage')
	expect(() => promoteAdministrator(['--email', 'bad'], {})).toThrow()
	expect(() =>
		promoteAdministrator(['--email', 'x@example.com'], { DATABASE_PATH: join(root, 'absent.sqlite') })
	).toThrow('Existing API database required')
	expect(runAdminCli(['--email', 'absent@example.com'], process.env)).toBe(1)
	expect(runAdminCli(['--email', 'owner-admin@example.com'], process.env)).toBe(0)
	expect(
		new AdminRoles(database).allowed(
			(database.query('SELECT id FROM user WHERE email=?').get('owner-admin@example.com') as { id: string }).id
		)
	).toBe(true)
})
