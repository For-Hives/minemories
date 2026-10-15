import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { planRelease } from './plan-release.mjs'
import { changelogSection, prepareRelease } from './prepare-release.mjs'
import { releaseFixture } from './release-test-support.mjs'

for (const [message, expected] of [
	['fix(mod): repair upload', '0.1.1-beta.1'],
	['feat(mod): add captures', '0.2.0-beta.1'],
	['feat(mod)!: change capture format', '1.0.0-beta.1'],
	['docs: explain the tutorial', '0.1.1-beta.1'],
	['Update installation guide', '0.1.1-beta.1'],
]) {
	test(`conventional bump for ${message} chooses ${expected} without mutations`, async t => {
		const fixture = await releaseFixture(t, message)
		const plan = await planRelease(fixture)
		assert.equal(plan.version, expected)
		assert.deepEqual(
			plan.targets.map(target => target.loader),
			['neoforge', 'fabric', 'forge']
		)
		assert.equal(fixture.git(['status', '--porcelain']), '')
		assert.equal(fixture.git(['rev-parse', 'HEAD']), fixture.sourceCommit)
		assert.equal(fixture.git(['tag', '--list', plan.tag]), '')
	})
}
test('publication prepares a version-only commit, tags it atomically, and resumes without another bump', async t => {
	const fixture = await releaseFixture(t)
	const plan = await planRelease(fixture)
	await mkdir(resolve(fixture.root, 'work/release-assets'), { recursive: true })
	await writeFile(
		resolve(fixture.root, 'work/release-assets/release-manifest.json'),
		JSON.stringify({ version: plan.version, sourceCommit: plan.sourceCommit })
	)
	const commit = await prepareRelease(plan, fixture.root)
	assert.notEqual(commit, fixture.sourceCommit)
	assert.equal(fixture.git(['rev-parse', `${plan.tag}^{commit}`]), commit)
	assert.equal(fixture.git(['rev-parse', 'origin/main']), commit)
	const files = ['package.json', 'apps/api/package.json', 'apps/web/package.json', 'packages/api-contract/package.json']
	const packages = await Promise.all(files.map(file => readFile(resolve(fixture.root, file), 'utf8')))
	for (const content of packages) assert.equal(JSON.parse(content).version, plan.version)
	assert.ok((await readFile(resolve(fixture.root, 'work/release-notes.md'), 'utf8')).includes('repair capture upload'))
	assert.equal(await prepareRelease(plan, fixture.root), commit)
	assert.equal(await planRelease({ root: fixture.root, sourceCommit: commit }), null)
	await assert.rejects(prepareRelease({ ...plan, dryRun: true }, fixture.root))
	await assert.rejects(prepareRelease({ ...plan, sourceCommit: 'b'.repeat(40) }, fixture.root))
})
test('a superseded main source cannot plan or publish an obsolete release', async t => {
	const fixture = await releaseFixture(t)
	const plan = await planRelease(fixture)
	await writeFile(resolve(fixture.root, 'newer.txt'), 'newer main')
	fixture.git(['add', 'newer.txt'])
	fixture.git(['commit', '-m', 'fix: newer change'])
	fixture.git(['push', 'origin', 'main'])
	fixture.git(['checkout', '-B', 'main', fixture.sourceCommit])
	assert.equal(await planRelease(fixture), null)
	assert.equal(await prepareRelease(plan, fixture.root), null)
})
test('changelog sections keep their own subheadings and exclude older releases', () => {
	const changelog =
		'# Changelog\n\n# [0.2.0-beta.1](link)\n\n### Features\n\n- A feature\n\n## [0.1.0-beta](link)\n\nOlder'
	assert.ok(changelogSection(changelog, '0.2.0-beta.1').includes('### Features'))
	assert.ok(!changelogSection(changelog, '0.2.0-beta.1').includes('Older'))
	assert.throws(() => changelogSection(changelog, '0.3.0-beta.1'))
})
