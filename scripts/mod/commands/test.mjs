import { runHeadlessTests } from '../headless/index.mjs'
import { notify } from '../notify.mjs'

export const name = 'test'
export const summary = 'Runs the in-game tests on the mod targets (headless by default, --local on your screen)'
export const usage = 'bun mod test [<id>…|--all] [--local] [--keep-logs] [--notify]'

const ICON = { passed: 'OK     ', failed: 'FAILED ', skipped: 'skipped' }

export function parseArgs(args) {
	const flags = new Set(args.filter(arg => arg.startsWith('--')))
	return {
		ids: args.filter(arg => !arg.startsWith('--')),
		all: flags.has('--all'),
		keepLogs: flags.has('--keep-logs'),
		notify: flags.has('--notify'),
		local: flags.has('--local'),
	}
}

export async function run(args, ctx) {
	const options = parseArgs(args)
	if (options.ids.length === 0 && !options.all) {
		ctx.log(`Usage: ${usage}`)
		return 1
	}
	const results = await runHeadlessTests({
		config: ctx.config,
		targets: options.all ? undefined : options.ids,
		env: ctx.env,
		keepLogs: options.keepLogs,
		local: options.local,
	})
	for (const result of results) {
		ctx.log(
			`${ICON[result.status]} ${result.targetId} (${result.seconds} s)${result.message ? ` — ${result.message}` : ''}`
		)
	}
	const failed = results.filter(result => result.status === 'failed')
	if (failed.length > 0 && options.notify) {
		await notify(
			{
				kind: 'test-failure',
				title: 'In-game tests failed',
				summary: `${failed.length} of ${results.length} target(s)`,
				targets: results.map(r => ({ id: r.targetId, status: r.status, seconds: r.seconds, message: r.message })),
				logTail: failed[0].logTail,
			},
			{ env: ctx.env, warn: ctx.log }
		)
	}
	return failed.length > 0 ? 1 : 0
}
