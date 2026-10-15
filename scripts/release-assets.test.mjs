import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync as readFileSyncForMock, writeFileSync as writeFileSyncForMock } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, resolve } from 'node:path'
import { test } from 'node:test'
import { collectReleaseAssets } from './collect-release-assets.mjs'
import { downloadReleaseTarget } from './download-release-target.mjs'
import { packageMod } from './package-mod.mjs'
import { publishRelease } from './publish-release.mjs'
import { filenameFor, repositoryRoot } from './release-utils.mjs'

async function fixture(t, multiple = false) {
	const root = await mkdtemp(resolve(tmpdir(), 'minemories-assets-'))
	t.after(() => rm(root, { recursive: true, force: true }))
	const configuration = JSON.parse(await readFile(resolve(repositoryRoot, 'config/mod-targets.json'), 'utf8'))
	if (multiple)
		Object.assign(configuration.targets[1], { enabled: true, validatedInGame: true, loaderVersion: 'test-fixture' })
	const targets = configuration.targets.filter(target => target.enabled)
	await mkdir(resolve(root, 'config'))
	await writeFile(resolve(root, 'config/mod-targets.json'), JSON.stringify(configuration))
	const plan = {
		version: '0.2.0-beta.1',
		tag: 'mod-v0.2.0-beta.1',
		sourceCommit: 'a'.repeat(40),
		channel: 'beta',
		dryRun: false,
		targets,
	}
	const source = resolve(root, 'libs')
	await mkdir(source)
	await writeFile(resolve(source, `minemories-${plan.version}.jar`), Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))
	const inputs = resolve(root, 'work/release-inputs')
	await Promise.all(
		targets.map(async target => {
			const directory = resolve(inputs, `release-target-${target.id}`)
			const manifest = await packageMod(source, directory, {
				target,
				version: plan.version,
				sourceCommit: plan.sourceCommit,
			})
			await writeFile(
				resolve(directory, 'build-receipt.json'),
				JSON.stringify({
					version: plan.version,
					sourceCommit: plan.sourceCommit,
					target: target.id,
					sha256: manifest.sha256,
				})
			)
		})
	)
	const output = resolve(root, 'work/release-assets')
	await writeFile(resolve(root, 'work/release-notes.md'), '# Release fixture\n\nGenerated notes.\n')
	return { root, source, plan, inputs, output }
}
test('matrix artifacts retain distinct loader files and checksums in one verified release', async t => {
	const data = await fixture(t, true)
	const artifacts = await collectReleaseAssets(data.plan, data.inputs, data.output, data.root)
	assert.equal(artifacts.length, 2)
	const files = await readdir(data.output)
	for (const target of data.plan.targets) {
		assert.ok(files.includes(filenameFor(target)))
		assert.ok(files.includes(`${filenameFor(target)}.sha256`))
		assert.ok(files.includes(`manifest-${target.id}.json`))
	}
	assert.equal(
		JSON.parse(await readFile(resolve(data.output, 'release-manifest.json'), 'utf8')).sourceCommit,
		data.plan.sourceCommit
	)
})
test('a single artifact extracted flat by download-artifact keeps the same provenance and integrity checks', async t => {
	const data = await fixture(t)
	const directory = resolve(data.inputs, 'release-target-neoforge-mc1.21.1')
	const files = await readdir(directory)
	await Promise.all(files.map(file => rename(resolve(directory, file), resolve(data.inputs, file))))
	await rm(directory, { recursive: true })
	const artifacts = await collectReleaseAssets(data.plan, data.inputs, data.output, data.root)
	assert.equal(artifacts.length, 1)
	assert.equal(artifacts[0].target, 'neoforge-mc1.21.1')
	await writeFile(resolve(data.inputs, 'unexpected.jar'), 'foreign artifact')
	await assert.rejects(collectReleaseAssets(data.plan, data.inputs, data.output, data.root))
	await rm(resolve(data.inputs, 'unexpected.jar'))
	await writeFile(resolve(data.inputs, 'minemories-neoforge-mc1.21.1.jar'), 'altered archive')
	await assert.rejects(collectReleaseAssets(data.plan, data.inputs, data.output, data.root))
})
test('missing matrix targets, wrong source/version, altered bytes and mismatched receipts stop publication', async t => {
	await Promise.all(
		['missing', 'source', 'version', 'receipt', 'jar', 'targets'].map(async change => {
			const data = await fixture(t)
			const directory = resolve(data.inputs, 'release-target-neoforge-mc1.21.1')
			if (change === 'missing') await rm(directory, { recursive: true })
			if (change === 'source') data.plan.sourceCommit = 'b'.repeat(40)
			if (change === 'version') data.plan.version = '0.3.0-beta.1'
			if (change === 'receipt') await writeFile(resolve(directory, 'build-receipt.json'), '{}')
			if (change === 'jar') await writeFile(resolve(directory, 'minemories-neoforge-mc1.21.1.jar'), 'tampered')
			if (change === 'targets') data.plan.targets[0].loaderVersion = 'wrong'
			await assert.rejects(collectReleaseAssets(data.plan, data.inputs, data.output, data.root))
		})
	)
	const data = await fixture(t)
	await assert.rejects(packageMod(data.source, data.output, { target: data.plan.targets[0], version: '0.3.0-beta.1' }))
})

