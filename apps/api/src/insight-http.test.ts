import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const directory = mkdtempSync(join(tmpdir(), 'minemories-insight-'))
process.env.DATABASE_PATH = join(directory, 'test.sqlite')
process.env.LOCAL_OBJECTS_PATH = join(directory, 'objects')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.BETTER_AUTH_SECRET = 'test-auth-secret-at-least-32-characters'
process.env.PAIRING_PEPPER = 'test-pairing-pepper-at-least-32-characters'
process.env.WEB_ORIGIN = 'https://minemories.net'

const { app } = await import('./index')
const { database } = await import('./database')

afterAll(() => {
	database.close()
	rmSync(directory, { recursive: true, force: true })
})

test('the site may send Umami’s headers to the collect endpoint (CORS preflight)', async () => {
	const response = await app.request('/api/insight/api/send', {
		method: 'OPTIONS',
		headers: {
			Origin: 'https://minemories.net',
			'Access-Control-Request-Method': 'POST',
			'Access-Control-Request-Headers': 'content-type,x-umami-cache,x-umami-website-id,x-umami-hostname',
		},
	})
	expect(response.status).toBe(204)
	expect(response.headers.get('access-control-allow-origin')).toBe('https://minemories.net')
	const allowed = response.headers.get('access-control-allow-headers')?.toLowerCase() ?? ''
	for (const header of ['x-umami-cache', 'x-umami-website-id', 'x-umami-hostname']) expect(allowed).toContain(header)
})

test('the proxy is mounted and refuses another website without calling Umami', async () => {
	const response = await app.request('/api/insight/api/send', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: 'https://minemories.net' },
		body: JSON.stringify({ type: 'event', payload: { website: 'someone-else' } }),
	})
	expect(response.status).toBe(403)
	expect(await response.json()).toEqual({ error: 'unknown_website' })
})
