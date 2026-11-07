import { expect, test } from 'bun:test'
import { roadmapLatestRelease } from '@minemories/api-contract'
import {
	buildNotes,
	compareModTags,
	fetchLatestModRelease,
	fetchModTags,
	type GithubCommit,
	parseModTag,
	parseNote,
} from './mod-release'

const API = 'https://api.github.com/repos/For-Hives/minemories'
const NOW = Date.parse('2026-11-07T12:00:00Z')
const HOUR = 3_600_000
const iso = (time: number) => new Date(time).toISOString()
const sha = (character: string) => character.repeat(40)

function json(body: unknown, headers: Record<string, string> = {}, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

function commit(id: string, message: string, date: string | null = iso(NOW)): GithubCommit {
	return { sha: id, commit: { message, committer: date === null ? null : { date } } }
}

/** Fake GitHub: answers by exact URL and records every request. */
function github(routes: Record<string, () => Response>) {
	const urls: string[] = []
	const fetcher = (url: string) => {
		urls.push(url)
		const route = routes[url]
		return Promise.resolve(route ? route() : json({ message: 'Not Found' }, {}, 404))
	}
	return { urls, fetcher }
}

test('parses mod tags and ignores every other tag', () => {
	expect(parseModTag('mod-v0.36.1-beta.2', sha('a'))).toEqual({
		name: 'mod-v0.36.1-beta.2',
		version: '0.36.1-beta.2',
		parts: [0, 36, 1, 2],
		sha: sha('a'),
	})
	expect(parseModTag('mod-v1.0.0', sha('a'))?.parts).toEqual([1, 0, 0, null])
	for (const name of ['v1.0.0', 'mod-v1.0', 'mod-v1.0.0-rc.1', 'web-v1.0.0', 'mod-v1.0.0-beta.1x'])
		expect(parseModTag(name, sha('a'))).toBeNull()
})

test('sorts tags newest first with a release above its betas', () => {
	const names = [
		'mod-v0.36.0',
		'mod-v0.36.1-beta.1',
		'mod-v0.36.1',
		'mod-v0.36.1-beta.3',
		'mod-v1.0.0-beta.1',
		'mod-v0.37.0',
		'mod-v0.36.10',
	]
	const tags = names.flatMap(name => parseModTag(name, sha('a')) ?? [])
	expect(tags.toSorted(compareModTags).map(tag => tag.version)).toEqual([
		'1.0.0-beta.1',
		'0.37.0',
		'0.36.10',
		'0.36.1',
		'0.36.1-beta.3',
		'0.36.1-beta.1',
		'0.36.0',
	])
	const [release, beta] = [parseModTag('mod-v1.0.0', 'x'), parseModTag('mod-v1.0.0-beta.1', 'y')]
	if (!(release && beta)) throw new Error('fixtures')
	expect(compareModTags(release, release)).toBe(0)
	expect(compareModTags(beta, beta)).toBe(0)
})

test('reads at most three pages of tags by following the Link header', async () => {
	const page = (index: number) => `${API}/tags?per_page=100&page=${index}`
	const next = (index: number) => ({ link: `<${page(index)}>; rel="next"` })
	const { urls, fetcher } = github({
		[`${API}/tags?per_page=100`]: () =>
			json(
				[
					{ name: 'mod-v0.1.0', commit: { sha: sha('1') } },
					{ name: 'web-v9.0.0', commit: { sha: sha('2') } },
					{ name: 'mod-v9.9.9', commit: null },
					{ name: 'mod-v9.9.8' },
				],
				next(2)
			),
		[page(2)]: () => json([{ name: 'mod-v0.3.0-beta.1', commit: { sha: sha('3') } }], next(3)),
		[page(3)]: () => json([{ name: 'mod-v0.2.0', commit: { sha: sha('4') } }], next(4)),
	})
	const tags = await fetchModTags(fetcher, 'token')
	expect(tags.map(tag => [tag.version, tag.sha])).toEqual([
		['0.3.0-beta.1', sha('3')],
		['0.2.0', sha('4')],
		['0.1.0', sha('1')],
	])
	expect(urls).toHaveLength(3)
})

test('stops on a page without a next link and rejects malformed pages', async () => {
	const ok = github({ [`${API}/tags?per_page=100`]: () => json([]) })
	expect(await fetchModTags(ok.fetcher)).toEqual([])
	expect(ok.urls).toHaveLength(1)
	const bad = github({ [`${API}/tags?per_page=100`]: () => json({ message: 'x' }) })
	await expect(fetchModTags(bad.fetcher)).rejects.toThrow()
})

test('turns a commit subject into a typed note without its type, scope or PR references', () => {
	expect(parseNote('feat(mod): faster export (#210)')).toEqual({ type: 'feature', text: 'faster export', pr: 210 })
	expect(parseNote('Fix!: crash on load (#3) (#4)')).toEqual({ type: 'fix', text: 'crash on load', pr: 3 })
	expect(parseNote('perf: smaller meshes')).toEqual({ type: 'other', text: 'smaller meshes', pr: null })
	expect(parseNote('Update the README (#7)')).toEqual({ type: 'other', text: 'Update the README', pr: 7 })
})

test('builds notes since the previous tag: filters, groups features, fixes, then the rest', () => {
	const since = NOW - 10 * HOUR
	const commits = [
		commit(sha('1'), 'chore(release): 0.36.1-beta.1'),
		commit(sha('2'), 'docs(mod): explain AFK [skip ci]'),
		commit(sha('3'), 'fix(mod): textures (#5)\n\nLong body'),
		commit(sha('4'), 'refactor(mod): split exporter'),
		commit(sha('5'), 'feat(mod): pairing (#4)'),
		commit(sha('6'), '   \nbody only'),
		commit(sha('7'), 'feat: undated', null),
		commit(sha('8'), 'feat: at the previous tag', iso(since)),
		commit(sha('9'), 'feat: the previous tag', iso(NOW)),
		{ ...commit(sha('a'), "Merge branch 'worktree-agent'"), parents: [{ sha: sha('b') }, { sha: sha('c') }] },
		{ ...commit(sha('d'), 'perf(mod): single parent'), parents: [{ sha: sha('e') }] },
	]
	expect(buildNotes(commits, { since, exclude: sha('9'), newest: false })).toEqual({
		notes: [
			{ type: 'feature', text: 'pairing', pr: 4 },
			{ type: 'fix', text: 'textures', pr: 5 },
			{ type: 'other', text: 'split exporter', pr: null },
			{ type: 'other', text: 'single parent', pr: null },
		],
		more: 0,
	})
	expect(buildNotes(commits, { since: 0, exclude: null, newest: false }).notes.map(note => note.text)).toEqual([
		'pairing',
		'undated',
		'at the previous tag',
		'the previous tag',
		'textures',
		'split exporter',
		'single parent',
	])
})

test('caps notes at twelve and counts the rest, or keeps only the twelve newest without a previous tag', () => {
	const commits = Array.from({ length: 15 }, (_, index) =>
		commit(String(index), index % 2 ? `fix: f${index}` : `feat: n${index}`)
	)
	const ranged = buildNotes(commits, { since: 0, exclude: null, newest: false })
	expect(ranged.notes).toHaveLength(12)
	expect(ranged.more).toBe(3)
	expect(ranged.notes.map(note => note.type).slice(7, 9)).toEqual(['feature', 'fix'])
	const newest = buildNotes(commits, { since: 0, exclude: null, newest: true })
	expect(newest.more).toBe(0)
	expect(newest.notes.map(note => note.text).toSorted()).toEqual(
		['n0', 'f1', 'n2', 'f3', 'n4', 'f5', 'n6', 'f7', 'n8', 'f9', 'n10', 'f11'].toSorted()
	)
})

const LATEST = sha('a')
const PREVIOUS = sha('b')
function releaseRoutes(tags: unknown[], latestDate: string | null = iso(NOW)) {
	return {
		[`${API}/tags?per_page=100`]: () => json(tags),
		[`${API}/commits/${LATEST}`]: () => json(commit(LATEST, 'chore(release): x', latestDate)),
		[`${API}/commits/${PREVIOUS}`]: () => json(commit(PREVIOUS, 'chore(release): y', iso(NOW - 48 * HOUR))),
		[`${API}/commits?sha=${LATEST}&path=mod&per_page=100`]: () =>
			json([
				commit(LATEST, 'chore(release): 0.36.1'),
				commit(sha('c'), 'fix(mod): AFK timer (#12)', iso(NOW - HOUR)),
				commit(PREVIOUS, 'chore(release): 0.36.1-beta.1', iso(NOW - 48 * HOUR)),
				commit(sha('d'), 'feat(mod): older work', iso(NOW - 72 * HOUR)),
			]),
	}
}

test('fetches the latest release with its date, notes since the previous tag and a compare link', async () => {
	const tags = [
		{ name: 'mod-v0.36.1-beta.1', commit: { sha: PREVIOUS } },
		{ name: 'mod-v0.36.1', commit: { sha: LATEST } },
	]
	const release = await fetchLatestModRelease(github(releaseRoutes(tags)).fetcher)
	expect(roadmapLatestRelease.parse(release)).toEqual({
		version: '0.36.1',
		tag: 'mod-v0.36.1',
		date: iso(NOW),
		prerelease: false,
		notes: [{ type: 'fix', text: 'AFK timer', pr: 12 }],
		more: 0,
		downloadUrl: 'https://minemories.xenos.lightin.io/downloads',
		changelogUrl: 'https://minemories.xenos.lightin.io/changelog',
		compareUrl: 'https://github.com/For-Hives/minemories/compare/mod-v0.36.1-beta.1...mod-v0.36.1',
	})
})

test('without a previous tag, links the tag tree and lists the newest mod commits', async () => {
	const { urls, fetcher } = github(releaseRoutes([{ name: 'mod-v0.36.1-beta.2', commit: { sha: LATEST } }]))
	const release = await fetchLatestModRelease(fetcher)
	expect(release?.prerelease).toBe(true)
	expect(release?.compareUrl).toBe('https://github.com/For-Hives/minemories/tree/mod-v0.36.1-beta.2')
	expect(release?.notes.map(note => note.text)).toEqual(['older work', 'AFK timer'])
	expect(urls).not.toContain(`${API}/commits/${PREVIOUS}`)
})

test('returns null without any mod tag and rejects when GitHub fails or omits the tag date', async () => {
	expect(
		await fetchLatestModRelease(github(releaseRoutes([{ name: 'v1.0.0', commit: { sha: LATEST } }])).fetcher)
	).toBeNull()
	const tags = [{ name: 'mod-v0.36.1', commit: { sha: LATEST } }]
	await expect(fetchLatestModRelease(github(releaseRoutes(tags, null)).fetcher)).rejects.toThrow('no date')
	const routes = releaseRoutes(tags)
	delete (routes as Record<string, unknown>)[`${API}/commits?sha=${LATEST}&path=mod&per_page=100`]
	await expect(fetchLatestModRelease(github(routes).fetcher)).rejects.toThrow('status 404')
})
