import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'
import { checkApiCoverage, missingCoverage, productionSources } from './check-api-coverage.mjs'

const execute = promisify(execFile)
const forgottenFile = /forgotten\.ts/
const weakFile = /low\.ts/

async function fixture(t) {
	const directory = await mkdtemp(join(tmpdir(), 'minemories-coverage-'))
	t.after(() => rm(directory, { recursive: true, force: true }))
	await mkdir(join(directory, 'src/test-support'), { recursive: true })
	return directory
}

test('inventory includes nested production sources and excludes tests and fixtures', async t => {
	const directory = await fixture(t)
	await mkdir(join(directory, 'src/feature'))
	await Promise.all(
		[
			'src/route.ts',
			'src/route.test.ts',
			'src/declared.d.ts',
			'src/test-support/mock.ts',
			'src/feature/service.ts',
		].map(path => writeFile(join(directory, path), ''))
	)
	assert.deepEqual((await productionSources(join(directory, 'src'))).sort(), [
		join(directory, 'src/feature/service.ts'),
		join(directory, 'src/route.ts'),
	])
})

test('an uncovered source cannot hide behind a report for other files', async t => {
	const directory = await fixture(t)
	const sources = [join(directory, 'src/route.ts'), join(directory, 'src/forgotten.ts')]
	assert.deepEqual(missingCoverage('TN:\r\nSF:src/route.ts\r\nend_of_record\r\n', sources, directory), [sources[1]])
	assert.deepEqual(missingCoverage(`SF:${sources[0]}\nSF:src/forgotten.ts\n`, sources, directory), [])
	assert.deepEqual(missingCoverage('', sources, directory), sources)
	await assert.rejects(checkApiCoverage(directory), { code: 'ENOENT' })
	await mkdir(join(directory, 'coverage'))
	await writeFile(sources[0], '')
	await writeFile(sources[1], '')
	await writeFile(join(directory, 'coverage/lcov.info'), 'SF:src/route.ts\nend_of_record\n')
	await assert.rejects(checkApiCoverage(directory), forgottenFile)
	await writeFile(join(directory, 'coverage/lcov.info'), 'SF:src/route.ts\nSF:src/forgotten.ts\n')
	await checkApiCoverage(directory)
})

test('the real Bun config rejects a weak file despite a high overall average', async t => {
	const directory = await fixture(t)
	const config = await readFile(new URL('../apps/api/bunfig.toml', import.meta.url), 'utf8')
	await writeFile(join(directory, 'bunfig.toml'), config)
	const high = Array.from({ length: 50 }, (_, i) => `export function f${i}() {\n return ${i}\n}\n`).join('\n')
	await writeFile(join(directory, 'src/high.ts'), high)
	await writeFile(
		join(directory, 'src/low.ts'),
		'export function used() {\n return 1\n}\nexport function missed() {\n return 2\n}\n'
	)
	await writeFile(
		join(directory, 'src/probe.test.ts'),
		[
			"import { test, expect } from 'bun:test'",
			"import * as high from './high'",
			"import { used } from './low'",
			"test('covered', () => { expect(Object.values(high).reduce((sum, fn) => sum + fn(), 0)).toBe(1225); expect(used()).toBe(1) })",
		].join('\n')
	)
	const bun = process.env.MINEMORIES_TEST_BUN ?? 'bun'
	await assert.rejects(execute(bun, ['test', 'src', '--parallel', '--coverage'], { cwd: directory }), error => {
		assert.equal(error.code, 1)
		assert.match(error.stderr, weakFile)
		return true
	})
	// The failing gate is per file: the total still exceeds both thresholds.
	const report = await readFile(join(directory, 'coverage/lcov.info'), 'utf8')
	const total = name =>
		[...report.matchAll(new RegExp(`^${name}:(\\d+)`, 'gm'))].reduce((sum, m) => sum + Number(m[1]), 0)
	assert.ok(total('LH') / total('LF') > 0.9)
	assert.ok(total('FNH') / total('FNF') > 0.8)
})
