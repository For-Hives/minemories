// #changelog posts: one embed per push to `main` (commit subjects grouped by Conventional Commit type) and one per mod
// release tag (`mod-vX.Y.Z-beta.N`): the release card built from `release-info.mjs` (curated English notes first).
import { spawnSync } from 'node:child_process'
import { COLORS, clip, escapeClipped, fitLines, LIMITS, REPOSITORY_URL } from './discord.mjs'

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
const NOTE_MAX = 280
const NOTE_MARKERS = { feature: 'New', fix: 'Fixed', other: 'Changed' }
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

/** Drops release commits, commits carrying the skip-ci marker and merge commits. */
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

/** One Markdown bullet per release note: a marker, the escaped text, then a link to its pull request. */
export function formatNote(note) {
	const marker = NOTE_MARKERS[note.type] ?? NOTE_MARKERS.other
	const pr = Number.isInteger(note.pr) && note.pr > 0 ? ` ([#${note.pr}](${REPOSITORY_URL}/pull/${note.pr}))` : ''
	return `- **${marker}:** ${escapeClipped(note.text, NOTE_MAX)}${pr}`
}

function unixSeconds(iso) {
	const parsed = Date.parse(iso ?? '')
	return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null
}

/**
 * The release card (a `fetchRelease` result): title, release date as a Discord timestamp, beta marker, notes with
 * pull request links, "+N more", then Download, All changes and Compare links.
 */
export function releaseEmbed(release) {
	const lines = (release.notes ?? []).map(formatNote)
	const more = Number(release.more) || 0
	const seconds = unixSeconds(release.date)
	const header = [seconds === null ? null : `Released <t:${seconds}:D>`, release.prerelease ? 'beta' : null]
		.filter(Boolean)
		.join(' · ')
	const top = header ? [header, ''] : []
	const links = `[Download](${release.downloadUrl}) · [All changes](${release.changelogUrl}) · [Compare](${release.compareUrl})`
	// Notes that do not fit Discord's description limit are counted in "+N more" with the ones already left out.
	const body =
		lines.length === 0 && more === 0
			? [...top, 'No mod changes listed.'].join('\n')
			: fitLines([...top, ...lines], LIMITS.description - links.length - 2, dropped =>
					dropped + more > 0 ? `+${dropped + more} more` : ''
				)
	return {
		title: clip(`Minemories mod ${release.version}`, LIMITS.title),
		url: release.downloadUrl,
		description: `${body}\n\n${links}`,
		color: COLORS.release,
		footer: { text: clip(release.tag, 256) },
	}
}

/** The #changelog message for a mod release. */
export function buildReleasePayload(release) {
	return { username: 'Minemories', allowed_mentions: { parse: [] }, embeds: [releaseEmbed(release)] }
}

const LOG_FORMAT = '--format=%H%x1f%P%x1f%s%x1e'

/** Commits of a push, first parent only (one line per merged pull request on `main`). */
export function pushCommits({ before, after, exec = git, cwd }) {
	if (!(isSha(before) && isSha(after))) throw new Error('push mode needs two commit SHAs (--before and --after).')
	return parseLog(exec(['log', '--first-parent', LOG_FORMAT, `${before}..${after}`], { cwd }))
}
