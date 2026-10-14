import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const javaCommands = /(?:java|gradle|mod:build|package:mod)/i

test('the Coolify web deploy has no Java toolchain or mod artifact dependency', async () => {
	const config = JSON.parse(await readFile(new URL('../railpack.web.json', import.meta.url), 'utf8'))
	assert.ok(!Object.keys(config.packages).some(name => javaCommands.test(name)))
	for (const step of Object.values(config.steps)) {
		for (const command of step.commands ?? []) assert.doesNotMatch(command, javaCommands)
	}
	assert.ok(config.steps.build.commands.some(command => command.includes('@minemories/web build')))
	assert.ok(config.steps.build.commands.every(command => command.startsWith('VITE_INDEXABLE=false ')))
})
