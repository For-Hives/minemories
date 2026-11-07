import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	ciCells,
	compareVersions,
	distFileName,
	enabledTargets,
	readConfig,
	selectTargets,
	validateConfig,
} from './config.mjs'
import { repositoryRoot } from './utils.mjs'

const target = (overrides = {}) => ({
	id: 'forge-mc26.3',
	loader: 'forge',
	name: 'Forge',
	minecraft: '26.3',
	loaderVersion: '1.2.3',
	java: '25',
	project: 'forge',
	dir: 'mod/26.3',
	jar: 'minemories-forge-{version}.jar',
	enabled: true,
	validatedInGame: false,
	...overrides,
})
const raw = (extra = {}) => ({ minecraft: ['1.21.1', '26.3'], targets: [target()], planned: [], ...extra })
const rejects = (value, pattern) => assert.throws(() => validateConfig(value), pattern)

test('the real mod/targets.json is valid and every enabled target is buildable', async () => {
	const config = await readConfig(repositoryRoot)
	assert.ok(config.targets.length >= 11)
	assert.deepEqual(
		config.planned.map(p => p.id),
		['forge-mc1.16.5', 'forge-mc1.12.2']
	)
	for (const t of enabledTargets(config)) assert.ok(t.jar.includes('{version}'), t.id)
})

test('versions such as 26.3 are accepted and nothing assumes a 1.x scheme', () => {
	assert.equal(validateConfig(raw()).targets[0].minecraft, '26.3')
	assert.deepEqual(['1.9', '26.3', '1.21.1'].sort(compareVersions), ['1.9', '1.21.1', '26.3'])
})

test('invalid shapes are rejected', () => {
	rejects(raw({ minecraft: ['1.x'] }), /minecraft/)
	rejects(raw({ targets: [] }), /targets/)
	rejects(raw({ targets: [target({ id: 'forge-1.0' })] }), /id/)
	rejects(raw({ targets: [target({ dir: 'mod/1.21.1' })] }), /dir/)
	rejects(raw({ targets: [target({ java: 'x' })] }), /java/)
	rejects(raw({ targets: [target({ minecraft: '1.0', id: 'forge-mc1.0', dir: 'mod/1.0' })] }), /missing from/)
	rejects(raw({ targets: [target(), target()] }), /duplicate/)
	rejects(raw({ targets: [target({ jar: undefined })] }), /buildable/)
	rejects(raw({ targets: [target({ jar: 'no-placeholder.jar' })] }), /jar/)
	rejects(raw({ targets: [target({ enabled: 'yes' })] }), /name\/enabled/)
	rejects(raw({ targets: [target({ loaderVersion: 'a b' })] }), /loaderVersion/)
	rejects(raw({ planned: [{ ...target(), jar: undefined }] }), /both built and planned/)
	rejects(undefined, /minecraft/)
})

test('a disabled target without a Gradle project is allowed but not selectable', () => {
	const config = validateConfig(
		raw({ targets: [target(), target({ id: 'quilt-mc26.3', loader: 'quilt', jar: undefined, enabled: false })] })
	)
	assert.equal(enabledTargets(config).length, 1)
	assert.throws(() => selectTargets(config, ['quilt-mc26.3']), /no Gradle project/)
})

test('selectTargets resolves ids, loader/minecraft pairs and --all', () => {
	const config = validateConfig(raw())
	assert.equal(selectTargets(config, ['forge-mc26.3'])[0].id, 'forge-mc26.3')
	assert.equal(selectTargets(config, ['forge', '26.3', 'forge-mc26.3']).length, 1)
	assert.equal(selectTargets(config, [], { all: true }).length, 1)
	assert.throws(() => selectTargets(config, ['fabric', '26.3']), /Unknown target/)
})

test('distribution names and CI cells', () => {
	assert.equal(distFileName(target(), '1.0.0-beta.1'), 'minemories-forge-mc26.3-1.0.0-beta.1.jar')
	const cells = ciCells(validateConfig(raw()))
	assert.deepEqual(Object.keys(cells[0]), ['id', 'loader', 'minecraft', 'loaderVersion', 'dir', 'project', 'java'])
	assert.equal(
		ciCells(
			validateConfig(raw({ targets: [target({ dir: 'mod/1.21.1', minecraft: '1.21.1', id: 'forge-mc1.21.1' })] }))
		).length,
		0
	)
})
