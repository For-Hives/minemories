// `bun mod release`: lock, version, prod build of every enabled target, headless tests, storage, third-party
// publication, notification. Optional steps load the other agents' modules lazily and are skipped when absent.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildTargets, lockPath, summarize } from './build.mjs'
import { enabledTargets } from './config.mjs'
import { acquireLock } from './lock.mjs'
import { run } from './utils.mjs'
import { bump, readModVersion } from './version.mjs'

const here = dirname(fileURLToPath(import.meta.url))

/** Imports `scripts/mod/<name>`; null (and a warning) when the module does not exist yet. */
export function loadOptionalModule(name, log) {
	const path = resolve(here, name)
	if (!existsSync(path)) {
		log.warn(`Module ${name} absent : étape ignorée.`)
		return Promise.resolve(null)
	}
	return import(pathToFileURL(path).href)
}

async function optionalFunction(loadModule, name, fn, log) {
	const module = await loadModule(name, log)
	if (!module) return null
	if (typeof module[fn] === 'function') return module[fn]
	log.warn(`${name} n'exporte pas ${fn} : étape ignorée.`)
	return null
}

export function changelogSince(root, exec = run) {
	try {
		const tag = exec('git', ['describe', '--tags', '--abbrev=0', '--match', 'mod-v*'], { cwd: root })
		return exec('git', ['log', '--pretty=- %s', `${tag}..HEAD`, '--', 'mod'], { cwd: root })
	} catch {
		return ''
	}
}

const tokenNames = ['MODRINTH_TOKEN', 'CURSEFORGE_TOKEN']
const hasPublishTokens = env => tokenNames.some(name => Boolean(env[name]))

function targetReport(results, tests) {
	return results.map(r => {
		const test = tests.find(t => t.targetId === r.targetId)
		if (r.status === 'failed') return { id: r.targetId, status: 'failed', seconds: r.seconds, message: r.message }
		if (test?.status === 'failed')
			return {
				id: r.targetId,
				status: 'failed',
				seconds: r.seconds,
				message: test.message ?? 'Test headless en échec.',
			}
		return { id: r.targetId, status: 'passed', seconds: r.seconds, bytes: r.bytes }
	})
}

function failureKind({ buildFailed, testFailed, publishFailed }) {
	if (buildFailed) return 'build-failure'
	if (testFailed) return 'test-failure'
	if (publishFailed) return 'publish-failure'
	return 'release-success'
}

/**
 * Runs the pipeline. `deps` lets tests inject `build`, `loadModule`, `acquire` and `changelog`.
 * Resolves to { ok, exitCode, results, tests, published, store }.
 */
export async function runRelease({ config, env, root, log, flags = {}, deps = {} }) {
	const build = deps.build ?? buildTargets
	const loadModule = deps.loadModule ?? loadOptionalModule
	const acquire = deps.acquire ?? acquireLock
	const state = { version: null, commit: null, results: [], tests: [], published: [], store: null }
	let release = null
	const notify = async event => {
		if (flags.dryRun) return
		try {
			const notifyFn = await optionalFunction(loadModule, './notify.mjs', 'notify', log)
			await notifyFn?.(event)
		} catch (error) {
			log.warn(`Notification échouée : ${error.message}`)
		}
	}
	try {
		if (flags.dryRun) return await dryRun({ config, root, log, loadModule, flags })
		release = await acquire(lockPath(root), { label: 'bun mod release' })
		if (flags.bump) log.info(`Version : ${(await bump(root, flags.bump, { commit: flags.commit })).next}`)
		state.version = await readModVersion(root)
		const targets = enabledTargets(config)
		log.info(`Release ${state.version} : ${targets.length} cible(s).`)
		state.results = await build(targets, { root, env, log, version: state.version, prod: true, locked: true })
		state.commit = state.results.find(r => r.manifest)?.manifest.commit ?? null
		log.info(`\n${summarize(state.results)}`)
		await testStage({ state, targets, config, env, log, loadModule, flags })
		const artifacts = storable(state)
		await storeStage({ state, artifacts, config, env, log, loadModule })
		await publishStage({ state, artifacts, config, env, root, log, loadModule, flags, changelog: deps.changelog })
		return await finish({ state, notify, log })
	} catch (error) {
		log.error(`Release interrompue : ${error.message}`)
		await notify({
			kind: 'release-failure',
			title: `Release ${state.version ?? ''} interrompue`,
			summary: error.message,
			version: state.version ?? undefined,
			commit: state.commit ?? undefined,
			targets: targetReport(state.results, state.tests),
		})
		return { ok: false, exitCode: 1, ...state }
	} finally {
		await release?.()
	}
}

