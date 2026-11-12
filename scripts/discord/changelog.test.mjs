import assert from 'node:assert/strict'
import test from 'node:test'
import {
	buildPushPayload,
	buildReleasePayload,
	formatNote,
	git,
	groupCommits,
	keepCommit,
	parseLog,
	parseSubject,
	parseTag,
	pushCommits,
	releaseEmbed,
	renderGroups,
} from './changelog.mjs'
import { LIMITS, payloadSize } from './discord.mjs'

const BEFORE = 'a'.repeat(40)
const AFTER = 'b'.repeat(40)
const commit = (subject, parents = ['p']) => ({ sha: 'c'.repeat(40), parents, subject })
const log = commits => commits.map(c => `${c.sha}\u001f${c.parents.join(' ')}\u001f${c.subject}\u001e\n`).join('')

test('parseLog reads sha, parents and subject records', () => {
	const parsed = parseLog(`${log([commit('feat: a'), commit('Merge x', ['p', 'q'])])}`)
	assert.equal(parsed.length, 2)
	assert.deepEqual(parsed[1].parents, ['p', 'q'])
	assert.equal(parsed[0].subject, 'feat: a')
	assert.deepEqual(parseLog(''), [])
	assert.deepEqual(parseLog(undefined), [])
	assert.deepEqual(parseLog('x'), [{ sha: 'x', parents: [], subject: '' }])
})

test('keepCommit drops release, skip-ci marker, merge and empty commits', () => {
	assert.equal(keepCommit(commit('chore(release): 0.36.1-beta.1')), false)
	assert.equal(keepCommit(commit('docs: typo [skip ci]')), false)
	assert.equal(keepCommit(commit('feat: merged', ['p', 'q'])), false)
	assert.equal(keepCommit(commit('Merge pull request #1 from x/y')), false)
	assert.equal(keepCommit(commit('')), false)
	assert.equal(keepCommit({ subject: 'fix: no parents field' }), true)
	assert.equal(keepCommit(commit('chore(deps): bump')), true)
})

test('parseSubject reads type, scope, text and pull request numbers', () => {
	assert.deepEqual(parseSubject('feat(web)!: roadmap page (#12)'), {
		type: 'feat',
		scope: 'web',
		text: 'roadmap page',
		prs: [12],
	})
	assert.deepEqual(parseSubject('FIX: crash'), { type: 'fix', scope: null, text: 'crash', prs: [] })
	assert.equal(parseSubject('refactor(api): x').type, 'other')
	assert.deepEqual(parseSubject('Plain subject (#3) (#4)'), {
		type: 'other',
		scope: null,
		text: 'Plain subject',
		prs: [3, 4],
	})
})

test('groupCommits groups by type in a fixed order and links pull requests', () => {
	const groups = groupCommits([
		commit('chore: tidy'),
		commit('fix(mod): leak (#7)'),
		commit('feat: new thing'),
		commit('perf: faster'),
		commit('docs: guide'),
		commit('chore(release): 1.0.0'),
	])
	assert.deepEqual(
		groups.map(group => group.title),
		['Features', 'Fixes', 'Performance', 'Documentation', 'Other']
	)
	assert.equal(groups[1].lines[0], '- mod: leak [#7](https://github.com/For-Hives/minemories/pull/7)')
})

test('subjects are escaped: no mention, link or markdown injection', () => {
	const [group] = groupCommits([commit('feat: @everyone [click](https://evil) **now** <@1> (#9)')])
	const line = group.lines[0]
	assert.ok(line.includes('@​everyone'))
	assert.ok(line.includes('\\[click\\]\\(https://evil\\)'))
	assert.ok(line.includes('\\*\\*now\\*\\*'))
	assert.ok(line.endsWith('[#9](https://github.com/For-Hives/minemories/pull/9)'))
	const long = groupCommits([commit(`fix: ${'x'.repeat(1000)}`)])[0].lines[0]
	assert.ok(long.length < 200)
})

test('renderGroups stays under the description limit and counts hidden changes', () => {
	const commits = Array.from({ length: 200 }, (_, index) => commit(`feat: change number ${index} ${'y'.repeat(120)}`))
	const text = renderGroups(groupCommits(commits))
	assert.ok(text.length <= LIMITS.description)
	assert.match(text, /… and \d+ more$/)
	const hidden = Number(/… and (\d+) more$/.exec(text)[1])
	const shown = text.split('\n').filter(line => line.startsWith('- ')).length
	assert.equal(hidden + shown, 200)
})

test('buildPushPayload posts one embed with compare link and short SHA, or nothing', () => {
	const payload = buildPushPayload({ before: BEFORE, after: AFTER, commits: [commit('feat: one')] })
	assert.deepEqual(payload.allowed_mentions, { parse: [] })
	assert.equal(payload.embeds.length, 1)
	const [embed] = payload.embeds
	assert.equal(embed.title, 'main updated: 1 change')
	assert.equal(embed.url, `https://github.com/For-Hives/minemories/compare/${'a'.repeat(12)}...${'b'.repeat(12)}`)
	assert.equal(embed.footer.text, 'main · bbbbbbb')
	assert.ok(payloadSize(payload) <= LIMITS.total)
	const two = buildPushPayload({ before: BEFORE, after: AFTER, commits: [commit('feat: a'), commit('fix: b')] })
	assert.equal(two.embeds[0].title, 'main updated: 2 changes')
	assert.equal(buildPushPayload({ before: BEFORE, after: AFTER, commits: [commit('chore(release): 1')] }), null)
})

