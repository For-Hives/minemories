// Headless in-game tests of the mod targets: for each target, one Minecraft client at a time under Xvfb with Mesa
// software rendering runs the existing capture gametest; the resulting GLB is then compared to minimum statistics.
//
// No dedicated-server smoke test: the mod is client-only (`"environment": "client"` in fabric.mod.json, client
// mixins and renderer code) and no build file defines a server run configuration, so a server start would test
// nothing of the mod and could only fail for unrelated reasons.
import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execLogged } from './exec.mjs'
import {
	buildCommand,
	buildEnvironment,
	DEFAULT_GAME_MEMORY_MB,
	DEFAULT_TIMEOUT_SECONDS,
	exportPaths,
	gametestSpec,
	gradleRoot,
	noGametestReason,
} from './plan.mjs'
import { detectPrerequisites, resolveJdk } from './prereqs.mjs'
import {
	evaluateStats,
	failureMessage,
	parseGlbStats,
	parseLogMarkers,
	parseSummary,
	thresholdsFor,
} from './report.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(here, '..', '..', '..')
const GRADLE_JAVA = '21'

export async function loadThresholds(path = join(here, 'thresholds.json')) {
	return JSON.parse(await readFile(path, 'utf8'))
}

/** Accepts ids and/or target objects; with nothing given, every enabled target of the configuration. */
export function resolveTargets(config, targets) {
	const known = config?.targets ?? []
	if (!targets || targets.length === 0) return known.filter(target => target.enabled !== false)
	return targets.map(item => (typeof item === 'string' ? (known.find(t => t.id === item) ?? { id: item }) : item))
}

async function readStats(paths) {
	try {
		return { stats: parseGlbStats(await readFile(paths.glb)) }
	} catch (glbError) {
		try {
			const stats = parseSummary(await readFile(paths.summary, 'utf8'))
			if (stats) return { stats }
		} catch {
			// No summary either: report the GLB problem below.
		}
		return { error: existsSync(paths.glb) ? glbError.message : 'GLB de capture absent après le test' }
	}
}

function interpret({ outcome, stats, error, thresholds, spec }) {
	const markers = parseLogMarkers(outcome.tail)
	if (outcome.timedOut) return { status: 'failed', message: 'délai dépassé, Minecraft a été arrêté' }
	if (markers.failed || outcome.code !== 0) {
		const detail = failureMessage(outcome.tail)
		return { status: 'failed', message: detail ?? `${spec.gradleArgs[0]} a échoué (code ${outcome.code})` }
	}
	if (error) return { status: 'failed', message: error }
	const problems = evaluateStats(stats, thresholds)
	if (problems.length > 0) return { status: 'failed', message: problems.join(' ; ') }
	return { status: 'passed' }
}

async function runTarget(target, context) {
	const { root, env, thresholdsFile, gameMemoryMb, timeoutSeconds, keepLogs, exec, prerequisites, jdkLookup } = context
	const spec = gametestSpec(target)
	if (!spec) return { status: 'skipped', message: noGametestReason(target) }
	if (prerequisites.missing.length > 0) {
		return { status: 'skipped', message: `prérequis manquants : ${prerequisites.missing.join(', ')}` }
	}
	const gradleJdk = jdkLookup(GRADLE_JAVA)
	const gameJdk = jdkLookup(String(target.java ?? GRADLE_JAVA))
	if (!(gradleJdk && gameJdk)) {
		const major = gradleJdk ? target.java : GRADLE_JAVA
		return {
			status: 'skipped',
			message: `JDK ${major} introuvable (MOD_JDK_${major}, JAVA_HOME_${major} ou ~/.local/tools)`,
		}
	}
	if (!existsSync(join(root, gradleRoot(target), 'gradlew'))) {
		return { status: 'skipped', message: `gradlew absent de ${gradleRoot(target)}` }
	}
	const paths = exportPaths(root, target)
	await rm(dirname(paths.glb), { recursive: true, force: true })
	const logFile = join(root, 'build', 'mod-test-logs', `${target.id}.log`)
	const plan = buildCommand({ root, target, spec, jdkPaths: [...new Set([gradleJdk, gameJdk])] })
	const outcome = await exec({
		...plan,
		env: buildEnvironment({ env, gradleJdk, gameMemoryMb }),
		timeoutMs: timeoutSeconds * 1000,
		logFile,
	})
	const { stats, error } = await readStats(paths)
	const thresholds = thresholdsFor(thresholdsFile, target.id)
	const verdict = interpret({ outcome, stats, error, thresholds, spec })
	const report = { stats: stats ?? null, thresholds, logFile: relative(root, logFile) }
	if (verdict.status === 'passed' && !keepLogs) await rm(logFile, { force: true })
	return { ...verdict, report, logTail: verdict.status === 'failed' ? outcome.tail : undefined }
}

/**
 * Runs the headless tests, sequentially. `deps` is for tests only (exec, filesystem, root, thresholds).
 * @returns {Promise<{targetId, status, seconds, report?, message?}[]>}
 */
export async function runHeadlessTests({ config, targets, env = process.env, keepLogs = false }, deps = {}) {
	const root = deps.root ?? config?.root ?? repositoryRoot
	const memory = Number(config?.headless?.gameMemoryMb ?? env.MOD_TEST_GAME_MEMORY_MB ?? DEFAULT_GAME_MEMORY_MB)
	const timeout = Number(config?.headless?.timeoutSeconds ?? env.MOD_TEST_TIMEOUT_SECONDS ?? DEFAULT_TIMEOUT_SECONDS)
	const context = {
		root,
		env,
		keepLogs,
		exec: deps.exec ?? execLogged,
		gameMemoryMb: Number.isFinite(memory) && memory > 0 ? memory : DEFAULT_GAME_MEMORY_MB,
		timeoutSeconds: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_SECONDS,
		thresholdsFile: deps.thresholds ?? (await loadThresholds()),
		prerequisites: deps.prerequisites ?? detectPrerequisites(env),
		jdkLookup: deps.jdkLookup ?? (major => resolveJdk(major, env)),
	}
	const results = []
	for (const target of resolveTargets(config, targets)) {
		const started = Date.now()
		let result
		try {
			// biome-ignore lint/performance/noAwaitInLoops: a single Minecraft instance at a time on the small VPS.
			result = await runTarget(target, context)
		} catch (error) {
			result = { status: 'failed', message: `erreur inattendue : ${error.message}` }
		}
		results.push({ targetId: target.id, seconds: Math.round((Date.now() - started) / 100) / 10, ...result })
	}
	return results
}
