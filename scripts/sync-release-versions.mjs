import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isMain, repositoryRoot, requireReleaseVersion } from './release-utils.mjs'

const modVersionPattern = /^mod_version=.*$/m
export async function syncReleaseVersions(version, root = repositoryRoot) {
	requireReleaseVersion(version)
	const rootPackage = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
	const files = ['package.json']
	for (const workspace of rootPackage.workspaces) {
		if (!['apps/*', 'packages/*'].includes(workspace)) throw new Error(`Unsupported workspace pattern: ${workspace}`)
		const directory = workspace.slice(0, -2)
		for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
			if (entry.isDirectory()) files.push(`${directory}/${entry.name}/package.json`)
		}
	}
	const updates = await Promise.all(
		files.map(async file => {
			const data = JSON.parse(await readFile(resolve(root, file), 'utf8'))
			return [file, `${JSON.stringify({ ...data, version }, null, '\t')}\n`]
		})
	)
	const propertiesPath = 'mod/minemories/gradle.properties'
	const properties = await readFile(resolve(root, propertiesPath), 'utf8')
	if (!modVersionPattern.test(properties)) throw new Error('Missing mod_version in Gradle properties.')
	updates.push([propertiesPath, properties.replace(modVersionPattern, `mod_version=${version}`)])
	await Promise.all(updates.map(([file, content]) => writeFile(resolve(root, file), content)))
	return files
}
if (isMain(import.meta.url)) await syncReleaseVersions(process.argv[2])
