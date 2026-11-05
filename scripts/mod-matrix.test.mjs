import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	archiveName,
	cellState,
	ciCells,
	gradleArgs,
	issueFor,
	jarVersion,
	javaFor,
	matrixEntries,
	missingTargets,
	parseArchiveName,
	pickJdk,
	renderMatrix,
	requireBuildable,
} from './mod-matrix.mjs'

const unconfiguredHint = /issue forge 1\.20\.4/
const pinnedOnlyHint = /issue forge 1\.21\.1 52\.1\.20/
const forge121 = {
	loader: 'forge',
	minecraft: '1.21.1',
	loaderVersion: '52.1.19',
	jar: 'minemories-forge-{version}.jar',
}
const forge120 = {
	loader: 'forge',
	minecraft: '1.20.1',
	loaderVersion: '47.4.26',
	project: 'forge',
	jar: 'minemories-forge-mc1.20.1-{version}.jar',
	loaderProperty: 'forgeVersion',
}
const matrix = { version: '1.0.0-beta.1', minecraft: ['1.20.1', '1.21.1', '1.21.4'], builds: [forge121, forge120] }

test('extracts the mod version from a JAR name and rejects other files', () => {
	assert.equal(jarVersion('minemories-forge-mc1.20.1-1.0.0-beta.1.jar', forge120.jar), '1.0.0-beta.1')
	assert.equal(jarVersion('minemories-forge-1.0.0-beta.1-sources.jar', forge121.jar), null)
	assert.equal(jarVersion('other.jar', forge121.jar), null)
})

test('classifies a cell against the current mod version', () => {
	assert.equal(cellState([], '1.0.0'), 'missing')
	assert.equal(cellState(undefined, '1.0.0'), 'missing')
	assert.equal(cellState(['0.9.0'], '1.0.0'), 'stale')
	assert.equal(cellState(['0.9.0', '1.0.0'], '1.0.0'), 'current')
})

test('derives the build state of each loader version', () => {
	const cells = new Map([
		['forge|1.20.1|47.4.26', ['1.0.0-beta.1']],
		['forge|1.21.1|52.1.19', ['0.9.0']],
	])
	const planned = [{ loader: 'forge', minecraft: '1.21.4', loaderVersion: '54.0.1', priority: 2 }]
	const withPlan = { ...matrix, planned }
	assert.deepEqual(matrixEntries(withPlan, cells, 'forge', '1.20.1'), [{ loaderVersion: '47.4.26', state: 'current' }])
	assert.deepEqual(matrixEntries(withPlan, cells, 'forge', '1.21.1'), [{ loaderVersion: '52.1.19', state: 'stale' }])
	assert.deepEqual(matrixEntries(withPlan, cells, 'forge', '1.21.4'), [{ loaderVersion: '54.0.1', state: 'planned' }])
	assert.deepEqual(matrixEntries(matrix, new Map(), 'forge', '1.20.1'), [{ loaderVersion: '47.4.26', state: 'todo' }])
})

test('renders one compact table, newest Minecraft first, with colour only on request', () => {
	const cells = new Map([['forge|1.20.1|47.4.26', ['1.0.0-beta.1']]])
	const plain = renderMatrix(matrix, cells)
	const lines = plain.split('\n')
	assert.equal(lines[0], 'Mod 1.0.0-beta.1')
	assert.ok(lines[2].startsWith('Minecraft'))
	assert.ok(lines[3].startsWith('1.21.4'))
	assert.ok(plain.includes('✓ 47.4.26'))
	assert.ok(plain.includes('✗ 52.1.19'))
	assert.ok(!plain.includes('\u001b'))
	assert.ok(renderMatrix(matrix, cells, { color: true }).includes('\u001b[32m'))
})

test('lists the pinned targets missing the current version', () => {
	const cells = new Map([['forge|1.20.1|47.4.26', ['1.0.0-beta.1']]])
	assert.deepEqual(missingTargets(matrix, cells), [forge121])
})

test('passes a loader version property only when it differs from the pinned one', () => {
	assert.deepEqual(gradleArgs(forge120, '47.4.26'), [':forge:build'])
	assert.deepEqual(gradleArgs(forge120, '47.4.30'), [':forge:build', '-PforgeVersion=47.4.30'])
})

test('refuses builds that are unconfigured or cannot take another loader version', () => {
	assert.throws(() => requireBuildable(undefined, undefined, 'forge', '1.20.4'), unconfiguredHint)
	assert.throws(() => requireBuildable(forge121, '52.1.20', 'forge', '1.21.1'), pinnedOnlyHint)
	assert.doesNotThrow(() => requireBuildable(forge120, '47.4.30', 'forge', '1.20.1'))
})

test('prefers the lowest JDK that can run Gradle', () => {
	assert.equal(
		pickJdk([
			{ home: '/jdk25', major: 25 },
			{ home: '/jdk17', major: 17 },
			{ home: '/jdk21', major: 21 },
		]),
		'/jdk21'
	)
	assert.equal(pickJdk([{ home: '/jdk17', major: 17 }]), null)
})

test('prepares an issue with the validation checklist', () => {
	const issue = issueFor(matrix, 'forge', '1.21.4', '54.0.1')
	assert.ok(issue.title.includes('forge 54.0.1 pour Minecraft 1.21.4'))
	assert.ok(issue.body.includes('Aucun projet Gradle'))
	assert.ok(issue.body.includes('Test en jeu'))
	assert.ok(issueFor(matrix, 'forge', '1.20.1', '47.4.30').body.includes('Un build existe déjà'))
})

test('names archived JARs so loader, Minecraft and loader versions are readable and parseable', () => {
	const name = archiveName(forge120, '47.4.26', '1.0.0-beta.1')
	assert.equal(name, 'minemories-1.0.0-beta.1-forge-mc1.20.1-47.4.26.jar')
	assert.deepEqual(parseArchiveName(name), {
		version: '1.0.0-beta.1',
		loader: 'forge',
		minecraft: '1.20.1',
		loaderVersion: '47.4.26',
	})
	assert.equal(parseArchiveName('notes.txt'), null)
})

test('carries the planned note into the issue', () => {
	const planned = [
		{ loader: 'forge', minecraft: '1.21.4', loaderVersion: '54.0.1', java: '21', priority: 2, note: 'portage' },
	]
	assert.ok(issueFor({ ...matrix, planned }, 'forge', '1.21.4').body.includes('priorité 2'))
})

test('CI builds every cell outside the 1.21.1 root, with the Java of its Minecraft version', () => {
	const matrix = {
		builds: [
			{ loader: 'forge', minecraft: '1.21.1', loaderVersion: '52.1.19', dir: 'mod/minemories', project: 'forge' },
			{
				loader: 'forge',
				minecraft: '1.20.1',
				loaderVersion: '47.4.26',
				dir: 'mod/minemories-1.20.1',
				project: 'forge',
			},
			{
				loader: 'fabric',
				minecraft: '1.21.11',
				loaderVersion: '0.20.1',
				dir: 'mod/minemories-1.21.11',
				project: 'fabric',
			},
		],
	}
	assert.deepEqual(
		ciCells(matrix).map(cell => [cell.id, cell.java, cell.dir]),
		[
			['forge-mc1.20.1', '17', 'mod/minemories-1.20.1'],
			['fabric-mc1.21.11', '21', 'mod/minemories-1.21.11'],
		]
	)
	assert.equal(javaFor('1.18.2'), '17')
	assert.equal(javaFor('1.21.1'), '21')
})
