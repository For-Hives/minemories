import { afterAll, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const enabled = process.env.RUN_GARAGE_INTEGRATION === '1'
const directory = mkdtempSync(join(tmpdir(), 'minemories-mod-garage-'))
if (enabled) {
	process.env.DATABASE_PATH = join(directory, 'test.sqlite')
	process.env.MOD_INDEX_CACHE_MS = '0'
	process.env.STORAGE_DRIVER = 'filesystem'
	process.env.LOCAL_OBJECTS_PATH = join(directory, 'objects')
	process.env.MOD_STORAGE_BUCKET = `minemories-mods-integration-${Date.now()}`
	process.env.BETTER_AUTH_SECRET = 'test-auth-secret-at-least-32-characters'
	process.env.PAIRING_PEPPER = 'test-pairing-pepper-at-least-32-characters'
}
afterAll(() => rmSync(directory, { recursive: true, force: true }))

// Le module de stockage est du JavaScript ESM partagé avec l'outil `bun mod`.
const storagePath = '../../../scripts/mod/storage/index.mjs'
interface ModStorage {
	storeRelease(options: Record<string, unknown>): Promise<unknown>
	setPinned(options: Record<string, unknown>): Promise<unknown>
	pruneStorage(options: Record<string, unknown>): Promise<{ deleted: { version: string }[] }>
	storageReport(options: Record<string, unknown>): Promise<{ perTarget: Record<string, { versions: number }> }>
}

test.skipIf(!enabled)('un vrai Garage : stockage, index, téléchargement via l’API, rétention', async () => {
	const storage = (await import(storagePath)) as ModStorage
	const { app } = await import('./index')
	const id = 'fabric-mc1.21.11'
	const config = { targets: [{ id, loader: 'fabric', minecraft: '1.21.11', loaderVersion: '0.19.5', java: '21' }] }
	const hashes: Record<string, string> = {}
	for (const [n, size] of [
		[1, 1024],
		[2, 2048],
		[3, 4096],
		// Plus gros que la taille d'une partie multipart (8 Mio) : exerce l'envoi multipart réel.
		[4, 9 * 1024 * 1024],
	] as const) {
		const file = join(directory, `built-${n}.jar`)
		const body = Buffer.alloc(size, n)
		writeFileSync(file, body)
		hashes[`0.${n}.0`] = createHash('sha256').update(body).digest('hex')
		// biome-ignore lint/performance/noAwaitInLoops: les versions doivent être stockées l'une après l'autre.
		await storage.storeRelease({
			config,
			version: `0.${n}.0`,
			commit: 'abc1234',
			builtAt: `2026-10-0${n}T00:00:00Z`,
			artifacts: [{ targetId: id, file, bytes: size, sha256: hashes[`0.${n}.0`] as string }],
			env: process.env,
		})
	}
	const index = await (await app.request('/downloads/index.json')).json()
	expect(index.targets[id].latest).toBe('0.4.0')
	expect(index.targets[id].versions).toHaveLength(4)

	const latest = await app.request(`/downloads/${id}/latest`)
	expect(latest.status).toBe(200)
	const bytes = Buffer.from(await latest.arrayBuffer())
	expect(createHash('sha256').update(bytes).digest('hex')).toBe(hashes['0.4.0'] ?? '')
	expect(latest.headers.get('content-disposition')).toBe(`attachment; filename="minemories-${id}-0.4.0.jar"`)
	const one = await app.request(`/downloads/${id}/0.1.0`)
	expect(
		createHash('sha256')
			.update(Buffer.from(await one.arrayBuffer()))
			.digest('hex')
	).toBe(hashes['0.1.0'] ?? '')
	expect((await app.request(`/downloads/${id}/9.9.9`)).status).toBe(404)

	await storage.setPinned({ targetId: id, version: '0.1.0', pinned: true, env: process.env })
	const dry = await storage.pruneStorage({ keep: 2, dryRun: true, env: process.env })
	expect([...new Set(dry.deleted.map(item => item.version))]).toEqual(['0.2.0'])
	await storage.pruneStorage({ keep: 2, dryRun: false, env: process.env })
	const pruned = await (await app.request('/downloads/index.json')).json()
	expect(pruned.targets[id].versions.map((item: { version: string }) => item.version)).toEqual([
		'0.4.0',
		'0.3.0',
		'0.1.0',
	])
	expect((await app.request(`/downloads/${id}/0.1.0`)).status).toBe(200)
	const report = await storage.storageReport({ env: process.env })
	expect(report.perTarget[id]?.versions).toBe(3)
})
