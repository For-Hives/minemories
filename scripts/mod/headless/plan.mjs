// Pure helpers: which Gradle task runs the in-game capture test of a target, where it writes its result, and the
// command line / environment to run it headless (Xvfb + Mesa llvmpipe). Nothing here starts a process.
import { join } from 'node:path'

export const DEFAULT_GAME_MEMORY_MB = 2048
export const DEFAULT_TIMEOUT_SECONDS = 1500
export const XVFB_SCREEN = '1280x720x24'
const SAFE_ENV = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'GRADLE_USER_HOME', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME']
const TASK_NAME = { fabric: 'runClientGameTest' }

/**
 * The in-game test of a target, or null when none exists. Exact tasks per loader/version are in
 * docs/features/loader-support.md. Minecraft 1.21.1 has no automated in-game test (validated by hand).
 */
export function gametestSpec(target) {
	if (!target || target.enabled === false) return null
	const { minecraft, loader, project = loader } = target
	if (minecraft === '1.21.1' || loader === 'quilt') return null
	if (minecraft === '1.21.11' && loader === 'forge') {
		return { gradleArgs: [`:${project}:runClient`, '-PgameTest=true'] }
	}
	const task = minecraft === '1.21.11' ? (TASK_NAME[loader] ?? 'runClientGametest') : 'runClientGametest'
	return { gradleArgs: [`:${project}:${task}`] }
}

/** Why a target has no headless test (for the `skipped` message). */
export function noGametestReason(target) {
	if (target?.enabled === false) return 'target disabled'
	if (target?.loader === 'quilt') return 'Quilt has no Gradle project (the Fabric JAR is tried by hand)'
	return `no automated client test for Minecraft ${target?.minecraft} (manual in-game validation)`
}

/** Gradle root of a target (`dir`, default `mod/1.21.1`), relative to the repository root. */
export function gradleRoot(target) {
	return target.dir ?? 'mod/1.21.1'
}

/** Folder the game uses as `user.home` during the test (isolated by the build files). */
export function gametestHome(root, target) {
	return join(root, gradleRoot(target), target.project ?? target.loader, 'build', 'gametest-home')
}

export function exportPaths(root, target) {
	const home = gametestHome(root, target)
	return { glb: join(home, 'export', 'capture.glb'), summary: join(home, 'export', 'summary.txt') }
}

/**
 * Environment for the process: a small allow-list of the parent environment (never secrets such as tokens or S3
 * keys), software rendering and a heap cap for every JVM (`_JAVA_OPTIONS` wins over the build's own -Xmx).
 */
export function buildEnvironment({ env, gradleJdk, gameMemoryMb = DEFAULT_GAME_MEMORY_MB }) {
	const out = {}
	for (const name of SAFE_ENV) if (env[name] !== undefined) out[name] = env[name]
	return {
		...out,
		JAVA_HOME: gradleJdk,
		PATH: `${join(gradleJdk, 'bin')}:${env.PATH ?? ''}`,
		LIBGL_ALWAYS_SOFTWARE: '1',
		GALLIUM_DRIVER: 'llvmpipe',
		MESA_GL_VERSION_OVERRIDE: '4.5',
		MESA_GLSL_VERSION_OVERRIDE: '450',
		ALSOFT_DRIVERS: 'null',
		SDL_AUDIODRIVER: 'dummy',
		_JAVA_OPTIONS: `-Xmx${gameMemoryMb}m`,
	}
}

/**
 * Command line: xvfb-run → gradlew. Gradle runs on JDK 21 (`gradleJdk`); the other JDKs are exposed to its
 * toolchain resolution without any download.
 */
export function buildCommand({ root, target, spec, jdkPaths = [] }) {
	const toolchains = jdkPaths.length > 0 ? [`-Dorg.gradle.java.installations.paths=${jdkPaths.join(',')}`] : []
	return {
		command: 'xvfb-run',
		args: [
			'-a',
			'-s',
			`-screen 0 ${XVFB_SCREEN} -nolisten tcp`,
			'./gradlew',
			'--no-daemon',
			'--console=plain',
			'-Dorg.gradle.java.installations.auto-download=false',
			...toolchains,
			'-Dminemories.gametest=true',
			...spec.gradleArgs,
		],
		cwd: join(root, gradleRoot(target)),
	}
}
