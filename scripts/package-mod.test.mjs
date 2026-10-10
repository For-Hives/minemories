import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { downloadFilename, packageMod } from './package-mod.mjs'

const checksumPattern = /^[a-f0-9]{64}$/
const ambiguousBuild = /exactly one/
const corruptBuild = /not a JAR/

async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), 'minemories-package-'))
	t.after(() => rm(root, { recursive: true, force: true }))
	const source = join(root, 'libs')
	await mkdir(source)
	return { source, target: join(root, 'downloads') }
}

test('packages the exact JAR with reproducible version, compatibility and checksum metadata', async t => {
	const { source, target } = await fixture(t)
	const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])
	await writeFile(join(source, 'minemories-0.2.0.jar'), bytes)
	await writeFile(join(source, 'minemories-0.2.0-sources.jar'), 'not the playable artifact')
	const manifest = await packageMod(source, target)
	assert.deepEqual(await readFile(join(target, downloadFilename)), bytes)
	assert.equal(manifest.version, '0.2.0')
	assert.equal(manifest.loaderVersion, '21.1.248')
	assert.equal(manifest.file, `/downloads/${downloadFilename}`)
	assert.equal(manifest.bytes, bytes.length)
	assert.match(manifest.sha256, checksumPattern)
	assert.deepEqual(JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8')), manifest)
	assert.equal(
		await readFile(join(target, `${downloadFilename}.sha256`), 'utf8'),
		`${manifest.sha256}  ${downloadFilename}\n`
	)
})

test('does not distribute an absent, ambiguous or corrupt build', async t => {
	const { source, target } = await fixture(t)
	await assert.rejects(packageMod(source, target), ambiguousBuild)
	await writeFile(join(source, 'minemories-0.1.0.jar'), 'invalid archive')
	await assert.rejects(packageMod(source, target), corruptBuild)
	await writeFile(join(source, 'minemories-0.2.0.jar'), 'another stale build')
	await assert.rejects(packageMod(source, target), ambiguousBuild)
})
