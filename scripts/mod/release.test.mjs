import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { validateConfig } from './config.mjs'
import { changelogSince, loadOptionalModule, runRelease } from './release.mjs'
import { propertiesPath } from './version.mjs'

const target = (loader, enabled = true) => ({
	id: `${loader}-mc1.21.1`,
	loader,
	name: loader,
	minecraft: '1.21.1',
	loaderVersion: '1.0',
	java: '21',
	project: loader,
	dir: 'mod/1.21.1',
	jar: `${loader}-{version}.jar`,
	enabled,
	validatedInGame: true,
})
const config = validateConfig({
	minecraft: ['1.21.1'],
	targets: [target('forge'), target('fabric'), target('neoforge', false)],
})

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'mod-release-'))
	await mkdir(join(root, 'mod/1.21.1'), { recursive: true })
	await writeFile(join(root, propertiesPath), 'mod_version=1.0.0-beta.1\n')
	return root
}

function harness({ failing = [], modules = {}, tests } = {}) {
	const logs = { info: [], warn: [], error: [] }
	const log = {
		info: m => logs.info.push(m),
		warn: m => logs.warn.push(m),
		error: m => logs.error.push(m),
	}
	const calls = []
	const build = async targets => {
		calls.push(['build', targets.map(t => t.id)])
		return targets.map(t =>
			failing.includes(t.id)
				? { targetId: t.id, status: 'failed', seconds: 1, message: 'Gradle KO', logTail: 'a\nb' }
				: {
						targetId: t.id,
						status: 'passed',
						seconds: 2,
						bytes: 10,
						filePath: `/dist/${t.id}.jar`,
						manifest: { commit: 'c'.repeat(40), sha256: `sha-${t.id}` },
					}
		)
	}
	const loadModule = async name => {
		const module = modules[name]
		if (module === undefined) {
			log.warn(`Module ${name} absent : étape ignorée.`)
			return null
		}
		return module(calls)
	}
	const full = {
		'./headless/index.mjs': calls => ({
			runHeadlessTests: async ({ targets }) => {
				calls.push(['tests', targets.map(t => t.id)])
				return targets.map(t => ({ targetId: t.id, status: tests?.[t.id] ?? 'passed', seconds: 1, message: 'crash' }))
			},
		}),
		'./storage/index.mjs': calls => ({
			storeRelease: async args => {
				calls.push(['store', args.artifacts.map(a => a.targetId), args.version, args.commit])
				return { index: {} }
			},
		}),
		'./publish/index.mjs': calls => ({
			publishThirdParty: async args => {
				calls.push(['publish', args.release.artifacts.map(a => a.targetId), args.dryRun])
				return [{ platform: 'modrinth', targetId: 'forge-mc1.21.1', status: 'published', url: 'https://m' }]
			},
		}),
		'./notify.mjs': calls => ({
			notify: async event => {
				calls.push(['notify', event.kind, event.targets?.map(t => `${t.id}:${t.status}`)])
			},
		}),
	}
	return { logs, log, calls, build, loadModule, full, modules }
}

const run = async (root, h, flags = {}, env = { MODRINTH_TOKEN: 't' }) =>
	runRelease({
		config,
		env,
		root,
		log: h.log,
		flags,
		deps: {
			build: h.build,
			loadModule: h.loadModule,
			changelog: () => '- fix',
			acquire: async () => async () => h.calls.push(['unlock']),
		},
	})

test('a full successful release runs every step in order and notifies success', async () => {
	const root = await fixture()
	const h = harness()
	h.modules = h.full
	h.loadModule = async name => h.full[name]?.(h.calls) ?? null
	const result = await run(root, h)
	assert.equal(result.exitCode, 0)
	assert.deepEqual(
		h.calls.map(c => c[0]),
		['build', 'tests', 'store', 'publish', 'notify', 'unlock']
	)
	assert.deepEqual(h.calls[2], ['store', ['forge-mc1.21.1', 'fabric-mc1.21.1'], '1.0.0-beta.1', 'c'.repeat(40)])
	assert.equal(h.calls[4][1], 'release-success')
})

