import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { packageMod } from './package-mod.mjs'
import { isMain, readTargets, repositoryRoot, requireCommit, requireReleaseVersion, run } from './release-utils.mjs'
import { verifyModArtifact } from './verify-mod-artifact.mjs'

export async function buildReleaseTarget(id, version, sourceCommit) {
	requireReleaseVersion(version)
	requireCommit(sourceCommit)
	if (run('git', ['rev-parse', 'HEAD']) !== sourceCommit)
		throw new Error('Wrong source checkout for the release build.')
	if (run('git', ['status', '--porcelain'])) throw new Error('Release builds require a clean checkout.')
	const target = (await readTargets()).find(item => item.id === id)
	if (!target) throw new Error('Unknown or disabled mod target.')
	run(
		'node',
		[
			'scripts/gradle.mjs',
			'clean',
			':core:check',
			`:${target.project}:check`,
			`:${target.project}:build`,
			`-PmodVersion=${version}`,
		],
		{ stdio: 'inherit' }
	)
	const directory = resolve(repositoryRoot, 'work/mod-release', target.id)
	await mkdir(directory, { recursive: true })
	const manifest = await packageMod(resolve(repositoryRoot, `mod/minemories/${target.project}/build/libs`), directory, {
		target,
		version,
		sourceCommit,
	})
	await verifyModArtifact(directory, manifest.sha256, { target, version, sourceCommit })
	await writeFile(
		resolve(directory, 'build-receipt.json'),
		`${JSON.stringify({ sha256: manifest.sha256, sourceCommit, version, target: target.id }, null, '\t')}\n`
	)
	return manifest
}
if (isMain(import.meta.url)) await buildReleaseTarget(...process.argv.slice(2))
