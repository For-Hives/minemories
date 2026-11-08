// Discord sync entry point, run by .github/workflows/discord.yml:
//   node scripts/discord/cli.mjs changelog push --before <sha> --after <sha> [--dry-run]
//   node scripts/discord/cli.mjs changelog release --tag mod-vX.Y.Z-beta.N [--notes-dir <dir>] [--dry-run]
//   node scripts/discord/cli.mjs roadmap [--dry-run]
// The webhook comes from DISCORD_WEBHOOK_URL and is never printed. Changelog posts are best effort (exit 0 even when
// Discord or GitHub fails); the roadmap exits 1 on failure so the workflow shows it. A release reads its curated notes
// from `--notes-dir` (or DISCORD_RELEASE_NOTES_DIR) when set, otherwise from the default branch on GitHub.
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildPushPayload, buildReleasePayload, isSha, isZeroSha, parseTag, pushCommits } from './changelog.mjs'
import { redactSecrets, resolveWebhook, sendWebhook } from './discord.mjs'
import { fetchRelease } from './release-info.mjs'
import { syncRoadmap } from './roadmap.mjs'

export const USAGE = [
	'Usage:',
	'  node scripts/discord/cli.mjs changelog push --before <sha> --after <sha> [--dry-run]',
	'  node scripts/discord/cli.mjs changelog release --tag mod-vX.Y.Z-beta.N [--notes-dir <dir>] [--dry-run]',
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

/** The release card of `--tag`, read from GitHub like the site's latest release (curated notes first). */
async function releasePayload(flags, deps, env, warn) {
	const release = await fetchRelease({
		tag: parseTag(flags.tag).tag,
		fetchImpl: deps.fetch ?? globalThis.fetch,
		token: env.GITHUB_TOKEN,
		notesDir: flags['notes-dir'] || env.DISCORD_RELEASE_NOTES_DIR || undefined,
		warn: text => warn(`changelog: ${text}`),
		env,
	})
	if (!release) return { skip: `${flags.tag} is not a mod release tag listed on GitHub: nothing to post.` }
	return { payload: buildReleasePayload(release) }
}

function changelogPayload(mode, flags, deps, env, warn) {
	if (mode === 'release') return releasePayload(flags, deps, env, warn)
	if (isZeroSha(flags.before)) return { skip: 'new branch (no previous commit): nothing to post.' }
	const commits = pushCommits({ before: flags.before, after: flags.after, exec: deps.exec, cwd: deps.cwd })
	const payload = buildPushPayload({ before: flags.before, after: flags.after, commits })
	return payload ? { payload } : { skip: 'only release or skipped commits: nothing to post.' }
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
		const { payload, skip } = await changelogPayload(mode, flags, options, env, warn)
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
