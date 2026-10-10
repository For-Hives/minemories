import { expect, test } from 'bun:test'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'

const execute = promisify(execFile)

import { minimalGlb } from './test-support/glb-fixture'

// Opt in with a dedicated Garage test bucket and S3 credentials; never touch real captures.
test.skipIf(process.env.RUN_GARAGE_INTEGRATION !== '1')(
	'real Garage preserves GLB bytes and deletes only the test object',
	async () => {
		process.env.STORAGE_DRIVER = 's3'
		const { storeMemory, readMemory, removeMemory } = await import('./storage')
		const key = `integration-tests/${randomUUID()}.glb`
		const glb = minimalGlb()
		try {
			await storeMemory(key, glb)
			expect((await readMemory(key)).toString('hex')).toBe(glb.toString('hex'))
			await removeMemory(key)
			await expect(readMemory(key)).rejects.toThrow()
		} finally {
			await removeMemory(key)
		}
	}
)

test.skipIf(process.env.RUN_GARAGE_INTEGRATION !== '1' || !process.env.GARAGE_TEST_CONTAINER)(
	'dedicated Garage fixture preserves a capture across a real outage and restart',
	async () => {
		const container = process.env.GARAGE_TEST_CONTAINER
		if (!(container && process.env.S3_BUCKET?.startsWith('minemories-integration'))) {
			throw new Error('Use the dedicated Garage integration fixture and bucket.')
		}
		const { stdout } = await execute('docker', [
			'inspect',
			'--format',
			'{{ index .Config.Labels "com.docker.compose.project" }}',
			container,
		])
		if (stdout.trim() !== 'minemories-integration') throw new Error('Refusing to stop a non-test Garage container.')
		process.env.STORAGE_DRIVER = 's3'
		const { storeMemory, readMemory, removeMemory } = await import('./storage')
		const key = `integration-tests/${randomUUID()}.glb`
		const bytes = minimalGlb(Buffer.alloc(5 * 1024 * 1024, 23))
		try {
			await storeMemory(key, bytes)
			await execute('docker', ['stop', container])
			await expect(readMemory(key)).rejects.toThrow()
			await execute('docker', ['start', container])
			let recovered: Buffer | undefined
			for (let attempt = 0; attempt < 30; attempt++) {
				try {
					// biome-ignore lint/performance/noAwaitInLoops: readiness retries must wait for the previous attempt.
					recovered = await readMemory(key)
					break
				} catch {
					await Bun.sleep(200)
				}
			}
			expect(recovered?.equals(bytes)).toBe(true)
		} finally {
			await execute('docker', ['start', container])
			await removeMemory(key)
		}
	},
	45_000
)

async function runResumer(id: string, token: string, source: string) {
	const worker = Bun.spawn([process.execPath, join(import.meta.dir, 'test-support/garage-resume-worker.ts')], {
		env: { ...process.env, RESUME_ID: id, RESUME_TOKEN: token, RESUME_SOURCE: source },
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const [output] = await Promise.all([new Response(worker.stdout).text(), new Response(worker.stderr).text()])
	expect(await worker.exited).toBe(0)
	return JSON.parse(output) as { chunk: number; complete: number }
}

async function waitForGarage() {
	for (let attempt = 0; attempt < 30; attempt++) {
		try {
			// biome-ignore lint/performance/noAwaitInLoops: only the dedicated fixture is polled sequentially.
			await fetch(process.env.S3_ENDPOINT ?? 'http://127.0.0.1:3900', { signal: AbortSignal.timeout(1000) })
			return
		} catch {
			await Bun.sleep(200)
		}
	}
	throw new Error('Garage fixture did not restart.')
}

test.skipIf(process.env.RUN_GARAGE_INTEGRATION !== '1' || !process.env.GARAGE_TEST_CONTAINER)(
	'resumable upload survives an API process restart and a real Garage outage without duplicate memories',
	async () => {
		const container = process.env.GARAGE_TEST_CONTAINER
		if (!(container && process.env.S3_BUCKET?.startsWith('minemories-integration')))
			throw new Error('Dedicated fixture required.')
		const { stdout } = await execute('docker', [
			'inspect',
			'--format',
			'{{ index .Config.Labels "com.docker.compose.project" }}',
			container,
		])
		if (stdout.trim() !== 'minemories-integration') throw new Error('Refusing to stop a non-test container.')
		const directory = mkdtempSync(join(tmpdir(), 'minemories-real-garage-'))
		process.env.DATABASE_PATH = join(directory, 'db.sqlite')
		process.env.UPLOADS_PATH = join(directory, 'uploads')
		process.env.STORAGE_DRIVER = 's3'
		process.env.BETTER_AUTH_SECRET = 'garage-test-secret-at-least-32-characters'
		process.env.PAIRING_PEPPER = 'garage-test-pepper-at-least-32-characters'
		const { app } = await import('./index')
		const { database } = await import('./database')
		const { createPairingCode, exchangePairingCode, listMemories, deleteMemory } = await import('./pairing')
		const { removeMemory } = await import('./storage')
		const owner = randomUUID()
		const pairing = exchangePairingCode(createPairingCode(owner).code, 'Garage recovery fixture')
		if (!pairing) throw new Error('Pairing failed.')
		const bytes = minimalGlb(Buffer.alloc(5 * 1024 * 1024, 31))
		const id = randomUUID()
		const path = join(directory, 'source.glb')
		await Bun.write(path, bytes)
		const authorization = `Bearer ${pairing.deviceToken}`
		try {
			const initialized = await app.request('/api/mod/uploads', {
				method: 'POST',
				headers: { authorization, 'content-type': 'application/json' },
				body: JSON.stringify({ id, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }),
			})
			expect(initialized.status).toBe(201)
			const chunk = await app.request(`/api/mod/uploads/${id}`, {
				method: 'PUT',
				headers: { authorization, 'content-type': 'application/octet-stream', 'upload-offset': '0' },
				body: Uint8Array.from(bytes.subarray(0, 4 * 1024 * 1024)).buffer,
			})
			expect(chunk.status).toBe(200)
			await execute('docker', ['stop', container])
			expect(await runResumer(id, pairing.deviceToken, path)).toEqual({ chunk: 200, complete: 503 })
			expect(listMemories(owner)).toEqual([])
			expect(existsSync(join(directory, 'uploads', id))).toBe(true)
			await execute('docker', ['start', container])
			await waitForGarage()
			expect(await runResumer(id, pairing.deviceToken, path)).toEqual({ chunk: 200, complete: 201 })
			expect(listMemories(owner)).toHaveLength(1)
			const { readMemoryStream } = await import('./storage')
			const stream = await readMemoryStream(`${owner}/${id}.glb`)
			expect(
				Buffer.from(await new Response(Readable.toWeb(stream) as unknown as ReadableStream).arrayBuffer()).equals(bytes)
			).toBe(true)
			expect(existsSync(join(directory, 'uploads', id))).toBe(false)
			const replay = await app.request(`/api/mod/uploads/${id}/complete`, {
				method: 'POST',
				headers: { authorization },
			})
			expect(replay.status).toBe(200)
			expect(listMemories(owner)).toHaveLength(1)
		} finally {
			await execute('docker', ['start', container])
			await waitForGarage()
			deleteMemory(owner, id)
			await removeMemory(`${owner}/${id}.glb`)
			database.close()
			rmSync(directory, { recursive: true, force: true })
		}
	},
	45_000
)
