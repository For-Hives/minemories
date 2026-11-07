// #changelog posts: one embed per push to `main` (commit subjects grouped by Conventional Commit type) and one per mod
// release tag (`mod-vX.Y.Z-beta.N`, commits touching `mod/` since the previous mod tag).
import { spawnSync } from 'node:child_process'
import { COLORS, clip, escapeClipped, escapeMarkdown, fitLines, LIMITS, REPOSITORY_URL, SITE_URL } from './discord.mjs'

export const GROUPS = [
	{ key: 'feat', title: 'Features' },
	{ key: 'fix', title: 'Fixes' },
	{ key: 'perf', title: 'Performance' },
	{ key: 'docs', title: 'Documentation' },
	{ key: 'other', title: 'Other' },
]
const KNOWN_TYPES = new Set(['feat', 'fix', 'perf', 'docs'])
const CONVENTIONAL = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/
const PR_REFERENCE = /\s*\(#(\d+)\)/g
const RELEASE_COMMIT = /^chore\(release\)/i
const SKIP_CI = /\[skip ci\]/i
const MERGE_SUBJECT = /^Merge (?:pull request|branch|remote-tracking branch) /
const SHA = /^[0-9a-f]{7,40}$/i
const ZERO_SHA = /^0+$/
const TAG = /^mod-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)$/
const SUBJECT_MAX = 180
const RELEASE_LIMIT = 50
const LEADING_NEWLINES = /^\n+/
const FIELD = '\u001f'
const RECORD = '\u001e'

