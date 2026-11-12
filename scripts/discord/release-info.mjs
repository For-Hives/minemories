// A mod release, read from the public GitHub API: a `mod-v*` tag (the newest by default, semver order, a release
// above its betas), its commit date and its release notes. Notes come from the curated English file
// `mod/release-notes/<version>.md` on the default branch when it exists, otherwise from the commits touching `mod/`
// since the previous mod tag. The shape matches `latestRelease` in GET /api/roadmap so Discord and the site agree.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseSubject } from './changelog.mjs'
import { REPOSITORY, REPOSITORY_URL, redactSecrets, SITE_URL } from './discord.mjs'

export const MOD_TAG = /^mod-v(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/
export const NOTES_CAP = 12
const TAG_PAGES = 3
const API_BASE = `https://api.github.com/repos/${REPOSITORY}`
const NEXT_LINK = /<([^>]+)>;\s*rel="next"/
const RELEASE_COMMIT = /^chore\(release\)/i
const SKIP_CI = /\[skip ci\]/i
const NOTE_TYPES = { feat: 'feature', fix: 'fix' }
const NOTE_ORDER = ['feature', 'fix', 'other']
/** Raw files of the default branch: curated notes are read from `main` so a file added after tagging still counts. */
export const RELEASE_NOTES_BASE = `https://raw.githubusercontent.com/${REPOSITORY}/main/mod/release-notes`
const CURATED_MAX_CHARS = 64 * 1024
const NOTES_TIMEOUT_MS = 10_000
const CURATED_LINE = /^\s*-\s+(new|fixed|changed):\s*(.*)$/i
// Matched on the right-trimmed note so a long run of spaces cannot make the search quadratic.
const CURATED_PR = /\(#([1-9]\d{0,8})\)$/
const CURATED_TYPES = { new: 'feature', fixed: 'fix', changed: 'other' }
const LINE_BREAK = /\r?\n/

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

/** Whether a GitHub commit is a release note: in range, not a release, skip-ci marker or merge commit. */
function isNote(commit, subject, { since, exclude }) {
	if (!subject || commit.sha === exclude) return false
	if (since > 0 && time(commit.commit?.committer?.date) <= since) return false
	if (RELEASE_COMMIT.test(subject) || SKIP_CI.test(subject)) return false
	// Merge commits repeat the work of the commits they merge (the changelog drops them too).
	return (commit.parents?.length ?? 0) <= 1
}

/**
 * Turns GitHub commits (newest first) into release notes: drops release, skip-ci marker and merge commits, keeps the
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
 * Parses a curated release notes file: one `- New: …`, `- Fixed: …` or `- Changed: …` line per note (marker case
 * ignored), an optional trailing `(#123)` pull request, every other line ignored, the author's order kept. Capped at
 * NOTES_CAP (the rest counted in `more`). Null when the file holds no note. `apps/api/src/mod-release.ts` implements
 * the same rules; `fixtures/curated-notes.json` is checked by both test suites.
 */
export function parseCuratedNotes(markdown) {
	const notes = []
	for (const line of String(markdown ?? '')
		.slice(0, CURATED_MAX_CHARS)
		.split(LINE_BREAK)) {
		const match = CURATED_LINE.exec(line)
		if (!match) continue
		const body = match[2].trimEnd()
		const pr = CURATED_PR.exec(body)
		const text = (pr ? body.slice(0, pr.index) : body).trim()
		if (text) notes.push({ type: CURATED_TYPES[match[1].toLowerCase()], text, pr: pr ? Number(pr[1]) : null })
	}
	if (notes.length === 0) return null
	return { notes: notes.slice(0, NOTES_CAP), more: Math.max(0, notes.length - NOTES_CAP) }
}

export const releaseNotesUrl = version => `${RELEASE_NOTES_BASE}/${version}.md`

async function readLocalNotes(notesDir, version) {
	try {
		return await readFile(join(notesDir, `${version}.md`), 'utf8')
	} catch (error) {
		if (error?.code === 'ENOENT') return null
		throw error
	}
}

async function readRemoteNotes(fetchImpl, version) {
	// A hung connection must not hold the best-effort changelog job: the timeout falls back to commit notes.
	const response = await fetchImpl(releaseNotesUrl(version), {
		headers: { 'user-agent': 'minemories-discord-sync' },
		signal: AbortSignal.timeout(NOTES_TIMEOUT_MS),
	})
	if (response.status === 404) return null
	if (!response.ok) throw new Error(`release notes HTTP ${response.status}`)
	return await response.text()
}

/**
 * The curated notes of `version` ({ notes, more }), or null when there is none. Reads `<notesDir>/<version>.md` when
 * `notesDir` is set, otherwise the raw file on the default branch. A missing file is silent; any other failure is
 * reported through `warn` (secrets redacted) and also returns null, so callers fall back to commit notes.
 */
export async function fetchCuratedNotes({ version, fetchImpl = globalThis.fetch, notesDir, warn, env } = {}) {
	try {
		const text = notesDir ? await readLocalNotes(notesDir, version) : await readRemoteNotes(fetchImpl, version)
		return text === null ? null : parseCuratedNotes(text)
	} catch (error) {
		const reason = redactSecrets(error?.message ?? String(error), env)
		warn?.(`release notes for ${version} unavailable, using commits (${reason}).`)
		return null
	}
}

async function commitNotes(get, release, previous) {
	const since = previous ? time(await commitDate(get, previous.sha)) : 0
	const { body } = await get(`${API_BASE}/commits?sha=${encodeURIComponent(release.sha)}&path=mod&per_page=100`)
	if (!Array.isArray(body)) throw new Error('GitHub API returned an unexpected body.')
	return buildNotes(body, { since, exclude: previous?.sha ?? null, newest: !previous })
}

/**
 * A mod release: `tag` when given (null when GitHub does not list it), otherwise the newest `mod-v*` tag (null when
 * there is none). Its previous release is the next older mod tag. Curated notes win over commit notes (`source`).
 * Throws when the GitHub API fails: callers decide whether a missing release is acceptable.
 */
export async function fetchRelease({ tag, fetchImpl = globalThis.fetch, token, notesDir, warn, env } = {}) {
	const tags = await fetchModTags({ fetchImpl, token })
	const index = tag === undefined ? 0 : tags.findIndex(entry => entry.name === tag)
	const release = tags[index]
	if (!release) return null
	const previous = tags[index + 1] ?? null
	const get = githubGet(fetchImpl, token)
	const date = await commitDate(get, release.sha)
	if (!time(date)) throw new Error('GitHub API returned no date for the mod tag.')
	const curated = await fetchCuratedNotes({ version: release.version, fetchImpl, notesDir, warn, env })
	const { notes, more } = curated ?? (await commitNotes(get, release, previous))
	return {
		version: release.version,
		tag: release.name,
		date: new Date(date).toISOString(),
		prerelease: release.parts[3] !== null,
		notes,
		more,
		source: curated ? 'curated' : 'commits',
		downloadUrl: `${SITE_URL}/downloads`,
		changelogUrl: `${SITE_URL}/versions`,
		compareUrl: previous
			? `${REPOSITORY_URL}/compare/${previous.name}...${release.name}`
			: `${REPOSITORY_URL}/tree/${release.name}`,
	}
}

/** The latest mod release, or null when there is no mod tag. Throws when GitHub fails. */
export function fetchLatestRelease(options = {}) {
	return fetchRelease({ ...options, tag: undefined })
}
