import assert from 'node:assert/strict'
import test from 'node:test'
import {
	buildNotes,
	compareModTags,
	fetchLatestRelease,
	fetchModTags,
	NOTES_CAP,
	parseModTag,
} from './release-info.mjs'

const API = 'https://api.github.com/repos/For-Hives/minemories'
const response = (status, body, headers = {}) => ({
	ok: status >= 200 && status < 300,
	status,
	headers: { get: name => headers[name.toLowerCase()] ?? null },
	json: async () => body,
})
const tag = (name, sha = `sha-${name}`) => ({ name, commit: { sha } })
const commit = (sha, message, date) => ({ sha, commit: { message, committer: { date } } })

/** A fetch answering each GitHub URL from `routes` (exact URL → response). */
function fakeGitHub(routes) {
	const calls = []
	const fetchImpl = (url, init) => {
		calls.push({ url, init })
		const route = routes[url]
		return route ? Promise.resolve(route) : Promise.resolve(response(404, { message: 'Not Found' }))
	}
	return { calls, fetchImpl }
}

test('parseModTag reads releases and betas, rejects everything else', () => {
	assert.deepEqual(parseModTag('mod-v0.36.1-beta.12'), {
		name: 'mod-v0.36.1-beta.12',
		version: '0.36.1-beta.12',
		parts: [0, 36, 1, 12],
	})
	assert.deepEqual(parseModTag('mod-v1.2.3').parts, [1, 2, 3, null])
	for (const name of ['v1.2.3', 'mod-v1.2', 'mod-v1.2.3-rc.1', 'mod-v1.2.3-beta', 'xmod-v1.2.3', undefined]) {
		assert.equal(parseModTag(name), null, String(name))
	}
})

test('compareModTags sorts semver, a release above its betas', () => {
	const names = [
		'mod-v0.36.0',
		'mod-v0.36.1-beta.1',
		'mod-v0.36.1',
		'mod-v0.36.1-beta.10',
		'mod-v0.36.1-beta.3',
		'mod-v1.0.0-beta.1',
		'mod-v0.9.9',
		'mod-v0.36.1-beta.3',
	]
	const sorted = names.map(parseModTag).toSorted(compareModTags)
	assert.deepEqual(
		sorted.map(parsed => parsed.version),
		['1.0.0-beta.1', '0.36.1', '0.36.1-beta.10', '0.36.1-beta.3', '0.36.1-beta.3', '0.36.1-beta.1', '0.36.0', '0.9.9']
	)
})

test('buildNotes filters, groups features then fixes then other, and keeps PR numbers', () => {
	const since = Date.parse('2026-11-01T00:00:00Z')
	const commits = [
		commit('a', 'chore(release): 0.36.1-beta.1 [skip ci]', '2026-11-06T00:00:00Z'),
		commit('b', 'fix(mod): crash on load (#12)\n\nlong body', '2026-11-05T00:00:00Z'),
		commit('c', 'docs(mod): explain [skip ci]', '2026-11-05T00:00:00Z'),
		commit('d', 'perf(mod): faster export (#13)', '2026-11-04T00:00:00Z'),
		commit('e', 'feat(mod): AFK toggle (#14) (#15)', '2026-11-03T00:00:00Z'),
		commit('f', 'Plain subject', '2026-11-02T00:00:00Z'),
		commit('prev', 'feat: previous tag commit', '2026-11-02T00:00:00Z'),
		commit('g', 'feat: same second as the previous tag', '2026-11-01T00:00:00Z'),
		commit('h', 'feat: older', '2026-10-01T00:00:00Z'),
		commit('i', '', '2026-11-05T00:00:00Z'),
		{ ...commit('m', "Merge branch 'x' into y", '2026-11-05T00:00:00Z'), parents: [{ sha: 'p1' }, { sha: 'p2' }] },
		{ sha: 'j' },
	]
	const { notes, more } = buildNotes(commits, { since, exclude: 'prev' })
	assert.equal(more, 0)
	assert.deepEqual(notes, [
		{ type: 'feature', text: 'AFK toggle', pr: 14 },
		{ type: 'fix', text: 'crash on load', pr: 12 },
		{ type: 'other', text: 'faster export', pr: 13 },
		{ type: 'other', text: 'Plain subject', pr: null },
	])
	assert.deepEqual(buildNotes(undefined), { notes: [], more: 0 })
})

test('buildNotes caps at 12 (features first) and counts the rest; newest keeps only the newest commits', () => {
	const commits = [
		...Array.from({ length: 10 }, (_, index) => commit(`x${index}`, `fix: bug ${index}`, '2026-11-05T00:00:00Z')),
		...Array.from({ length: 8 }, (_, index) => commit(`y${index}`, `feat: thing ${index}`, '2026-11-04T00:00:00Z')),
	]
	const capped = buildNotes(commits)
	assert.equal(capped.notes.length, NOTES_CAP)
	assert.equal(capped.more, 6)
	assert.equal(capped.notes.filter(note => note.type === 'feature').length, 8)
	assert.equal(capped.notes[8].text, 'bug 0')
	const newest = buildNotes(commits, { newest: true })
	assert.equal(newest.more, 0)
	assert.deepEqual(
		newest.notes.map(note => note.text),
		['thing 0', 'thing 1', 'bug 0', 'bug 1', 'bug 2', 'bug 3', 'bug 4', 'bug 5', 'bug 6', 'bug 7', 'bug 8', 'bug 9']
	)
})

