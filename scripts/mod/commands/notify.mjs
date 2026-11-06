import { buildPayload, notify } from '../notify.mjs'

async function readAll() {
	const chunks = []
	for await (const chunk of process.stdin) chunks.push(chunk)
	return Buffer.concat(chunks).toString('utf8')
}

export const name = 'notify'
export const summary = 'Envoie une notification Discord (message de test avec --test)'
export const usage =
	'bun mod notify --test [--dry-run] | bun mod notify --kind <kind> --title <t> [--summary <s>] [--log-stdin] [--dry-run]'

function option(args, flag) {
	const index = args.indexOf(flag)
	return index >= 0 ? args[index + 1] : undefined
}

export async function eventFromArgs(args, readStdin = readAll) {
	if (args.includes('--test')) {
		return {
			kind: 'release-success',
			title: 'Test de notification Minemories',
			summary: 'Message de test envoyé par `bun mod notify --test`.',
			version: '0.0.0-beta.0',
			targets: [
				{ id: 'neoforge-mc1.21.1', status: 'passed', bytes: 3_250_000, seconds: 84 },
				{ id: 'fabric-mc1.21.1', status: 'failed', message: 'exemple d’échec (test)' },
				{ id: 'forge-mc1.21.1', status: 'skipped', message: 'exemple de cible ignorée' },
			],
		}
	}
	const kind = option(args, '--kind')
	if (!kind) return null
	const event = { kind, title: option(args, '--title') ?? kind, summary: option(args, '--summary') ?? '' }
	if (args.includes('--log-stdin')) event.logTail = await readStdin()
	return event
}

export async function run(args, ctx) {
	const event = await eventFromArgs(args, ctx.readStdin)
	if (!event) {
		ctx.log(`Usage : ${usage}`)
		return 1
	}
	if (args.includes('--dry-run')) {
		ctx.log(JSON.stringify(buildPayload(event, ctx.env), null, 2))
		return 0
	}
	const result = await notify(event, { env: ctx.env, warn: ctx.log })
	ctx.log(result.sent ? 'Notification envoyée.' : `Notification non envoyée (${result.reason}).`)
	return 0
}
