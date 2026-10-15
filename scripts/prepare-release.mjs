import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validatePlan } from './plan-release.mjs'
import { isMain, repositoryRoot, run } from './release-utils.mjs'

const headingPattern = /^#{1,2} /m
const whitespacePattern = /\s+/
const packageManifestPattern = /^(?:apps|packages)\/[^/]+\/package\.json$/
export function changelogSection(changelog, version) {
	const lines = changelog.split('\n')
	const start = lines.findIndex(line => headingPattern.test(line) && line.includes(`[${version}]`))
	if (start === -1) throw new Error('Release version missing from changelog.')
	const remaining = lines.slice(start + 1)
	const end = remaining.findIndex(line => headingPattern.test(line))
	return [lines[start], ...remaining.slice(0, end === -1 ? undefined : end)].join('\n').trim()
}
export function verifyReleaseCommit(plan, commit, root = repositoryRoot) {
	const git = args => run('git', args, { cwd: root })
	if (
		git(['rev-parse', `${commit}^`]) !== plan.sourceCommit ||
		git(['log', '-1', '--format=%s', commit]) !== `chore(release): ${plan.version} [skip ci]`
	)
		throw new Error('Existing release tag belongs to another source commit.')
	const allowed = new Set(['package.json', 'bun.lock', 'CHANGELOG.md', 'mod/minemories/gradle.properties'])
	const changed = git(['diff', '--name-only', plan.sourceCommit, commit]).split('\n')
	if (changed.some(file => !(allowed.has(file) || packageManifestPattern.test(file))))
		throw new Error('The release commit contains untested source changes.')
	if (JSON.parse(git(['show', `${commit}:package.json`])).version !== plan.version)
		throw new Error('Release commit version differs from plan.')
	git(['merge-base', '--is-ancestor', commit, 'origin/main'])
}
export async function prepareRelease(plan, root = repositoryRoot) {
	validatePlan(plan)
	if (plan.dryRun) throw new Error('A dry-run plan cannot create a release commit.')
	const git = args => run('git', args, { cwd: root })
	git(['fetch', 'origin', 'main', '--tags'])
	const tagged = Boolean(git(['tag', '--list', plan.tag]))
	const remote = git(['ls-remote', 'origin', 'refs/heads/main']).split(whitespacePattern)[0]
	if (!tagged && remote !== plan.sourceCommit) return null
	const manifest = JSON.parse(await readFile(resolve(root, 'work/release-assets/release-manifest.json'), 'utf8'))
	if (manifest.version !== plan.version || manifest.sourceCommit !== plan.sourceCommit)
		throw new Error('Release assets differ from the tested source.')
	let commit
	if (tagged) {
		commit = git(['rev-parse', `${plan.tag}^{commit}`])
		verifyReleaseCommit(plan, commit, root)
	} else {
		if (git(['rev-parse', 'HEAD']) !== plan.sourceCommit)
			throw new Error('Release checkout differs from the tested source.')
		run('node', [resolve(root, 'node_modules/release-it/bin/release-it.js'), plan.version, '--ci'], {
			cwd: root,
			stdio: 'inherit',
		})
		commit = git(['rev-parse', `${plan.tag}^{commit}`])
		verifyReleaseCommit(plan, commit, root)
	}
	const changelog = changelogSection(git(['show', `${commit}:CHANGELOG.md`]), plan.version)
	const targets = plan.targets
		.map(target => `- ${target.name} ${target.loaderVersion} · Minecraft ${target.minecraft} · Java ${target.java}`)
		.join('\n')
	const notes = `${changelog}\n\n## Fichiers\n\n${targets}\n\nPréversion automatique issue du commit ${plan.sourceCommit}. Les contrôles CI sont réussis ; ce pipeline n’atteste pas une validation en jeu de ce JAR exact. Les empreintes SHA-256 et les manifestes accompagnent les fichiers.\n`
	await writeFile(resolve(root, 'work/release-notes.md'), notes)
	return commit
}
if (isMain(import.meta.url)) {
	const plan = JSON.parse(await readFile(resolve(repositoryRoot, 'work/release-plan/plan.json'), 'utf8'))
	const commit = await prepareRelease(plan)
	if (process.env.GITHUB_OUTPUT)
		await appendFile(process.env.GITHUB_OUTPUT, `ready=${Boolean(commit)}\ncommit=${commit ?? ''}\n`)
	console.log(commit ? `Prepared ${plan.tag} at ${commit}.` : 'Source superseded: publication skipped.')
}
