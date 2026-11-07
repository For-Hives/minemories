import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { distRoot } from '../build.mjs'

export const name = 'open'
export const summary = 'Opens the build/mod-dist folder of built JARs'
export const usage = 'bun mod open'

export function run(_args, { log, root }) {
	const folder = distRoot(root)
	mkdirSync(folder, { recursive: true })
	log.info(folder)
	const opener = { darwin: 'open', win32: 'explorer' }[process.platform] ?? 'xdg-open'
	spawnSync(opener, [folder], { stdio: 'ignore' })
	return 0
}
