import { Database } from 'bun:sqlite'
import { expect, spyOn, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { executeDiagnosticsCli, runDiagnosticsCli } from './diagnostics-cli'
import { diagnosticsPolicy } from './diagnostics-policy'
import { DiagnosticsStore } from './diagnostics-store'

test('private CLI reads existing database, groups and lists bounded reports without mutation or creation', async () => {
	const directory = mkdtempSync(join(tmpdir(), 'minemories-diagnostics-cli-'))
	const path = join(directory, 'private.sqlite')
	const deviceId = randomUUID()
	const database = new Database(path)
	database.exec('CREATE TABLE devices(id TEXT PRIMARY KEY, revoked_at INTEGER)')
	database.query('INSERT INTO devices VALUES (?, NULL)').run(deviceId)
	const store = new DiagnosticsStore(database, diagnosticsPolicy({}))
	const permit = store.beginConsent(deviceId) as string
	const id = randomUUID()
	const report = {
		id,
		occurredAt: new Date().toISOString(),
		source: 'api' as const,
		phase: 'upload' as const,
		versions: { api: '0.1.0' as const },
		correlationId: randomUUID(),
		exception: { type: 'Error' as const, frames: [] },
		breadcrumbs: [] as [],
	}
	store.accept({ id: deviceId, userId: 'owner' }, report, permit)
	store.accept({ id: deviceId, userId: 'owner' }, { ...report, id: randomUUID() }, permit)
	database.close()
	const before = readFileSync(path)
	try {
		expect(await runDiagnosticsCli(['--help'], join(directory, 'absent.sqlite'))).toHaveProperty('usage')
		const grouped = await runDiagnosticsCli(['--device', deviceId, '--limit', '1'], path)
		expect(grouped).toMatchObject({
			mode: 'groups',
			groups: [{ count: 2, source: 'api', phase: 'upload', exceptionType: 'Error' }],
		})
		const listing = await runDiagnosticsCli(['--reports', '--device', deviceId, '--limit', '1'], path)
		expect(listing).toMatchObject({ mode: 'reports', reports: [{ deviceId }] })
		expect(await runDiagnosticsCli(['--reports'], path)).toMatchObject({ reports: [{}, {}] })
		expect(await runDiagnosticsCli([], path)).toMatchObject({ groups: [{ count: 2 }] })
		for (const args of [
			['--limit', '0'],
			['--limit', '1001'],
			['--limit', 'Infinity'],
			['--device', 'secret'],
			['--bad'],
			['positional'],
		]) {
			// biome-ignore lint/performance/noAwaitInLoops: each rejection must leave the private database unchanged.
			await expect(runDiagnosticsCli(args, path)).rejects.toThrow()
		}
		const absent = join(directory, 'absent.sqlite')
		await expect(runDiagnosticsCli([], absent)).rejects.toThrow()
		expect(existsSync(absent)).toBe(false)
		expect(readFileSync(path).equals(before)).toBe(true)
		const output = spyOn(process.stdout, 'write').mockImplementation(() => true)
		const errors = spyOn(console, 'error').mockImplementation(() => undefined)
		try {
			expect(await executeDiagnosticsCli(['--help'], absent)).toBe(0)
			expect(await executeDiagnosticsCli([], absent)).toBe(1)
			expect(errors.mock.calls[0]?.[0]).not.toContain(absent)
		} finally {
			output.mockRestore()
			errors.mockRestore()
		}
		const command = Bun.spawn([process.execPath, 'src/diagnostics-cli.ts', '--help'], {
			cwd: import.meta.dir.replace(/\/src$/, ''),
			stdout: 'pipe',
			stderr: 'pipe',
		})
		expect(await command.exited).toBe(0)
		expect(await new Response(command.stdout).text()).toContain('Groupes privés')
		const rootCommand = Bun.spawn([process.execPath, 'run', '--silent', 'api:diagnostics', '--help'], {
			cwd: join(import.meta.dir, '../../..'),
			stdout: 'pipe',
			stderr: 'pipe',
		})
		expect(await rootCommand.exited).toBe(0)
		expect(JSON.parse(await new Response(rootCommand.stdout).text())).toHaveProperty('usage')
	} finally {
		rmSync(directory, { recursive: true, force: true })
	}
})
