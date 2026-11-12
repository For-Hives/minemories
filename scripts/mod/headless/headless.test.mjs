import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { parseArgs, run as runTestCommand } from '../commands/test.mjs'
import { execLogged } from './exec.mjs'
import { loadThresholds, resolveTargets, runHeadlessTests } from './index.mjs'
import {
	buildCommand,
	buildEnvironment,
	exportPaths,
	gametestHome,
	gametestSpec,
	gradleRoot,
	noGametestReason,
} from './plan.mjs'
import { detectLocalPrerequisites, detectPrerequisites, findOnPath, hasMesaSoftware, resolveJdk } from './prereqs.mjs'
import {
	evaluateStats,
	failureMessage,
	parseGlbStats,
	parseLogMarkers,
	parseSummary,
	resourceProblems,
	thresholdsFor,
} from './report.mjs'

const T = (loader, minecraft, extra = {}) => ({
	id: `${loader}-mc${minecraft}`,
	loader,
	minecraft,
	project: loader,
	java: minecraft === '1.21.1' || minecraft === '1.21.11' ? '21' : '17',
	dir: minecraft === '1.21.1' ? undefined : `mod/${minecraft}`,
	enabled: true,
	...extra,
})

function glb(counts = {}) {
	const json = {
		meshes: new Array(counts.meshes ?? 5).fill({}),
		materials: new Array(counts.materials ?? 16).fill({}),
		images: new Array(counts.images ?? 15).fill({}),
		nodes: new Array(counts.nodes ?? 6).fill({}),
	}
	let body = Buffer.from(JSON.stringify(json))
	body = Buffer.concat([body, Buffer.alloc((4 - (body.length % 4)) % 4, 0x20), Buffer.alloc(counts.padding ?? 200_000)])
	const jsonLength = Buffer.from(JSON.stringify(json)).length
	const padded = Buffer.alloc(20)
	padded.writeUInt32LE(0x46546c67, 0)
	padded.writeUInt32LE(2, 4)
	padded.writeUInt32LE(20 + body.length, 8)
	padded.writeUInt32LE(jsonLength, 12)
	padded.writeUInt32LE(0x4e4f534a, 16)
	return Buffer.concat([padded, body])
}

test('gametestSpec picks the exact Gradle task per loader and version', () => {
	assert.deepEqual(gametestSpec(T('fabric', '1.21.11')).gradleArgs, [':fabric:runClientGameTest'])
	assert.deepEqual(gametestSpec(T('fabric', '26.3')).gradleArgs, [':fabric:runClientGameTest'])
	assert.deepEqual(gametestSpec(T('neoforge', '1.21.11')).gradleArgs, [':neoforge:runClientGametest'])
	assert.deepEqual(gametestSpec(T('forge', '1.21.11')).gradleArgs, [':forge:runClient', '-PgameTest=true'])
	assert.deepEqual(gametestSpec(T('forge', '1.20.1')).gradleArgs, [':forge:runClientGametest'])
	assert.deepEqual(gametestSpec(T('fabric', '1.19.2')).gradleArgs, [':fabric:runClientGametest'])
	assert.deepEqual(gametestSpec(T('forge', '1.18.2')).gradleArgs, [':forge:runClientGametest'])
	assert.deepEqual(gametestSpec(T('neoforge', '1.21.1')).gradleArgs, [':neoforge:runClientGametest'])
	assert.deepEqual(gametestSpec(T('fabric', '1.21.1')).gradleArgs, [':fabric:runClientGametest'])
	assert.deepEqual(gametestSpec(T('forge', '1.21.1')).gradleArgs, [':forge:runClientGametest'])
	assert.equal(gametestSpec(T('quilt', '1.21.1')), null)
	assert.equal(gametestSpec(T('forge', '1.20.1', { enabled: false })), null)
	assert.equal(gametestSpec(undefined), null)
})

