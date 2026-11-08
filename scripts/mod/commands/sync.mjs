import { parseArgs } from '../args.mjs'
import { PLATFORMS, syncRemote } from '../sync/index.mjs'

export const name = 'sync'
export const summary = 'Mirrors the released JARs on Modrinth and CurseForge (uploads only what is missing)'
export const usage =
	'bun mod sync --remote [--api-url <url>] [--all] [--platform modrinth|curseforge] [--target <id>] [--dry-run]\n' +
	'  --remote    reads the releases from the API index (GET /downloads/index.json); required\n' +
	'  --api-url   API URL (default MOD_API_URL, then https://api.minemories.net)\n' +
	'  --all       every stored version of each target instead of the latest one only\n' +
	'  --platform  restrict to one platform; --target restricts to one target id\n' +
	'  --dry-run   checks what is missing and prints the requests, uploads nothing\n' +
	'  Needs MODRINTH_TOKEN / CURSEFORGE_TOKEN (environment or .env). CURSEFORGE_API_KEY (Core API key, optional)\n' +
	'  lets the tool see files already on CurseForge; without it a local ledger avoids repeated uploads.'

export async function run(args, { config, env, log, root }) {
	const { flags } = parseArgs(args, ['api-url', 'platform', 'target'])
	if (!flags.remote) {
		log('`bun mod sync` needs --remote (the releases come from the API index).')
		return 1
	}
	if (flags.platform && !PLATFORMS.includes(flags.platform)) {
		log(`Unknown platform: ${flags.platform} (expected ${PLATFORMS.join(' or ')}).`)
		return 1
	}
	const results = await syncRemote({
		config,
		env,
		root,
		apiUrl: flags['api-url'],
		all: Boolean(flags.all),
		dryRun: Boolean(flags['dry-run']),
		platforms: flags.platform ? [flags.platform] : PLATFORMS,
		targetIds: flags.target ? [flags.target] : undefined,
		log,
	})
	for (const result of results) {
		log(
			`${result.platform} ${result.targetId} ${result.version}: ${result.status}${result.url ? ` ${result.url}` : ''}${result.message ? ` — ${result.message}` : ''}`
		)
		if (result.request) log(result.request)
	}
	return summarize(results, log)
}

function summarize(results, log) {
	const count = status => results.filter(result => result.status === status).length
	log(`Sync: ${count('present')} already online, ${count('published')} published, ${count('failed')} failed.`)
	return count('failed') > 0 ? 1 : 0
}
