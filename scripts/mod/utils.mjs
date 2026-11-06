// Helpers shared by the `bun mod` tool: repository root, command runner, entry-point test, version format.
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const releaseVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.([1-9]\d*)$/

export function run(command, args, { cwd = repositoryRoot, ...options } = {}) {
	const output = execFileSync(command, args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit'],
		...options,
	})
	return typeof output === 'string' ? output.trim() : ''
}

export function isMain(path) {
	return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(path)
}
