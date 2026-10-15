import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { syncReleaseVersions } from './sync-release-versions.mjs'

async function fixture(t) {
	const root = await mkdtemp(resolve(tmpdir(), 'minemories-versions-'))
	t.after(() => rm(root, { recursive: true, force: true }))
	await writeFile(
		resolve(root, 'package.json'),
		JSON.stringify({ name: 'root', private: true, workspaces: ['apps/*', 'packages/*'] })
	)
	await Promise.all(
		['apps/web', 'apps/api', 'packages/api-contract', 'packages/future'].map(async directory => {
			await mkdir(resolve(root, directory), { recursive: true })
			await writeFile(
				resolve(root, directory, 'package.json'),
				JSON.stringify({ name: directory, version: '0.1.0', dependencies: { stable: 'workspace:*' } })
			)
		})
	)
	await mkdir(resolve(root, 'mod/minemories'), { recursive: true })
	await writeFile(
		resolve(root, 'mod/minemories/gradle.properties'),
		'org.gradle.caching=true\nmod_version=0.1.1-dev.1\n'
	)
	return root
}
test('root, every workspace and Gradle receive the same release version, preserving dependencies', async t => {
	const root = await fixture(t)
	const files = await syncReleaseVersions('0.2.0-beta.1', root)
	assert.equal(files.length, 5)
	const packages = await Promise.all(files.map(file => readFile(resolve(root, file), 'utf8')))
	for (const content of packages) assert.equal(JSON.parse(content).version, '0.2.0-beta.1')
	assert.deepEqual(JSON.parse(await readFile(resolve(root, 'apps/api/package.json'), 'utf8')).dependencies, {
		stable: 'workspace:*',
	})
	assert.equal(
		await readFile(resolve(root, 'mod/minemories/gradle.properties'), 'utf8'),
		'org.gradle.caching=true\nmod_version=0.2.0-beta.1\n'
	)
	await syncReleaseVersions('0.2.0-beta.1', root)
})
test('invalid versions or Gradle configuration fail before modifying package manifests', async t => {
	const root = await fixture(t)
	const original = await readFile(resolve(root, 'apps/web/package.json'), 'utf8')
	await assert.rejects(syncReleaseVersions('0.2.0;bad', root))
	await writeFile(resolve(root, 'mod/minemories/gradle.properties'), 'other=true\n')
	await assert.rejects(syncReleaseVersions('0.2.0-beta.1', root))
	assert.equal(await readFile(resolve(root, 'apps/web/package.json'), 'utf8'), original)
})