test('skip reasons and paths', () => {
	assert.ok(String(noGametestReason(T('neoforge', '1.26'))).includes('1.26'))
	assert.ok(String(noGametestReason(T('quilt', '1.21.1'))).includes('Quilt'))
	assert.ok(String(noGametestReason(T('forge', '1.20.1', { enabled: false }))).includes('disabled'))
	assert.equal(gradleRoot(T('neoforge', '1.21.1')), 'mod/1.21.1')
	assert.equal(gametestHome('/r', T('fabric', '1.21.11')), '/r/mod/1.21.11/fabric/build/gametest-home')
	assert.equal(
		exportPaths('/r', T('fabric', '1.21.11')).glb,
		'/r/mod/1.21.11/fabric/build/gametest-home/export/capture.glb'
	)
})

test('buildCommand wraps gradlew in xvfb-run on the target root', () => {
	const target = T('forge', '1.20.1')
	const plan = buildCommand({ root: '/r', target, spec: gametestSpec(target), jdkPaths: ['/j/21', '/j/17'] })
	assert.equal(plan.command, 'xvfb-run')
	assert.equal(plan.cwd, '/r/mod/1.20.1')
	assert.ok(plan.args.includes('./gradlew'))
	assert.ok(plan.args.includes('-Dminemories.gametest=true'))
	assert.ok(plan.args.includes('-Dorg.gradle.java.installations.paths=/j/21,/j/17'))
	assert.ok(plan.args.includes('-Dorg.gradle.java.installations.auto-download=false'))
	assert.equal(plan.args.at(-1), ':forge:runClientGametest')
	const bare = buildCommand({ root: '/r', target, spec: gametestSpec(target) })
	assert.ok(!bare.args.some(arg => arg.includes('installations.paths')))
})

test('--local runs gradlew directly on the real screen', () => {
	const target = T('forge', '1.20.1')
	const plan = buildCommand({ root: '/r', target, spec: gametestSpec(target), local: true })
	assert.equal(plan.command, '/r/mod/1.20.1/gradlew')
	assert.equal(plan.cwd, '/r/mod/1.20.1')
	assert.ok(!plan.args.includes('-a'))
	assert.ok(plan.args.includes('-Dminemories.gametest=true'))
	assert.equal(plan.args.at(-1), ':forge:runClientGametest')
	const env = buildEnvironment({
		env: {
			PATH: '/usr/bin',
			DISPLAY: ':0',
			WAYLAND_DISPLAY: 'wayland-0',
			XDG_RUNTIME_DIR: '/run/user/1',
			MODRINTH_TOKEN: 'x',
		},
		gradleJdk: '/j/21',
		local: true,
	})
	assert.equal(env.DISPLAY, ':0')
	assert.equal(env.WAYLAND_DISPLAY, 'wayland-0')
	assert.equal(env.LIBGL_ALWAYS_SOFTWARE, undefined)
	assert.equal(env.MODRINTH_TOKEN, undefined)
	assert.equal(buildEnvironment({ env: { DISPLAY: ':0' }, gradleJdk: '/j' }).DISPLAY, undefined)
	assert.equal(detectLocalPrerequisites({}).missing.length, 1)
	assert.deepEqual(detectLocalPrerequisites({ DISPLAY: ':0' }).missing, [])
	assert.deepEqual(detectLocalPrerequisites({ WAYLAND_DISPLAY: 'wayland-0' }).missing, [])
})

test('buildEnvironment is software-rendered, memory capped and leaks no secret', () => {
	const env = buildEnvironment({
		env: { PATH: '/usr/bin', HOME: '/home/x', MODRINTH_TOKEN: 'secret', S3_SECRET_KEY: 'secret' },
		gradleJdk: '/j/21',
		gameMemoryMb: 1536,
	})
	assert.equal(env.LIBGL_ALWAYS_SOFTWARE, '1')
	assert.equal(env.GALLIUM_DRIVER, 'llvmpipe')
	assert.equal(env._JAVA_OPTIONS, '-Xmx1536m')
	assert.equal(env.JAVA_HOME, '/j/21')
	assert.equal(env.PATH, '/j/21/bin:/usr/bin')
	assert.equal(env.MODRINTH_TOKEN, undefined)
	assert.equal(env.S3_SECRET_KEY, undefined)
	assert.equal(buildEnvironment({ env: {}, gradleJdk: '/j' }).PATH, '/j/bin:')
})

