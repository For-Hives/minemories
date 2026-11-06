import { parseArgs } from '../args.mjs'
import { runRelease } from '../release.mjs'

export const name = 'release'
export const summary = 'Pipeline complet : build prod, tests headless, stockage, publication tierce, notification'
export const usage =
	'bun mod release [--skip-tests] [--no-publish] [--dry-run] [--bump patch|minor|beta [--commit]]\n' +
	'  --dry-run  affiche le plan et la présence des modules, sans rien construire ni envoyer'

export async function run(args, { config, env, log, root }) {
	const { flags } = parseArgs(args, ['bump'])
	const result = await runRelease({
		config,
		env,
		root,
		log,
		flags: {
			skipTests: Boolean(flags['skip-tests']),
			noPublish: Boolean(flags['no-publish']),
			dryRun: Boolean(flags['dry-run']),
			bump: flags.bump,
			commit: Boolean(flags.commit),
		},
	})
	return result.exitCode
}