function storable(state) {
	const testFailed = new Set(state.tests.filter(t => t.status === 'failed').map(t => t.targetId))
	return state.results
		.filter(r => r.status === 'passed' && !testFailed.has(r.targetId))
		.map(r => ({
			targetId: r.targetId,
			file: r.filePath,
			filePath: r.filePath,
			bytes: r.bytes,
			sha256: r.manifest.sha256,
		}))
}

async function testStage({ state, targets, config, env, log, loadModule, flags }) {
	if (flags.skipTests) return log.info('Tests headless ignorés (--skip-tests).')
	const runTests = await optionalFunction(loadModule, './headless/index.mjs', 'runHeadlessTests', log)
	if (!runTests) return
	const built = new Set(state.results.filter(r => r.status === 'passed').map(r => r.targetId))
	const wanted = targets.filter(t => built.has(t.id))
	state.tests = (await runTests({ config, targets: wanted, env })) ?? []
	for (const t of state.tests) log.info(`  test ${t.targetId} : ${t.status}${t.message ? ` (${t.message})` : ''}`)
}

async function storeStage({ state, artifacts, config, env, log, loadModule }) {
	if (artifacts.length === 0) return log.warn('Aucun artefact à stocker.')
	const store = await optionalFunction(loadModule, './storage/index.mjs', 'storeRelease', log)
	if (!store) return
	state.store = await store({
		config,
		version: state.version,
		commit: state.commit,
		builtAt: new Date().toISOString(),
		artifacts,
		env,
	})
	log.info(`Stockage : ${artifacts.length} artefact(s) enregistré(s).`)
}

async function publishStage({ state, artifacts, config, env, root, log, loadModule, flags, changelog }) {
	if (flags.noPublish) return log.info('Publication tierce ignorée (--no-publish).')
	if (!hasPublishTokens(env)) return log.info('Aucun jeton Modrinth/CurseForge : publication tierce ignorée.')
	const publish = await optionalFunction(loadModule, './publish/index.mjs', 'publishThirdParty', log)
	if (!publish) return
	const enabled = new Set(enabledTargets(config).map(t => t.id))
	state.published = await publish({
		config,
		release: {
			version: state.version,
			commit: state.commit,
			changelog: (changelog ?? changelogSince)(root),
			artifacts: artifacts.filter(a => enabled.has(a.targetId)),
		},
		env,
		dryRun: false,
	})
	for (const p of state.published) log.info(`  ${p.platform} ${p.targetId} : ${p.status}${p.url ? ` ${p.url}` : ''}`)
}

async function finish({ state, notify, log }) {
	const buildFailed = state.results.some(r => r.status === 'failed')
	const testFailed = state.tests.some(t => t.status === 'failed')
	const publishFailed = state.published.some(p => p.status === 'failed')
	const kind = failureKind({ buildFailed, testFailed, publishFailed })
	const ok = kind === 'release-success'
	const firstFailure = state.results.find(r => r.status === 'failed')
	await notify({
		kind,
		title: ok ? `Release ${state.version} publiée` : `Release ${state.version} en échec`,
		summary: ok ? 'Toutes les cibles sont compilées, testées et stockées.' : 'Une ou plusieurs étapes ont échoué.',
		version: state.version,
		commit: state.commit ?? undefined,
		targets: targetReport(state.results, state.tests),
		logTail: firstFailure?.logTail?.split('\n').slice(-40).join('\n'),
	})
	log[ok ? 'info' : 'error'](ok ? 'Release terminée.' : 'Release terminée avec des échecs.')
	return { ok, exitCode: ok ? 0 : 1, ...state }
}

async function dryRun({ config, root, log, loadModule, flags }) {
	const version = await readModVersion(root)
	log.info(`[dry-run] version ${version}${flags.bump ? ` (bump ${flags.bump} non appliqué)` : ''}`)
	log.info(
		`[dry-run] build prod : ${enabledTargets(config)
			.map(t => t.id)
			.join(', ')}`
	)
	const steps = [
		['tests headless', './headless/index.mjs', flags.skipTests],
		['stockage', './storage/index.mjs', false],
		['publication tierce', './publish/index.mjs', flags.noPublish],
		['notification', './notify.mjs', false],
	]
	for (const [label, module, skipped] of steps) {
		if (skipped) log.info(`[dry-run] ${label} : ignoré par option`)
		else log.info(`[dry-run] ${label} : ${(await loadModule(module, log)) ? 'module présent' : 'module absent'}`)
	}
	return { ok: true, exitCode: 0, results: [], tests: [], published: [], store: null, version }
}
