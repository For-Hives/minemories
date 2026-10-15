import { Database } from 'bun:sqlite'
import { afterAll, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { verifyColdStorageTarget } from './cold-storage-target'
import { migrateObjectTiers } from './object-tiers'

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

test('a bound cold catalog prevents starting HTTP against another storage driver even with archiving off', async () => {
	const env = { ...environment('wrong-cold-target'), COLD_STORAGE_PROVIDER: 'off' }
	mkdirSync(dirname(env.DATABASE_PATH), { recursive: true })
	const database = new Database(env.DATABASE_PATH)
	try {
		migrateObjectTiers(database)
		verifyColdStorageTarget(database, {
			COLD_STORAGE_PROVIDER: 'aws',
			COLD_STORAGE_CLASS: 'GLACIER',
			S3_ENDPOINT: 'https://cold-target-do-not-use.invalid',
			S3_BUCKET: 'private',
			S3_REGION: 'eu-west-3',
		})
	} finally {
		database.close()
	}
	const child = start(env)
	const [code, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	])
	expect(code).not.toBe(0)
	expect(stdout).not.toContain('API ready')
	expect(stderr).toContain('Cold storage target changed')
	expect(stderr).not.toContain(env.BETTER_AUTH_SECRET)
})

test('invalid production configuration exits before creating the database or exposing secrets', async () => {
	const cases: Array<{ field: string; overrides: Record<string, string> }> = [
		{ field: 'COLD_STORAGE_PROVIDER', overrides: { COLD_STORAGE_PROVIDER: 'invalid-private-fixture-provider' } },
		{ field: 'Diagnostics', overrides: { DIAGNOSTICS_PER_HOUR: 'invalid-private-fixture-limit' } },
		{ field: 'ACCOUNT_STORAGE_BYTES', overrides: { ACCOUNT_STORAGE_BYTES: 'invalid-private-fixture-quota' } },
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
			expect(stderr).not.toContain('invalid-private-fixture-quota')
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

test.each(['deletion', 'upload'] as const)(
	'real API shutdown waits for remote %s cleanup and repeated termination signals',
	async mode => {
		const entered = Promise.withResolvers<void>(),
			release = Promise.withResolvers<void>()
		const storage = Bun.serve({
			port: 0,
			hostname: '127.0.0.1',
			async fetch(request) {
				if (request.method === 'HEAD') return new Response(null)
				if (new URL(request.url).searchParams.has('uploads'))
					return new Response('<ListMultipartUploadsResult/>', { headers: { 'content-type': 'application/xml' } })
				if (request.method !== 'DELETE') return new Response(null, { status: 400 })
				entered.resolve()
				await release.promise
				return new Response(null, { status: 204 })
			},
		})
		const reservation = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response() })
		const port = reservation.port
		reservation.stop(true)
		const env = {
			...environment(`shutdown-${mode}`),
			API_PORT: String(port),
			STORAGE_DRIVER: 's3',
			S3_ENDPOINT: storage.url.toString(),
			S3_BUCKET: 'private-fixture',
			S3_REGION: 'auto',
			S3_ACCESS_KEY: 'startup-fixture-key',
			S3_SECRET_KEY: 'startup-fixture-secret',
			COLD_STORAGE_PROVIDER: 'off',
		}
		const seed =
			mode === 'deletion'
				? `database.query("INSERT INTO object_deletions(object_key,created_at,user_id,size) VALUES ('owner/11111111-1111-4111-8111-111111111111.glb',0,'owner',123)").run()`
				: `await import(${JSON.stringify(join(import.meta.dir, 'uploads.ts'))}); database.exec("INSERT INTO devices(id,user_id,name,token_hash,created_at) VALUES ('fixture-device','owner','Fixture','fixture-hash',0); INSERT INTO mod_uploads(id,device_id,user_id,size,sha256,name,metadata_json,expires_at,storage_started) VALUES ('11111111-1111-4111-8111-111111111111','fixture-device','owner',123,'fixture-digest','Fixture','{}',0,1)")`
		const source = `const { database } = await import(${JSON.stringify(join(import.meta.dir, 'database.ts'))}); ${seed}; database.close()`
		const table = mode === 'deletion' ? 'object_deletions' : 'mod_uploads'
		const initialize = Bun.spawn([process.execPath, '--no-env-file', '--eval', source], {
			env,
			stdout: 'pipe',
			stderr: 'pipe',
		})
		expect(await initialize.exited).toBe(0)
		const child = start(env)
		let watchdog: ReturnType<typeof setTimeout> | undefined
		try {
			watchdog = setTimeout(() => {
				release.resolve()
				child.kill('SIGKILL')
			}, 4000)
			await entered.promise
			child.kill('SIGTERM')
			child.kill('SIGINT')
			const db = new Database(env.DATABASE_PATH, { readonly: true })
			try {
				expect(db.query(`SELECT size FROM ${table}`).get()).toEqual({ size: 123 })
				release.resolve()
				const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
				expect(code).toBe(0)
				expect(stderr).not.toContain('closed')
				expect(db.query(`SELECT * FROM ${table}`).all()).toEqual([])
			} finally {
				db.close()
			}
		} finally {
			clearTimeout(watchdog)
			release.resolve()
			child.kill('SIGKILL')
			await child.exited
			storage.stop(true)
		}
	}
)
