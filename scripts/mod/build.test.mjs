import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import {
	buildTarget,
	buildTargets,
	builtByFrom,
	builtVersions,
	distDir,
	formatBytes,
	gradleArgs,
	jarHasClasses,
	jarVersion,
	libsDir,
	runGradleProcess,
	summarize,
	targetState,
} from './build.mjs'

const target = {
	id: 'forge-mc1.18.2',
	loader: 'forge',
	minecraft: '1.18.2',
	loaderVersion: '40.3.12',
	java: '17',
	project: 'forge',
	dir: 'mod/1.18.2',
	jar: 'minemories-forge-mc1.18.2-{version}.jar',
	loaderProperty: 'forgeVersion',
}
const jar = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('dev/minemories/Mod.class')])
const setup = { args: ['-Dx=1'], env: { JAVA_HOME: '/j' } }
const jdks = { gradle: { home: '/j/21', major: 21 }, compile: new Map([[17, { home: '/j/17', major: 17 }]]), all: [] }
const git = { commit: 'a'.repeat(40), dirty: false }

async function repo() {
	const root = await mkdtemp(join(tmpdir(), 'mod-build-'))
	await mkdir(libsDir(root, target), { recursive: true })
	return root
}

test('jarVersion extracts a release version from the JAR template', () => {
	assert.equal(jarVersion('minemories-forge-mc1.18.2-0.36.0-beta.1.jar', target.jar), '0.36.0-beta.1')
	assert.equal(jarVersion('minemories-forge-mc1.18.2-0.36.0-beta.1-sources.jar', target.jar), null)
	assert.equal(jarVersion('other.jar', target.jar), null)
})

test('gradleArgs cleans the project, pins the version and the prod flag', () => {
	const args = gradleArgs(target, { version: '1.0.0-beta.1', ci: false })
	assert.deepEqual(args, [
		'--console=plain',
		'--no-build-cache',
		':forge:clean',
		':forge:build',
		'-PmodVersion=1.0.0-beta.1',
		'-Pminemories.prod=true',
	])
	assert.ok(gradleArgs(target, { version: 'v', prod: false, ci: false }).includes('-Pminemories.prod=false'))
	assert.ok(gradleArgs(target, { version: 'v', ci: true }).includes('--no-configuration-cache'))
	assert.ok(
		gradleArgs(target, { version: 'v', loaderVersion: '40.3.99', ci: false }).includes('-PforgeVersion=40.3.99')
	)
	assert.throws(
		() => gradleArgs({ ...target, loaderProperty: undefined }, { version: 'v', loaderVersion: '1' }),
		/ne sait compiler/
	)
})

test('targetState tells current, stale and missing builds apart', async () => {
	const root = await repo()
	assert.equal((await targetState(root, target, '2.0.0-beta.1')).state, 'missing')
	await writeFile(join(libsDir(root, target), 'minemories-forge-mc1.18.2-1.0.0-beta.1.jar'), jar)
	assert.equal((await targetState(root, target, '2.0.0-beta.1')).state, 'stale')
	await mkdir(distDir(root, '2.0.0-beta.1', target.id), { recursive: true })
	await writeFile(join(distDir(root, '2.0.0-beta.1', target.id), 'manifest.json'), '{}')
	assert.deepEqual(await builtVersions(root, target), ['1.0.0-beta.1', '2.0.0-beta.1'])
	assert.equal((await targetState(root, target, '2.0.0-beta.1')).state, 'current')
})

test('buildTarget collects the JAR, checksum and manifest', async () => {
	const root = await repo()
	const runGradle = async ({ cwd, args }) => {
		assert.equal(cwd, join(root, 'mod/1.18.2'))
		assert.ok(args.includes('-Dx=1'))
		await writeFile(join(libsDir(root, target), 'minemories-forge-mc1.18.2-1.0.0-beta.1.jar'), jar)
		return { code: 0, tail: 'BUILD SUCCESSFUL' }
	}
	const result = await buildTarget(target, { root, version: '1.0.0-beta.1', prod: false, jdks, setup, git, runGradle })
	assert.equal(result.status, 'passed')
	const directory = distDir(root, '1.0.0-beta.1', target.id)
	const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
	assert.equal(manifest.file, 'minemories-forge-mc1.18.2-1.0.0-beta.1.jar')
	assert.equal(manifest.prod, false)
	assert.equal(manifest.commit, git.commit)
	assert.equal(manifest.java, '17')
	assert.equal(manifest.bytes, jar.length)
	assert.match(
		await readFile(join(directory, `${manifest.file}.sha256`), 'utf8'),
		new RegExp(`^${manifest.sha256}  ${manifest.file}\n$`)
	)
	assert.equal(result.filePath, join(directory, manifest.file))
})

