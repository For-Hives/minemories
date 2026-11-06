import { parseArgs } from '../args.mjs'
import { resolveApiUrl } from '../remote/index.mjs'
import { collectCells, loadRemoteReport, loadStorageReport, renderStatus } from '../status.mjs'
import { readModVersion } from '../version.mjs'

export const name = 'status'
export const summary = 'Grille Minecraft x loader : état local, version publiée et espace utilisé'
export const usage =
	'bun mod status [--no-storage] [--remote | --api-url <url>]\n' +
	"  --remote   lit l'index public de l'API (MOD_API_URL, puis https://api.minemories.net) au lieu de S3 :\n" +
	'             pas besoin des clés S3'

export async function run(args, { config, env, log, root }) {
	const version = await readModVersion(root)
	const { flags } = parseArgs(args, ['api-url'])
	const remote = Boolean(flags.remote || flags['api-url'])
	let storage = null
	if (remote) storage = await loadRemoteReport({ apiUrl: resolveApiUrl({ flag: flags['api-url'], env }) })
	else if (!flags['no-storage']) storage = await loadStorageReport(env)
	const cells = await collectCells(config, root, version, storage)
	const color = Boolean(process.stdout.isTTY) && !env.NO_COLOR
	log.info(renderStatus({ config, cells, version, storage, color, source: remote ? 'Publié (API)' : 'Stockage' }))
	return 0
}
