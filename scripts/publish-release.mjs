import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validatePlan } from './plan-release.mjs'
import { isMain, repositoryRoot, requireCommit, run } from './release-utils.mjs'

const repositoryPattern = /^[\w.-]+\/[\w.-]+$/
function uploadAsset({ release, plan, directory, repository, execute }, { file, size, digest }) {
	const existing = release.assets.find(asset => asset.name === file)
	if (existing) {
		if (existing.digest !== digest || existing.size !== size)
			throw new Error(`Existing asset differs: ${file}. Refusing to overwrite it.`)
	} else {
		if (!release.draft) throw new Error('A published release is missing assets; refusing to modify it.')
		execute('gh', ['release', 'upload', plan.tag, resolve(directory, file), '--repo', repository])
	}
}
async function ensureDraft({ plan, commit, repository, root, execute }) {
	function lookup() {
		const output = execute('gh', [
			'api',
			`repos/${repository}/releases?per_page=100`,
			'--paginate',
			'--jq',
			`.[] | select(.tag_name == "${plan.tag}")`,
		])
		return output ? JSON.parse(output) : null
	}
	const release = lookup()
	if (!release) {
		const request = resolve(root, 'work/release-request.json')
		await writeFile(
			request,
			JSON.stringify({
				tag_name: plan.tag,
				target_commitish: commit,
				name: `Minemories ${plan.version} · bêta automatique`,
				body: await readFile(resolve(root, 'work/release-notes.md'), 'utf8'),
				draft: true,
				prerelease: true,
				make_latest: 'false',
			})
		)
		return JSON.parse(execute('gh', ['api', '--method', 'POST', `repos/${repository}/releases`, '--input', request]))
	}
	return release
}
export async function publishRelease({ plan, commit, repository, root = repositoryRoot, execute = run }) {
	validatePlan(plan)
	requireCommit(commit)
	if (plan.dryRun) throw new Error('A dry-run plan cannot be published.')
	if (!repositoryPattern.test(repository)) throw new Error('Invalid GitHub repository.')
	if (execute('git', ['rev-parse', `refs/tags/${plan.tag}^{commit}`], { cwd: root }) !== commit)
		throw new Error('Release tag differs from the prepared commit.')
	const directory = resolve(root, 'work/release-assets')
	const files = (await readdir(directory)).sort()
	if (!(files.includes('release-manifest.json') && files.some(file => file.endsWith('.jar'))))
		throw new Error('Missing release artifacts.')
	const release = await ensureDraft({ plan, commit, repository, root, execute })
	if (!release || release.tag_name !== plan.tag || release.prerelease !== true)
		throw new Error('Existing GitHub release belongs to another build or channel.')
	if (release.assets.some(asset => !files.includes(asset.name)))
		throw new Error('Unexpected asset in the GitHub release.')
	const digests = await Promise.all(
		files.map(async file => {
			const bytes = await readFile(resolve(directory, file))
			return { file, size: bytes.length, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` }
		})
	)
	for (const metadata of digests) uploadAsset({ release, plan, directory, repository, execute }, metadata)
	if (release.draft)
		execute('gh', [
			'release',
			'edit',
			plan.tag,
			'--repo',
			repository,
			'--draft=false',
			'--prerelease',
			'--latest=false',
		])
	return plan.tag
}
if (isMain(import.meta.url)) {
	const plan = JSON.parse(await readFile(resolve(repositoryRoot, 'work/release-plan/plan.json'), 'utf8'))
	await publishRelease({ plan, commit: process.env.RELEASE_COMMIT, repository: process.env.GITHUB_REPOSITORY })
}
