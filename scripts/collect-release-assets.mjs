import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { validatePlan } from './plan-release.mjs'
import { filenameFor, isMain, readTargets, repositoryRoot } from './release-utils.mjs'
import { verifyModArtifact } from './verify-mod-artifact.mjs'

export async function collectReleaseAssets(plan, inputs, output, root = repositoryRoot) {
	validatePlan(plan)
	const targets = await readTargets(root)
	if (!isDeepStrictEqual(targets, plan.targets))
		throw new Error('Release targets differ from the source configuration.')
	const directories = await readdir(inputs)
	const expected = targets.map(target => `release-target-${target.id}`)
	if (!isDeepStrictEqual(directories.toSorted(), expected.toSorted()))
		throw new Error('Missing or unexpected matrix artifact.')
	await mkdir(output, { recursive: true })
	const artifacts = await Promise.all(
		targets.map(async target => {
			const directory = resolve(inputs, `release-target-${target.id}`)
			const receipt = JSON.parse(await readFile(resolve(directory, 'build-receipt.json'), 'utf8'))
			if (
				receipt.version !== plan.version ||
				receipt.sourceCommit !== plan.sourceCommit ||
				receipt.target !== target.id
			)
				throw new Error('Build receipt differs from the release plan.')
			const manifest = await verifyModArtifact(directory, receipt.sha256, {
				target,
				version: plan.version,
				sourceCommit: plan.sourceCommit,
			})
			const filename = filenameFor(target)
			await copyFile(resolve(directory, filename), resolve(output, filename))
			await copyFile(resolve(directory, `${filename}.sha256`), resolve(output, `${filename}.sha256`))
			await copyFile(resolve(directory, 'manifest.json'), resolve(output, `manifest-${target.id}.json`))
			if (target.id === 'neoforge-mc1.21.1')
				await copyFile(resolve(directory, 'manifest.json'), resolve(output, 'manifest.json'))
			return { target: target.id, file: filename, bytes: manifest.bytes, sha256: manifest.sha256 }
		})
	)
	await writeFile(
		resolve(output, 'release-manifest.json'),
		`${JSON.stringify({ version: plan.version, sourceCommit: plan.sourceCommit, validation: 'automated', artifacts }, null, '\t')}\n`
	)
	return artifacts
}
if (isMain(import.meta.url)) {
	const plan = JSON.parse(await readFile(resolve(repositoryRoot, 'work/release-plan/plan.json'), 'utf8'))
	await collectReleaseAssets(
		plan,
		resolve(repositoryRoot, 'work/release-inputs'),
		resolve(repositoryRoot, 'work/release-assets')
	)
}