test('parse GLB, summary and log markers', () => {
	assert.deepEqual(parseGlbStats(glb()), { bytes: glb().length, meshes: 5, materials: 16, images: 15, nodes: 6 })
	assert.throws(
		() => parseGlbStats(Buffer.alloc(4)),
		error => error.message.includes('magic')
	)
	const broken = glb()
	broken.writeUInt32LE(1, 16)
	assert.throws(
		() => parseGlbStats(broken),
		error => error.message.includes('JSON')
	)
	assert.deepEqual(parseSummary('bytes=181556 meshes=5 materials=17 images=15 nodes=9\n[]'), {
		bytes: 181556,
		meshes: 5,
		materials: 17,
		images: 15,
		nodes: 9,
	})
	assert.equal(parseSummary('nothing'), null)
	assert.equal(parseSummary(undefined), null)
	assert.deepEqual(parseLogMarkers('x MINEMORIES-GAMETEST PASSED'), { passed: true, failed: false })
	assert.deepEqual(parseLogMarkers('MINEMORIES-GAMETEST FAILED'), { passed: false, failed: true })
	assert.deepEqual(parseLogMarkers(undefined), { passed: false, failed: false })
	const bare = Buffer.concat([glb().subarray(0, 20), Buffer.from('{}')])
	bare.writeUInt32LE(2, 12)
	assert.deepEqual(parseGlbStats(bare), { bytes: 22, meshes: 0, materials: 0, images: 0, nodes: 0 })
})

test('failureMessage extracts the assertion after the FAILED marker', () => {
	const log = 'a\n[x] MINEMORIES-GAMETEST FAILED\njava.lang.AssertionError: Missing from GLB: minecraft:cow\n\tat x'
	assert.equal(failureMessage(log), 'java.lang.AssertionError: Missing from GLB: minecraft:cow')
	assert.ok(String(failureMessage('MINEMORIES-GAMETEST FAILED\nnothing')).includes('FAILED'))
	assert.equal(failureMessage('fine'), null)
	assert.equal(failureMessage(undefined), null)
})

test('thresholds merge defaults and per-target overrides, and evaluation lists every violation', async () => {
	const file = await loadThresholds()
	assert.ok(file.default.materials > 0)
	assert.equal(thresholdsFor(file, 'fabric-mc1.21.11').materials, 14)
	assert.equal(thresholdsFor(file, 'forge-mc1.20.1').materials, file.default.materials)
	assert.equal(thresholdsFor(undefined, 'x').materials, undefined)
	const thresholds = { bytes: 100, maxBytes: 1000, meshes: 3, materials: 10, images: 8, nodes: 3 }
	assert.deepEqual(evaluateStats({ bytes: 500, meshes: 5, materials: 16, images: 15, nodes: 6 }, thresholds), [])
	const problems = evaluateStats({ bytes: 10, meshes: 0, materials: 1, images: 1, nodes: 0 }, thresholds)
	assert.equal(problems.length, 5)
	assert.ok(
		evaluateStats({ bytes: 5000, meshes: 5, materials: 16, images: 15, nodes: 6 }, thresholds)[0].includes('too large')
	)
	assert.deepEqual(evaluateStats({ bytes: 1 }, {}), [])
	// The shipped file accepts the figures measured in game for every target.
	for (const id of ['neoforge-mc1.21.11', 'fabric-mc1.21.11', 'forge-mc1.20.1']) {
		assert.deepEqual(
			evaluateStats({ bytes: 189_628, meshes: 5, materials: 16, images: 15, nodes: 8 }, thresholdsFor(file, id)),
			[]
		)
	}
})

function fakeFs({ executables = [], existing = [], dirs = {} } = {}) {
	return {
		isExecutable: path => executables.includes(path),
		exists: path => existing.includes(path),
		list: path => dirs[path] ?? [],
	}
}

