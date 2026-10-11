import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { downloadFilename, packageMod } from './package-mod.mjs'
import { verifyModArtifact } from './verify-mod-artifact.mjs'

const manifestError = /manifest does not match/
const checksumError = /checksum file does not match/
const jarError = /JAR differs/
const archiveError = /not a JAR archive/
const expectedHashError = /original build SHA-256 is required/

async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), 'minemories-artifact-'))
	t.after(() => rm(root, { recursive: true, force: true }))
	const source = join(root, 'libs')
	const directory = join(root, 'downloaded')
	await mkdir(source)
	const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])
	await writeFile(join(source, 'minemories-0.2.0-beta.1.jar'), bytes)
	const manifest = await packageMod(source, directory)
	return { directory, bytes, manifest }
}

test('accepts the packaged JAR, manifest and checksum against the original build hash', async t => {
	const { directory, bytes, manifest } = await fixture(t)
	assert.deepEqual(await verifyModArtifact(directory, manifest.sha256), manifest)
	assert.deepEqual(await readFile(join(directory, downloadFilename)), bytes)
})

test('rejects altered, truncated and absent downloaded JARs', async t => {
	const { directory, bytes, manifest } = await fixture(t)
	await writeFile(join(directory, downloadFilename), Buffer.concat([bytes, Buffer.from([4])]))
	await assert.rejects(verifyModArtifact(directory, manifest.sha256), jarError)
	const altered = Buffer.from(bytes)
	altered[4] = 9
	await writeFile(join(directory, downloadFilename), altered)
	await assert.rejects(verifyModArtifact(directory, manifest.sha256), jarError)
	await writeFile(join(directory, downloadFilename), bytes.subarray(0, 3))
	await assert.rejects(verifyModArtifact(directory, manifest.sha256), archiveError)
	await rm(join(directory, downloadFilename))
	await assert.rejects(verifyModArtifact(directory, manifest.sha256), { code: 'ENOENT' })
})

test('requires the original hash even if an altered JAR has a self-consistent manifest', async t => {
	const { directory, bytes, manifest } = await fixture(t)
	const replacement = Buffer.concat([bytes, Buffer.from([9])])
	const sha256 = createHash('sha256').update(replacement).digest('hex')
	await writeFile(join(directory, downloadFilename), replacement)
	await writeFile(join(directory, 'manifest.json'), JSON.stringify({ ...manifest, bytes: replacement.length, sha256 }))
	await writeFile(join(directory, `${downloadFilename}.sha256`), `${sha256}  ${downloadFilename}\n`)
	await assert.rejects(verifyModArtifact(directory, manifest.sha256), manifestError)
	await assert.rejects(verifyModArtifact(directory, undefined), expectedHashError)
	await assert.rejects(verifyModArtifact(directory, 'not-a-build-hash'), expectedHashError)
})

test('rejects missing, corrupt or inconsistent manifest metadata and unsafe paths', async t => {
	const { directory, manifest } = await fixture(t)
	const variants = [
		null,
		[],
		{},
		{ ...manifest, version: '../other' },
		{ ...manifest, version: 2 },
		{ ...manifest, minecraft: '1.21.2' },
		{ ...manifest, loader: 'Fabric' },
		{ ...manifest, loaderVersion: '21.1.1' },
		{ ...manifest, file: '/downloads/../../other.jar' },
		{ ...manifest, bytes: '7' },
		{ ...manifest, bytes: 3 },
		{ ...manifest, bytes: 7.5 },
		{ ...manifest, bytes: Number.MAX_SAFE_INTEGER + 1 },
		{ ...manifest, sha256: '0'.repeat(64) },
	]
	await Promise.all(
		variants.map(async variant => {
			const candidate = await fixture(t)
			await writeFile(join(candidate.directory, 'manifest.json'), JSON.stringify(variant))
			await assert.rejects(verifyModArtifact(candidate.directory, manifest.sha256), manifestError)
		})
	)
	await writeFile(join(directory, 'manifest.json'), JSON.stringify({ ...manifest, bytes: 8 }))
	await assert.rejects(verifyModArtifact(directory, manifest.sha256), jarError)
	await writeFile(join(directory, 'manifest.json'), '{')
	await assert.rejects(verifyModArtifact(directory, manifest.sha256), SyntaxError)
	await rm(join(directory, 'manifest.json'))
	await assert.rejects(verifyModArtifact(directory, manifest.sha256), { code: 'ENOENT' })
})

test('rejects an altered or absent checksum file and a file without a JAR header', async t => {
	const { directory, bytes, manifest } = await fixture(t)
	await writeFile(join(directory, `${downloadFilename}.sha256`), `${manifest.sha256}  other.jar\n`)
	await assert.rejects(verifyModArtifact(directory, manifest.sha256), checksumError)
	await writeFile(join(directory, `${downloadFilename}.sha256`), `${manifest.sha256}  ${downloadFilename}\n`)
	await writeFile(join(directory, downloadFilename), Buffer.alloc(bytes.length))
	await assert.rejects(verifyModArtifact(directory, manifest.sha256), archiveError)
	await rm(join(directory, `${downloadFilename}.sha256`))
	await assert.rejects(verifyModArtifact(directory, manifest.sha256), { code: 'ENOENT' })
})
