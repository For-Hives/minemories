import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { filenameFor, isMain, readTargets, repositoryRoot, run } from './release-utils.mjs'
import { verifyModArtifact } from './verify-mod-artifact.mjs'

const tagPattern = /^mod-v\d+\.\d+\.\d+(?:-[\w.-]+)?$/
const repositoryPattern = /^[\w.-]+\/[\w.-]+$/
const digestPattern = /^sha256:([a-f0-9]{64})$/
export async function downloadReleaseTarget({ tag, targetId, repository, root = repositoryRoot, execute = run }) {
	if (!(tagPattern.test(tag) && repositoryPattern.test(repository)))
		throw new Error('Invalid release tag or repository.')
	const target = (await readTargets(root)).find(item => item.id === targetId)
	if (!target) throw new Error('Unknown or disabled mod target.')
	const release = JSON.parse(execute('gh', ['api', `repos/${repository}/releases/tags/${tag}`]))
	if (release.draft || release.tag_name !== tag)
		throw new Error('Only an existing published release can be distributed.')
	const filename = filenameFor(target)
	const jar = release.assets.find(asset => asset.name === filename)
	const digest = digestPattern.exec(jar?.digest ?? '')?.[1]
	if (!digest) throw new Error('Missing GitHub JAR digest.')
	let manifest = `manifest-${target.id}.json`
	if (!release.assets.some(asset => asset.name === manifest) && target.id === 'neoforge-mc1.21.1')
		manifest = 'manifest.json'
	const directory = resolve(root, 'downloads')
	await mkdir(directory, { recursive: true })
	execute('gh', [
		'release',
		'download',
		tag,
		'--repo',
		repository,
		'--dir',
		directory,
		'--pattern',
		filename,
		'--pattern',
		`${filename}.sha256`,
		'--pattern',
		manifest,
	])
	if (manifest !== 'manifest.json')
		await writeFile(resolve(directory, 'manifest.json'), await readFile(resolve(directory, manifest)))
	const result = await verifyModArtifact(directory, digest, { target, version: tag.slice('mod-v'.length) })
	await writeFile(resolve(directory, 'CHANGELOG.md'), release.body ?? '')
	return result
}
if (isMain(import.meta.url)) {
	const manifest = await downloadReleaseTarget({
		tag: process.env.RELEASE_TAG,
		targetId: process.env.RELEASE_TARGET,
		repository: process.env.GITHUB_REPOSITORY,
	})
	if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `version=${manifest.version}\n`)
}
