// Discord sync entry point, run by .github/workflows/discord.yml:
//   node scripts/discord/cli.mjs changelog push --before <sha> --after <sha> [--dry-run]
//   node scripts/discord/cli.mjs changelog release --tag mod-vX.Y.Z-beta.N [--dry-run]
//   node scripts/discord/cli.mjs roadmap [--dry-run]
// The webhook comes from DISCORD_WEBHOOK_URL and is never printed. Changelog posts are best effort (exit 0 even when
// Discord fails); the roadmap exits 1 on failure so the workflow shows it.
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
	buildPushPayload,
	buildReleasePayload,
	isSha,
	isZeroSha,
	parseTag,
	pushCommits,
	releaseCommits,
} from './changelog.mjs'
import { redactSecrets, resolveWebhook, sendWebhook } from './discord.mjs'
import { syncRoadmap } from './roadmap.mjs'

export const USAGE = [
	'Usage:',
	'  node scripts/discord/cli.mjs changelog push --before <sha> --after <sha> [--dry-run]',
	'  node scripts/discord/cli.mjs changelog release --tag mod-vX.Y.Z-beta.N [--dry-run]',
	'  node scripts/discord/cli.mjs roadmap [--dry-run]',
].join('\n')

/** Splits argv into positionals and `--name value` / `--flag` options. */
export function parseArgs(argv) {
	const positionals = []
	const flags = {}
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (!arg.startsWith('--')) {
			positionals.push(arg)
			continue
		}
		const name = arg.slice(2)
		if (name === 'dry-run') flags.dryRun = true
		else {
			flags[name] = argv[index + 1]
			index += 1
		}
	}
	return { positionals, flags }
}

/** Push needs two SHAs (a zero `before` means a new branch, skipped later); release needs a mod-v* tag. */
export function validArguments(mode, flags) {
	if (mode === 'push') return (isZeroSha(flags.before) || isSha(flags.before)) && isSha(flags.after)
	if (mode === 'release') return parseTag(flags.tag) !== null
	return false
}

function changelogPayload(mode, flags, deps) {
	if (mode === 'push') {
		if (isZeroSha(flags.before)) return { skip: 'new branch (no previous commit): nothing to post.' }
		const commits = pushCommits({ before: flags.before, after: flags.after, exec: deps.exec, cwd: deps.cwd })
		const payload = buildPushPayload({ before: flags.before, after: flags.after, commits })
		return payload ? { payload } : { skip: 'only release or skipped commits: nothing to post.' }
	}
	const parsed = parseTag(flags.tag)
	const { previousTag, commits } = releaseCommits({ tag: parsed.tag, exec: deps.exec, cwd: deps.cwd })
	return { payload: buildReleasePayload({ ...parsed, previousTag, commits }) }
}

/** Posts a changelog embed. Best effort: always resolves to 0 once the arguments are valid. */
export async function postChangelog(mode, flags, options = {}) {
	const env = options.env ?? process.env
	const out = options.out ?? (text => console.log(text))
	const warn = options.warn ?? (text => console.error(text))
	if (!validArguments(mode, flags)) {
		warn(USAGE)
		return 2
	}
	try {
		const { payload, skip } = changelogPayload(mode, flags, options)
		if (skip) {
			warn(`changelog: ${skip}`)
			return 0
		}
		if (flags.dryRun) {
			out(JSON.stringify(payload, null, '\t'))
			return 0
		}
		const webhook = resolveWebhook(env)
		if (!webhook) {
			warn('changelog: DISCORD_WEBHOOK_URL is not set or not a webhook, nothing sent.')
			return 0
		}
		const result = await sendWebhook(webhook, payload, {
			fetchImpl: options.fetch,
			sleep: options.sleep,
			env,
		})
		warn(result.ok ? 'changelog: posted.' : `changelog: Discord delivery abandoned (${result.reason}).`)
	} catch (error) {
		warn(`changelog: ${redactSecrets(error?.message ?? String(error), env)}`)
	}
	return 0
}

/** Runs the command line and resolves to the process exit code. `options` injects env, fetch, sleep, exec and output. */
export function main(argv, options = {}) {
	const { positionals, flags } = parseArgs(argv)
	const [command, mode] = positionals
	if (command === 'changelog') return postChangelog(mode, flags, options)
	if (command === 'roadmap') return syncRoadmap({ ...options, dryRun: flags.dryRun })
	;(options.warn ?? (text => console.error(text)))(USAGE)
	return Promise.resolve(2)
}

function isEntryPoint() {
	try {
		return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url))
	} catch {
		return false
	}
}

if (isEntryPoint()) process.exitCode = await main(process.argv.slice(2))
