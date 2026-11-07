// JDK management: Gradle runs on a JDK >= 21, every target compiles with its own JDK (`java` in mod/targets.json).
// JDKs are found in JAVA_HOME, ~/.local/tools, ~/.gradle/jdks and the PATH, or downloaded from Adoptium (SHA-256 checked).

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { homedir, arch as osArch, platform as osPlatform } from 'node:os'
import { delimiter, dirname, join } from 'node:path'

export const supportedMajors = [8, 17, 21, 25]
export const minimumGradleJava = 21
const javaVersionLine = /JAVA_VERSION="(\d+)(?:\.(\d+))?/
const checksumPattern = /^[a-f0-9]{64}$/i
const releasePrefix = /^jdk-?/
const noop = () => undefined
const toolsJdk = /^jdk-?\d/
const adoptiumApi = 'https://api.adoptium.net/v3/assets/latest'

export const defaultToolsDir = () => join(homedir(), '.local', 'tools')

/** Major version from the `release` file of a JDK ("1.8.0_402" is 8). */
export function parseJavaMajor(releaseText) {
	const match = javaVersionLine.exec(releaseText)
	if (!match) return 0
	const first = Number(match[1])
	return first === 1 ? Number(match[2]) : first
}

async function listDir(path) {
	try {
		return await readdir(path)
	} catch {
		return []
	}
}

async function jdkAt(home) {
	try {
		return { home, major: parseJavaMajor(await readFile(join(home, 'release'), 'utf8')) }
	} catch {
		return { home, major: 0 }
	}
}

async function pathHomes(env) {
	const exe = osPlatform() === 'win32' ? 'java.exe' : 'java'
	const homes = []
	for (const dir of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
		const candidate = join(dir, exe)
		if (!existsSync(candidate)) continue
		try {
			homes.push(dirname(dirname(await realpath(candidate))))
		} catch {
			// dangling link
		}
	}
	return homes
}

/** Every usable JDK found on the machine: [{ home, major }] sorted by major then home. */
export async function detectJdks({ env = process.env, toolsDir = defaultToolsDir(), gradleJdks } = {}) {
	const gradleDir = gradleJdks ?? join(homedir(), '.gradle', 'jdks')
	const homes = [env.JAVA_HOME]
	for (const name of await listDir(toolsDir)) if (toolsJdk.test(name)) homes.push(join(toolsDir, name))
	for (const name of await listDir(gradleDir)) homes.push(join(gradleDir, name))
	homes.push(...(await pathHomes(env)))
	const found = new Map()
	for (const home of homes.filter(Boolean)) {
		const jdk = await jdkAt(home)
		if (jdk.major > 0 && !found.has(jdk.home)) found.set(jdk.home, jdk)
	}
	return [...found.values()].sort((a, b) => a.major - b.major || a.home.localeCompare(b.home))
}

/** The JDK that runs Gradle: the smallest one that is at least `minimum`. */
export function pickGradleJdk(jdks, minimum = minimumGradleJava) {
	return jdks.find(jdk => jdk.major >= minimum) ?? null
}

/** An installed JDK of exactly this major, or null. */
export function jdkFor(jdks, major) {
	return jdks.find(jdk => jdk.major === Number(major)) ?? null
}

export function adoptiumPlatform(platform = osPlatform(), arch = osArch()) {
	const os = { linux: 'linux', darwin: 'mac', win32: 'windows' }[platform]
	const architecture = { x64: 'x64', arm64: 'aarch64' }[arch]
	if (!(os && architecture)) throw new Error(`Unsupported platform for JDK download: ${platform}/${arch}.`)
	return { os, architecture }
}

export function adoptiumUrl(major, platform) {
	const { os, architecture } = adoptiumPlatform(platform?.platform, platform?.arch)
	return `${adoptiumApi}/${major}/hotspot?architecture=${architecture}&image_type=jdk&os=${os}&vendor=eclipse`
}

/** Extracts { link, checksum, name, release } from the Adoptium "latest assets" answer. */
export function pickAdoptiumPackage(json) {
	const entry = Array.isArray(json) ? json.find(item => item?.binary?.package?.link) : null
	const pack = entry?.binary?.package
	if (!(pack?.checksum && checksumPattern.test(pack.checksum)))
		throw new Error('Adoptium answer without a usable SHA-256 checksum: download refused.')
	return { link: pack.link, checksum: pack.checksum.toLowerCase(), name: pack.name, release: entry.release_name }
}

