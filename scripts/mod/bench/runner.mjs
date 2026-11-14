// Runs one render bench configuration in a real game client, the way a player's launcher would: the loader
// installed by portablemc, a plain mods folder (Minemories' production JAR, the configuration's pinned Modrinth
// files, the bench driver), offline, headless under Xvfb with Mesa software rendering (or on this machine's screen
// with `local`). Nothing here is part of `bun mod release`: a third-party mod breaking must never block a beta.

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildEnvironment, XVFB_SCREEN } from '../headless/plan.mjs'
import { detectJdks, jdkFor, pickGradleJdk } from '../jdk.mjs'
import { readModVersion } from '../version.mjs'
import { evaluate } from './evaluate.mjs'
import { cellTriangles, parseGlb } from './glb-cells.mjs'

export const PORTABLEMC_VERSION = '5.0.6'
export const DEFAULT_BENCH_TIMEOUT_SECONDS = 1800
const USER_AGENT = 'minemories-render-bench'
const noop = () => undefined
const AFK_SETTING = /^\s*afkSnapshots\s*[=:]/
const EXCEPTION_LINE = /^(Caused by|java\.\S+(Exception|Error)):?/
const ERROR_LINE = /\/(ERROR|FATAL)\]/

/** Where downloads, the launcher and each configuration's game folder live (outside the repository). */
export function benchHome(env = process.env) {
	return env.MINEMORIES_BENCH_HOME ?? join(homedir(), '.cache', 'minemories-bench')
}

export async function readBenchConfigs(root) {
	const file = JSON.parse(await readFile(join(root, 'mod', 'bench', 'configs.json'), 'utf8'))
	return file.configs
}

/** The plan the driver reads: exclusions keep their reasons in configs.json but go over as a list. */
export function driverPlan(config) {
	const plan = { ...config.plan }
	if (plan.exclude && !Array.isArray(plan.exclude)) plan.exclude = Object.keys(plan.exclude)
	return plan
}

/** portablemc's version argument for a configuration. */
export function launcherVersion(config) {
	return `${config.loader}:${config.minecraft}:${config.loaderVersion}`
}

/** The game's command line: portablemc, then (unless local) wrapped in xvfb-run. */
export function gameCommand({ config, launcher, launcherDir, gameDir, java, plan, memoryMb = 6144, local = false }) {
	const args = [
		'--main-dir',
		launcherDir,
		'start',
		launcherVersion(config),
		'--mc-dir',
		gameDir,
		'--jvm',
		java,
		'-u',
		'Bench',
		`--jvm-arg=-Xmx${memoryMb}m`,
		`--jvm-arg=-Dminemories.bench=${plan}`,
		// The export goes to <user.home>/export: kept inside the configuration's folder.
		`--jvm-arg=-Duser.home=${gameDir}`,
	]
	if (local) return { command: launcher, args }
	return { command: 'xvfb-run', args: ['-a', '-s', `-screen 0 ${XVFB_SCREEN} -nolisten tcp`, launcher, ...args] }
}

/** The primary file of a Modrinth version (its own JSON), or the first one. */
export function primaryFile(version) {
	const files = version.files ?? []
	const file = files.find(entry => entry.primary) ?? files[0]
	if (!file) throw new Error(`Modrinth version ${version.id} has no file`)
	return file
}

/**
 * Downloads a pinned Modrinth version once, checking its SHA-512; returns the cached path. The version's JSON is kept
 * next to it, so a later run works offline.
 */
export async function fetchMod(home, mod, { fetchImpl = fetch } = {}) {
	const dir = join(home, 'mods')
	const file = primaryFile(await modVersion(dir, mod, fetchImpl))
	const path = join(dir, file.filename)
	if (existsSync(path) && sha512(await readFile(path)) === file.hashes.sha512) return path
	const download = await fetchImpl(file.url, { headers: { 'User-Agent': USER_AGENT } })
	if (!download.ok) throw new Error(`${file.filename}: HTTP ${download.status}`)
	const bytes = Buffer.from(await download.arrayBuffer())
	if (sha512(bytes) !== file.hashes.sha512) throw new Error(`${file.filename}: SHA-512 mismatch`)
	await mkdir(dir, { recursive: true })
	await writeFile(path, bytes)
	return path
}

async function modVersion(dir, mod, fetchImpl) {
	const cached = join(dir, `${encodeURIComponent(mod.version)}.version.json`)
	const known = await readJson(cached)
	if (known) return known
	const response = await fetchImpl(`https://api.modrinth.com/v2/version/${encodeURIComponent(mod.version)}`, {
		headers: { 'User-Agent': USER_AGENT },
	})
	if (!response.ok) throw new Error(`Modrinth version ${mod.version} (${mod.project}): HTTP ${response.status}`)
	const version = await response.json()
	await mkdir(dir, { recursive: true })
	await writeFile(cached, JSON.stringify(version))
	return version
}

const sha512 = bytes => createHash('sha512').update(bytes).digest('hex')

