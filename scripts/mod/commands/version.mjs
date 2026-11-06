import { parseArgs } from '../args.mjs'
import { bump, readModVersion } from '../version.mjs'

export const name = 'version'
export const summary = 'Affiche ou incrémente la version du mod (mod/1.21.1/gradle.properties)'
export const usage = 'bun mod version [show | bump patch|minor|beta [--commit]]'

export async function run(args, { log, root }) {
	const { positionals, flags } = parseArgs(args)
	const [action = 'show', kind] = positionals
	if (action === 'show') {
		log.info(await readModVersion(root))
		return 0
	}
	if (action !== 'bump' || !kind) throw new Error(`Usage : ${usage}`)
	const { current, next } = await bump(root, kind, { commit: Boolean(flags.commit) })
	log.info(`${current} -> ${next}${flags.commit ? ` (commit et tag mod-v${next})` : ' (non commité, ajoute --commit)'}`)
	return 0
}
