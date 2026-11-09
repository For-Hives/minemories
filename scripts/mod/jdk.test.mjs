import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
	adoptiumPlatform,
	adoptiumUrl,
	detectJdks,
	ensureJdks,
	gradleJavaSetup,
	gradleJdkFor,
	installJdk,
	jdkFor,
	parseJavaMajor,
	pickAdoptiumPackage,
	pickGradleJdk,
	sha256Hex,
} from './jdk.mjs'

async function fakeJdk(parent, name, version) {
	const home = join(parent, name)
	await mkdir(home, { recursive: true })
	await writeFile(join(home, 'release'), `JAVA_VERSION="${version}"\n`)
	return home
}

test('parseJavaMajor reads modern and legacy version strings', () => {
	assert.equal(parseJavaMajor('JAVA_VERSION="21.0.12"'), 21)
	assert.equal(parseJavaMajor('JAVA_VERSION="17"'), 17)
	assert.equal(parseJavaMajor('JAVA_VERSION="1.8.0_402"'), 8)
	assert.equal(parseJavaMajor('nothing'), 0)
})

test('detectJdks scans JAVA_HOME, the tools folder and the Gradle JDK folder', async () => {
	const base = await mkdtemp(join(tmpdir(), 'mod-jdk-'))
	const tools = join(base, 'tools')
	const gradle = join(base, 'gradle')
	const home = await fakeJdk(base, 'java-home', '25.0.1')
	await fakeJdk(tools, 'jdk-21.0.12+1', '21.0.12')
	await fakeJdk(gradle, 'eclipse_adoptium-17-amd64-linux.2', '17.0.21')
	await mkdir(join(tools, 'bun-1.4.3'), { recursive: true })
	await writeFile(join(gradle, 'archive.tar.gz'), 'x')
	const jdks = await detectJdks({ env: { JAVA_HOME: home, PATH: '' }, toolsDir: tools, gradleJdks: gradle })
	assert.deepEqual(
		jdks.map(j => j.major),
		[17, 21, 25]
	)
	assert.equal(pickGradleJdk(jdks).major, 21)
	assert.equal(jdkFor(jdks, '17').major, 17)
	assert.equal(jdkFor(jdks, 8), null)
	assert.equal(pickGradleJdk([]), null)
})

test('Adoptium metadata must carry a SHA-256', () => {
	const entry = (checksum, link = 'https://x/jdk.tar.gz') => [
		{ release_name: 'jdk-21.0.1+1', binary: { package: { link, checksum, name: 'jdk.tar.gz' } } },
	]
	assert.equal(pickAdoptiumPackage(entry('A'.repeat(64))).checksum, 'a'.repeat(64))
	assert.throws(() => pickAdoptiumPackage(entry('short')), /SHA-256/)
	assert.throws(() => pickAdoptiumPackage([]), /SHA-256/)
	assert.throws(() => pickAdoptiumPackage(null), /SHA-256/)
	assert.match(adoptiumUrl(17, { platform: 'linux', arch: 'x64' }), /\/17\/hotspot\?architecture=x64.*os=linux/)
	assert.deepEqual(adoptiumPlatform('darwin', 'arm64'), { os: 'mac', architecture: 'aarch64' })
	assert.throws(() => adoptiumPlatform('sunos', 'x64'), /Unsupported platform/)
})

function fakeFetch(archive, checksum) {
	const calls = []
	const fetchImpl = async url => {
		calls.push(url)
		if (url.includes('api.adoptium.net'))
			return {
				ok: true,
				json: async () => [
					{
						release_name: 'jdk-17.0.99+1',
						binary: { package: { link: 'https://dl/jdk.tar.gz', checksum, name: 'jdk.tar.gz' } },
					},
				],
			}
		return { ok: true, arrayBuffer: async () => archive }
	}
	return { fetchImpl, calls }
}

