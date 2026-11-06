import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { libsDir } from './build.mjs'
import { validateConfig } from './config.mjs'
import { collectCells, loadStorageReport, renderStatus } from './status.mjs'

const target = (loader, minecraft, extra = {}) => ({
	id: `${loader}-mc${minecraft}`,
	loader,
	name: loader,
	minecraft,
	loaderVersion: '1.0',
	java: '21',
	project: loader,
	dir: `mod/${minecraft}`,
	jar: `${loader}-${minecraft}-{version}.jar`,
	enabled: true,
	validatedInGame: true,
	...extra,
})
const config = validateConfig({
	minecraft: ['1.20.1', '1.21.1', '26.3'],
	targets: [target('forge', '1.21.1'), target('fabric', '1.21.1', { enabled: false }), target('forge', '1.20.1')],
	planned: [{ id: 'forge-mc26.3', loader: 'forge', minecraft: '26.3', loaderVersion: '9.9', java: '25' }],
})

test('cells show local state, planned entries and storage figures; colours are optional', async () => {
	const root = await mkdtemp(join(tmpdir(), 'mod-status-'))
	const forge = config.targets[0]
	await mkdir(libsDir(root, forge), { recursive: true })
	await writeFile(join(libsDir(root, forge), 'forge-1.21.1-2.0.0-beta.1.jar'), 'x')
	const old = config.targets[2]
	await mkdir(libsDir(root, old), { recursive: true })
	await writeFile(join(libsDir(root, old), 'forge-1.20.1-1.0.0-beta.1.jar'), 'x')
	const storage = {
		totalBytes: 3 * 1024 * 1024,
		perTarget: { 'forge-mc1.21.1': { versions: 2, bytes: 2048, latest: '1.9.0-beta.1' } },
	}
	const cells = await collectCells(config, root, '2.0.0-beta.1', storage)
	assert.equal(cells.get('forge|1.21.1').state, 'current')
	assert.equal(cells.get('forge|1.20.1').state, 'stale')
	assert.equal(cells.get('fabric|1.21.1').state, 'todo')
	assert.equal(cells.get('forge|26.3').state, 'planned')
	const plain = renderStatus({ config, cells, version: '2.0.0-beta.1', storage })
	assert.match(plain, /Mod 2\.0\.0-beta\.1/)
	assert.match(plain, /✓ 1\.0 ↑1\.9\.0-beta\.1 2 KB/)
	assert.match(plain, /✗ 1\.0\*/)
	assert.match(plain, /○ 9\.9/)
	assert.match(plain, /Storage: 3\.0 MB/)
	assert.ok(plain.indexOf('26.3') < plain.indexOf('1.21.1'))
	assert.equal(plain.includes('\u001b'), false)
	assert.ok(renderStatus({ config, cells, version: 'v', color: true }).includes('\u001b[32m'))
})

test('storage figures without a published version show a dash', async () => {
	const root = await mkdtemp(join(tmpdir(), 'mod-status-'))
	const cells = await collectCells(config, root, 'v', { perTarget: { 'forge-mc1.21.1': { bytes: 0 } } })
	assert.match(renderStatus({ config, cells, version: 'v' }), /↑- 1 KB/)
})

test('loadStorageReport ignores an absent or failing storage module', async () => {
	assert.equal(await loadStorageReport({}, async () => Promise.reject(new Error('missing'))), null)
	assert.equal(await loadStorageReport({}, async () => ({})), null)
	assert.deepEqual(await loadStorageReport({ A: 1 }, async () => ({ storageReport: async ({ env }) => env })), { A: 1 })
	assert.equal(
		await loadStorageReport({}, async () => ({ storageReport: async () => Promise.reject(new Error('s3')) })),
		null
	)
})
