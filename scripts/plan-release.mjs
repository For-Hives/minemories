import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
	enabledTargets,
	isMain,
	readTargets,
	repositoryRoot,
	requireCommit,
	requireReleaseVersion,
	run,
} from './release-utils.mjs'

const whitespacePattern = /\s+/
const repositoryPattern = /^[\w.-]+\/[\w.-]+$/
const releaseCommitPattern = /^chore\(release\): /

export function validatePlan(plan) {
	requireCommit(plan?.sourceCommit)
	requireReleaseVersion(plan?.version)
	if (plan.tag !== `mod-v${plan.version}` || plan.channel !== 'beta') throw new Error('Invalid release tag or channel.')
	if (typeof plan.dryRun !== 'boolean' || enabledTargets({ targets: plan.targets }).length !== plan.targets.length)
		throw new Error('Invalid release plan targets or dry-run flag.')
	return plan
}
export async function planRelease({ sourceCommit, dryRun = false, root = repositoryRoot, requireQuality = false }) {
	requireCommit(sourceCommit)
	const head = run('git', ['rev-parse', 'HEAD'], { cwd: root })
	if (head !== sourceCommit) throw new Error('Checkout differs from the quality-tested source commit.')
	const remote = run('git', ['ls-remote', 'origin', 'refs/heads/main'], { cwd: root }).split(whitespacePattern)[0]
	if (remote !== sourceCommit) return null
	if (releaseCommitPattern.test(run('git', ['log', '-1', '--format=%s'], { cwd: root }))) return null
	if (requireQuality) {
		const repository = process.env.GITHUB_REPOSITORY
		if (!(repository && repositoryPattern.test(repository)))
			throw new Error('Missing repository for quality verification.')
		const runs = JSON.parse(
			run('gh', [
				'api',
				`repos/${repository}/actions/workflows/quality.yml/runs?head_sha=${sourceCommit}&event=push&per_page=30`,
			])
		)
		if (
			!runs.workflow_runs.some(
				item => item.head_sha === sourceCommit && item.head_branch === 'main' && item.conclusion === 'success'
			)
		)
			throw new Error('Quality gates have not succeeded for this exact main commit.')
	}
	const targets = await readTargets(root)
	const binary = resolve(root, 'node_modules/release-it/bin/release-it.js')
	const arguments_ = ['--ci', '--release-version', '--preRelease=beta', '--preReleaseBase=1']
	const version =
		run('node', [binary, ...arguments_], { cwd: root }) || run('node', [binary, 'patch', ...arguments_], { cwd: root })
	requireReleaseVersion(version)
	const plan = { version, tag: `mod-v${version}`, sourceCommit, channel: 'beta', dryRun, targets }
	const directory = resolve(root, 'work/release-plan')
	await mkdir(directory, { recursive: true })
	await writeFile(resolve(directory, 'plan.json'), `${JSON.stringify(plan, null, '\t')}\n`)
	return plan
}
if (isMain(import.meta.url)) {
	const plan = await planRelease({
		sourceCommit: process.env.RELEASE_SOURCE_SHA,
		dryRun: process.env.RELEASE_DRY_RUN === 'true',
		requireQuality: true,
	})
	if (process.env.GITHUB_OUTPUT)
		await appendFile(
			process.env.GITHUB_OUTPUT,
			`ready=${Boolean(plan)}\nversion=${plan?.version ?? ''}\nsource=${plan?.sourceCommit ?? ''}\nmatrix=${JSON.stringify({ include: plan?.targets ?? [] })}\n`
		)
	console.log(
		plan
			? `Prepared ${plan.tag} for ${plan.targets.length} mod target(s).`
			: 'No release: source superseded or no releasable commit.'
	)
}
