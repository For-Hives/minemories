import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { enabledTargets, filenameFor, repositoryRoot, requireCommit, requireReleaseVersion } from './release-utils.mjs'

const target = {
	id: 'neoforge-mc1.21.1',
	loader: 'neoforge',
	project: 'neoforge',
	name: 'NeoForge',
	minecraft: '1.21.1',
	loaderVersion: '21.1.248',
	java: '21',
	enabled: true,
	validatedInGame: true,
}
test('only implemented and validated loader targets enter the matrix', async () => {
	const configuration = JSON.parse(await readFile(`${repositoryRoot}/config/mod-targets.json`, 'utf8'))
	const active = enabledTargets(configuration)
	assert.deepEqual(
		active.map(item => [item.loader, item.loaderVersion, item.project]),
		[
			['neoforge', '21.1.248', 'neoforge'],
			['fabric', '0.19.5', 'fabric'],
			['forge', '52.1.19', 'forge'],
		]
	)
	assert.ok(
		active.every(item => item.enabled && item.validatedInGame && item.minecraft === '1.21.1' && item.java === '21')
	)
	assert.equal(active.find(item => item.loader === 'fabric').fabricApi, '0.116.17+1.21.1')
	assert.equal(configuration.targets.find(item => item.loader === 'quilt').enabled, false)
	assert.equal(filenameFor(target), 'minemories-neoforge-mc1.21.1.jar')
	assert.equal(configuration.targets.length, 4)
	for (const broken of [
		null,
		{},
		{ targets: [] },
		{ targets: [target, target] },
		{ targets: [{ ...target, validatedInGame: false }] },
		{ targets: [{ ...target, loaderVersion: null }] },
		{ targets: [{ ...target, project: '../fabric' }] },
		{ targets: [{ ...target, id: 'foreign' }] },
	])
		assert.throws(() => enabledTargets(broken))
})
test('untrusted version strings and commit references cannot reach commands or paths', () => {
	assert.equal(requireReleaseVersion('0.2.0-beta.1'), '0.2.0-beta.1')
	assert.equal(requireCommit('a'.repeat(40)), 'a'.repeat(40))
	for (const version of [
		'0.2.0',
		'0.2.0-beta',
		'0.2.0-beta.0',
		'0.2.0-beta.01',
		'01.2.0-beta.1',
		'../../file',
		'0.2.0-beta.1;echo bad',
		null,
	])
		assert.throws(() => requireReleaseVersion(version))
	for (const sha of ['main', 'HEAD', 'a'.repeat(39), '../main', null]) assert.throws(() => requireCommit(sha))
})
