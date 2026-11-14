import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const javaCommands = /(?:java|gradle|mod:build)/i

test('the Coolify web deploy has no Java toolchain or mod artifact dependency', async () => {
	const config = JSON.parse(await readFile(new URL('../railpack.web.json', import.meta.url), 'utf8'))
	assert.ok(!Object.keys(config.packages).some(name => javaCommands.test(name)))
	for (const step of Object.values(config.steps)) {
		for (const command of step.commands ?? []) assert.doesNotMatch(command, javaCommands)
	}
	assert.ok(config.steps.build.commands.some(command => command.includes('@minemories/web build')))
	// The site is launched: the build is indexable, whatever an old Coolify variable says.
	assert.ok(config.steps.build.commands.every(command => command.startsWith('VITE_INDEXABLE=true ')))
})

test('the nginx indexing switch matches the build: open by default, private routes still noindex', async () => {
	const nginx = await readFile(new URL('../deploy/nginx.web.conf', import.meta.url), 'utf8')
	const robots = nginx.match(/map \$uri \$mm_robots \{([^}]*)\}/)?.[1] ?? ''
	assert.match(robots, /^\s*default "";$/m)
	assert.match(robots, /\/app\.html "noindex, nofollow";/)
	assert.match(robots, /\/404\.html "noindex, nofollow";/)
})

test('the former staging host and www redirect to minemories.net with the same path', async () => {
	const nginx = await readFile(new URL('../deploy/nginx.web.conf', import.meta.url), 'utf8')
	assert.match(nginx, /www\.minemories\.net "https:\/\/minemories\.net";/)
	assert.match(nginx, /minemories\.xenos\.lightin\.io "https:\/\/minemories\.net";/)
	assert.match(nginx, /return 301 \$mm_canonical_host\$request_uri;/)
	assert.doesNotMatch(nginx, /^\s*minemories\.net "/m)
})
