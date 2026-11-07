// Latest mod release, read from the public GitHub API: the newest `mod-v*` tag (semver order, a release above its
// betas), its commit date, and the commits touching `mod/` since the previous mod tag as short release notes. The
// shape matches `latestRelease` in GET /api/roadmap so Discord and the site always agree.
import { parseSubject } from './changelog.mjs'
import { REPOSITORY, REPOSITORY_URL, SITE_URL } from './discord.mjs'

export const MOD_TAG = /^mod-v(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/
export const NOTES_CAP = 12
const TAG_PAGES = 3
const API_BASE = `https://api.github.com/repos/${REPOSITORY}`
const NEXT_LINK = /<([^>]+)>;\s*rel="next"/
const RELEASE_COMMIT = /^chore\(release\)/i
const SKIP_CI = /\[skip ci\]/i
const NOTE_TYPES = { feat: 'feature', fix: 'fix' }
const NOTE_ORDER = ['feature', 'fix', 'other']

/** { name, version, parts: [major, minor, patch, beta|null] } for a mod tag, or null. */
export function parseModTag(name) {
	const match = MOD_TAG.exec(String(name ?? ''))
	if (!match) return null
	const [, major, minor, patch, beta] = match
	return {
		name: match[0],
		version: match[0].slice('mod-v'.length),
		parts: [Number(major), Number(minor), Number(patch), beta === undefined ? null : Number(beta)],
	}
}

/** Sort comparator, newest first: 0.36.1 > 0.36.1-beta.3 > 0.36.1-beta.1 > 0.36.0. */
export function compareModTags(a, b) {
	for (let index = 0; index < 3; index += 1) {
		if (a.parts[index] !== b.parts[index]) return b.parts[index] - a.parts[index]
	}
	const [betaA, betaB] = [a.parts[3] ?? Number.POSITIVE_INFINITY, b.parts[3] ?? Number.POSITIVE_INFINITY]
	if (betaA === betaB) return 0
	return betaA < betaB ? 1 : -1
}

const time = value => {
	const parsed = Date.parse(value ?? '')
	return Number.isFinite(parsed) ? parsed : 0
}

const subjectOf = commit =>
	String(commit?.commit?.message ?? '')
		.split('\n')[0]
		.trim()

/** Whether a GitHub commit is a release note: in range, not a release, `[skip ci]` or merge commit. */
function isNote(commit, subject, { since, exclude }) {
	if (!subject || commit.sha === exclude) return false
	if (since > 0 && time(commit.commit?.committer?.date) <= since) return false
	if (RELEASE_COMMIT.test(subject) || SKIP_CI.test(subject)) return false
	// Merge commits repeat the work of the commits they merge (the changelog drops them too).
	return (commit.parents?.length ?? 0) <= 1
}

/**
 * Turns GitHub commits (newest first) into release notes: drops release, `[skip ci]` and merge commits, keeps the
 * first line, groups features, then fixes, then everything else, and caps the list at NOTES_CAP (the rest is counted
 * in `more`). `since`/`exclude` bound the range to the previous tag; `newest` keeps only the NOTES_CAP newest commits.
 */
export function buildNotes(commits, { since = 0, exclude = null, newest = false } = {}) {
	let parsed = []
	for (const commit of commits ?? []) {
		const subject = subjectOf(commit)
		if (!isNote(commit, subject, { since, exclude })) continue
		const { type, text, prs } = parseSubject(subject)
		parsed.push({ type: NOTE_TYPES[type] ?? 'other', text, pr: prs[0] || null })
	}
	// Without a previous tag there is no range: only the newest commits are release notes.
	if (newest) parsed = parsed.slice(0, NOTES_CAP)
	const ordered = NOTE_ORDER.flatMap(type => parsed.filter(note => note.type === type))
	return { notes: ordered.slice(0, NOTES_CAP), more: Math.max(0, ordered.length - NOTES_CAP) }
}

function githubGet(fetchImpl, token) {
	const headers = {
		accept: 'application/vnd.github+json',
		'x-github-api-version': '2022-11-28',
		'user-agent': 'minemories-discord-sync',
		...(token ? { authorization: `Bearer ${token}` } : {}),
	}
	return async url => {
		const response = await fetchImpl(url, { headers })
		if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`)
		return { body: await response.json(), link: response.headers?.get?.('link') ?? '' }
	}
}

/** Every `mod-v*` tag ({ name, version, parts, sha }), newest first, reading at most three pages of tags. */
export async function fetchModTags({ fetchImpl = globalThis.fetch, token } = {}) {
	const get = githubGet(fetchImpl, token)
	const tags = []
	let url = `${API_BASE}/tags?per_page=100`
	for (let page = 0; url && page < TAG_PAGES; page += 1) {
		// biome-ignore lint/performance/noAwaitInLoops: pages are sequential (each one names the next).
		const { body, link } = await get(url)
		if (!Array.isArray(body)) throw new Error('GitHub API returned an unexpected body.')
		for (const tag of body) {
			const parsed = parseModTag(tag?.name)
			if (parsed && tag.commit?.sha) tags.push({ ...parsed, sha: tag.commit.sha })
		}
		url = NEXT_LINK.exec(link)?.[1] ?? null
	}
	return tags.toSorted(compareModTags)
}

async function commitDate(get, sha) {
	const { body } = await get(`${API_BASE}/commits/${encodeURIComponent(sha)}`)
	return body?.commit?.committer?.date ?? null
}

/**
 * The latest mod release, or null when there is no mod tag. Throws when GitHub fails: callers decide whether a
 * missing release block is acceptable (the roadmap still posts without it).
 */
export async function fetchLatestRelease({ fetchImpl = globalThis.fetch, token } = {}) {
	const [latest, previous] = await fetchModTags({ fetchImpl, token })
	if (!latest) return null
	const get = githubGet(fetchImpl, token)
	const date = await commitDate(get, latest.sha)
	if (!time(date)) throw new Error('GitHub API returned no date for the latest mod tag.')
	const since = previous ? time(await commitDate(get, previous.sha)) : 0
	const { body } = await get(`${API_BASE}/commits?sha=${encodeURIComponent(latest.sha)}&path=mod&per_page=100`)
	if (!Array.isArray(body)) throw new Error('GitHub API returned an unexpected body.')
	const { notes, more } = buildNotes(body, {
		since,
		exclude: previous?.sha ?? null,
		newest: !previous,
	})
	return {
		version: latest.version,
		tag: latest.name,
		date: new Date(date).toISOString(),
		prerelease: latest.parts[3] !== null,
		notes,
		more,
		downloadUrl: `${SITE_URL}/downloads`,
		changelogUrl: `${SITE_URL}/changelog`,
		compareUrl: previous
			? `${REPOSITORY_URL}/compare/${previous.name}...${latest.name}`
			: `${REPOSITORY_URL}/tree/${latest.name}`,
	}
}
