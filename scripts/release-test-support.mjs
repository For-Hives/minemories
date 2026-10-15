import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { repositoryRoot, run } from './release-utils.mjs'

export async function releaseFixture(t, message = 'fix(mod): repair capture upload') {
	const temporary = await mkdtemp(resolve(tmpdir(), 'minemories-release-'))
	t.after(() => rm(temporary, { recursive: true, force: true }))
	const remote = resolve(temporary, 'remote.git')
	const root = resolve(temporary, 'repo')
	await mkdir(root)
	const git = args => run('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
	git(['init', '--bare', remote])
	git(['init', '-b', 'main'])
	git(['config', 'user.name', 'Release test'])
	git(['config', 'user.email', 'release@example.test'])
	git(['remote', 'add', 'origin', remote])
	const configuration = JSON.parse(await readFile(resolve(repositoryRoot, '.release-it.json'), 'utf8'))
	configuration.hooks = { 'after:bump': configuration.hooks['after:bump'][0] }
	await writeFile(resolve(root, '.release-it.json'), JSON.stringify(configuration))
	await writeFile(resolve(root, '.gitignore'), '/node_modules\n/work/\n')
	await writeFile(
		resolve(root, 'package.json'),
		JSON.stringify({ name: 'release-fixture', private: true, workspaces: ['apps/*', 'packages/*'] })
	)
	await Promise.all(
		['apps/api', 'apps/web', 'packages/api-contract'].map(async directory => {
			await mkdir(resolve(root, directory), { recursive: true })
			await writeFile(
				resolve(root, directory, 'package.json'),
				JSON.stringify({ name: directory.replace('/', '-'), version: '0.1.0', private: true })
			)
		})
	)
	await mkdir(resolve(root, 'config'))
	await copyFile(resolve(repositoryRoot, 'config/mod-targets.json'), resolve(root, 'config/mod-targets.json'))
	await mkdir(resolve(root, 'mod/minemories'), { recursive: true })
	await writeFile(
		resolve(root, 'mod/minemories/gradle.properties'),
		'org.gradle.caching=true\nmod_version=0.1.1-dev.1\n'
	)
	await mkdir(resolve(root, 'scripts'))
	await Promise.all(
		['sync-release-versions.mjs', 'release-utils.mjs'].map(file =>
			copyFile(resolve(repositoryRoot, 'scripts', file), resolve(root, 'scripts', file))
		)
	)
	await copyFile(resolve(repositoryRoot, 'CHANGELOG.md'), resolve(root, 'CHANGELOG.md'))
	await symlink(resolve(repositoryRoot, 'node_modules'), resolve(root, 'node_modules'), 'dir')
	git(['add', '.'])
	git(['commit', '-m', 'chore: initial fixture'])
	git(['tag', 'mod-v0.1.0-beta'])
	git(['push', '-u', 'origin', 'main', '--tags'])
	await writeFile(resolve(root, 'feature.txt'), message)
	git(['add', 'feature.txt'])
	git(['commit', '-m', message])
	git(['push', 'origin', 'main'])
	return { root, remote, git, sourceCommit: git(['rev-parse', 'HEAD']) }
}