test('prerequisite detection', () => {
	const none = fakeFs()
	assert.equal(findOnPath('xvfb-run', { PATH: '/a:/b' }, fakeFs({ executables: ['/b/xvfb-run'] })), '/b/xvfb-run')
	assert.equal(findOnPath('xvfb-run', {}, none), null)
	assert.equal(hasMesaSoftware({}, none), false)
	assert.equal(hasMesaSoftware({ MOD_HEADLESS_ASSUME_MESA: '1' }, none), true)
	assert.equal(hasMesaSoftware({}, fakeFs({ existing: ['/usr/lib/dri/swrast_dri.so'] })), true)
	assert.equal(hasMesaSoftware({}, fakeFs({ dirs: { '/usr/lib': ['libgallium-25.so'] } })), true)
	assert.equal(detectPrerequisites({ PATH: '/a' }, none).missing.length, 2)
	assert.deepEqual(
		detectPrerequisites(
			{ PATH: '/a' },
			fakeFs({ executables: ['/a/xvfb-run'], existing: ['/usr/lib/dri/swrast_dri.so'] })
		).missing,
		[]
	)
})

test('resolveJdk uses injected paths, then the tools folder', () => {
	const fs = fakeFs({
		executables: [
			'/inj/bin/java',
			'/home/x/.local/tools/jdk-21.0.12.1+1/bin/java',
			'/home/x/.local/tools/jdk-17.0.9+9/bin/java',
		],
		dirs: { '/home/x/.local/tools': ['bun-1.4.3', 'jdk-21.0.12.1+1', 'jdk-25.0.5+8', 'jdk-17.0.9+9', 'jdk-210'] },
	})
	const env = { HOME: '/home/x', MOD_JDK_8: '/inj' }
	assert.equal(resolveJdk(8, env, fs), '/inj')
	assert.equal(resolveJdk(21, env, fs), '/home/x/.local/tools/jdk-21.0.12.1+1')
	assert.equal(resolveJdk('17', { ...env, JAVA_HOME_17: '/nope' }, fs), '/home/x/.local/tools/jdk-17.0.9+9')
	assert.equal(resolveJdk(25, env, fs), null)
	assert.equal(resolveJdk(11, env, fs), null)
	// Java 8 builds from Adoptium use the update notation.
	const java8 = fakeFs({
		executables: ['/home/x/.local/tools/jdk-8u512-b09/bin/java'],
		dirs: { '/home/x/.local/tools': ['jdk-8u512-b09', 'jdk-80'] },
	})
	assert.equal(resolveJdk(8, { HOME: '/home/x' }, java8), '/home/x/.local/tools/jdk-8u512-b09')
	assert.equal(
		resolveJdk(
			21,
			{ MOD_JDK_DIR: '/custom', HOME: '/h' },
			fakeFs({ dirs: { '/custom': ['jdk-21.0.1'] }, executables: ['/custom/jdk-21.0.1/bin/java'] })
		),
		'/custom/jdk-21.0.1'
	)
})

test('resolveTargets', () => {
	const config = { targets: [T('forge', '1.20.1'), T('fabric', '1.20.1', { enabled: false })] }
	assert.deepEqual(
		resolveTargets(config).map(t => t.id),
		['forge-mc1.20.1']
	)
	assert.deepEqual(
		resolveTargets(config, ['forge-mc1.20.1', 'inconnu']).map(t => t.id),
		['forge-mc1.20.1', 'inconnu']
	)
	assert.deepEqual(resolveTargets(config, [config.targets[1]])[0].id, 'fabric-mc1.20.1')
	assert.deepEqual(resolveTargets(undefined, undefined), [])
})

async function sandbox() {
	const root = await mkdtemp(join(tmpdir(), 'mm-headless-'))
	await mkdir(join(root, 'mod', '1.20.1'), { recursive: true })
	await writeFile(join(root, 'mod', '1.20.1', 'gradlew'), '#!/bin/sh\n')
	return root
}

const READY = { missing: [] }
const jdks = major => `/jdk/${major}`