test('a failing build does not stop storage of the others but fails the release', async () => {
	const root = await fixture()
	const h = harness({ failing: ['fabric-mc1.21.1'] })
	h.loadModule = async name => h.full[name]?.(h.calls) ?? null
	const result = await run(root, h, { noPublish: true })
	assert.equal(result.exitCode, 1)
	assert.deepEqual(h.calls.find(c => c[0] === 'store')[1], ['forge-mc1.21.1'])
	assert.ok(!h.calls.some(c => c[0] === 'publish'))
	const notify = h.calls.find(c => c[0] === 'notify')
	assert.equal(notify[1], 'build-failure')
	assert.deepEqual(notify[2], ['forge-mc1.21.1:passed', 'fabric-mc1.21.1:failed'])
})

test('a headless test failure keeps that target out of storage and notifies a test failure', async () => {
	const root = await fixture()
	const h = harness({ tests: { 'forge-mc1.21.1': 'failed' } })
	h.loadModule = async name => h.full[name]?.(h.calls) ?? null
	const result = await run(root, h, {}, {})
	assert.equal(result.exitCode, 1)
	assert.deepEqual(h.calls.find(c => c[0] === 'store')[1], ['fabric-mc1.21.1'])
	assert.equal(h.calls.find(c => c[0] === 'notify')[1], 'test-failure')
	assert.ok(h.logs.info.some(m => m.includes('Aucun jeton')))
})

test('--skip-tests, --no-publish and absent modules are skipped with warnings', async () => {
	const root = await fixture()
	const h = harness()
	const result = await run(root, h, { skipTests: true, noPublish: true })
	assert.equal(result.exitCode, 0)
	assert.deepEqual(
		h.calls.map(c => c[0]),
		['build', 'unlock']
	)
	assert.ok(h.logs.warn.some(m => m.includes('./storage/index.mjs')))
	assert.ok(h.logs.info.some(m => m.includes('--skip-tests')))
})

test('a thrown error is captured, notified and returned as a failure; the lock is released', async () => {
	const root = await fixture()
	const h = harness()
	h.loadModule = async name => h.full[name]?.(h.calls) ?? null
	h.build = async () => {
		throw new Error('disk full')
	}
	const result = await run(root, h)
	assert.equal(result.exitCode, 1)
	assert.equal(h.calls.find(c => c[0] === 'notify')[1], 'release-failure')
	assert.equal(h.calls.at(-1)[0], 'unlock')
})

test('a publish failure and a notifier that throws are both handled', async () => {
	const root = await fixture()
	const h = harness()
	const modules = {
		...h.full,
		'./publish/index.mjs': () => ({
			publishThirdParty: async () => [{ platform: 'curseforge', targetId: 'x', status: 'failed' }],
		}),
		'./notify.mjs': () => ({
			notify: async () => {
				throw new Error('webhook down')
			},
		}),
		'./storage/index.mjs': () => ({}),
	}
	h.loadModule = async name => modules[name]?.(h.calls) ?? null
	const result = await run(root, h)
	assert.equal(result.exitCode, 1)
	assert.ok(h.logs.warn.some(m => m.includes('webhook down')))
	assert.ok(h.logs.warn.some(m => m.includes('storeRelease') || m.includes("n'exporte pas")))
})

test('--dry-run builds and sends nothing, and --bump rewrites the version otherwise', async () => {
	const root = await fixture()
	const h = harness()
	h.loadModule = async name => h.full[name]?.(h.calls) ?? null
	const dry = await run(root, h, { dryRun: true, bump: 'patch' })
	assert.equal(dry.exitCode, 0)
	assert.equal(h.calls.length, 0)
	assert.ok(h.logs.info.some(m => m.includes('module présent')))
	const real = await run(root, h, { bump: 'patch', skipTests: true, noPublish: true })
	assert.equal(real.version, '1.0.1-beta.1')
})

test('loadOptionalModule skips a missing file and loads an existing one; changelogSince tolerates git failures', async () => {
	const log = { warn: m => warnings.push(m) }
	const warnings = []
	assert.equal(await loadOptionalModule('./does-not-exist.mjs', log), null)
	assert.equal(warnings.length, 1)
	assert.equal(typeof (await loadOptionalModule('./version.mjs', log)).bump, 'function')
	assert.equal(
		changelogSince('.', () => {
			throw new Error('no tag')
		}),
		''
	)
	assert.equal(
		changelogSince('.', (_c, args) => (args[0] === 'describe' ? 'mod-v1' : '- a')),
		'- a'
	)
})
