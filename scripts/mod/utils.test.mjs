import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { releaseVersionPattern, repositoryRoot, run } from './utils.mjs'

test('the repository root holds the workspace package.json', () => {
	assert.ok(existsSync(resolve(repositoryRoot, 'package.json')))
	assert.ok(existsSync(resolve(repositoryRoot, 'scripts/mod/utils.mjs')))
})

test('only X.Y.Z-beta.N versions are accepted', () => {
	assert.ok(releaseVersionPattern.test('0.36.0-beta.1'))
	for (const bad of ['0.36.0', '1.2-beta.1', '1.2.3-beta.0', '01.2.3-beta.1', 'v1.2.3-beta.1'])
		assert.equal(releaseVersionPattern.test(bad), false, bad)
})

test('run returns the trimmed output and honours the working directory', () => {
	assert.equal(run('node', ['-p', '"ok"']), 'ok')
	const scripts = resolve(repositoryRoot, 'scripts')
	assert.equal(run('node', ['-p', 'process.cwd()'], { cwd: scripts }), scripts)
	assert.equal(run('node', ['-e', '0'], { encoding: 'buffer' }), '')
})

test('isMain is true only for the entry point of the process', () => {
	const probe = `import { isMain } from ${JSON.stringify(import.meta.resolve('./utils.mjs'))}; console.log(isMain(import.meta.url), isMain('file:///elsewhere.mjs'))`
	const directory = mkdtempSync(join(tmpdir(), 'utils-'))
	const file = join(directory, 'probe.mjs')
	writeFileSync(file, probe)
	assert.equal(run('node', [file]), 'true false')
})