test('runHeadlessTests skips with a clear message when prerequisites are missing', async () => {
	const root = await sandbox()
	const target = T('forge', '1.20.1')
	const run = (deps, targets = [target]) =>
		runHeadlessTests(
			{ config: { targets }, env: {} },
			{ root, jdkLookup: jdks, prerequisites: READY, exec: () => assert.fail('exec'), ...deps }
		)
	assert.ok(
		String((await run({ prerequisites: { missing: ['xvfb-run (package xvfb)'] } }))[0].message).includes('xvfb-run')
	)
	assert.ok(String((await run({ jdkLookup: m => (m === '21' ? '/j' : null) }))[0].message).includes('JDK 17'))
	assert.ok(String((await run({ jdkLookup: () => null }))[0].message).includes('JDK 21'))
	const noGradle = await run({}, [T('fabric', '1.19.2')])
	assert.ok(String(noGradle[0].message).includes('gradlew missing'))
	const noTest = await run({}, [T('neoforge', '1.21.1')])
	assert.equal(noTest[0].status, 'skipped')
	assert.equal(noTest[0].targetId, 'neoforge-mc1.21.1')
	await rm(root, { recursive: true })
})

function fakeExec({
	root,
	target,
	tail = 'MINEMORIES-GAMETEST PASSED',
	code = 0,
	timedOut = false,
	glbBuffer = glb(),
}) {
	return async options => {
		fakeExec.calls.push(options)
		if (glbBuffer) {
			const { glb: path } = exportPaths(root, target)
			await mkdir(join(path, '..'), { recursive: true })
			await writeFile(path, glbBuffer)
		}
		await mkdir(join(options.logFile, '..'), { recursive: true })
		await writeFile(options.logFile, tail)
		return { code, signal: null, timedOut, tail }
	}
}
fakeExec.calls = []

test('runHeadlessTests passes, fails on thresholds, failures, timeouts and missing GLB', async () => {
	const root = await sandbox()
	const target = T('forge', '1.20.1')
	const base = { root, jdkLookup: jdks, prerequisites: READY }
	const go = (exec, extra = {}) =>
		runHeadlessTests(
			{ config: { targets: [target] }, env: { PATH: '/usr/bin', TOKEN: 'x' }, ...extra },
			{ ...base, exec }
		)

	const passed = (await go(fakeExec({ root, target })))[0]
	assert.equal(passed.status, 'passed')
	assert.equal(passed.report.stats.materials, 16)
	assert.equal(passed.report.logFile, 'build/mod-test-logs/forge-mc1.20.1.log')
	assert.equal(fakeExec.calls.at(-1).env.TOKEN, undefined)
	assert.equal(fakeExec.calls.at(-1).timeoutMs, 1_500_000)
	assert.equal(fakeExec.calls.at(-1).env._JAVA_OPTIONS, '-Xmx2048m')
	await assert.rejects(readFile(join(root, 'build/mod-test-logs/forge-mc1.20.1.log')))

	const kept = await go(fakeExec({ root, target }), { keepLogs: true })
	assert.equal(kept[0].status, 'passed')
	assert.ok((await readFile(join(root, 'build/mod-test-logs/forge-mc1.20.1.log'), 'utf8')).includes('PASSED'))

	const small = (await go(fakeExec({ root, target, glbBuffer: glb({ materials: 2, padding: 10 }) })))[0]
	assert.equal(small.status, 'failed')
	assert.ok(String(small.message).includes('materials: 2'))

	const crashed = (
		await go(
			fakeExec({
				root,
				target,
				code: 1,
				tail: 'MINEMORIES-GAMETEST FAILED\njava.lang.AssertionError: Export timed out',
			})
		)
	)[0]
	assert.ok(String(crashed.message).includes('Export timed out'))
	assert.ok(String(crashed.logTail).includes('FAILED'))

	assert.ok(String((await go(fakeExec({ root, target, code: 2, tail: 'boom' })))[0].message).includes('code 2'))
	assert.ok(String((await go(fakeExec({ root, target, timedOut: true, code: null })))[0].message).includes('timed out'))
	assert.ok(String((await go(fakeExec({ root, target, glbBuffer: null })))[0].message).includes('missing'))

	const throwing = await go(() => Promise.reject(new Error('spawn')))
	assert.ok(String(throwing[0].message).includes('unexpected error'))

	const tuned = await runHeadlessTests(
		{ config: { targets: [target], headless: { gameMemoryMb: 1024, timeoutSeconds: 10 } }, env: {} },
		{ ...base, exec: fakeExec({ root, target }) }
	)
	assert.equal(tuned[0].status, 'passed')
	assert.equal(fakeExec.calls.at(-1).timeoutMs, 10_000)
	assert.equal(fakeExec.calls.at(-1).env._JAVA_OPTIONS, '-Xmx1024m')
	await rm(root, { recursive: true })
})

