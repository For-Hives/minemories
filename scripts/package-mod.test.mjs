import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { downloadFilename, modArtifact, packageAllMods, packageMod } from './package-mod.mjs'

const checksumPattern = /^[a-f0-9]{64}$/
const ambiguousBuild = /exactly one/
const corruptBuild = /not a JAR/

async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), 'minemories-package-'))
	t.after(() => rm(root, { recursive: true, force: true }))
	const source = join(root, 'libs')
	await mkdir(source)
	return { root, source, target: join(root, 'downloads') }
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

test('packages separate loader artifacts without replacing the website default', async t => {
	const { root } = await fixture(t)
	const targets = [
		['neoforge', 'minemories-', 'NeoForge', '21.1.248'],
		['fabric', 'minemories-fabric-', 'Fabric', '0.19.5'],
		['forge', 'minemories-forge-', 'Forge', '52.1.19'],
	]
	await Promise.all(
		targets.map(async ([loader, prefix]) => {
			const source = join(root, 'mod/minemories', loader, 'build/libs')
			await mkdir(source, { recursive: true })
			await writeFile(join(source, `${prefix}0.2.0-beta.1.jar`), Buffer.from([0x50, 0x4b, 0x03, 0x04, loader.length]))
			await writeFile(join(source, `${prefix}0.2.0-beta.1-dev.jar`), 'development classes')
		})
	)
	const manifests = await packageAllMods(root)
	await Promise.all(
		targets.map(async ([loader, , name, version]) => {
			const filename = `minemories-${loader}-mc1.21.1.jar`
			const directory = join(root, 'build/mod-loaders', loader)
			assert.equal(manifests[loader].loader, name)
			assert.equal(manifests[loader].loaderVersion, version)
			assert.equal(manifests[loader].version, '0.2.0-beta.1')
			assert.equal(manifests[loader].file, `/downloads/${filename}`)
			assert.deepEqual(await readFile(join(directory, filename)), Buffer.from([0x50, 0x4b, 0x03, 0x04, loader.length]))
		})
	)
	assert.equal(manifests.fabric.fabricApi, '0.116.17+1.21.1')
	assert.equal(downloadFilename, 'minemories-neoforge-mc1.21.1.jar')
	await assert.rejects(readFile(join(root, 'apps/web/public/downloads/manifest.json')), { code: 'ENOENT' })
})

test('rejects a wrong loader build and unknown or unsafe loader names', async t => {
	const { source, target } = await fixture(t)
	await writeFile(join(source, 'minemories-fabric-0.2.0.jar'), Buffer.from([0x50, 0x4b, 0x03, 0x04]))
	await assert.rejects(packageMod(source, target), ambiguousBuild)
	await assert.rejects(packageMod(source, target, 'forge'), ambiguousBuild)
	await Promise.all(
		['../fabric', '__proto__', 'quilt', 'unknown'].map(async loader => {
			assert.throws(() => modArtifact(loader), { message: 'Unknown mod loader.' })
			await assert.rejects(packageMod(source, target, loader), { message: 'Unknown mod loader.' })
		})
	)
})
