import assert from 'node:assert/strict'
import test from 'node:test'
import {
	buildPushPayload,
	buildReleasePayload,
	git,
	groupCommits,
	keepCommit,
	parseLog,
	parseSubject,
	parseTag,
	pushCommits,
	releaseCommits,
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

test('keepCommit drops release, [skip ci], merge and empty commits', () => {
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

test('buildReleasePayload links downloads and changelog, with or without notes', () => {
	const withNotes = buildReleasePayload({
		tag: 'mod-v1.0.0-beta.2',
		version: '1.0.0-beta.2',
		previousTag: 'mod-v1.0.0-beta.1',
		commits: [commit('fix(mod): crash (#5)')],
	})
	const [embed] = withNotes.embeds
	assert.equal(embed.title, 'Minemories mod 1.0.0-beta.2 released')
	assert.ok(embed.description.includes('https://minemories.xenos.lightin.io/downloads'))
	assert.ok(embed.description.includes('https://minemories.xenos.lightin.io/changelog'))
	assert.ok(embed.description.includes('**Fixes**'))
	assert.equal(embed.footer.text, 'mod-v1.0.0-beta.2 · since mod-v1.0.0-beta.1')
	assert.deepEqual(withNotes.allowed_mentions, { parse: [] })
	const empty = buildReleasePayload({ tag: 'mod-v1.0.0', version: '1.0.0', previousTag: null, commits: [] })
	assert.ok(empty.embeds[0].description.startsWith('No mod changes listed.'))
	assert.equal(empty.embeds[0].footer.text, 'mod-v1.0.0')
	const since = buildReleasePayload({ tag: 'mod-v1.0.1', version: '1.0.1', previousTag: 'mod-v1.0.0', commits: [] })
	assert.ok(since.embeds[0].description.startsWith('No mod changes listed since mod\\-v1.0.0.'))
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

test('releaseCommits searches the previous tag from the parent of the new tag', () => {
	const calls = []
	const exec = args => {
		calls.push(args)
		return args[0] === 'describe' ? 'mod-v1.0.0-beta.1\n' : log([commit('fix: a')])
	}
	const result = releaseCommits({ tag: 'mod-v1.0.0-beta.2', exec })
	assert.equal(result.previousTag, 'mod-v1.0.0-beta.1')
	assert.equal(result.commits.length, 1)
	assert.deepEqual(calls[0], ['describe', '--tags', '--abbrev=0', '--match', 'mod-v*', 'mod-v1.0.0-beta.2^'])
	assert.deepEqual(calls[1].slice(-3), ['mod-v1.0.0-beta.1..mod-v1.0.0-beta.2', '--', 'mod'])
})

test('releaseCommits caps the history when there is no previous tag', () => {
	const calls = []
	const exec = args => {
		calls.push(args)
		if (args[0] === 'describe') throw new Error('No names found')
		return ''
	}
	const result = releaseCommits({ tag: 'mod-v1.0.0', exec })
	assert.equal(result.previousTag, null)
	assert.ok(calls[1].includes('--max-count=50'))
	const blank = releaseCommits({ tag: 'mod-v1.0.0', exec: args => (args[0] === 'describe' ? '\n' : '') })
	assert.equal(blank.previousTag, null)
})

test('git runs the real binary and throws on failure', () => {
	assert.match(git(['--version']), /git version/)
	assert.throws(() => git(['definitely-not-a-git-command']), /git definitely-not-a-git-command failed/)
})