test('runHeadlessTests reads summary.txt when the GLB is unreadable and rejects absurd settings', async () => {
	const root = await sandbox()
	const target = T('forge', '1.20.1')
	const { glb: path, summary } = exportPaths(root, target)
	const exec = async options => {
		await mkdir(join(path, '..'), { recursive: true })
		await writeFile(path, 'not a glb')
		await writeFile(summary, 'bytes=181556 meshes=5 materials=17 images=15 nodes=9\n')
		return { code: 0, timedOut: false, tail: 'ok', logFile: options.logFile }
	}
	const result = await runHeadlessTests(
		{ config: { targets: [target], headless: { gameMemoryMb: -1, timeoutSeconds: 'x' } }, env: {} },
		{ root, jdkLookup: jdks, prerequisites: READY, exec }
	)
	assert.equal(result[0].status, 'passed')
	const garbled = async () => {
		await mkdir(join(path, '..'), { recursive: true })
		await writeFile(path, 'not a glb')
		return { code: 0, timedOut: false, tail: 'ok' }
	}
	const bad = await runHeadlessTests(
		{ config: { targets: [target] }, env: {} },
		{ root, jdkLookup: jdks, prerequisites: READY, exec: garbled }
	)
	assert.ok(String(bad[0].message).includes('Invalid GLB'))
	await rm(root, { recursive: true })
})

test('execLogged captures output, exit codes, spawn errors and kills on timeout', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-exec-'))
	const logFile = join(dir, 'logs', 'a.log')
	const ok = await execLogged({
		command: process.execPath,
		args: ['-e', 'console.log("one");process.stdout.write("end")'],
		cwd: dir,
		env: process.env,
		timeoutMs: 20_000,
		logFile,
	})
	assert.equal(ok.code, 0)
	assert.equal(ok.tail, 'one\nend')
	assert.equal(await readFile(logFile, 'utf8'), 'one\nend')
	const failed = await execLogged({
		command: process.execPath,
		args: ['-e', 'process.exit(3)'],
		cwd: dir,
		env: process.env,
		timeoutMs: 20_000,
		logFile,
	})
	assert.equal(failed.code, 3)
	const missing = await execLogged({
		command: join(dir, 'absent'),
		args: [],
		cwd: dir,
		env: {},
		timeoutMs: 20_000,
		logFile,
	})
	assert.equal(missing.code, -1)
	const slow = await execLogged({
		command: process.execPath,
		args: ['-e', 'setInterval(()=>{},1000)'],
		cwd: dir,
		env: process.env,
		timeoutMs: 300,
		logFile,
	})
	assert.equal(slow.timedOut, true)
	await rm(dir, { recursive: true })
})

test('execLogged keeps only the last lines', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mm-exec-'))
	const out = await execLogged({
		command: process.execPath,
		args: ['-e', 'for(let i=0;i<500;i++)console.log("l"+i)'],
		cwd: dir,
		env: process.env,
		timeoutMs: 20_000,
		logFile: join(dir, 'b.log'),
	})
	const lines = out.tail.split('\n')
	assert.equal(lines.length, 200)
	assert.equal(lines.at(-1), 'l499')
	await rm(dir, { recursive: true })
})

