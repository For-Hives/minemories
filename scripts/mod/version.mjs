// The mod version lives in mod/1.21.1/gradle.properties (the ports read it from there).
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { releaseVersionPattern, repositoryRoot, run } from '../release-utils.mjs'

export const propertiesPath = 'mod/1.21.1/gradle.properties'
const versionLine = /^mod_version=(.+)$/m

export async function readModVersion(root = repositoryRoot) {
	const text = await readFile(resolve(root, propertiesPath), 'utf8')
	const version = versionLine.exec(text)?.[1]?.trim()
	if (!version) throw new Error(`mod_version introuvable dans ${propertiesPath}.`)
	return version
}

/** patch: X.Y.(Z+1)-beta.1, minor: X.(Y+1).0-beta.1, beta: X.Y.Z-beta.(N+1). */
export function bumpVersion(current, kind) {
	const match = releaseVersionPattern.exec(current)
	if (!match) throw new Error(`Version ${current} hors format X.Y.Z-beta.N.`)
	const [major, minor, patch, beta] = match.slice(1).map(Number)
	if (kind === 'beta') return `${major}.${minor}.${patch}-beta.${beta + 1}`
	if (kind === 'patch') return `${major}.${minor}.${patch + 1}-beta.1`
	if (kind === 'minor') return `${major}.${minor + 1}.0-beta.1`
	throw new Error(`Type de bump inconnu : ${kind} (patch, minor ou beta).`)
}

export async function writeModVersion(root, version) {
	const path = resolve(root, propertiesPath)
	const text = await readFile(path, 'utf8')
	await writeFile(path, text.replace(versionLine, `mod_version=${version}`))
}

/** Commits the bump and tags it `mod-v<version>`; `exec(command, args)` is injectable. */
export function commitBump(root, version, exec = (command, args) => run(command, args, { cwd: root })) {
	exec('git', ['add', propertiesPath])
	exec('git', ['commit', '-m', `chore(release): ${version}`])
	exec('git', ['tag', `mod-v${version}`])
}

export async function bump(root, kind, { commit = false, exec } = {}) {
	const current = await readModVersion(root)
	const next = bumpVersion(current, kind)
	await writeModVersion(root, next)
	if (commit) commitBump(root, next, exec)
	return { current, next }
}
