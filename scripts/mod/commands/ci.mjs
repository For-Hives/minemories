import { appendFileSync } from 'node:fs'
import { ciCells } from '../config.mjs'

export const name = 'ci'
export const summary = 'Prints the matrix cells to build in the quality workflow (JSON)'
export const usage = 'bun mod ci'

export function run(_args, { config, env, log }) {
	const cells = JSON.stringify({ include: ciCells(config) })
	if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `cells=${cells}\n`)
	log.info(cells)
	return 0
}
