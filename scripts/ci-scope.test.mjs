import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scopeOf } from './ci-scope.mjs'

const only = (files, ...gates) => {
	const scope = scopeOf(files)
	for (const gate of ['web', 'api', 'mod']) assert.equal(scope[gate], gates.includes(gate), `${gate} for ${files}`)
}

test('a front change runs the web gate and nothing of the mod or the API', () => {
	only(['apps/web/src/App.tsx', 'apps/web/src/hero/charter.css'], 'web')
	only(['scripts/hero-assets/cli.mjs'], 'web')
	only(['scripts/build-web.mjs'], 'web')
})
test('an API change runs the API gate only', () => {
	only(['apps/api/src/auth.ts'], 'api')
	only(['scripts/garage-integration.mjs'], 'api')
})
test('the shared contract runs the web and the API gates, never the mod', () => {
	only(['packages/api-contract/src/index.ts'], 'web', 'api')
})
test('a mod change runs the mod gate only', () => {
	only(['mod/minemories/common/src/main/java/dev/minemories/client/SimpleHubScreen.java'], 'mod')
	only(['config/mod-targets.json'], 'web', 'mod')
	only(['scripts/package-mod.mjs'], 'mod')
	only(['config/mod-matrix.json', 'scripts/mod-matrix.mjs'], 'mod')
	only(
		['mod/minemories-1.19.2/forge/build.gradle', 'mod/minemories/core/src/main/java/dev/minemories/core/GlbScene.java'],
		'mod'
	)
	only(['.github/workflows/mod-release.yml'], 'mod')
})
test('documentation alone runs no gate', () => {
	only(['docs/features/plan-site-complet.md', 'README.md'])
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
		only([file], 'web', 'api', 'mod')
})
test('a mixed change runs the union, and a push runs everything', () => {
	only(['apps/web/src/App.tsx', 'apps/api/src/auth.ts'], 'web', 'api')
	assert.deepEqual(scopeOf([], { everything: true }), { web: true, api: true, mod: true, deps: true })
})
test('dependencies are audited only when a manifest or the lockfile changes', () => {
	assert.equal(scopeOf(['apps/web/src/App.tsx']).deps, false)
	assert.equal(scopeOf(['apps/web/package.json']).deps, true)
	assert.equal(scopeOf(['bun.lock']).deps, true)
})
