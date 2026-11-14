import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { reportHtml } from '../bench/report.mjs'
import { readBenchConfigs, runConfig } from '../bench/runner.mjs'

export const name = 'bench'
export const summary = 'Captures every block of modpack configurations in real game clients and compares the renders'
export const usage = 'bun mod bench [<config id>…|--all] [--local] [--list]'

export function parseArgs(args) {
	const flags = new Set(args.filter(arg => arg.startsWith('--')))
	return {
		ids: args.filter(arg => !arg.startsWith('--')),
		all: flags.has('--all'),
		local: flags.has('--local'),
		list: flags.has('--list'),
	}
}

/** The configurations a command line asks for; unknown ids are an error. */
export function selectConfigs(configs, { ids, all }) {
	if (all) return configs
	const unknown = ids.filter(id => !configs.some(config => config.id === id))
	if (unknown.length > 0) throw new Error(`Unknown bench configuration: ${unknown.join(', ')}`)
	return configs.filter(config => ids.includes(config.id))
}

export async function run(args, ctx) {
	const options = parseArgs(args)
	const configs = await readBenchConfigs(ctx.root)
	if (options.list) {
		for (const config of configs)
			ctx.log(`${config.id}  ${config.loader} ${config.minecraft}, ${config.mods.map(mod => mod.project).join(', ')}`)
		return 0
	}
	if (options.ids.length === 0 && !options.all) {
		ctx.log(`Usage: ${usage}`)
		return 1
	}
	const selected = selectConfigs(configs, options)
	const results = []
	for (const config of selected) {
		// biome-ignore lint/performance/noAwaitInLoops: one game at a time, the machine runs a single Minecraft client.
		const result = await runConfig(ctx.root, config, { env: ctx.env, local: options.local, log: ctx.log })
		if (result.error) ctx.log(`FAILED ${config.id}: ${result.error}`)
		else {
			const s = result.summary
			ctx.log(
				`${config.id}: ${s.ok}/${s.blocks} ok, ${s.missing} missing, ${s.doubled} doubled, ${s.unplaced} not placed${result.contraption ? `, contraption ${result.contraption.status}` : ''} (${result.seconds} s, ${result.renderer})`
			)
			results.push(result)
		}
	}
	if (results.length > 0) {
		const dir = join(ctx.root, 'build', 'mod-bench')
		await mkdir(dir, { recursive: true })
		await writeFile(join(dir, 'report.html'), reportHtml(results))
		ctx.log(`Report: ${join(dir, 'report.html')}`)
	}
	return results.length === selected.length ? 0 : 1
}