function spawnLogged(command, args, { cwd, env, log, timeoutSeconds }) {
	return new Promise(resolve => {
		const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
		const chunks = []
		const collect = chunk => chunks.push(chunk)
		child.stdout.on('data', collect)
		child.stderr.on('data', collect)
		const timer = setTimeout(() => {
			// The whole group: xvfb-run, the launcher and the game JVM.
			try {
				process.kill(-child.pid, 'SIGKILL')
			} catch {
				// Already gone.
			}
		}, timeoutSeconds * 1000)
		child.on('close', async code => {
			clearTimeout(timer)
			await writeFile(log, Buffer.concat(chunks))
			resolve(code)
		})
	})
}

/** The launcher, installed once in its own virtual environment with uv. */
export async function ensureLauncher(home, { log = noop } = {}) {
	const launcher = join(home, '.venv', 'bin', 'portablemc')
	if (existsSync(launcher)) return launcher
	log(`Installing portablemc ${PORTABLEMC_VERSION} in ${home}/.venv (uv)`)
	await mkdir(home, { recursive: true })
	for (const args of [
		['venv', '-q', join(home, '.venv')],
		['pip', 'install', '-q', '--python', join(home, '.venv', 'bin', 'python'), `portablemc==${PORTABLEMC_VERSION}`],
	]) {
		// biome-ignore lint/performance/noAwaitInLoops: uv creates the environment, then installs into it.
		const code = await spawnLogged('uv', args, {
			cwd: home,
			env: process.env,
			log: join(home, 'uv.log'),
			timeoutSeconds: 600,
		})
		if (code !== 0)
			throw new Error(`uv ${args[0]} failed (see ${home}/uv.log); uv is required: https://docs.astral.sh/uv/`)
	}
	return launcher
}

/** The bench driver's JAR, built with its Gradle wrapper when missing or older than its sources or build files. */
export async function ensureDriver(root, name, jdks, { log = noop } = {}) {
	const dir = join(root, 'mod', 'bench', 'drivers', name)
	const jar = join(dir, 'build', 'libs', 'zz-minemories-bench-driver-1.0.0.jar')
	if (existsSync(jar) && (await newestSource(dir)) <= (await stat(jar)).mtimeMs) return jar
	const gradleJdk = pickGradleJdk(jdks)
	if (!gradleJdk) throw new Error('No JDK 21+ to run Gradle (bun mod jdk install 21)')
	log(`Building the ${name} bench driver`)
	const env = { ...process.env, JAVA_HOME: gradleJdk.home, PATH: `${join(gradleJdk.home, 'bin')}:${process.env.PATH}` }
	const paths = jdks.map(jdk => jdk.home).join(',')
	const code = await spawnLogged(
		join(dir, 'gradlew'),
		['--no-daemon', '-q', `-Dorg.gradle.java.installations.paths=${paths}`, 'remapJar'],
		{ cwd: dir, env, log: join(dir, 'build-driver.log'), timeoutSeconds: 1200 }
	)
	if (code !== 0 || !existsSync(jar))
		throw new Error(`The ${name} bench driver did not build (see ${dir}/build-driver.log)`)
	return jar
}

async function newestSource(dir) {
	let newest = 0
	const walk = async path => {
		for (const entry of await readdir(path, { withFileTypes: true })) {
			const full = join(path, entry.name)
			// biome-ignore lint/performance/noAwaitInLoops: a small source tree, walked once.
			if (entry.isDirectory()) await walk(full)
			else newest = Math.max(newest, (await stat(full)).mtimeMs)
		}
	}
	await walk(join(dir, 'src'))
	for (const name of ['build.gradle', 'settings.gradle', 'gradle.properties'])
		if (existsSync(join(dir, name))) newest = Math.max(newest, statSync(join(dir, name)).mtimeMs)
	return newest
}

/**
 * Minemories' production JAR for a target at the version the tree declares (mod/1.21.1/gradle.properties), from
 * build/mod-dist: never an older build left there.
 */
export async function minemoriesJar(root, target) {
	const version = await readModVersion(root)
	const dir = join(root, 'build', 'mod-dist', version, target)
	const jar = existsSync(dir) ? (await readdir(dir)).find(name => name.endsWith('.jar')) : null
	if (!jar) throw new Error(`No ${target} JAR for ${version} in build/mod-dist: run bun mod build ${target}`)
	return join(dir, jar)
}

/**
 * Turns AFK captures off in the game folder's Minemories settings, keeping the other keys: an AFK capture during a
 * slow run would replace the export the bench waits for.
 */
export async function disableAfk(gameDir) {
	const path = join(gameDir, 'config', 'minemories.properties')
	const lines = existsSync(path) ? (await readFile(path, 'utf8')).split('\n') : []
	const kept = lines.filter(line => line.trim() !== '' && !AFK_SETTING.test(line))
	await mkdir(join(gameDir, 'config'), { recursive: true })
	await writeFile(path, `${[...kept, 'afkSnapshots=false'].join('\n')}\n`)
}