function fakeGitHub({ data, commit, staleList = false }) {
	let release = null
	const calls = []
	function api(args) {
		if (args.includes('POST')) {
			const request = JSON.parse(readFileSyncForMock(args[args.indexOf('--input') + 1], 'utf8'))
			assert.equal(request.tag_name, data.plan.tag)
			assert.equal(request.target_commitish, commit)
			assert.equal(request.body, '# Release fixture\n\nGenerated notes.\n')
			assert.equal(request.draft, true)
			assert.equal(request.prerelease, true)
			release = { ...request, assets: [] }
			return JSON.stringify(release)
		}
		if (staleList) return ''
		return release ? JSON.stringify(release) : ''
	}
	const execute = (command, args) => {
		if (command === 'git') {
			assert.deepEqual(args, ['rev-parse', `refs/tags/${data.plan.tag}^{commit}`])
			return commit
		}
		assert.equal(command, 'gh')
		calls.push(args)
		if (args[0] === 'api') return api(args)
		if (args[1] === 'upload') {
			const file = args[3]
			const bytes = readFileSyncForMock(file)
			release.assets.push({
				name: basename(file),
				size: bytes.length,
				digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
			})
		}
		if (args[1] === 'edit') release.draft = false
		return ''
	}
	return {
		execute,
		calls,
		get release() {
			return release
		},
	}
}

test('GitHub publication stays a draft until complete, resumes safely and never overwrites a different asset', async t => {
	const data = await fixture(t)
	await collectReleaseAssets(data.plan, data.inputs, data.output, data.root)
	const commit = 'c'.repeat(40)
	const mock = fakeGitHub({ data, commit })
	const input = { plan: data.plan, commit, repository: 'For-Hives/minemories', root: data.root, execute: mock.execute }
	let uploads = 0
	await assert.rejects(
		publishRelease({
			...input,
			execute: (command, args, options) => {
				if (args[1] === 'upload' && ++uploads === 2) throw new Error('Connection lost')
				return mock.execute(command, args, options)
			},
		})
	)
	assert.equal(mock.release.draft, true)
	await publishRelease(input)
	assert.equal(mock.release.draft, false)
	mock.release.target_commitish = 'main'
	const writes = mock.calls.filter(args => args[0] === 'release').length
	await publishRelease(input)
	assert.equal(mock.calls.filter(args => args[0] === 'release').length, writes)
	await assert.rejects(publishRelease({ ...input, commit: 'd'.repeat(40) }))
	mock.release.assets[0].digest = `sha256:${'0'.repeat(64)}`
	await assert.rejects(publishRelease(input))
	await assert.rejects(publishRelease({ ...input, plan: { ...data.plan, dryRun: true } }))
	assert.ok(mock.calls.filter(args => args[1] === 'upload').every(args => !args.includes('--clobber')))
})
test('publishes using the creation response even while GitHub release listings remain stale', async t => {
	const data = await fixture(t)
	await collectReleaseAssets(data.plan, data.inputs, data.output, data.root)
	const commit = 'c'.repeat(40)
	const mock = fakeGitHub({ data, commit, staleList: true })
	await publishRelease({
		plan: data.plan,
		commit,
		repository: 'For-Hives/minemories',
		root: data.root,
		execute: mock.execute,
	})
	assert.equal(mock.release.draft, false)
	assert.equal(mock.release.assets.length, 5)
})
test('catalogue distribution downloads the existing JAR and verifies the GitHub digest without rebuilding', async t => {
	const data = await fixture(t)
	await collectReleaseAssets(data.plan, data.inputs, data.output, data.root)
	const commit = 'c'.repeat(40)
	const mock = fakeGitHub({ data, commit })
	await publishRelease({
		plan: data.plan,
		commit,
		repository: 'For-Hives/minemories',
		root: data.root,
		execute: mock.execute,
	})
	const downloaded = []
	const execute = (command, args) => {
		assert.equal(command, 'gh')
		if (args[0] === 'api') return JSON.stringify(mock.release)
		assert.deepEqual(args.slice(0, 2), ['release', 'download'])
		for (let index = 0; index < args.length; index++) {
			if (args[index] !== '--pattern') continue
			const name = args[index + 1]
			downloaded.push(name)
			writeFileSyncForMock(resolve(data.root, 'downloads', name), readFileSyncForMock(resolve(data.output, name)))
		}
		return ''
	}
	const input = {
		tag: data.plan.tag,
		targetId: data.plan.targets[0].id,
		repository: 'For-Hives/minemories',
		root: data.root,
		execute,
	}
	const manifest = await downloadReleaseTarget(input)
	assert.equal(manifest.version, data.plan.version)
	assert.ok(downloaded.includes('minemories-neoforge-mc1.21.1.jar'))
	mock.release.assets.find(asset => asset.name.endsWith('.jar')).digest = `sha256:${'0'.repeat(64)}`
	await assert.rejects(downloadReleaseTarget(input))
	await assert.rejects(downloadReleaseTarget({ ...input, tag: '../malicious' }))
})
