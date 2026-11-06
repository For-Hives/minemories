import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { bump, bumpVersion, commitBump, propertiesPath, readModVersion } from './version.mjs'

async function fixture(version = '0.36.0-beta.1') {
	const root = await mkdtemp(join(tmpdir(), 'mod-version-'))
	await mkdir(join(root, 'mod/1.21.1'), { recursive: true })
	await writeFile(join(root, propertiesPath), `org.gradle.jvmargs=-Xmx3G\nmod_version=${version}\nother=1\n`)
	return root
}

test('bumpVersion follows X.Y.Z-beta.N', () => {
	assert.equal(bumpVersion('0.36.0-beta.1', 'beta'), '0.36.0-beta.2')
	assert.equal(bumpVersion('0.36.4-beta.3', 'patch'), '0.36.5-beta.1')
	assert.equal(bumpVersion('0.36.4-beta.3', 'minor'), '0.37.0-beta.1')
	assert.throws(() => bumpVersion('0.36.0', 'beta'), /hors format/)
	assert.throws(() => bumpVersion('0.36.0-beta.1', 'major'), /inconnu/)
})

test('bump rewrites only the version line and commits with a tag on request', async () => {
	const root = await fixture()
	const calls = []
	assert.deepEqual(await bump(root, 'patch', { commit: false }), { current: '0.36.0-beta.1', next: '0.36.1-beta.1' })
	assert.equal(await readModVersion(root), '0.36.1-beta.1')
	assert.match(
		await readFile(join(root, propertiesPath), 'utf8'),
		/jvmargs=-Xmx3G\nmod_version=0\.36\.1-beta\.1\nother=1/
	)
	assert.equal(calls.length, 0)
	await bump(root, 'beta', { commit: true, exec: (command, args) => calls.push([command, ...args]) })
	assert.deepEqual(calls, [
		['git', 'add', propertiesPath],
		['git', 'commit', '-m', 'chore(release): 0.36.1-beta.2'],
		['git', 'tag', 'mod-v0.36.1-beta.2'],
	])
})

test('commitBump defaults to running git in the root; a file without version fails', async () => {
	assert.equal(typeof commitBump, 'function')
	const root = await mkdtemp(join(tmpdir(), 'mod-version-'))
	await mkdir(join(root, 'mod/1.21.1'), { recursive: true })
	await writeFile(join(root, propertiesPath), 'x=1\n')
	await assert.rejects(readModVersion(root), /introuvable/)
})
