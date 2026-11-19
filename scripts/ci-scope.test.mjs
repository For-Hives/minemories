import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scopeOf } from './ci-scope.mjs'

// The gates a change runs, in the workflow order.
const gatesOf = files => {
	const scope = scopeOf(files)
	return ['web', 'api', 'mod', 'discord'].filter(gate => scope[gate])
}

test('a front change runs the web gate and nothing of the mod or the API', () => {
	assert.deepEqual(gatesOf(['apps/web/src/App.tsx', 'apps/web/src/hero/charter.css']), ['web'])
	assert.deepEqual(gatesOf(['scripts/hero-assets/cli.mjs']), ['web'])
	assert.deepEqual(gatesOf(['scripts/build-web.mjs']), ['web'])
	assert.deepEqual(gatesOf(['scripts/smoke-web.mjs', 'deploy/nginx.web.conf']), ['web'])
	assert.deepEqual(gatesOf(['scripts/brand/build-icons.mjs']), ['web'])
	assert.deepEqual(gatesOf(['scripts/boot-screen/gen.mjs']), ['web'])
	assert.deepEqual(gatesOf(['design/logo/minemories-logo.svg']), ['web'])
})
test('an API change runs the API gate only', () => {
	assert.deepEqual(gatesOf(['apps/api/src/auth.ts']), ['api'])
	assert.deepEqual(gatesOf(['scripts/garage-integration.mjs']), ['api'])
})
test('the shared contract runs the web and the API gates, never the mod', () => {
	assert.deepEqual(gatesOf(['packages/api-contract/src/index.ts']), ['web', 'api'])
})
test('the shared mod storage package runs the API and the mod gates, never the web', () => {
	assert.deepEqual(gatesOf(['packages/mod-storage/src/index.mjs']), ['api', 'mod'])
})
test('a mod change runs the mod gate only', () => {
	assert.deepEqual(gatesOf(['mod/shared/common/src/main/java/dev/minemories/client/SimpleHubScreen.java']), ['mod'])
	assert.deepEqual(gatesOf(['mod/targets.json']), ['web', 'mod'])
	assert.deepEqual(gatesOf(['scripts/gradle.mjs', 'scripts/mod/release.mjs']), ['mod'])
	assert.deepEqual(gatesOf(['scripts/mod/notify.mjs']), ['mod', 'discord'])
	assert.deepEqual(gatesOf(['mod/targets.json', 'scripts/mod/cli.mjs']), ['web', 'mod'])
	assert.deepEqual(
		gatesOf(['mod/1.19.2/forge/build.gradle', 'mod/shared/core/src/main/java/dev/minemories/core/GlbScene.java']),
		['mod']
	)
})
test('a Discord sync change runs the Discord gate only (the shared notes fixture also runs the API and the site)', () => {
	assert.deepEqual(gatesOf(['scripts/discord/roadmap.mjs']), ['discord'])
	assert.deepEqual(gatesOf(['scripts/discord/fixtures/curated-notes.json']), ['web', 'api', 'discord'])
	// /versions bundles the notes at build time: a new notes file also runs the web gate.
	assert.deepEqual(gatesOf(['mod/release-notes/0.37.0-beta.1.md', 'mod/release-notes/README.md']), ['web', 'discord'])
	assert.deepEqual(gatesOf(['.github/workflows/discord.yml']), ['discord'])
})
test('documentation alone runs no gate', () => {
	assert.deepEqual(gatesOf(['docs/features/plan-site-complet.md', 'README.md', 'ops/mod-builder/install.sh']), [])
})
test('shared files and the workflow itself run every gate', () => {
	for (const file of [
		'bun.lock',
		'package.json',
		'biome.json',
		'.github/workflows/quality.yml',
		'.github/actions/setup/action.yml',
		'scripts/ci-scope.mjs',
	])
		assert.deepEqual(gatesOf([file]), ['web', 'api', 'mod', 'discord'], file)
})
test('a mixed change runs the union, and a push runs everything', () => {
	assert.deepEqual(gatesOf(['apps/web/src/App.tsx', 'apps/api/src/auth.ts']), ['web', 'api'])
	assert.deepEqual(scopeOf([], { everything: true }), {
		web: true,
		api: true,
		mod: true,
		discord: true,
		deps: true,
	})
})
test('dependencies are audited only when a manifest or the lockfile changes', () => {
	assert.equal(scopeOf(['apps/web/src/App.tsx']).deps, false)
	assert.equal(scopeOf(['apps/web/package.json']).deps, true)
	assert.equal(scopeOf(['bun.lock']).deps, true)
})
