import { afterAll, expect, spyOn, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const directory = mkdtempSync(join(tmpdir(), 'minemories-github-webhook-'))
process.env.DATABASE_PATH = join(directory, 'test.sqlite')
process.env.LOCAL_OBJECTS_PATH = join(directory, 'objects')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.TRUSTED_PROXY_IPS = ''
process.env.BETTER_AUTH_SECRET = 'test-auth-secret-at-least-32-characters'
process.env.PAIRING_PEPPER = 'test-pairing-pepper-at-least-32-characters'
process.env.GITHUB_TOKEN = ''
process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret'

// An accepted delivery schedules a background refresh: it must never reach the real GitHub API from a test.
spyOn(globalThis, 'fetch').mockImplementation((() => Promise.resolve(Response.json([]))) as unknown as typeof fetch)

const { app } = await import('./index')
const { database } = await import('./database')

afterAll(() => {
	database.close()
	rmSync(directory, { recursive: true, force: true })
})

function deliver(event: string, body: string, secret = 'test-webhook-secret') {
	return app.request('/api/github/webhook', {
		method: 'POST',
		headers: {
			Origin: 'http://localhost:5173',
			'Content-Type': 'application/json',
			'X-GitHub-Event': event,
			'X-Hub-Signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
		},
		body,
	})
}

test('with GITHUB_WEBHOOK_SECRET the app checks signatures on the webhook route, without CORS headers', async () => {
	expect((await deliver('ping', '{}')).status).toBe(200)
	expect((await deliver('ping', '{}', 'wrong-secret')).status).toBe(401)
	const accepted = await deliver('label', '{"action":"edited"}')
	expect(accepted.status).toBe(202)
	expect(await accepted.json()).toEqual({ status: 'accepted' })
	expect(accepted.headers.get('Access-Control-Allow-Origin')).toBeNull()
})
