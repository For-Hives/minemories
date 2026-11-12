import { parseArgs } from '../args.mjs'
import { runRelease } from '../release.mjs'

export const name = 'release'
export const summary = 'Full pipeline: prod build, headless tests, storage, third-party publishing, notification'
export const usage =
	'bun mod release [--skip-tests] [--no-publish] [--dry-run] [--bump patch|minor|beta [--commit]]\n' +
	'                [--remote [--api-url <url>] [--replace]]\n' +
	'  --dry-run  shows the plan and which modules are present, without building or uploading anything\n' +
	'  --remote   PC mode: uploads the JARs to the API (PUT /downloads/upload) instead of writing to S3; requires\n' +
	'             API_TOKEN (environment or .env); third-party publishing stays on the VPS\n' +
	'  --api-url  API URL (default MOD_API_URL, then https://api.minemories.net)\n' +
	'  --replace  replaces an already published version with different content (refused otherwise)'

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
