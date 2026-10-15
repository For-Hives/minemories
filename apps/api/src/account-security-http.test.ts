import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { apiContract } from '@minemories/api-contract'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'

const root = mkdtempSync(join(tmpdir(), 'minemories-account-security-'))
process.env.DATABASE_PATH = join(root, 'db.sqlite')
process.env.LOCAL_OBJECTS_PATH = join(root, 'objects')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.BETTER_AUTH_SECRET = 'account-test-secret-at-least-32-characters'
process.env.PAIRING_PEPPER = 'account-test-pepper-at-least-32-characters'
const { app } = await import('./index')
const { database } = await import('./database')
afterAll(() => {
	database.close()
	rmSync(root, { recursive: true, force: true })
})
function rpc(cookie = '', origin = 'http://localhost:5173'): ContractRouterClient<typeof apiContract> {
	return createORPCClient(
		new RPCLink({
			url: 'http://localhost:3001/rpc',
			fetch: (request, init) => {
				const headers = new Headers(request.headers)
				headers.set('cookie', cookie)
				headers.set('origin', origin)
				return Promise.resolve(app.fetch(new Request(request, { ...init, headers })))
			},
		})
	)
}
async function account(email: string) {
	const password = 'my-original-password'
	const response = await authRequest('sign-up/email', { email, password, name: 'Account tester' })
	expect(response.status).toBe(200)
	const cookie = response.headers.get('set-cookie')?.split(';')[0]
	if (!cookie) throw new Error('Missing session')
	return { email, password, cookie, id: ((await response.json()) as { user: { id: string } }).user.id }
}
function authRequest(path: string, body: unknown) {
	return app.request(`/api/auth/${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
		body: JSON.stringify(body),
	})
}
test('real HTTP and oRPC credentials change only the owner and invalidate all old sessions', async () => {
	const owner = await account('credentials-owner@example.com')
	const other = await account('credentials-other@example.com')
	const session = await authRequest('sign-in/email', { email: owner.email, password: owner.password })
	const secondCookie = session.headers.get('set-cookie')?.split(';')[0] ?? ''
	await expect(
		rpc().account.changeEmail({ email: 'new@example.com', currentPassword: owner.password })
	).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
	await expect(
		rpc(owner.cookie, 'https://evil.example').account.changeEmail({
			email: 'new@example.com',
			currentPassword: owner.password,
		})
	).rejects.toMatchObject({ code: 'FORBIDDEN' })
	await expect(
		rpc(owner.cookie).account.changeEmail({ email: 'new@example.com', currentPassword: 'wrong' })
	).rejects.toMatchObject({ code: 'BAD_REQUEST' })
	await expect(
		rpc(owner.cookie).account.changeEmail({ email: other.email, currentPassword: owner.password })
	).rejects.toMatchObject({ code: 'CONFLICT' })
	database.query('UPDATE user SET emailVerified=1 WHERE id=?').run(owner.id)
	expect(
		await rpc(owner.cookie).account.changeEmail({ email: 'New-Owner@example.com', currentPassword: owner.password })
	).toEqual({ ok: true })
	expect(database.query('SELECT email,emailVerified FROM user WHERE id=?').get(owner.id)).toEqual({
		email: 'new-owner@example.com',
		emailVerified: 0,
	})
	await expect(rpc(owner.cookie).account.storage()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
	await expect(rpc(secondCookie).account.storage()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
	expect((await rpc(other.cookie).account.storage()).usedBytes).toBe(0)
	expect((await authRequest('sign-in/email', { email: owner.email, password: owner.password })).status).toBe(401)
	const login = await authRequest('sign-in/email', { email: 'new-owner@example.com', password: owner.password })
	expect(login.status).toBe(200)
	const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? ''
	await expect(
		rpc(cookie).account.changePassword({ currentPassword: owner.password, newPassword: 'short' })
	).rejects.toMatchObject({ code: 'BAD_REQUEST' })
	expect(
		await rpc(cookie).account.changePassword({ currentPassword: owner.password, newPassword: 'my-updated-password' })
	).toEqual({ ok: true })
	await expect(rpc(cookie).account.storage()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
	expect(
		(await authRequest('sign-in/email', { email: 'new-owner@example.com', password: owner.password })).status
	).toBe(401)
	expect(
		(await authRequest('sign-in/email', { email: 'new-owner@example.com', password: 'my-updated-password' })).status
	).toBe(200)
}, 15000)
