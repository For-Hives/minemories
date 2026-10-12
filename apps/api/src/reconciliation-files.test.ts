import { afterAll, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readReconciliationPlan, validateReconciliationPlan, writeReconciliationPlan } from './reconciliation-files'
import { MAX_RECONCILIATION_BYTES } from './storage-reconciliation-plan'
import { reconciliationDatabase, reconciliationPlan } from './test-support/reconciliation-fixture'

const root = await mkdtemp(join(tmpdir(), 'minemories-plan-files-'))
afterAll(() => rm(root, { recursive: true, force: true }))
const database = reconciliationDatabase()
const plan = await reconciliationPlan(database)
database.close()

test('plans are private, complete UTF-8 files and cannot overwrite another artifact', async () => {
	const path = join(root, 'private.json')
	await writeReconciliationPlan(path, plan)
	expect((await stat(path)).mode & 0o777).toBe(0o600)
	expect(await readReconciliationPlan(path)).toEqual(plan)
	await expect(writeReconciliationPlan(path, plan)).rejects.toThrow()
	expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(plan)
})

test('truncated JSON, invalid UTF-8, unknown schemas and oversize files are rejected', async () => {
	const path = join(root, 'invalid.json')
	await writeFile(path, '{"version":')
	await expect(readReconciliationPlan(path)).rejects.toThrow()
	await writeFile(path, Buffer.from([0xff, 0xff]))
	await expect(readReconciliationPlan(path)).rejects.toThrow()
	await writeFile(path, '{}')
	await expect(readReconciliationPlan(path)).rejects.toThrow('plan')
	await writeFile(path, Buffer.alloc(MAX_RECONCILIATION_BYTES + 1))
	await expect(readReconciliationPlan(path)).rejects.toThrow('file')
	await expect(readReconciliationPlan(root)).rejects.toThrow('file')
})

test('duplicate, mismatched and out-of-scope observations cannot be applied', () => {
	const entry = plan.entries[0]
	if (!entry) throw new Error('Missing plan entry')
	expect(() => validateReconciliationPlan({ ...plan, version: 2 })).toThrow()
	expect(() => validateReconciliationPlan({ ...plan, entries: [entry, entry] })).toThrow()
	expect(() => validateReconciliationPlan({ ...plan, prefix: 'other/' })).toThrow()
	const mismatched = structuredClone(plan)
	if (mismatched.entries[0]?.candidate.object) mismatched.entries[0].candidate.object.key = 'other/value.glb'
	expect(() => validateReconciliationPlan(mismatched)).toThrow()
	const parts = structuredClone(plan)
	if (!parts.entries[0]) throw new Error('Missing plan entry')
	parts.entries[0].candidate.uploads = [
		{ key: entry.candidate.key, id: 'same', created: 0 },
		{ key: entry.candidate.key, id: 'same', created: 0 },
	]
	expect(() => validateReconciliationPlan(parts)).toThrow()
	parts.entries[0].candidate.uploads = [{ key: 'other/file', id: 'one', created: 0 }]
	expect(() => validateReconciliationPlan(parts)).toThrow()
})

test('reading spans multiple bounded windows while oversized serialized plans never create an artifact', async () => {
	const large = structuredClone(plan)
	const entry = large.entries[0]
	if (!entry) throw new Error('Missing plan entry')
	large.entries = Array.from({ length: 300 }, (_, index) => {
		const next = structuredClone(entry)
		next.candidate.key = `owner/${index}.glb`
		if (next.candidate.object) next.candidate.object.key = next.candidate.key
		return next
	})
	const path = join(root, 'windows.json')
	await writeReconciliationPlan(path, large)
	expect((await stat(path)).size).toBeGreaterThan(64 * 1024)
	expect((await readReconciliationPlan(path)).entries).toHaveLength(300)
	large.entries = Array.from({ length: 9000 }, (_, index) => {
		const next = structuredClone(entry)
		next.candidate.key = `owner/${index}.glb`
		if (next.candidate.object) {
			next.candidate.object.key = next.candidate.key
			next.candidate.object.etag = 'x'.repeat(4096)
		}
		return next
	})
	await expect(writeReconciliationPlan(join(root, 'too-big.json'), large)).rejects.toThrow('size limit')
	await expect(stat(join(root, 'too-big.json'))).rejects.toThrow()
})