export function sha256Hex(bytes) {
	return createHash('sha256').update(bytes).digest('hex')
}

function defaultExtract(archive, destination) {
	const result = spawnSync('tar', ['-xf', archive, '-C', destination], { stdio: 'inherit' })
	if (result.status !== 0) throw new Error(`Extraction of ${archive} failed.`)
}

/**
 * Downloads and installs a JDK into `toolsDir/jdk-<release>`; returns { home, major }.
 * `fetchImpl(url) → Response`, `extract(archive, dir)` and `log` are injectable.
 */
export async function installJdk(major, options = {}) {
	const { toolsDir = defaultToolsDir(), fetchImpl = fetch, extract = defaultExtract, log = noop, platform } = options
	if (!supportedMajors.includes(Number(major)))
		throw new Error(`JDK ${major} is not supported (versions: ${supportedMajors.join(', ')}).`)
	const metadata = await fetchImpl(adoptiumUrl(major, platform))
	if (!metadata.ok) throw new Error(`Adoptium answered ${metadata.status}.`)
	const pack = pickAdoptiumPackage(await metadata.json())
	log(`Downloading ${pack.name} (${pack.release})`)
	const response = await fetchImpl(pack.link)
	if (!response.ok) throw new Error(`JDK ${major} download: HTTP ${response.status}.`)
	const bytes = Buffer.from(await response.arrayBuffer())
	const actual = sha256Hex(bytes)
	if (actual !== pack.checksum) throw new Error(`Invalid SHA-256 for JDK ${major} (expected ${pack.checksum}).`)
	await mkdir(toolsDir, { recursive: true })
	const staging = join(toolsDir, `.jdk-${major}-${process.pid}`)
	await rm(staging, { recursive: true, force: true })
	await mkdir(staging, { recursive: true })
	try {
		const archive = join(staging, pack.name)
		await writeFile(archive, bytes)
		extract(archive, staging)
		const folder = (await listDir(staging)).find(name => name !== pack.name)
		if (!folder) throw new Error('Empty JDK archive.')
		const final = join(toolsDir, `jdk-${pack.release.replace(releasePrefix, '')}`)
		await rm(final, { recursive: true, force: true })
		await rename(join(staging, folder), final)
		return await jdkAt(final)
	} finally {
		await rm(staging, { recursive: true, force: true })
	}
}

/**
 * Makes sure Gradle's JDK and the compile JDK of each wanted major exist.
 * Returns { gradle, compile: Map(major → jdk), all }.
 */
export async function ensureJdks(majors, options = {}) {
	const { download = true, log = noop, install = installJdk } = options
	let jdks = await detectJdks(options)
	const need = [...new Set(majors.map(Number))]
	const missing = []
	if (!pickGradleJdk(jdks)) missing.push(minimumGradleJava)
	for (const major of need) if (!(jdkFor(jdks, major) || missing.includes(major))) missing.push(major)
	if (missing.length && !download)
		throw new Error(`Missing JDK(s): ${missing.join(', ')}. Run "bun mod jdk install <version>".`)
	for (const major of missing) {
		log(`JDK ${major} not found, downloading.`)
		await install(major, { ...options, log })
	}
	if (missing.length) jdks = await detectJdks(options)
	const compile = new Map(need.map(major => [major, jdkFor(jdks, major)]))
	return { gradle: pickGradleJdk(jdks), compile, all: jdks }
}

/** Environment and -D flags that give Gradle its JDK and the toolchains it may pick. */
export function gradleJavaSetup(jdks, env = process.env) {
	const { gradle, all } = jdks
	if (!gradle) throw new Error(`No JDK ${minimumGradleJava}+ to run Gradle.`)
	const paths = all.map(jdk => jdk.home).join(',')
	return {
		env: { ...env, JAVA_HOME: gradle.home, PATH: `${join(gradle.home, 'bin')}${delimiter}${env.PATH ?? ''}` },
		args: [`-Dorg.gradle.java.installations.paths=${paths}`],
	}
}
