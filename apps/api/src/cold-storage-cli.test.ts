import { expect, spyOn, test } from 'bun:test'
import { migrateCaptureAccess } from './capture-access'
import { executeColdStorageCli, runColdStorageCli } from './cold-storage-cli'
import { temporalFixture } from './test-support/timelapse-fixture'

test('archive preview opens an existing database read-only, reports physical objects and never applies a transition', async () => {
	const f = await temporalFixture()
	try {
		migrateCaptureAccess(f.db)
		const capture = await f.add({})
		const context = { databasePath: f.db.filename, now: () => 100 * 86_400_000 }
		expect(await runColdStorageCli(['--help'], { databasePath: '/missing' })).toHaveProperty('usage')
		const before = f.db.query('SELECT * FROM memories').all()
		const plan = await runColdStorageCli(['--idle-days', '60', '--limit', '1'], context)
		expect(plan).toMatchObject({
			mode: 'preview',
			inactiveDays: 60,
			limit: 1,
			physicalBytes: f.data.length,
			candidates: [{ objectKey: capture.key, references: 1 }],
		})
		expect(f.db.query('SELECT * FROM memories').all()).toEqual(before)
		expect(f.db.query('SELECT * FROM object_deletions').all()).toEqual([])
		const subprocess = Bun.spawn([process.execPath, new URL('./cold-storage-cli.ts', import.meta.url).pathname], {
			env: { ...process.env, DATABASE_PATH: f.db.filename, COLD_STORAGE_INACTIVE_DAYS: '60' },
			stdout: 'pipe',
			stderr: 'pipe',
		})
		const output = await new Response(subprocess.stdout).json()
		expect(await subprocess.exited).toBe(0)
		expect(output).toMatchObject({ mode: 'preview', inactiveDays: 60, physicalBytes: f.data.length })
		await expect(runColdStorageCli(['--apply'], context)).rejects.toThrow()
		await expect(runColdStorageCli(['--limit', '1e2'], context)).rejects.toThrow('limit')
		await expect(runColdStorageCli(['--idle-days', '91'], context)).rejects.toThrow('60 to 90')
		await expect(runColdStorageCli([], { databasePath: `${f.dir}/missing` })).rejects.toThrow()
		const stdout = spyOn(process.stdout, 'write').mockReturnValue(true),
			stderr = spyOn(console, 'error').mockImplementation(() => {})
		try {
			expect(await executeColdStorageCli(['--help'])).toBe(0)
			expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toHaveProperty('usage')
			expect(await executeColdStorageCli(['--apply'], context)).toBe(1)
			expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Aucun objet modifié'))
		} finally {
			stdout.mockRestore()
			stderr.mockRestore()
		}
	} finally {
		await f.close()
	}
})
