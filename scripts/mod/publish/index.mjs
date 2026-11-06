// Third-party publication (Modrinth, CurseForge) of a release already built and stored. No account exists yet:
// every step reports `skipped` with the exact list of what remains to be filled in, until the catalogs are enabled.
import { join } from 'node:path'
import { repositoryRoot as defaultRoot, loadCatalogs } from './common.mjs'
import { fileCache, publishCurseForge } from './curseforge.mjs'
import { publishModrinth } from './modrinth.mjs'

/**
 * @param {object} options
 * @param {object} options.config configuration with `targets`
 * @param {{version:string, commit?:string, changelog?:string, published?:object,
 *   artifacts:{targetId:string, filePath:string, bytes?:number, sha256?:string}[]}} options.release
 *   `published` is the site index (`published[platform][targetId] = url`) used to skip what is already online.
 * @param {object} [options.env]
 * @param {boolean} [options.dryRun]
 * @param {object} [options.deps] injection for tests: fetch, readFile, catalogs, cache
 * @returns {Promise<{platform:'modrinth'|'curseforge', targetId:string, status:'published'|'skipped'|'failed',
 *   url?:string, message?:string, request?:string}[]>}
 */
export async function publishThirdParty({ config, release, env = process.env, dryRun = false, deps = {} }) {
	const root = config?.root ?? defaultRoot
	const catalogs = deps.catalogs ?? (await loadCatalogs(root))
	const common = {
		config,
		catalogs,
		release,
		env,
		dryRun,
		fetchImpl: deps.fetch ?? globalThis.fetch,
		readImpl: deps.readFile,
	}
	const cache = deps.cache ?? fileCache(join(root, 'build', 'mod-cache', 'curseforge-game-versions.json'))
	const modrinth = await publishModrinth(common)
	const curseforge = await publishCurseForge({ ...common, cache })
	return [...modrinth, ...curseforge]
}