test('test command: usage, arguments, results and exit code', async () => {
	assert.deepEqual(parseArgs(['a', '--keep-logs', '--all', '--notify']), {
		ids: ['a'],
		all: true,
		keepLogs: true,
		notify: true,
		local: false,
	})
	assert.equal(parseArgs(['--all', '--local']).local, true)
	const lines = []
	const ctx = { config: { targets: [] }, env: { PATH: '' }, log: m => lines.push(m) }
	assert.equal(await runTestCommand([], ctx), 1)
	assert.ok(String(lines[0]).includes('Usage'))
	const code = await runTestCommand(['neoforge-mc1.21.1'], { ...ctx, config: { targets: [T('neoforge', '1.21.1')] } })
	assert.equal(code, 0)
	assert.ok(String(lines.at(-1)).includes('skipped neoforge-mc1.21.1'))
	assert.equal(await runTestCommand(['--all'], ctx), 0)
})

test('the watchdog flags a repeating line and a printed result, ignoring timestamps and counters', async () => {
	const { createWatchdog } = await import('./watchdog.mjs')
	const loop = createWatchdog({ repeatLimit: 5 })
	let verdict = null
	for (let second = 10; second < 20 && !verdict; second++) {
		verdict = loop.onLine(
			`[17:12:${second}] [Render thread/INFO] (x) World loading finished: null screen: S@${second}ab`
		)
	}
	assert.equal(verdict.stop, 'stuck')
	assert.match(verdict.reason, /repeated 5 times/)
	const healthy = createWatchdog({ repeatLimit: 5 })
	for (const line of ['a', 'b', 'a', 'b', 'a', 'b', 'a']) assert.equal(healthy.onLine(line), null)
	assert.equal(createWatchdog().onLine('MINEMORIES-GLB bytes=1 meshes=5').stop, 'completed')
})

test('reapProcesses kills the game processes of a folder but never a Gradle daemon', async () => {
	const { reapProcesses } = await import('./exec.mjs')
	const killed = []
	const list = () =>
		[
			'100 java -Dfoo /w/mod/1.21.11/fabric/build/classes',
			'101 java org.gradle.launcher.daemon.bootstrap.GradleDaemon /w/mod/1.21.11',
			'102 java /elsewhere/other',
			'abc not-a-pid /w/mod/1.21.11',
		].join('\n')
	const count = reapProcesses('/w/mod/1.21.11', { list, kill: pid => killed.push(pid) })
	assert.deepEqual(killed, [100])
	assert.equal(count, 1)
})

test('a hung run is retried once, a finished test is judged on its report even if the process never exits', async () => {
	const root = await sandbox()
	const target = T('forge', '1.20.1')
	const outcomes = []
	const exec = async options => {
		const outcome = outcomes.shift()
		const { glb: path } = exportPaths(root, target)
		await mkdir(join(path, '..'), { recursive: true })
		await writeFile(path, glb())
		await mkdir(join(options.logFile, '..'), { recursive: true })
		await writeFile(options.logFile, outcome.tail)
		return outcome
	}
	const run = () =>
		runHeadlessTests(
			{ config: { targets: [target] }, env: {} },
			{ root, jdkLookup: jdks, prerequisites: READY, exec, reap: () => 0 }
		)
	const hung = { code: null, timedOut: false, completed: false, stuck: 'repetition', tail: 'loop' }
	const finished = { code: null, timedOut: true, completed: true, stuck: null, tail: 'MINEMORIES-GLB bytes=1' }
	outcomes.push(hung, finished)
	assert.equal((await run())[0].status, 'passed')
	assert.equal(outcomes.length, 0)
	outcomes.push(hung, hung)
	const failed = (await run())[0]
	assert.equal(failed.status, 'failed')
	assert.match(failed.message, /stuck.*repetition/)
	await rm(root, { recursive: true })
})

test('resourceProblems finds the mod resources the game could not load', () => {
	const log = [
		'[Render thread/WARN] Failed to load texture: minemories:textures/gui/icon.png',
		'[Render thread/WARN] Failed to load texture: minemories:textures/gui/icon.png',
		'[Render thread/WARN] Failed to load texture: other:textures/x.png',
		'[Render thread/INFO] fine',
	].join('\n')
	assert.deepEqual(resourceProblems(log), ['Failed to load texture: minemories:textures/gui/icon.png'])
	assert.deepEqual(resourceProblems(undefined), [])
})
