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
import { supportedMajors } from '../jdk.mjs'
import { execLogged, reapProcesses } from './exec.mjs'
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
import { detectLocalPrerequisites, detectPrerequisites, resolveJdk } from './prereqs.mjs'
import {
	evaluateStats,
	failureMessage,
	parseGlbStats,
	parseLogMarkers,
	resourceProblems,
	parseSummary,
	thresholdsFor,
} from './report.mjs'
import { createWatchdog, DEFAULT_IDLE_SECONDS } from './watchdog.mjs'

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
		return { error: existsSync(paths.glb) ? glbError.message : 'capture GLB missing after the test' }
	}
}

function interpret({ outcome, stats, error, thresholds, spec, log }) {
	const markers = parseLogMarkers(outcome.tail)
	if (outcome.stuck) return { status: 'failed', message: `Minecraft stuck (${outcome.stuck}), stopped` }
	if (outcome.timedOut && !outcome.completed) return { status: 'failed', message: 'timed out, Minecraft was stopped' }
	// A finished test is judged on its log and report: ForgeGradle can keep the process alive after the result.
	if (markers.failed || (outcome.code !== 0 && !outcome.completed)) {
		const detail = failureMessage(outcome.tail)
		return { status: 'failed', message: detail ?? `${spec.gradleArgs[0]} failed (code ${outcome.code})` }
	}
	if (error) return { status: 'failed', message: error }
	const problems = evaluateStats(stats, thresholds)
	if (problems.length > 0) return { status: 'failed', message: problems.join('; ') }
	const missing = resourceProblems(log)
	if (missing.length > 0) return { status: 'failed', message: `missing resource: ${missing.join(' | ')}` }
	return { status: 'passed' }
}

// A hung client is killed and tried once more; a second hang is reported, never waited on.
const MAX_ATTEMPTS = 2

async function execWithRetry({ context, plan, target, logFile, gradleJdk }) {
	const { root, env, gameMemoryMb, timeoutSeconds, exec, reap, local } = context
	let outcome
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		// biome-ignore lint/performance/noAwaitInLoops: a single Minecraft instance at a time, retried only when stuck.
		outcome = await exec({
			...plan,
			env: buildEnvironment({ env, gradleJdk, gameMemoryMb, local }),
			timeoutMs: timeoutSeconds * 1000,
			idleTimeoutMs: DEFAULT_IDLE_SECONDS * 1000,
			watch: createWatchdog(),
			logFile,
		})
		reap(join(root, gradleRoot(target)))
		if (!(outcome.stuck || outcome.timedOut) || outcome.completed) break
	}
	return outcome
}

async function runTarget(target, context) {
	const { root, thresholdsFile, keepLogs, prerequisites, jdkLookup, local } = context
	const spec = gametestSpec(target)
	if (!spec) return { status: 'skipped', message: noGametestReason(target) }
	if (prerequisites.missing.length > 0) {
		return { status: 'skipped', message: `missing prerequisites: ${prerequisites.missing.join(', ')}` }
	}
	// Loom for Minecraft 26.x needs Gradle on the game's own (newer) JDK.
	const gradleMajor = Number(target.java) > Number(GRADLE_JAVA) ? String(target.java) : GRADLE_JAVA
	const gradleJdk = jdkLookup(gradleMajor)
	const gameJdk = jdkLookup(String(target.java ?? GRADLE_JAVA))
	if (!(gradleJdk && gameJdk)) {
		const major = gradleJdk ? target.java : gradleMajor
		return {
			status: 'skipped',
			message: `JDK ${major} not found (MOD_JDK_${major}, JAVA_HOME_${major} or ~/.local/tools)`,
		}
	}
	if (!existsSync(join(root, gradleRoot(target), 'gradlew'))) {
		return { status: 'skipped', message: `gradlew missing from ${gradleRoot(target)}` }
	}
	const paths = exportPaths(root, target)
	await rm(dirname(paths.glb), { recursive: true, force: true })
	const logFile = join(root, 'build', 'mod-test-logs', `${target.id}.log`)
	// Every installed JDK is offered: configuring a Gradle root also configures its other loaders (Forge 1.21.11 needs 25).
	const installed = supportedMajors.map(major => jdkLookup(String(major))).filter(Boolean)
	const plan = buildCommand({ root, target, spec, jdkPaths: [...new Set([gradleJdk, gameJdk, ...installed])], local })
	const outcome = await execWithRetry({ context, plan, target, logFile, gradleJdk })
	const { stats, error } = await readStats(paths)
	const thresholds = thresholdsFor(thresholdsFile, target.id)
	const log = await readFile(logFile, 'utf8').catch(() => '')
	const verdict = interpret({ outcome, stats, error, thresholds, spec, log })
	const report = { stats: stats ?? null, thresholds, logFile: relative(root, logFile) }
	if (verdict.status === 'passed' && !keepLogs) await rm(logFile, { force: true })
	return { ...verdict, report, logTail: verdict.status === 'failed' ? outcome.tail : undefined }
}

const detectFor = (local, env) => (local ? detectLocalPrerequisites(env) : detectPrerequisites(env))

/**
 * Runs the headless tests, sequentially. `deps` is for tests only (exec, filesystem, root, thresholds).
 * @returns {Promise<{targetId, status, seconds, report?, message?}[]>}
 */
export async function runHeadlessTests(
	{ config, targets, env = process.env, keepLogs = false, local = false },
	deps = {}
) {
	const root = deps.root ?? config?.root ?? repositoryRoot
	const memory = Number(config?.headless?.gameMemoryMb ?? env.MOD_TEST_GAME_MEMORY_MB ?? DEFAULT_GAME_MEMORY_MB)
	const timeout = Number(config?.headless?.timeoutSeconds ?? env.MOD_TEST_TIMEOUT_SECONDS ?? DEFAULT_TIMEOUT_SECONDS)
	const context = {
		root,
		env,
		keepLogs,
		local,
		exec: deps.exec ?? execLogged,
		reap: deps.reap ?? reapProcesses,
		gameMemoryMb: Number.isFinite(memory) && memory > 0 ? memory : DEFAULT_GAME_MEMORY_MB,
		timeoutSeconds: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_SECONDS,
		thresholdsFile: deps.thresholds ?? (await loadThresholds()),
		prerequisites: deps.prerequisites ?? detectFor(local, env),
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
			result = { status: 'failed', message: `unexpected error: ${error.message}` }
		}
		results.push({ targetId: target.id, seconds: Math.round((Date.now() - started) / 100) / 10, ...result })
	}
	return results
}
