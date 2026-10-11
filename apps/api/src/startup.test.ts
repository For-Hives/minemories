import { afterAll, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const directory = mkdtempSync(join(tmpdir(), 'minemories-startup-'))
afterAll(() => rmSync(directory, { recursive: true, force: true }))

function environment(name: string) {
	return {
		NODE_ENV: 'production',
		BETTER_AUTH_SECRET: 'startup-fixture-auth-secret-with-at-least-32-characters',
		PAIRING_PEPPER: 'startup-fixture-pairing-pepper-with-at-least-32-characters',
		BETTER_AUTH_URL: 'https://api.example.test',
		WEB_ORIGIN: 'https://example.test',
		DATABASE_PATH: join(directory, name, 'db.sqlite'),
		UPLOADS_PATH: join(directory, name, 'uploads'),
		STORAGE_DRIVER: 'filesystem',
		LOCAL_OBJECTS_PATH: join(directory, name, 'objects'),
	}
}

function start(env: Record<string, string>) {
	return Bun.spawn([process.execPath, '--no-env-file', join(import.meta.dir, 'index.ts')], {
		cwd: directory,
		env,
		stdout: 'pipe',
		stderr: 'pipe',
	})
}

test('invalid production configuration exits before creating the database or exposing secrets', async () => {
	const cases: Array<{ field: string; overrides: Record<string, string> }> = [
		{ field: 'PAIRING_PEPPER', overrides: { PAIRING_PEPPER: 'short-private-fixture-value' } },
		{ field: 'WEB_ORIGIN', overrides: { WEB_ORIGIN: 'http://example.test' } },
		{ field: 'S3_ENDPOINT', overrides: { STORAGE_DRIVER: 's3', S3_ENDPOINT: 'invalid-private-fixture-endpoint' } },
	]
	await Promise.all(
		cases.map(async ({ field, overrides }) => {
			const env = { ...environment(`invalid-${field}`), ...overrides }
			const child = start(env)
			const [code, stdout, stderr] = await Promise.all([
				child.exited,
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
			])
			expect(code).not.toBe(0)
			expect(stdout).not.toContain('API ready')
			expect(stderr).not.toContain(env.BETTER_AUTH_SECRET)
			expect(stderr).not.toContain(env.PAIRING_PEPPER)
			expect(stderr).not.toContain('invalid-private-fixture-endpoint')
			expect(stderr).toContain(field)
			expect(existsSync(env.DATABASE_PATH)).toBe(false)
		})
	)
})

async function waitForHealth(port: number, attempts = 100): Promise<Response> {
	const response = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(100) }).catch(
		() => null
	)
	if (response) return response
	if (attempts === 0) throw new Error('Production fixture did not become healthy')
	await Bun.sleep(20)
	return waitForHealth(port, attempts - 1)
}

test('a configured production API starts with a private filesystem fixture and answers health checks', async () => {
	const reservation = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response() })
	const port = reservation.port
	reservation.stop(true)
	if (port === undefined) throw new Error('Startup fixture did not allocate a TCP port')
	const env = { ...environment('valid'), API_PORT: String(port) }
	const child = start(env)
	try {
		const response = await waitForHealth(port)
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({ status: 'ok' })
		expect(existsSync(env.DATABASE_PATH)).toBe(true)
	} finally {
		const timeout = setTimeout(() => child.kill('SIGKILL'), 1000)
		child.kill('SIGTERM')
		const code = await child.exited
		clearTimeout(timeout)
		expect(code).toBe(0)
	}
})
