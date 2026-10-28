import assert from 'node:assert/strict'
import { test } from 'node:test'
import { releaseGradleTasks } from './build-release-target.mjs'

const target = { project: 'fabric' }

test('a standalone release cell checks the shared modules and its own adapter', () => {
	assert.deepEqual(releaseGradleTasks(target, '0.2.0-beta.1'), [
		'clean',
		':core:check',
		':common:check',
		':fabric:check',
		':fabric:build',
		'-PmodVersion=0.2.0-beta.1',
	])
})

test('a cell whose commit already passed the quality gates only checks its adapter', () => {
	assert.deepEqual(releaseGradleTasks(target, '0.2.0-beta.1', { sharedChecksDone: true }), [
		'clean',
		':fabric:check',
		':fabric:build',
		'-PmodVersion=0.2.0-beta.1',
	])
})