/** Runs git with an argument array (no shell). Returns stdout, throws on a non-zero exit. */
export function git(args, { cwd } = {}) {
	const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
	if (result.error) throw result.error
	if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${String(result.stderr).trim()}`)
	return result.stdout
}

export const isZeroSha = sha => ZERO_SHA.test(String(sha ?? ''))
export const isSha = sha => SHA.test(String(sha ?? ''))

/** Parses `git log --format=%H%x1f%P%x1f%s%x1e` output into { sha, parents, subject }. */
export function parseLog(output) {
	return String(output ?? '')
		.split(RECORD)
		.map(record => record.replace(LEADING_NEWLINES, ''))
		.filter(record => record.trim() !== '')
		.map(record => {
			const [sha = '', parents = '', subject = ''] = record.split(FIELD)
			return { sha: sha.trim(), parents: parents.trim().split(' ').filter(Boolean), subject: subject.trim() }
		})
}

/** Drops release commits, `[skip ci]` commits and merge commits. */
export function keepCommit(commit) {
	if (!commit.subject) return false
	if (RELEASE_COMMIT.test(commit.subject) || SKIP_CI.test(commit.subject)) return false
	if ((commit.parents?.length ?? 0) > 1 || MERGE_SUBJECT.test(commit.subject)) return false
	return true
}

/** Splits a subject into its Conventional Commit type, scope, text and the pull requests it references. */
export function parseSubject(subject) {
	const prs = [...String(subject).matchAll(PR_REFERENCE)].map(match => Number(match[1]))
	const bare = String(subject).replace(PR_REFERENCE, '').trim()
	const match = CONVENTIONAL.exec(bare)
	if (!match) return { type: 'other', scope: null, text: bare, prs }
	const type = match[1].toLowerCase()
	return { type: KNOWN_TYPES.has(type) ? type : 'other', scope: match[2] || null, text: match[3].trim(), prs }
}

/** One Markdown bullet: escaped text, then a link per pull request. */
export function formatLine({ scope, text, prs }) {
	const label = escapeClipped(scope ? `${scope}: ${text}` : text, SUBJECT_MAX)
	const links = prs.map(pr => `[#${pr}](${REPOSITORY_URL}/pull/${pr})`)
	return [`- ${label}`, ...links].join(' ')
}

/** Groups kept commits by type, in the order of GROUPS. Empty groups are omitted. */
export function groupCommits(commits) {
	const parsed = commits.filter(keepCommit).map(commit => parseSubject(commit.subject))
	return GROUPS.map(group => ({
		title: group.title,
		lines: parsed.filter(c => c.type === group.key).map(formatLine),
	})).filter(group => group.lines.length > 0)
}

/** Renders grouped commits as a description; drops the last lines (and says so) past `max` characters. */
export function renderGroups(groups, max = LIMITS.description) {
	const lines = groups.flatMap((group, index) => [...(index > 0 ? [''] : []), `**${group.title}**`, ...group.lines])
	return fitLines(lines, max, dropped => {
		const hidden = lines.slice(lines.length - dropped).filter(line => line.startsWith('- ')).length
		return dropped === 0 ? '' : `… and ${hidden} more`
	})
}

/** The embed posted after a push to `main`, or null when nothing is left after filtering. */
export function buildPushPayload({ before, after, commits }) {
	const groups = groupCommits(commits)
	if (groups.length === 0) return null
	const count = groups.reduce((sum, group) => sum + group.lines.length, 0)
	const short = String(after).slice(0, 7)
	const embed = {
		title: clip(`main updated: ${count} ${count === 1 ? 'change' : 'changes'}`, LIMITS.title),
		url: `${REPOSITORY_URL}/compare/${String(before).slice(0, 12)}...${String(after).slice(0, 12)}`,
		description: renderGroups(groups),
		color: COLORS.changelog,
		footer: { text: `main · ${short}` },
		timestamp: new Date().toISOString(),
	}
	return { username: 'Minemories', allowed_mentions: { parse: [] }, embeds: [embed] }
}

export function parseTag(tag) {
	const match = TAG.exec(String(tag ?? ''))
	return match ? { tag: match[0], version: match[1] } : null
}

/** The embed posted for a mod release tag. */
export function buildReleasePayload({ tag, version, previousTag, commits }) {
	const groups = groupCommits(commits)
	const links = `[Download](${SITE_URL}/downloads) · [Changelog](${SITE_URL}/changelog)`
	const since = previousTag ? ` since ${escapeMarkdown(previousTag)}` : ''
	const notes = groups.length > 0 ? renderGroups(groups, LIMITS.description - 200) : `No mod changes listed${since}.`
	const embed = {
		title: clip(`Minemories mod ${version} released`, LIMITS.title),
		url: `${SITE_URL}/downloads`,
		description: clip(`${notes}\n\n${links}`, LIMITS.description),
		color: COLORS.release,
		footer: { text: clip(previousTag ? `${tag} · since ${previousTag}` : tag, 256) },
		timestamp: new Date().toISOString(),
	}
	return { username: 'Minemories', allowed_mentions: { parse: [] }, embeds: [embed] }
}

const LOG_FORMAT = '--format=%H%x1f%P%x1f%s%x1e'

/** Commits of a push, first parent only (one line per merged pull request on `main`). */
export function pushCommits({ before, after, exec = git, cwd }) {
	if (!(isSha(before) && isSha(after))) throw new Error('push mode needs two commit SHAs (--before and --after).')
	return parseLog(exec(['log', '--first-parent', LOG_FORMAT, `${before}..${after}`], { cwd }))
}

/** Commits touching `mod/` since the previous mod tag (the tag itself excluded from the search). */
export function releaseCommits({ tag, exec = git, cwd }) {
	let previousTag = null
	try {
		previousTag = exec(['describe', '--tags', '--abbrev=0', '--match', 'mod-v*', `${tag}^`], { cwd }).trim() || null
	} catch {
		previousTag = null
	}
	const range = previousTag ? [`${previousTag}..${tag}`] : [`--max-count=${RELEASE_LIMIT}`, tag]
	const commits = parseLog(exec(['log', '--no-merges', LOG_FORMAT, ...range, '--', 'mod'], { cwd }))
	return { previousTag, commits }
}
