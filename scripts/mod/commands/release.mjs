import { parseArgs } from '../args.mjs'
import { runRelease } from '../release.mjs'

export const name = 'release'
export const summary = 'Pipeline complet : build prod, tests headless, stockage, publication tierce, notification'
export const usage =
	'bun mod release [--skip-tests] [--no-publish] [--dry-run] [--bump patch|minor|beta [--commit]]\n' +
	'                [--remote [--api-url <url>] [--replace]]\n' +
	'  --dry-run  affiche le plan et la présence des modules, sans rien construire ni envoyer\n' +
	"  --remote   mode PC : envoie les JAR à l'API (PUT /downloads/upload) au lieu d'écrire dans S3 ; exige\n" +
	'             MOD_UPLOAD_TOKEN (environnement ou .env) ; la publication tierce reste côté VPS\n' +
	"  --api-url  URL de l'API (défaut MOD_API_URL, puis https://api.minemories.net)\n" +
	'  --replace  remplace une version déjà publiée avec un autre contenu (sinon refusée)'

export async function run(args, { config, env, log, root }) {
	const { flags } = parseArgs(args, ['bump', 'api-url'])
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
			remote: Boolean(flags.remote),
			apiUrl: flags['api-url'],
			replace: Boolean(flags.replace),
		},
	})
	return result.exitCode
}