test('builtByFrom reads MOD_BUILT_BY (pc by default) and manifest.json records it', async () => {
	assert.equal(builtByFrom({}), 'pc')
	assert.equal(builtByFrom({ MOD_BUILT_BY: 'vps' }), 'vps')
	assert.throws(() => builtByFrom({ MOD_BUILT_BY: 'laptop' }), /MOD_BUILT_BY/)
	const root = await repo()
	const runGradle = async () => {
		await writeFile(join(libsDir(root, target), 'minemories-forge-mc1.18.2-1.0.0-beta.1.jar'), jar)
		return { code: 0, tail: '' }
	}
	const options = { root, version: '1.0.0-beta.1', prod: true, jdks, setup, git, runGradle }
	assert.equal((await buildTarget(target, { ...options, env: { MOD_BUILT_BY: 'vps' } })).manifest.builtBy, 'vps')
	assert.equal((await buildTarget(target, { ...options, env: {} })).manifest.builtBy, 'pc')
	assert.equal((await buildTarget(target, { ...options, env: { MOD_BUILT_BY: 'x' } })).status, 'failed')
})

test('buildTarget reports Gradle failures, missing JARs and non-JAR files without throwing', async () => {
	const root = await repo()
	const base = { root, version: '1.0.0-beta.1', jdks: { ...jdks, compile: new Map() }, setup, git }
	const failed = await buildTarget(target, { ...base, runGradle: async () => ({ code: 1, tail: 'FAILURE' }) })
	assert.equal(failed.status, 'failed')
	assert.match(failed.message, /code 1.*JDK 17 absent/)
	assert.equal(failed.logTail, 'FAILURE')
	const missing = await buildTarget(target, { ...base, runGradle: async () => ({ code: 0, tail: '' }) })
	assert.match(missing.message, /introuvable/)
	await writeFile(join(libsDir(root, target), 'minemories-forge-mc1.18.2-1.0.0-beta.1.jar'), 'text')
	const bad = await buildTarget(target, { ...base, runGradle: async () => ({ code: 0, tail: '' }) })
	assert.match(bad.message, /pas une archive/)
})

test('buildTargets keeps going after a failure, uses the lock and ignores non-buildable targets', async () => {
	const root = await repo()
	const other = { ...target, id: 'forge-mc9.9', minecraft: '9.9', dir: 'mod/9.9', jar: 'x-{version}.jar' }
	await mkdir(libsDir(root, other), { recursive: true })
	const messages = []
	const log = { info: m => messages.push(m), warn: m => messages.push(m), error: m => messages.push(m) }
	let calls = 0
	const runGradle = async () => {
		calls++
		if (calls === 1) return { code: 2, tail: 'x' }
		await writeFile(join(libsDir(root, other), 'x-1.0.0-beta.1.jar'), jar)
		return { code: 0, tail: '' }
	}
	const results = await buildTargets([target, other, { id: 'quilt', loader: 'quilt' }], {
		root,
		env: {},
		log,
		version: '1.0.0-beta.1',
		runGradle,
		git,
		verbose: true,
		ensure: async () => jdks,
	}).catch(error => error)
	assert.ok(Array.isArray(results), String(results))
	assert.deepEqual(
		results.map(r => r.status),
		['failed', 'passed']
	)
	assert.ok(messages.some(m => m.startsWith('✗ forge-mc1.18.2')))
	assert.match(summarize(results), /1 échec\(s\) sur 2/)
	assert.match(summarize([results[1]]), /1 cible\(s\) compilée\(s\)/)
})

test('buildTargets refuses to run while another build holds the lock', async () => {
	const root = await repo()
	const { acquireLock } = await import('./lock.mjs')
	const { lockPath } = await import('./build.mjs')
	const release = await acquireLock(lockPath(root), { label: 'other build' })
	const log = { info() {}, warn() {}, error() {} }
	await assert.rejects(
		buildTargets([target], { root, env: {}, log, version: 'v', ensure: async () => jdks }),
		/déjà en cours/
	)
	await release()
})

test('runGradleProcess streams lines and keeps a bounded tail', async () => {
	const lines = []
	const spawnImpl = () => {
		const child = new EventEmitter()
		child.stdout = new PassThrough()
		child.stderr = new PassThrough()
		setImmediate(() => {
			child.stdout.write('one\ntw')
			child.stderr.write('o\nthree')
			setImmediate(() => child.emit('close', 3))
		})
		return child
	}
	const result = await runGradleProcess({ cwd: '.', args: [], env: {}, onLine: l => lines.push(l), spawnImpl })
	assert.equal(result.code, 3)
	assert.deepEqual(lines, ['one', 'two', 'three'])
	assert.equal(result.tail, 'one\ntwo\nthree')
	const failing = () => {
		const child = new EventEmitter()
		setImmediate(() => child.emit('error', new Error('spawn ENOENT')))
		return child
	}
	await assert.rejects(runGradleProcess({ cwd: '.', args: [], env: {}, spawnImpl: failing }), /ENOENT/)
})

test('formatBytes uses Ko and Mo', () => {
	assert.equal(formatBytes(10), '1 Ko')
	assert.equal(formatBytes(2048), '2 Ko')
	assert.equal(formatBytes(5 * 1024 * 1024), '5.0 Mo')
})

test('a JAR without any class entry is recognised as an empty build', () => {
	assert.equal(jarHasClasses(Buffer.from('PK META-INF/MANIFEST.MF assets/x.json')), false)
	assert.equal(jarHasClasses(Buffer.from('PK dev/minemories/Mod.class')), true)
})