test('parseTag accepts mod release tags only', () => {
	assert.deepEqual(parseTag('mod-v0.36.1-beta.1'), { tag: 'mod-v0.36.1-beta.1', version: '0.36.1-beta.1' })
	assert.deepEqual(parseTag('mod-v1.0.0'), { tag: 'mod-v1.0.0', version: '1.0.0' })
	assert.equal(parseTag('v1.0.0'), null)
	assert.equal(parseTag('mod-v1.0.0;rm -rf'), null)
	assert.equal(parseTag(undefined), null)
})

const RELEASE = {
	version: '0.36.1-beta.1',
	tag: 'mod-v0.36.1-beta.1',
	date: '2026-11-06T08:00:00.000Z',
	prerelease: true,
	notes: [
		{ type: 'feature', text: 'AFK toggle', pr: 14 },
		{ type: 'fix', text: '@everyone [x](http://evil)', pr: null },
		{ type: 'other', text: 'faster export', pr: 13 },
	],
	more: 2,
	source: 'curated',
	downloadUrl: 'https://minemories.xenos.lightin.io/downloads',
	changelogUrl: 'https://minemories.xenos.lightin.io/versions',
	compareUrl: 'https://github.com/For-Hives/minemories/compare/mod-v0.36.0-beta.1...mod-v0.36.1-beta.1',
}

test('formatNote marks the type, escapes the text and links the pull request', () => {
	assert.equal(
		formatNote({ type: 'feature', text: 'AFK toggle', pr: 14 }),
		'- **New:** AFK toggle ([#14](https://github.com/For-Hives/minemories/pull/14))'
	)
	assert.equal(formatNote({ type: 'fix', text: '**b** @here', pr: null }), '- **Fixed:** \\*\\*b\\*\\* @​here')
	assert.equal(formatNote({ type: 'weird', text: 't', pr: -1 }), '- **Changed:** t')
	assert.ok(formatNote({ type: 'other', text: 'x'.repeat(400), pr: null }).length < 300)
})

test('releaseEmbed shows the date as a Discord timestamp, beta, notes, "+N more" and the links', () => {
	const embed = releaseEmbed(RELEASE)
	assert.equal(embed.title, 'Minemories mod 0.36.1-beta.1')
	assert.equal(embed.url, RELEASE.downloadUrl)
	assert.equal(embed.footer.text, 'mod-v0.36.1-beta.1')
	const lines = embed.description.split('\n')
	assert.equal(lines[0], `Released <t:${Date.parse(RELEASE.date) / 1000}:D> · beta`)
	assert.equal(lines[2], '- **New:** AFK toggle ([#14](https://github.com/For-Hives/minemories/pull/14))')
	assert.ok(!embed.description.includes('](http://evil)'))
	assert.equal(lines[5], '+2 more')
	assert.equal(
		lines.at(-1),
		`[Download](${RELEASE.downloadUrl}) · [All changes](${RELEASE.changelogUrl}) · [Compare](${RELEASE.compareUrl})`
	)
	const bare = releaseEmbed({ ...RELEASE, date: 'nope', prerelease: false, notes: [], more: 0 })
	assert.ok(bare.description.startsWith('No mod changes listed.\n\n[Download]('))
	const stable = releaseEmbed({ ...RELEASE, prerelease: false, notes: [], more: 0 })
	assert.ok(stable.description.startsWith('Released <t:'))
	assert.ok(!stable.description.split('\n')[0].includes('beta'))
	const hidden = releaseEmbed({ ...RELEASE, notes: [], more: 3 })
	assert.equal(hidden.description.split('\n')[2], '+3 more')
	const plain = releaseEmbed({ ...RELEASE, notes: RELEASE.notes.slice(0, 1), more: 0 })
	assert.ok(!plain.description.includes('more'))
})

test('releaseEmbed keeps the links and counts notes that do not fit the description', () => {
	const notes = Array.from({ length: 30 }, (_, index) => ({
		type: 'other',
		text: `${index} ${'x'.repeat(270)}`,
		pr: 1,
	}))
	const embed = releaseEmbed({ ...RELEASE, notes, more: 4 })
	assert.ok(embed.description.length <= LIMITS.description)
	assert.ok(embed.description.endsWith(`[Compare](${RELEASE.compareUrl})`))
	const kept = embed.description.split('\n').filter(line => line.startsWith('- ')).length
	assert.ok(kept > 0 && kept < 30)
	assert.ok(embed.description.includes(`+${30 - kept + 4} more`))
})

test('buildReleasePayload posts the release card without mentions', () => {
	const payload = buildReleasePayload(RELEASE)
	assert.deepEqual(payload.allowed_mentions, { parse: [] })
	assert.equal(payload.username, 'Minemories')
	assert.deepEqual(payload.embeds, [releaseEmbed(RELEASE)])
	assert.ok(payloadSize(payload) <= LIMITS.total)
})

test('pushCommits reads the first-parent range and validates SHAs', () => {
	const calls = []
	const exec = args => {
		calls.push(args)
		return log([commit('feat: a')])
	}
	assert.equal(pushCommits({ before: BEFORE, after: AFTER, exec }).length, 1)
	assert.deepEqual(calls[0], ['log', '--first-parent', '--format=%H%x1f%P%x1f%s%x1e', `${BEFORE}..${AFTER}`])
	assert.throws(() => pushCommits({ before: '--output=x', after: AFTER, exec }))
})

test('git runs the real binary and throws on failure', () => {
	assert.match(git(['--version']), /git version/)
	assert.throws(() => git(['definitely-not-a-git-command']), /git definitely-not-a-git-command failed/)
})
