// Builds mod targets with Gradle and collects JAR + checksum + manifest in build/mod-dist/<version>/<id>/.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { distFileName, isBuildable } from './config.mjs'
import { ensureJdks, gradleJavaSetup } from './jdk.mjs'
import { withLock } from './lock.mjs'
import { repositoryRoot, run } from './utils.mjs'

const releaseVersion = /^\d+\.\d+\.\d+(-[\w.]+)?$/
const zipMagic = 0x04034b50
const tailLines = 200
const lineBreak = /\r?\n/
const noop = () => undefined

export const distRoot = root => join(root, 'build', 'mod-dist')
export const distDir = (root, version, id) => join(distRoot(root), version, id)
export const lockPath = root => join(root, 'build', 'mod-build.lock')
export const libsDir = (root, target) => join(root, target.dir, target.project, 'build', 'libs')

/** Version carried by a JAR file name built from the target's `jar` template, or null. */
export function jarVersion(name, template) {
	const [prefix, suffix] = template.split('{version}')
	if (!(name.startsWith(prefix) && name.endsWith(suffix))) return null
	const version = name.slice(prefix.length, name.length - suffix.length)
	return releaseVersion.test(version) ? version : null
}

async function listDir(path) {
	try {
		return await readdir(path)
	} catch {
		return []
	}
}