test('installJdk downloads, verifies the checksum and extracts into jdk-<release>', async () => {
	const toolsDir = await mkdtemp(join(tmpdir(), 'mod-jdk-install-'))
	const archive = Buffer.from('fake archive')
	const { fetchImpl } = fakeFetch(archive, sha256Hex(archive))
	const extract = (_file, directory) => {
		mkdirSync(join(directory, 'inner'), { recursive: true })
		writeFileSync(join(directory, 'inner', 'release'), 'JAVA_VERSION="17.0.99"\n')
	}
	const jdk = await installJdk(17, { toolsDir, fetchImpl, extract, platform: { platform: 'linux', arch: 'x64' } })
	assert.equal(jdk.major, 17)
	assert.equal(jdk.home, join(toolsDir, 'jdk-17.0.99+1'))
	assert.equal(existsSync(join(toolsDir, `.jdk-17-${process.pid}`)), false)
})

test('installJdk refuses a wrong checksum, a bad HTTP status and an unsupported major', async () => {
	const toolsDir = await mkdtemp(join(tmpdir(), 'mod-jdk-install-'))
	const { fetchImpl } = fakeFetch(Buffer.from('tampered'), 'f'.repeat(64))
	await assert.rejects(installJdk(21, { toolsDir, fetchImpl, extract: () => {} }), /Invalid SHA-256 for JDK 21/)
	await assert.rejects(installJdk(21, { toolsDir, fetchImpl: async () => ({ ok: false, status: 503 }) }), /503/)
	await assert.rejects(
		installJdk(21, {
			toolsDir,
			fetchImpl: async url =>
				url.includes('api')
					? {
							ok: true,
							json: async () => [
								{ release_name: 'x', binary: { package: { link: 'l', checksum: 'a'.repeat(64), name: 'n' } } },
							],
						}
					: { ok: false, status: 404 },
		}),
		/404/
	)
	await assert.rejects(installJdk(11, { toolsDir }), /is not supported/)
})

test('ensureJdks installs only what is missing, or refuses when downloads are disabled', async () => {
	const installed = []
	const detect = { env: { PATH: '' }, toolsDir: '/nonexistent-tools', gradleJdks: '/nonexistent-gradle' }
	await assert.rejects(ensureJdks([17], { ...detect, download: false }), /Missing JDK\(s\): 21, 17/)
	const result = await ensureJdks([21], {
		...detect,
		install: async major => installed.push(major),
	})
	assert.deepEqual(installed, [21])
	assert.equal(result.gradle, null)
})

test('gradleJavaSetup points Gradle at its JDK and lists every installation', () => {
	const jdks = {
		gradle: { home: '/j/21', major: 21 },
		all: [
			{ home: '/j/17', major: 17 },
			{ home: '/j/21', major: 21 },
		],
	}
	const setup = gradleJavaSetup(jdks, { PATH: '/bin' })
	assert.equal(setup.env.JAVA_HOME, '/j/21')
	assert.ok(setup.env.PATH.startsWith('/j/21/bin'))
	assert.deepEqual(setup.args, ['-Dorg.gradle.java.installations.paths=/j/17,/j/21'])
	assert.throws(() => gradleJavaSetup({ gradle: null, all: [] }), /No JDK/)
})

test("a target compiled with a JDK newer than Gradle's minimum runs Gradle on that JDK", () => {
	const jdk21 = { home: '/j/21', major: 21 }
	const jdk25 = { home: '/j/25', major: 25 }
	const jdks = { gradle: jdk21, compile: new Map([[25, jdk25]]), all: [jdk21, jdk25] }
	assert.equal(gradleJdkFor(jdks, { java: '25' }), jdk25)
	assert.equal(gradleJdkFor(jdks, { java: '21' }), jdk21)
	assert.equal(gradleJdkFor(jdks, { java: '17' }), jdk21)
	assert.equal(gradleJdkFor(jdks, undefined), jdk21)
	assert.equal(gradleJdkFor({ gradle: jdk21, all: [jdk21] }, { java: '25' }), jdk21)
	const setup = gradleJavaSetup(jdks, { PATH: '/bin' }, { java: '25' })
	assert.equal(setup.env.JAVA_HOME, '/j/25')
	assert.ok(setup.env.PATH.startsWith('/j/25/bin'))
})
