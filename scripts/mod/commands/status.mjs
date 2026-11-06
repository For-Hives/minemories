import { collectCells, loadStorageReport, renderStatus } from '../status.mjs'
import { readModVersion } from '../version.mjs'

export const name = 'status'
export const summary = 'Grille Minecraft x loader : état local, version publiée et espace utilisé'
export const usage = 'bun mod status [--no-storage]'

export async function run(args, { config, env, log, root }) {
	const version = await readModVersion(root)
	const storage = args.includes('--no-storage') ? null : await loadStorageReport(env)
	const cells = await collectCells(config, root, version, storage)
	const color = Boolean(process.stdout.isTTY) && !env.NO_COLOR
	log.info(renderStatus({ config, cells, version, storage, color }))
	return 0
}
