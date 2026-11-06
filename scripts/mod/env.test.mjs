import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadEnv, parseEnv } from './env.mjs'

test('parseEnv handles comments, quotes, export and trailing comments', () => {
	const values = parseEnv(
		['# comment', 'A=1', 'export B="two words"', "C='x'", 'D=plain # note', 'E=', 'not a line', ''].join('\n')
	)
	assert.deepEqual(values, { A: '1', B: 'two words', C: 'x', D: 'plain', E: '' })
})

test('loadEnv keeps existing variables and tolerates a missing .env', async () => {
	const root = await mkdtemp(join(tmpdir(), 'mod-env-'))
	assert.deepEqual(await loadEnv({ root, base: { X: '1' } }), { X: '1' })
	await writeFile(join(root, '.env'), 'X=file\nY=file\n')
	assert.deepEqual(await loadEnv({ root, base: { X: 'shell' } }), { X: 'shell', Y: 'file' })
})

test('loadEnv exports missing keys to process.env only', async () => {
	const root = await mkdtemp(join(tmpdir(), 'mod-env-'))
	await writeFile(join(root, '.env'), 'MOD_ENV_TEST_KEY=hello\n')
	await loadEnv({ root })
	assert.equal(process.env.MOD_ENV_TEST_KEY, 'hello')
	delete process.env.MOD_ENV_TEST_KEY
})
