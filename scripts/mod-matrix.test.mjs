import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	cellState,
	gradleArgs,
	issueFor,
	jarVersion,
	loaderGrid,
	missingTargets,
	pickJdk,
	renderGrid,
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

test('renders a grid with built, to-build, not-applicable and unconfigured cells', () => {
	const cells = new Map([['forge|1.20.1|47.4.26', ['1.0.0-beta.1']]])
	const grid = loaderGrid(matrix, cells, 'forge')
	assert.deepEqual(grid.columns, ['47.4.26', '52.1.19'])
	const text = renderGrid(grid, matrix.version)
	assert.ok(text.includes('✓ 1.0.0-beta.1'))
	assert.ok(text.includes('· à compiler'))
	assert.ok(text.includes('non configuré'))
	assert.ok(text.includes('· —'))
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
