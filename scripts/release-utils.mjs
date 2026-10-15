import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const releaseVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.([1-9]\d*)$/
export const commitPattern = /^[a-f0-9]{40}$/
const componentPattern = /^[a-z][a-z0-9_-]*$/
const minecraftPattern = /^\d+\.\d+(?:\.\d+)?$/
const loaderVersionPattern = /^[a-zA-Z0-9.+-]+$/
export function run(command, args, { cwd = repositoryRoot, ...options } = {}) {
	const output = execFileSync(command, args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit'],
		...options,
	})
	return typeof output === 'string' ? output.trim() : ''
}
export function requireReleaseVersion(version) {
	if (typeof version !== 'string' || !releaseVersionPattern.test(version))
		throw new Error('Expected a beta release version, e.g. 0.2.0-beta.1.')
	return version
}
export function requireCommit(sha) {
	if (typeof sha !== 'string' || !commitPattern.test(sha)) throw new Error('Expected the complete source commit SHA.')
	return sha
}
export function enabledTargets(configuration) {
	if (!Array.isArray(configuration?.targets)) throw new Error('Missing mod targets.')
	const active = configuration.targets.filter(target => target.enabled === true)
	if (active.length === 0) throw new Error('No enabled mod target.')
	const ids = new Set()
	for (const target of active) {
		if (
			!(
				componentPattern.test(target.loader) &&
				componentPattern.test(target.project) &&
				minecraftPattern.test(target.minecraft)
			) ||
			target.id !== `${target.loader}-mc${target.minecraft}` ||
			ids.has(target.id)
		)
			throw new Error('Invalid or duplicate mod target.')
		if (
			target.validatedInGame !== true ||
			!target.loaderVersion ||
			!loaderVersionPattern.test(target.loaderVersion) ||
			target.java !== '21' ||
			typeof target.name !== 'string'
		)
			throw new Error(`Unvalidated mod target: ${target.id}.`)
		ids.add(target.id)
	}
	return active
}
export async function readTargets(root = repositoryRoot) {
	return enabledTargets(JSON.parse(await readFile(resolve(root, 'config/mod-targets.json'), 'utf8')))
}
export function filenameFor(target) {
	return `minemories-${target.id}.jar`
}
export function isMain(path) {
	return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(path)
}
