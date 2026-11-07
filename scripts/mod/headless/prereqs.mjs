// Prerequisite detection for headless Minecraft: Xvfb, Mesa software rendering, JDKs. Filesystem access is
// injectable so tests never depend on the machine.
import { accessSync, constants, existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

const MESA_DIRS = [
	'/usr/lib/dri',
	'/usr/lib64/dri',
	'/usr/lib/x86_64-linux-gnu/dri',
	'/usr/lib/aarch64-linux-gnu/dri',
	'/usr/lib/x86_64-linux-gnu',
	'/usr/lib/aarch64-linux-gnu',
	'/usr/lib',
]
const MESA_FILES = ['swrast_dri.so', 'kms_swrast_dri.so']
const GALLIUM_LIBRARY = /^libgallium.*\.so/

export const realFs = {
	isExecutable(path) {
		try {
			accessSync(path, constants.X_OK)
			return true
		} catch {
			return false
		}
	},
	exists: existsSync,
	list(path) {
		try {
			return readdirSync(path)
		} catch {
			return []
		}
	},
}

export function findOnPath(name, env, fs = realFs) {
	for (const folder of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
		if (fs.isExecutable(join(folder, name))) return join(folder, name)
	}
	return null
}

export function hasMesaSoftware(env, fs = realFs) {
	if (env.MOD_HEADLESS_ASSUME_MESA === '1') return true
	return MESA_DIRS.some(
		dir => MESA_FILES.some(file => fs.exists(join(dir, file))) || fs.list(dir).some(file => GALLIUM_LIBRARY.test(file))
	)
}

/** { missing: string[] } — `missing` names what to install, empty when the machine can run the tests. */
export function detectPrerequisites(env, fs = realFs) {
	const missing = []
	if (!findOnPath('xvfb-run', env, fs)) missing.push('xvfb-run (package xvfb)')
	if (!hasMesaSoftware(env, fs)) missing.push('Mesa llvmpipe (package libgl1-mesa-dri)')
	return { missing }
}

function jdkRoots(env) {
	return [env.MOD_JDK_DIR, join(env.HOME ?? homedir(), '.local', 'tools')].filter(Boolean)
}

/** Home of the JDK of a given major version: MOD_JDK_<major>, JAVA_HOME_<major>, then ~/.local/tools/jdk-<major>*. */
export function resolveJdk(major, env, fs = realFs) {
	const wanted = String(major)
	for (const candidate of [env[`MOD_JDK_${wanted}`], env[`JAVA_HOME_${wanted}`]]) {
		if (candidate && fs.isExecutable(join(candidate, 'bin', 'java'))) return candidate
	}
	const prefix = new RegExp(`^jdk-?${wanted}(?:[.+_-]|$)`)
	for (const root of jdkRoots(env)) {
		const folder = fs
			.list(root)
			.filter(name => prefix.test(name))
			.sort()
			.at(-1)
		if (folder && fs.isExecutable(join(root, folder, 'bin', 'java'))) return join(root, folder)
	}
	return null
}
