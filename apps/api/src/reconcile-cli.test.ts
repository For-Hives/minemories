import { Database } from 'bun:sqlite'
import { afterAll, expect, spyOn, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { executeReconciliationCli, runReconciliationCli } from './reconcile-cli'
import { FilesystemInventory } from './storage-inventory'
import { ORPHAN_GRACE_MS } from './storage-reconciliation'
import { reconciliationDatabase, reconciliationKey } from './test-support/reconciliation-fixture'

const root = await mkdtemp(join(tmpdir(), 'minemories-cli-'))
afterAll(() => rm(root, { recursive: true, force: true }))

test('CLI inventories an existing database readonly, then applies reviewed claims with a restorable backup', async () => {
	const path = join(root, 'existing.sqlite')
	const database = reconciliationDatabase(path)
	database.close()
	const objects = join(root, 'objects')
	await mkdir(join(objects, 'owner'), { recursive: true })
	const stored = join(objects, reconciliationKey)
	await writeFile(stored, 'private-fixture')
	const old = new Date(Date.now() - 2 * ORPHAN_GRACE_MS)
	await utimes(stored, old, old)
	const context = { databasePath: path, inventory: new FilesystemInventory(objects) }
	const plan = join(root, 'plan.json')
	expect(await runReconciliationCli(['--plan', plan], context)).toMatchObject({
		mode: 'inventory',
		entries: 1,
		counts: { queue: 1 },
	})
	const before = new Database(path, { readonly: true })
	try {
		expect(before.query('SELECT * FROM object_deletions').all()).toEqual([])
	} finally {
		before.close()
	}
	const backup = join(root, 'before-apply.sqlite')
	expect(
		await runReconciliationCli(['--plan', plan, '--apply', '--api-stopped', '--backup', backup], context)
	).toMatchObject({ mode: 'apply', queued: 1 })
	expect(await readFile(stored, 'utf8')).toBe('private-fixture')
	const restored = new Database(backup, { readonly: true })
	try {
		expect(restored.query('SELECT * FROM object_deletions').all()).toEqual([])
	} finally {
		restored.close()
	}
	expect((await stat(backup)).mode & 0o777).toBe(0o600)
})

test('invalid flags and missing databases never create a database or application artifacts', async () => {
	const context = { databasePath: join(root, 'must-not-create.sqlite'), inventory: new FilesystemInventory(root) }
	for (const args of [
		[],
		['--plan', 'x', '--apply'],
		['--plan', 'x', '--apply', '--api-stopped'],
		['--plan', 'x', '--apply', '--api-stopped', '--backup', 'y', '--prefix', 'owner/'],
	]) {
		// biome-ignore lint/performance/noAwaitInLoops: Validate each malformed command separately.
		await expect(runReconciliationCli(args, context)).rejects.toThrow()
	}
	await expect(runReconciliationCli(['--plan', join(root, 'missing-plan.json')], context)).rejects.toThrow()
	await expect(stat(context.databasePath)).rejects.toThrow()
	expect(await runReconciliationCli(['--help'], context)).toHaveProperty('usage')
})

test('command output contains summaries while failures do not leak untrusted paths or metadata', async () => {
	const output = spyOn(process.stdout, 'write').mockImplementation(() => true)
	const errors = spyOn(console, 'error').mockImplementation(() => undefined)
	try {
		expect(await executeReconciliationCli(['--help'])).toBe(0)
		expect(output.mock.calls[0]?.[0]).toContain('usage')
		expect(await executeReconciliationCli(['--untrusted-secret=do-not-print'])).toBe(1)
		expect(String(errors.mock.calls[0]?.[0])).not.toContain('do-not-print')
	} finally {
		output.mockRestore()
		errors.mockRestore()
	}
})

test('the actual Bun entrypoint exits on errors without booting HTTP or creating SQLite', async () => {
	const path = join(root, 'entrypoint-missing.sqlite')
	const child = Bun.spawn({
		cmd: [process.execPath, join(import.meta.dir, 'reconcile-cli.ts'), '--plan', join(root, 'entrypoint.json')],
		env: { ...process.env, DATABASE_PATH: path, STORAGE_DRIVER: 'filesystem', LOCAL_OBJECTS_PATH: root },
		stdout: 'pipe',
		stderr: 'pipe',
	})
	expect(await child.exited).toBe(1)
	expect(await new Response(child.stdout).text()).toBe('')
	expect(await new Response(child.stderr).text()).toContain('Réconciliation interrompue')
	await expect(stat(path)).rejects.toThrow()
})
