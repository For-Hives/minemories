import { runHeadlessTests } from '../headless/index.mjs'
import { notify } from '../notify.mjs'

export const name = 'test'
export const summary = 'Lance les tests en jeu (Minecraft sans écran) sur les cibles du mod'
export const usage = 'bun mod test [<id>…|--all] [--keep-logs] [--notify]'

const ICON = { passed: 'OK     ', failed: 'ÉCHEC  ', skipped: 'ignorée' }

export function parseArgs(args) {
	const flags = new Set(args.filter(arg => arg.startsWith('--')))
	return {
		ids: args.filter(arg => !arg.startsWith('--')),
		all: flags.has('--all'),
		keepLogs: flags.has('--keep-logs'),
		notify: flags.has('--notify'),
	}
}

export async function run(args, ctx) {
	const options = parseArgs(args)
	if (options.ids.length === 0 && !options.all) {
		ctx.log(`Usage : ${usage}`)
		return 1
	}
	const results = await runHeadlessTests({
		config: ctx.config,
		targets: options.all ? undefined : options.ids,
		env: ctx.env,
		keepLogs: options.keepLogs,
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
				title: 'Tests en jeu en échec',
				summary: `${failed.length} cible(s) sur ${results.length}`,
				targets: results.map(r => ({ id: r.targetId, status: r.status, seconds: r.seconds, message: r.message })),
				logTail: failed[0].logTail,
			},
			{ env: ctx.env, warn: ctx.log }
		)
	}
	return failed.length > 0 ? 1 : 0
}