/** Mod versions available for a target, from the dist folder and from the Gradle output. */
export async function builtVersions(root, target) {
	const versions = new Set()
	for (const version of await listDir(distRoot(root)))
		if ((await listDir(join(distRoot(root), version, target.id))).includes('manifest.json')) versions.add(version)
	for (const name of await listDir(libsDir(root, target))) {
		const version = jarVersion(name, target.jar)
		if (version) versions.add(version)
	}
	return [...versions].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

/** 'current' (built for this version), 'stale' (only other versions) or 'missing'. */
export async function targetState(root, target, version) {
	const versions = await builtVersions(root, target)
	if (versions.length === 0) return { state: 'missing', versions }
	return { state: versions.includes(version) ? 'current' : 'stale', versions }
}

export function gradleArgs(target, { version, prod = true, loaderVersion, ci = Boolean(process.env.CI) } = {}) {
	// A release must come from freshly compiled classes: a restored build cache once produced an empty JAR.
	const args = [
		'--console=plain',
		'--no-build-cache',
		...(ci ? ['-Dorg.gradle.daemon=false', '--no-configuration-cache'] : []),
	]
	args.push(`:${target.project}:clean`, `:${target.project}:build`, `-PmodVersion=${version}`)
	args.push(`-Pminemories.prod=${prod ? 'true' : 'false'}`)
	if (loaderVersion && loaderVersion !== target.loaderVersion) {
		if (!target.loaderProperty) throw new Error(`${target.id} can only build loader ${target.loaderVersion}.`)
		args.push(`-P${target.loaderProperty}=${loaderVersion}`)
	}
	return args
}

/** Runs Gradle and resolves { code, tail } (the last log lines). */
export function runGradleProcess({ cwd, args, env, onLine = noop, spawnImpl = spawn }) {
	return new Promise((resolveRun, reject) => {
		const windows = process.platform === 'win32'
		const child = spawnImpl(windows ? 'gradlew.bat' : './gradlew', args, { cwd, env, shell: windows })
		const tail = []
		let pending = ''
		const push = text => {
			pending += text
			const lines = pending.split(lineBreak)
			pending = lines.pop() ?? ''
			for (const line of lines) {
				tail.push(line)
				if (tail.length > tailLines) tail.shift()
				onLine(line)
			}
		}
		child.stdout?.on('data', chunk => push(chunk.toString()))
		child.stderr?.on('data', chunk => push(chunk.toString()))
		child.on('error', reject)
		child.on('close', code => {
			if (pending) push('\n')
			resolveRun({ code: code ?? 1, tail: tail.join('\n') })
		})
	})
}

export function gitInfo(root) {
	try {
		const commit = run('git', ['rev-parse', 'HEAD'], { cwd: root })
		const dirty = run('git', ['status', '--porcelain'], { cwd: root }) !== ''
		return { commit, dirty }
	} catch {
		return { commit: null, dirty: false }
	}
}

/** A JAR whose central directory names no .class entry is an empty build (a restored cache can produce one). */
export function jarHasClasses(bytes) {
	return bytes.includes('.class')
}

/** Build machine: MOD_BUILT_BY=pc|vps (default pc). The VPS sets vps in its systemd unit. */
export function builtByFrom(env = process.env) {
	const value = env.MOD_BUILT_BY || 'pc'
	if (value !== 'pc' && value !== 'vps') throw new Error(`MOD_BUILT_BY must be pc or vps (got: ${value}).`)
	return value
}

async function collectArtifact(root, target, { version, prod, git, builtAt, builtBy }) {
	const source = join(libsDir(root, target), target.jar.replace('{version}', version))
	const bytes = await readFile(source).catch(() => {
		throw new Error(`Expected JAR not found: ${source}`)
	})
	if (bytes.length < 4 || bytes.readUInt32LE(0) !== zipMagic) throw new Error(`${source} is not a JAR archive.`)
	if (!jarHasClasses(bytes)) throw new Error(`${source} contains no class: incomplete build, JAR rejected.`)
	const sha256 = createHash('sha256').update(bytes).digest('hex')
	const directory = distDir(root, version, target.id)
	const file = distFileName(target, version)
	await rm(directory, { recursive: true, force: true })
	await mkdir(directory, { recursive: true })
	await copyFile(source, join(directory, file))
	await writeFile(join(directory, `${file}.sha256`), `${sha256}  ${file}\n`)
	const manifest = {
		id: target.id,
		version,
		minecraft: target.minecraft,
		loader: target.loader,
		loaderVersion: target.loaderVersion,
		...(target.fabricApi ? { fabricApi: target.fabricApi } : {}),
		file,
		bytes: bytes.length,
		sha256,
		commit: git.commit,
		dirty: git.dirty,
		java: target.java,
		prod,
		builtAt,
		builtBy,
	}
	await writeFile(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, '\t')}\n`)
	return { manifest, filePath: join(directory, file) }
}

/** Builds one target; never throws: failures come back as { status: 'failed', message, logTail }. */
export async function buildTarget(target, options) {
	const { root, version, prod = true, jdks, setup, git, onLine, runGradle = runGradleProcess, loaderVersion } = options
	const started = Date.now()
	const seconds = () => Math.round((Date.now() - started) / 100) / 10
	let logTail = ''
	try {
		const args = [...setup.args, ...gradleArgs(target, { version, prod, loaderVersion })]
		const jdk = jdks.compile.get(Number(target.java))
		const result = await runGradle({ cwd: join(root, target.dir), args, env: setup.env, onLine })
		logTail = result.tail
		if (result.code !== 0)
			throw new Error(
				`Gradle failed (code ${result.code}) for ${target.id}${jdk ? '' : ` (JDK ${target.java} missing)`}.`
			)
		const { manifest, filePath } = await collectArtifact(root, target, {
			version,
			prod,
			git,
			builtAt: new Date().toISOString(),
			builtBy: builtByFrom(options.env),
		})
		return {
			targetId: target.id,
			status: 'passed',
			seconds: seconds(),
			bytes: manifest.bytes,
			manifest,
			filePath,
			logTail,
		}
	} catch (error) {
		return { targetId: target.id, status: 'failed', seconds: seconds(), message: error.message, logTail }
	}
}

/**
 * Builds the targets one after the other under the machine-wide lock (unless `locked`: the caller already holds it).
 * A failing target does not stop the others. Returns the per-target results.
 */
export function buildTargets(targets, options) {
	const { root = repositoryRoot, env = process.env, log = console, locked = false, ensure = ensureJdks } = options
	const buildable = targets.filter(isBuildable)
	const work = async () => {
		const jdks = await ensure(
			buildable.map(t => t.java),
			{ env, download: options.downloadJdk !== false, log: message => log.info(message) }
		)
		const setup = gradleJavaSetup(jdks, env)
		const git = options.git ?? gitInfo(root)
		const results = []
		for (const target of buildable) {
			log.info(`▶ ${target.id} (Gradle ${jdks.gradle.major}, JDK ${target.java})`)
			const onLine = options.verbose ? line => log.info(`  ${line}`) : undefined
			const result = await buildTarget(target, { ...options, root, jdks, setup, git, onLine })
			log[result.status === 'passed' ? 'info' : 'error'](
				result.status === 'passed'
					? `✓ ${target.id} ${result.seconds}s ${formatBytes(result.bytes)}`
					: `✗ ${target.id}: ${result.message}`
			)
			results.push(result)
		}
		return results
	}
	return locked ? work() : withLock(lockPath(root), work, { label: 'bun mod build' })
}

export function formatBytes(bytes) {
	if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
	return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function summarize(results) {
	const lines = results.map(r =>
		r.status === 'passed'
			? `  ✓ ${r.targetId.padEnd(20)} ${String(r.seconds).padStart(7)}s  ${formatBytes(r.bytes)}`
			: `  ✗ ${r.targetId.padEnd(20)} ${String(r.seconds).padStart(7)}s  ${r.message}`
	)
	const failed = results.filter(r => r.status === 'failed').length
	return [...lines, '', failed ? `${failed} of ${results.length} failed.` : `${results.length} target(s) built.`].join(
		'\n'
	)
}
