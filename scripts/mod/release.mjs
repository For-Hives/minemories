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
		log.warn(`Module ${name} missing: step skipped.`)
		return Promise.resolve(null)
	}
	return import(pathToFileURL(path).href)
}

async function optionalFunction(loadModule, name, fn, log) {
	const module = await loadModule(name, log)
	if (!module) return null
	if (typeof module[fn] === 'function') return module[fn]
	log.warn(`${name} does not export ${fn}: step skipped.`)
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
				message: test.message ?? 'Headless test failed.',
			}
		return { id: r.targetId, status: 'passed', seconds: r.seconds, bytes: r.bytes }
	})
}

function failureKind({ buildFailed, testFailed, publishFailed, uploadFailed }) {
	if (buildFailed) return 'build-failure'
	if (testFailed) return 'test-failure'
	if (uploadFailed) return 'release-failure'
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
	const state = { version: null, commit: null, results: [], tests: [], published: [], store: null, remote: null }
	let release = null
	const notify = async event => {
		if (flags.dryRun) return
		try {
			const notifyFn = await optionalFunction(loadModule, './notify.mjs', 'notify', log)
			await notifyFn?.(event)
		} catch (error) {
			log.warn(`Notification failed: ${error.message}`)
		}
	}
	try {
		if (flags.dryRun) return await dryRun({ config, root, log, loadModule, flags })
		if (flags.remote) await checkRemote({ flags, env, loadModule, log })
		release = await acquire(lockPath(root), { label: 'bun mod release' })
		if (flags.bump) log.info(`Version: ${(await bump(root, flags.bump, { commit: flags.commit })).next}`)
		state.version = await readModVersion(root)
		const targets = enabledTargets(config)
		log.info(`Release ${state.version}: ${targets.length} target(s).`)
		state.results = await build(targets, { root, env, log, version: state.version, prod: true, locked: true })
		state.commit = state.results.find(r => r.manifest)?.manifest.commit ?? null
		log.info(`\n${summarize(state.results)}`)
		await testStage({ state, targets, config, env, log, loadModule, flags })
		const artifacts = storable(state)
		if (flags.remote) await uploadStage({ state, artifacts, env, log, loadModule, flags })
		else await storeStage({ state, artifacts, config, env, log, loadModule })
		await publishStage({ state, artifacts, config, env, root, log, loadModule, flags, changelog: deps.changelog })
		return await finish({ state, notify, log })
	} catch (error) {
		log.error(`Release interrupted: ${error.message}`)
		await notify({
			kind: 'release-failure',
			title: `Release ${state.version ?? ''} interrupted`,
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
			builtBy: r.manifest.builtBy,
			manifest: r.manifest,
		}))
}

async function testStage({ state, targets, config, env, log, loadModule, flags }) {
	if (flags.skipTests) return log.info('Headless tests skipped (--skip-tests).')
	const runTests = await optionalFunction(loadModule, './headless/index.mjs', 'runHeadlessTests', log)
	if (!runTests) return
	const built = new Set(state.results.filter(r => r.status === 'passed').map(r => r.targetId))
	const wanted = targets.filter(t => built.has(t.id))
	state.tests = (await runTests({ config, targets: wanted, env })) ?? []
	for (const t of state.tests) log.info(`  test ${t.targetId}: ${t.status}${t.message ? ` (${t.message})` : ''}`)
}

/** PC mode: checks the URL and the token before starting a long build. */
async function checkRemote({ flags, env, loadModule, log }) {
	const remote = await optionalFunction(loadModule, './remote/index.mjs', 'resolveRemote', log)
	if (!remote) throw new Error('Remote module missing: cannot upload through the API.')
	remote({ apiUrl: flags.apiUrl, env })
}

/** PC mode: uploads the JARs to the API (which writes to S3) instead of using the S3 keys. */
async function uploadStage({ state, artifacts, env, log, loadModule, flags }) {
	if (artifacts.length === 0) return log.warn('No artifact to upload.')
	const upload = await optionalFunction(loadModule, './remote/index.mjs', 'uploadRelease', log)
	if (!upload) throw new Error('Remote module missing: upload impossible.')
	state.remote = await upload({
		version: state.version,
		artifacts,
		env,
		apiUrl: flags.apiUrl,
		replace: Boolean(flags.replace),
		log,
	})
	const sent = state.remote.results.filter(r => r.status === 'sent').length
	log.info(`Upload: ${sent}/${artifacts.length} artifact(s) published through the API.`)
}

async function storeStage({ state, artifacts, config, env, log, loadModule }) {
	if (artifacts.length === 0) return log.warn('No artifact to store.')
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
	log.info(`Storage: ${artifacts.length} artifact(s) stored.`)
}

async function publishStage({ state, artifacts, config, env, root, log, loadModule, flags, changelog }) {
	if (flags.remote) return log.info('--remote mode: third-party publishing stays on the VPS (skipped).')
	if (flags.noPublish) return log.info('Third-party publishing skipped (--no-publish).')
	if (!hasPublishTokens(env)) return log.info('No Modrinth/CurseForge token: third-party publishing skipped.')
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
	for (const p of state.published) log.info(`  ${p.platform} ${p.targetId}: ${p.status}${p.url ? ` ${p.url}` : ''}`)
}

function failureSummary(state, uploadFailed) {
	if (!uploadFailed) return 'One or more steps failed.'
	const failed = state.remote.results.filter(r => r.status === 'failed').map(r => r.targetId)
	return `Upload through the API failed for: ${failed.join(', ')}.`
}

async function finish({ state, notify, log }) {
	const buildFailed = state.results.some(r => r.status === 'failed')
	const testFailed = state.tests.some(t => t.status === 'failed')
	const publishFailed = state.published.some(p => p.status === 'failed')
	const uploadFailed = state.remote ? !state.remote.ok : false
	const kind = failureKind({ buildFailed, testFailed, publishFailed, uploadFailed })
	const ok = kind === 'release-success'
	const firstFailure = state.results.find(r => r.status === 'failed')
	await notify({
		kind,
		title: ok ? `Release ${state.version} published` : `Release ${state.version} failed`,
		summary: ok ? 'Every target is built, tested and stored.' : failureSummary(state, uploadFailed),
		version: state.version,
		commit: state.commit ?? undefined,
		targets: targetReport(state.results, state.tests),
		logTail: firstFailure?.logTail?.split('\n').slice(-40).join('\n'),
	})
	log[ok ? 'info' : 'error'](ok ? 'Release finished.' : 'Release finished with failures.')
	return { ok, exitCode: ok ? 0 : 1, ...state }
}

async function dryRun({ config, root, log, loadModule, flags }) {
	const version = await readModVersion(root)
	log.info(`[dry-run] version ${version}${flags.bump ? ` (bump ${flags.bump} not applied)` : ''}`)
	log.info(
		`[dry-run] prod build: ${enabledTargets(config)
			.map(t => t.id)
			.join(', ')}`
	)
	const steps = [
		['headless tests', './headless/index.mjs', flags.skipTests],
		flags.remote
			? ['upload through the API (--remote)', './remote/index.mjs', false]
			: ['storage', './storage/index.mjs', false],
		['third-party publishing', './publish/index.mjs', flags.noPublish],
		['notification', './notify.mjs', false],
	]
	for (const [label, module, skipped] of steps) {
		if (skipped) log.info(`[dry-run] ${label}: skipped by option`)
		else log.info(`[dry-run] ${label}: ${(await loadModule(module, log)) ? 'module present' : 'module missing'}`)
	}
	return { ok: true, exitCode: 0, results: [], tests: [], published: [], store: null, remote: null, version }
}
