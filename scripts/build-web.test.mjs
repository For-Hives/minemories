import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { verifyWebDownload } from './build-web.mjs'
import { downloadFilename, packageMod } from './package-mod.mjs'

const unavailable = /Cannot build a site without a valid Minemories JAR/

test('the web build refuses missing or altered downloads and accepts the packaged artifact', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'minemories-web-build-'))
	t.after(() => rm(directory, { recursive: true, force: true }))
	const source = join(directory, 'libs')
	const target = join(directory, 'downloads')
	await mkdir(source)
	await assert.rejects(verifyWebDownload(target), unavailable)
	await mkdir(target)
	await writeFile(join(target, 'manifest.json'), '<html>not a manifest</html>')
	await assert.rejects(verifyWebDownload(target), unavailable)
	await writeFile(join(source, 'minemories-0.1.0.jar'), Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))
	const manifest = await packageMod(source, target)
	assert.deepEqual(await verifyWebDownload(target), manifest)
	const jar = await readFile(join(target, downloadFilename))
	await writeFile(join(target, downloadFilename), Buffer.concat([jar, Buffer.from([0])]))
	await assert.rejects(verifyWebDownload(target), unavailable)
})
