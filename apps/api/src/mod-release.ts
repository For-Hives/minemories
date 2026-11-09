import {
	ROADMAP_RELEASE_NOTES_LIMIT,
	type RoadmapLatestRelease,
	type RoadmapReleaseNote,
	type RoadmapReleaseNoteType,
} from '@minemories/api-contract'
import * as z from 'zod'
import { GITHUB_API, GITHUB_REPOSITORY, GITHUB_URL, type GithubFetch, githubGet } from './github'

// Mirrors scripts/discord/release-info.mjs so the Discord #changelog release card and /roadmap show the same release.
export const MOD_TAG = /^mod-v(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/
export const SITE_URL = 'https://minemories.xenos.lightin.io'
const TAG_PAGES = 3
const RELEASE_COMMIT = /^chore\(release\)/i
const SKIP_CI = /\[skip ci\]/i
/** Curated English notes live on the default branch, so a file added right after tagging still counts. */
export const RELEASE_NOTES_BASE = `https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/main/mod/release-notes`
const NOTES_TIMEOUT_MS = 10_000
const CURATED_MAX_CHARS = 64 * 1024
const CURATED_LINE = /^\s*-\s+(new|fixed|changed):\s*(.*)$/i
// Matched on the right-trimmed note so a long run of spaces cannot make the search quadratic.
const CURATED_PR = /\(#([1-9]\d{0,8})\)$/
const CURATED_TYPES: Readonly<Record<string, RoadmapReleaseNoteType>> = {
	new: 'feature',
	fixed: 'fix',
	changed: 'other',
}
const LINE_BREAK = /\r?\n/
const PR_REFERENCE = /\s*\(#(\d+)\)/g
const CONVENTIONAL = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/
const NOTE_TYPES: Readonly<Record<string, RoadmapReleaseNoteType>> = { feat: 'feature', fix: 'fix' }
const NOTE_ORDER: readonly RoadmapReleaseNoteType[] = ['feature', 'fix', 'other']

const githubTags = z.array(z.object({ name: z.string(), commit: z.object({ sha: z.string() }).nullish() }))
const githubCommit = z.object({
	sha: z.string(),
	commit: z.object({ message: z.string(), committer: z.object({ date: z.string().nullish() }).nullish() }),
	parents: z.array(z.object({ sha: z.string() })).nullish(),
})
const githubCommits = z.array(githubCommit)
export type GithubCommit = z.infer<typeof githubCommit>

export interface ModTag {
	name: string
	version: string
	/** major, minor, patch, beta number (null for a release). */
	parts: readonly [number, number, number, number | null]
	sha: string
}

/** Parses `mod-v1.2.3` or `mod-v1.2.3-beta.4`; null for any other tag. */
export function parseModTag(name: string, sha: string): ModTag | null {
	const match = MOD_TAG.exec(name)
	if (!match) return null
	const [, major, minor, patch, beta] = match
	return {
		name,
		version: name.slice('mod-v'.length),
		parts: [Number(major), Number(minor), Number(patch), beta === undefined ? null : Number(beta)],
		sha,
	}
}

/** Sort comparator, newest first: 0.36.1 > 0.36.1-beta.3 > 0.36.1-beta.1 > 0.36.0. */
export function compareModTags(left: ModTag, right: ModTag): number {
	for (let index = 0; index < 3; index++) {
		const difference = (right.parts[index] as number) - (left.parts[index] as number)
		if (difference !== 0) return difference
	}
	return (right.parts[3] ?? Number.POSITIVE_INFINITY) - (left.parts[3] ?? Number.POSITIVE_INFINITY) || 0
}

/** Every `mod-v*` tag, newest first, reading at most three pages of 100 tags. */
export async function fetchModTags(fetcher: GithubFetch, token?: string): Promise<ModTag[]> {
	const tags: ModTag[] = []
	let url: string | null = `${GITHUB_API}/tags?per_page=100`
	for (let page = 0; url && page < TAG_PAGES; page++) {
		// biome-ignore lint/performance/noAwaitInLoops: each page names the next one in its Link header.
		const response: { body: unknown; next: string | null } = await githubGet(fetcher, url, token)
		for (const tag of githubTags.parse(response.body)) {
			const parsed = tag.commit ? parseModTag(tag.name, tag.commit.sha) : null
			if (parsed) tags.push(parsed)
		}
		url = response.next
	}
	return tags.toSorted(compareModTags)
}

function time(value: string | null | undefined): number {
	const parsed = Date.parse(value ?? '')
	return Number.isFinite(parsed) ? parsed : 0
}

/** Splits a subject into a note: Conventional Commit group, text without type/scope/PR references, first PR. */
export function parseNote(subject: string): RoadmapReleaseNote {
	const prs = [...subject.matchAll(PR_REFERENCE)].map(match => Number(match[1]))
	const bare = subject.replace(PR_REFERENCE, '').trim()
	const match = CONVENTIONAL.exec(bare)
	const type = match ? (NOTE_TYPES[(match[1] as string).toLowerCase()] ?? 'other') : 'other'
	return { type, text: match ? (match[3] as string).trim() : bare, pr: prs[0] || null }
}

export interface NotesRange {
	/** Commits at or before this time (the previous tag's commit date) are excluded; 0 disables the bound. */
	since: number
	/** The previous tag's commit, always excluded. */
	exclude: string | null
	/** Without a previous tag there is no range: only the newest commits become notes. */
	newest: boolean
}

/**
 * Turns GitHub commits (newest first) into release notes: drops release, skip-ci marker and merge commits, keeps the
 * first line, groups features, then fixes, then everything else, and caps the list (the rest is counted in `more`).
 */
export function buildNotes(
	commits: readonly GithubCommit[],
	range: NotesRange
): { notes: RoadmapReleaseNote[]; more: number } {
	let parsed: RoadmapReleaseNote[] = []
	for (const commit of commits) {
		const subject = (commit.commit.message.split('\n')[0] as string).trim()
		if (!subject || commit.sha === range.exclude) continue
		if (range.since > 0 && time(commit.commit.committer?.date) <= range.since) continue
		if (RELEASE_COMMIT.test(subject) || SKIP_CI.test(subject)) continue
		// Merge commits repeat the work of the commits they merge (the Discord script drops them too).
		if ((commit.parents?.length ?? 0) > 1) continue
		parsed.push(parseNote(subject))
	}
	if (range.newest) parsed = parsed.slice(0, ROADMAP_RELEASE_NOTES_LIMIT)
	const ordered = NOTE_ORDER.flatMap(type => parsed.filter(note => note.type === type))
	return {
		notes: ordered.slice(0, ROADMAP_RELEASE_NOTES_LIMIT),
		more: Math.max(0, ordered.length - ROADMAP_RELEASE_NOTES_LIMIT),
	}
}

export interface ReleaseNotes {
	notes: RoadmapReleaseNote[]
	more: number
}

/**
 * Parses a curated release notes file: one `- New: …`, `- Fixed: …` or `- Changed: …` line per note (marker case
 * ignored), an optional trailing `(#123)` pull request, every other line ignored, the author's order kept, capped like
 * commit notes. Null when the file holds no note. Same rules as scripts/discord/release-info.mjs, checked by both test
 * suites against scripts/discord/fixtures/curated-notes.json.
 */
export function parseCuratedNotes(markdown: string): ReleaseNotes | null {
	const notes: RoadmapReleaseNote[] = []
	for (const line of markdown.slice(0, CURATED_MAX_CHARS).split(LINE_BREAK)) {
		const match = CURATED_LINE.exec(line)
		if (!match) continue
		const body = (match[2] as string).trimEnd()
		const pr = CURATED_PR.exec(body)
		const text = (pr ? body.slice(0, pr.index) : body).trim()
		const type = CURATED_TYPES[(match[1] as string).toLowerCase()] as RoadmapReleaseNoteType
		if (text) notes.push({ type, text, pr: pr ? Number(pr[1]) : null })
	}
	if (notes.length === 0) return null
	return {
		notes: notes.slice(0, ROADMAP_RELEASE_NOTES_LIMIT),
		more: Math.max(0, notes.length - ROADMAP_RELEASE_NOTES_LIMIT),
	}
}

export const releaseNotesUrl = (version: string) => `${RELEASE_NOTES_BASE}/${version}.md`

/**
 * The curated notes of `version` from the default branch, or null: a missing file (404) is silent, any other failure
 * calls `onError` (the caller logs an event name, never the error) and also falls back to commit notes.
 */
export async function fetchCuratedNotes(
	fetcher: GithubFetch,
	version: string,
	onError: () => void = () => undefined
): Promise<ReleaseNotes | null> {
	try {
		const response = await fetcher(releaseNotesUrl(version), {
			headers: { 'User-Agent': 'minemories-api' },
			signal: AbortSignal.timeout(NOTES_TIMEOUT_MS),
		})
		if (response.status === 404) return null
		if (!response.ok) throw new Error(`release notes request failed with status ${response.status}`)
		return parseCuratedNotes(await response.text())
	} catch {
		onError()
		return null
	}
}

async function commitDate(fetcher: GithubFetch, sha: string, token?: string): Promise<number> {
	const { body } = await githubGet(fetcher, `${GITHUB_API}/commits/${encodeURIComponent(sha)}`, token)
	return time(githubCommit.parse(body).commit.committer?.date)
}

async function commitNotes(
	fetcher: GithubFetch,
	latest: ModTag,
	previous: ModTag | undefined,
	token?: string
): Promise<ReleaseNotes> {
	const commitsUrl = `${GITHUB_API}/commits?sha=${encodeURIComponent(latest.sha)}&path=mod&per_page=100`
	const [since, commits] = await Promise.all([
		previous ? commitDate(fetcher, previous.sha, token) : 0,
		githubGet(fetcher, commitsUrl, token).then(({ body }) => githubCommits.parse(body)),
	])
	return buildNotes(commits, { since, exclude: previous?.sha ?? null, newest: !previous })
}

/**
 * The latest mod release, or null when there is no mod tag. Rejects when GitHub fails: the roadmap keeps its last
 * good release instead.
 */
export async function fetchLatestModRelease(
	fetcher: GithubFetch,
	token?: string,
	onNotesError?: () => void
): Promise<RoadmapLatestRelease | null> {
	const [latest, previous] = await fetchModTags(fetcher, token)
	if (!latest) return null
	const [date, curated] = await Promise.all([
		commitDate(fetcher, latest.sha, token),
		fetchCuratedNotes(fetcher, latest.version, onNotesError),
	])
	if (!date) throw new Error('GitHub returned no date for the latest mod tag')
	// The commit history is only read when there is no curated file (60 GitHub requests per hour without a token).
	const { notes, more } = curated ?? (await commitNotes(fetcher, latest, previous, token))
	return {
		version: latest.version,
		tag: latest.name,
		date: new Date(date).toISOString(),
		prerelease: latest.parts[3] !== null,
		notes,
		more,
		source: curated ? 'curated' : 'commits',
		downloadUrl: `${SITE_URL}/downloads`,
		changelogUrl: `${SITE_URL}/versions`,
		compareUrl: previous
			? `${GITHUB_URL}/compare/${previous.name}...${latest.name}`
			: `${GITHUB_URL}/tree/${latest.name}`,
	}
}
