import { afterAll, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { apiContract } from '@minemories/api-contract'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'

const directory = mkdtempSync(join(tmpdir(), 'minemories-diagnostics-rpc-'))
process.env.DATABASE_PATH = join(directory, 'db.sqlite')
process.env.LOCAL_OBJECTS_PATH = join(directory, 'objects')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.BETTER_AUTH_SECRET = 'diagnostics-rpc-secret-with-at-least-32-characters'
process.env.PAIRING_PEPPER = 'diagnostics-rpc-pepper-with-at-least-32-characters'
const { auth } = await import('./auth')
async function register(email: string) {
	const response = await auth.handler(
		new Request('http://localhost:3001/api/auth/sign-up/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
			body: JSON.stringify({ email, name: 'Tester', password: 'a-real-diagnostics-password' }),
		})
	)
	expect(response.status).toBe(200)
	return {
		id: ((await response.json()) as { user: { id: string } }).user.id,
		cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '',
	}
}
const operator = await register('operator@example.com')
const player = await register('player@example.com')
const moderator = await register('moderator@example.com')
process.env.DIAGNOSTICS_OPERATOR_IDS = operator.id
process.env.PUBLIC_MODERATOR_IDS = moderator.id
const { app } = await import('./index')
const { database } = await import('./database')
const { createPairingCode, exchangePairingCode } = await import('./pairing')
afterAll(() => {
	database.close()
	rmSync(directory, { recursive: true, force: true })
})
function rpc(cookie = '', token = ''): ContractRouterClient<typeof apiContract> {
	return createORPCClient(
		new RPCLink({
			url: 'http://localhost:3001/rpc',
			fetch: async (request, init) => {
				const headers = new Headers(request.headers)
				headers.set('cookie', cookie)
				if (token) headers.set('Authorization', `Bearer ${token}`)
				const response = await app.fetch(new Request(request, { ...init, headers }))
				expect(response.headers.get('cache-control')).toBe('private, no-store')
				return response
			},
		})
	)
}
const api = rpc(operator.cookie)
const paired = exchangePairingCode(createPairingCode(player.id).code, 'Diagnostic test') as {
	deviceId: string
	deviceToken: string
}
const headers = { authorization: `Bearer ${paired.deviceToken}`, 'content-type': 'application/json' }
const consent = await app.request('/api/mod/diagnostics/consent', { method: 'POST', headers, body: '{"enabled":true}' })
const { permit } = (await consent.json()) as { permit: string }
const report = {
	id: randomUUID(),
	occurredAt: new Date().toISOString(),
	source: 'mod',
	phase: 'crash',
	versions: { mod: '0.2.1-beta.1', minecraft: '1.21.1', loader: 'neoforge-21.1.248' },
	correlationId: randomUUID(),
	exception: {
		type: 'java.lang.IllegalStateException',
		frames: [
			{
				className: 'dev.minemories.neoforge.Minemories',
				methodName: 'export',
				fileName: 'Minemories.java',
				lineNumber: 100,
			},
		],
	},
	breadcrumbs: [
		{ step: 'capture_started', elapsedMs: 0 },
		{ step: 'client_crashed', elapsedMs: 500 },
	],
}
async function submit(value = report) {
	return app.request('/api/mod/diagnostics', {
		method: 'POST',
		headers: { ...headers, 'x-minemories-diagnostics-permit': permit },
		body: JSON.stringify({ consent: true, report: value }),
	})
}

test('web diagnostics require an explicit operator session; moderator and device credentials are insufficient', async () => {
	expect(await rpc().diagnostics.access()).toEqual({ allowed: false })
	expect(await rpc(player.cookie).diagnostics.access()).toEqual({ allowed: false })
	expect(await rpc(moderator.cookie).diagnostics.access()).toEqual({ allowed: false })
	expect(await api.diagnostics.access()).toEqual({ allowed: true })
	await expect(rpc().diagnostics.list({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
	await expect(rpc('', paired.deviceToken).diagnostics.list({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
	await expect(rpc(player.cookie).diagnostics.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' })
	await expect(rpc(moderator.cookie).diagnostics.detail({ fingerprint: 'a'.repeat(64) })).rejects.toMatchObject({
		code: 'FORBIDDEN',
	})
	await expect(
		rpc(player.cookie).diagnostics.update({ fingerprint: 'a'.repeat(64), revision: 1, state: 'resolved' })
	).rejects.toMatchObject({ code: 'FORBIDDEN' })
})

test('real crash ingestion is idempotent and supports operator detail, resolution, recurrence and withdrawal', async () => {
	expect((await submit()).status).toBe(201)
	expect((await submit()).status).toBe(200)
	const list = await api.diagnostics.list({ phase: 'crash', version: '0.2.1-beta.1' })
	expect(list.items).toHaveLength(1)
	const issue = list.items[0] as NonNullable<(typeof list.items)[number]>
	expect(issue).toMatchObject({ state: 'open', count: 1, devices: 1, lastReport: report })
	const detail = await api.diagnostics.detail({ fingerprint: issue.fingerprint })
	expect(detail.items[0]).toMatchObject({ deviceId: paired.deviceId, report })
	await api.diagnostics.update({ fingerprint: issue.fingerprint, state: 'resolved', revision: issue.revision })
	expect((await api.diagnostics.list({})).items).toHaveLength(0)
	await expect(
		api.diagnostics.update({ fingerprint: issue.fingerprint, state: 'ignored', revision: issue.revision })
	).rejects.toMatchObject({ code: 'CONFLICT' })
	expect((await submit({ ...report, id: randomUUID() })).status).toBe(201)
	expect((await api.diagnostics.list({})).items[0]).toMatchObject({ state: 'open', count: 2 })
	await expect(api.diagnostics.detail({ fingerprint: 'b'.repeat(64) })).rejects.toMatchObject({ code: 'NOT_FOUND' })
	await expect(api.diagnostics.list({ page: -1 })).rejects.toBeTruthy()
	expect(
		(await submit({ ...report, exception: { ...report.exception, message: 'private-world' } } as typeof report)).status
	).toBe(400)
	const withdrawal = await app.request('/api/mod/diagnostics', { method: 'DELETE', headers })
	expect(withdrawal.status).toBe(200)
	expect((await api.diagnostics.list({ state: 'all' })).items).toHaveLength(0)
	await expect(api.diagnostics.detail({ fingerprint: issue.fingerprint })).rejects.toMatchObject({ code: 'NOT_FOUND' })
	expect((await submit()).status).toBe(403)
})