test('fetchModTags follows up to three pages, keeps mod tags only and sends the token', async () => {
	const next = n => ({ link: `<${API}/tags?per_page=100&page=${n}>; rel="next"` })
	const { calls, fetchImpl } = fakeGitHub({
		[`${API}/tags?per_page=100`]: response(200, [tag('v1.0.0'), tag('mod-v0.35.0-beta.1')], next(2)),
		[`${API}/tags?per_page=100&page=2`]: response(200, [tag('mod-v0.36.1-beta.1'), { name: 'mod-v9.9.9' }], next(3)),
		[`${API}/tags?per_page=100&page=3`]: response(200, [tag('mod-v0.36.0-beta.1')], next(4)),
		[`${API}/tags?per_page=100&page=4`]: response(200, [tag('mod-v99.0.0')]),
	})
	const tags = await fetchModTags({ fetchImpl, token: 'ghs_test' })
	assert.deepEqual(
		tags.map(entry => entry.name),
		['mod-v0.36.1-beta.1', 'mod-v0.36.0-beta.1', 'mod-v0.35.0-beta.1']
	)
	assert.equal(tags[0].sha, 'sha-mod-v0.36.1-beta.1')
	assert.equal(calls.length, 3)
	assert.equal(calls[0].init.headers.authorization, 'Bearer ghs_test')
	const anonymous = fakeGitHub({ [`${API}/tags?per_page=100`]: response(200, []) })
	assert.deepEqual(await fetchModTags({ fetchImpl: anonymous.fetchImpl }), [])
	assert.equal(anonymous.calls[0].init.headers.authorization, undefined)
	await assert.rejects(fetchModTags({ fetchImpl: () => Promise.resolve(response(500, {})) }), /HTTP 500/)
	await assert.rejects(fetchModTags({ fetchImpl: () => Promise.resolve(response(200, {})) }), /unexpected/)
})

test('fetchLatestRelease builds the release from the two newest tags', async () => {
	const { calls, fetchImpl } = fakeGitHub({
		[`${API}/tags?per_page=100`]: response(200, [
			tag('mod-v0.36.0-beta.1', 'old'),
			tag('mod-v0.36.1-beta.1', 'new'),
			tag('mod-v0.35.0-beta.1', 'older'),
		]),
		[`${API}/commits/new`]: response(200, commit('new', 'chore(release): x', '2026-11-06T10:00:00+02:00')),
		[`${API}/commits/old`]: response(200, commit('old', 'chore(release): y', '2026-11-01T00:00:00Z')),
		[`${API}/commits?sha=new&path=mod&per_page=100`]: response(200, [
			commit('n1', 'fix(mod): open the live gallery (#206)', '2026-11-05T00:00:00Z'),
			commit('n2', 'feat(mod): new thing', '2026-11-04T00:00:00Z'),
			commit('old', 'feat(mod): released before', '2026-11-01T00:00:00Z'),
		]),
	})
	const release = await fetchLatestRelease({ fetchImpl })
	assert.deepEqual(release, {
		version: '0.36.1-beta.1',
		tag: 'mod-v0.36.1-beta.1',
		date: '2026-11-06T08:00:00.000Z',
		prerelease: true,
		notes: [
			{ type: 'feature', text: 'new thing', pr: null },
			{ type: 'fix', text: 'open the live gallery', pr: 206 },
		],
		more: 0,
		downloadUrl: 'https://minemories.xenos.lightin.io/downloads',
		changelogUrl: 'https://minemories.xenos.lightin.io/changelog',
		compareUrl: 'https://github.com/For-Hives/minemories/compare/mod-v0.36.0-beta.1...mod-v0.36.1-beta.1',
	})
	assert.equal(calls.length, 4)
})

test('fetchLatestRelease without a previous tag, without any tag, and on GitHub failures', async () => {
	const commits = Array.from({ length: 20 }, (_, index) =>
		commit(`c${index}`, `fix: change ${index}`, '2026-11-05T00:00:00Z')
	)
	const single = fakeGitHub({
		[`${API}/tags?per_page=100`]: response(200, [tag('mod-v1.0.0', 'one')]),
		[`${API}/commits/one`]: response(200, commit('one', 'x', '2026-11-06T00:00:00Z')),
		[`${API}/commits?sha=one&path=mod&per_page=100`]: response(200, commits),
	})
	const release = await fetchLatestRelease({ fetchImpl: single.fetchImpl })
	assert.equal(release.prerelease, false)
	assert.equal(release.compareUrl, 'https://github.com/For-Hives/minemories/tree/mod-v1.0.0')
	assert.equal(release.notes.length, NOTES_CAP)
	assert.equal(release.notes[0].text, 'change 0')
	assert.equal(release.more, 0)

	const none = fakeGitHub({ [`${API}/tags?per_page=100`]: response(200, [tag('v1')]) })
	assert.equal(await fetchLatestRelease({ fetchImpl: none.fetchImpl }), null)

	const noDate = fakeGitHub({
		[`${API}/tags?per_page=100`]: response(200, [tag('mod-v1.0.0', 'one')]),
		[`${API}/commits/one`]: response(200, {}),
	})
	await assert.rejects(fetchLatestRelease({ fetchImpl: noDate.fetchImpl }), /no date/)

	const badList = fakeGitHub({
		[`${API}/tags?per_page=100`]: response(200, [tag('mod-v1.0.0', 'one')]),
		[`${API}/commits/one`]: response(200, commit('one', 'x', '2026-11-06T00:00:00Z')),
		[`${API}/commits?sha=one&path=mod&per_page=100`]: response(200, { message: 'nope' }),
	})
	await assert.rejects(fetchLatestRelease({ fetchImpl: badList.fetchImpl }), /unexpected/)

	const missingCommit = fakeGitHub({
		[`${API}/tags?per_page=100`]: response(200, [tag('mod-v1.0.0', 'one')]),
	})
	await assert.rejects(fetchLatestRelease({ fetchImpl: missingCommit.fetchImpl }), /HTTP 404/)
})
