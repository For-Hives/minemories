import { parseArgs } from '../args.mjs'
import { resolveRemote, summarizeUpload, uploadRelease } from '../remote/index.mjs'
import { readModVersion } from '../version.mjs'
import { collectArtifacts } from './publish.mjs'

export const name = 'push'
export const summary = 'Uploads already built JARs (build/mod-dist/<version>/) to the API, without rebuilding'
export const usage =
	'bun mod push [<version>] [--api-url <url>] [--replace] [--dry-run]\n' +
	'  <version>   default: the current mod version; uploads build/mod-dist/<version>/<id>/*.jar\n' +
	'  --api-url   API URL (default MOD_API_URL, then https://api.minemories.net)\n' +
	'  --replace   replaces an already published version with different content (refused otherwise)\n' +
	'  --dry-run   lists what would be uploaded, without network\n' +
	'Token: API_TOKEN (environment or .env, never as an argument).'

export async function run(args, { env, log, root, fetchImpl, sleep }) {
	const { positionals, flags } = parseArgs(args, ['api-url'])
	const version = positionals[0] ?? (await readModVersion(root))
	const artifacts = await collectArtifacts(root, version)
	if (artifacts.length === 0) {
		log.error(`No JAR in build/mod-dist/${version}/<id>/: run "bun mod build" first.`)
		return 1
	}
	const apiUrl = flags['api-url']
	if (flags['dry-run']) {
		const remote = resolveRemote({ apiUrl, env })
		log.info(`[dry-run] ${artifacts.length} artifact(s) ${version} to ${remote.apiUrl}:`)
		for (const artifact of artifacts) log.info(`  ${artifact.targetId}  ${artifact.bytes} bytes`)
		return 0
	}
	const result = await uploadRelease({
		version,
		artifacts,
		env,
		apiUrl,
		replace: Boolean(flags.replace),
		log,
		...(fetchImpl ? { fetchImpl } : {}),
		...(sleep ? { sleep } : {}),
	})
	log.info(`\n${summarizeUpload(result)}`)
	return result.ok ? 0 : 1
}