/** Why a game ended without exporting, from its log: the driver's failure, a crash report, or the last error. */
export function failureCause(log) {
	const lines = log.split('\n')
	const driver = lines.findIndex(line => line.includes('MINEMORIES-BENCH FAILED'))
	if (driver >= 0 && lines[driver + 1]) return lines[driver + 1].trim()
	const description = lines.find(line => line.startsWith('Description: '))
	const cause = lines.find(line => EXCEPTION_LINE.test(line.trim()))
	if (description) return [description.slice('Description: '.length), cause?.trim()].filter(Boolean).join(': ')
	const error = lines.findLast(line => ERROR_LINE.test(line))
	return error ? error.trim() : 'The game ended before the export (see game.log)'
}

/**
 * Runs one configuration and evaluates it. Outputs (GLB, capture.json, placed.json, log, result.json) are kept in
 * build/mod-bench/<id>/. Returns the result, or { config, error } when the run itself failed.
 */
export async function runConfig(root, config, { env = process.env, local = false, log = noop, timeoutSeconds } = {}) {
	const home = benchHome(env)
	const out = join(root, 'build', 'mod-bench', config.id)
	await rm(out, { recursive: true, force: true })
	await mkdir(out, { recursive: true })
	const jdks = await detectJdks({ env })
	const java = jdkFor(jdks, config.java)
	if (!java) return { config, error: `No JDK ${config.java} (bun mod jdk install ${config.java})` }
	const launcher = await ensureLauncher(home, { log })
	const driver = await ensureDriver(root, config.driver, jdks, { log })
	const game = join(home, config.id)
	const mods = join(game, 'mods')
	await rm(mods, { recursive: true, force: true })
	await mkdir(mods, { recursive: true })
	await rm(join(game, 'export'), { recursive: true, force: true })
	const minemories = await minemoriesJar(root, config.target)
	const jars = [minemories, driver]
	// biome-ignore lint/performance/noAwaitInLoops: a few pinned downloads, one at a time.
	for (const mod of config.mods) jars.push(await fetchMod(home, mod))
	// biome-ignore lint/performance/noAwaitInLoops: a handful of JARs.
	for (const jar of jars) await copyFile(jar, join(mods, jar.split('/').pop()))
	const plan = join(game, 'bench', 'plan.json')
	await rm(join(game, 'bench'), { recursive: true, force: true })
	await mkdir(join(game, 'bench'), { recursive: true })
	await writeFile(plan, JSON.stringify(driverPlan(config), null, 2))
	await disableAfk(game)
	const { command, args } = gameCommand({
		config,
		launcher,
		launcherDir: join(home, 'portablemc'),
		gameDir: game,
		java: join(java.home, 'bin', 'java'),
		plan,
		local,
	})
	// The heap is set on the game's own command line; _JAVA_OPTIONS would override it.
	const gameEnv = buildEnvironment({ env, gradleJdk: java.home, local })
	delete gameEnv._JAVA_OPTIONS
	log(
		`${config.id}: running ${launcherVersion(config)} with ${config.mods.length} mods${local ? ' on this screen' : ' headless'}`
	)
	const started = Date.now()
	await spawnLogged(command, args, {
		cwd: game,
		env: gameEnv,
		log: join(out, 'game.log'),
		timeoutSeconds: timeoutSeconds ?? DEFAULT_BENCH_TIMEOUT_SECONDS,
	})
	const seconds = Math.round((Date.now() - started) / 1000)
	const done = await readJson(join(game, 'bench', 'done.json'))
	if (!done || done.error) {
		const log = await readFile(join(out, 'game.log'), 'utf8').catch(() => '')
		return { config, seconds, error: done?.error ?? failureCause(log) }
	}
	const files = ['placed.json']
	for (let tile = 0; tile < done.tiles; tile++) files.push(`tile-${tile}.glb`, `tile-${tile}.json`)
	await Promise.all(files.map(name => copyFile(join(game, 'bench', name), join(out, name))))
	const result = { ...(await evaluateDir(out, config)), seconds, minemoriesJar: minemories.split('/').pop() }
	await writeFile(join(out, 'result.json'), JSON.stringify(result, null, 2))
	return result
}

/** Evaluates the outputs kept in a configuration's build/mod-bench folder: one GLB per tile of the grid. */
export async function evaluateDir(dir, config) {
	const placed = JSON.parse(await readFile(join(dir, 'placed.json'), 'utf8'))
	const tiles = await Promise.all(
		(placed.tiles ?? []).map(async (_, tile) => {
			const origin = JSON.parse(await readFile(join(dir, `tile-${tile}.json`), 'utf8')).captureOrigin
			return cellTriangles(parseGlb(await readFile(join(dir, `tile-${tile}.glb`))), origin)
		})
	)
	const drawsNothing = Object.keys(config.drawsNothing ?? {})
	return {
		config,
		renderer: placed.renderer,
		minecraft: placed.minecraft,
		mods: placed.mods,
		tiles: tiles.length,
		...evaluate(placed, tiles, { drawsNothing }),
	}
}

async function readJson(path) {
	try {
		return JSON.parse(await readFile(path, 'utf8'))
	} catch {
		return null
	}
}
