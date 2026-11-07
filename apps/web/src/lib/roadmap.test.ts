import { expect, test } from 'vitest'
import {
	parseLatestRelease,
	parseReleaseNote,
	parseRoadmap,
	parseRoadmapItem,
	pullRequestUrl,
	type RoadmapItem,
	releaseNoteCap,
	roadmapColumnCap,
	roadmapItemDate,
} from './roadmap'

const issue = (number: number, extra: Record<string, unknown> = {}) => ({
	number,
	title: `Issue ${number}`,
	url: `https://github.com/For-Hives/minemories/issues/${number}`,
	areas: ['mod'],
	updatedAt: '2026-11-01T10:00:00Z',
	closedAt: null,
	...extra,
})
const board = (columns: Record<string, unknown> = {}) => ({
	updatedAt: '2026-11-07T09:00:00Z',
	columns: {
		inProgress: { items: [issue(1)], more: 0 },
		planned: { items: [], more: 0 },
		done: { items: [], more: 0 },
		...columns,
	},
})

test('keeps a valid issue, trimming its title, deduplicating known areas and ignoring unknown labels', () => {
	expect(parseRoadmapItem(issue(7, { title: '  Ship it  ', areas: ['api', 'bug', 'api', 'front', 3] }))).toEqual({
		number: 7,
		title: 'Ship it',
		url: 'https://github.com/For-Hives/minemories/issues/7',
		areas: ['api', 'front'],
		updatedAt: '2026-11-01T10:00:00Z',
		closedAt: null,
	})
	expect(parseRoadmapItem(issue(8, { areas: 'mod', closedAt: undefined }))).toMatchObject({ areas: [], closedAt: null })
	expect(parseRoadmapItem(issue(9, { closedAt: '2026-11-02T10:00:00Z' }))?.closedAt).toBe('2026-11-02T10:00:00Z')
})

test('links only ever point at the repository issue, whatever URL the response carries', () => {
	for (const url of ['javascript:alert(1)', 'https://evil.example/issues/5', undefined, 5])
		expect(parseRoadmapItem(issue(5, { url }))?.url).toBe('https://github.com/For-Hives/minemories/issues/5')
})

test('drops issues with a missing or unusable field', () => {
	for (const value of [
		null,
		'issue',
		issue(0),
		issue(-1),
		issue(1.5),
		{ ...issue(2), number: '2' },
		issue(3, { title: 42 }),
		issue(4, { title: '   ' }),
		issue(5, { updatedAt: 'yesterday' }),
		issue(6, { updatedAt: undefined }),
		issue(7, { closedAt: 'never' }),
		issue(8, { closedAt: 0 }),
	])
		expect(parseRoadmapItem(value)).toBeNull()
})

test('parses the three columns, keeping valid cards in the API order and counting the cut ones as more', () => {
	const many = Array.from({ length: roadmapColumnCap + 3 }, (_, index) => issue(index + 1))
	const roadmap = parseRoadmap(
		board({
			planned: { items: [issue(10), { broken: true }, issue(11)], more: 4 },
			done: { items: many, more: -2 },
		})
	)
	expect(roadmap.updatedAt).toBe('2026-11-07T09:00:00Z')
	expect(roadmap.columns.inProgress).toEqual({ items: [parseRoadmapItem(issue(1))], more: 0 })
	expect(roadmap.columns.planned.items.map(item => item.number)).toEqual([10, 11])
	expect(roadmap.columns.planned.more).toBe(4)
	expect(roadmap.columns.done.items).toHaveLength(roadmapColumnCap)
	expect(roadmap.columns.done.more).toBe(3)
})

test('rejects a response that is not a roadmap', () => {
	for (const value of [
		null,
		[],
		{ ...board(), updatedAt: 'soon' },
		{ updatedAt: '2026-11-07T09:00:00Z' },
		board({ done: undefined }),
		board({ planned: { items: 'none', more: 0 } }),
	])
		expect(() => parseRoadmap(value)).toThrow()
})

test('done cards show their closing date, other cards their last activity', () => {
	const closed = parseRoadmapItem(issue(1, { closedAt: '2026-11-03T10:00:00Z' })) as RoadmapItem
	const open = parseRoadmapItem(issue(2)) as RoadmapItem
	expect(roadmapItemDate(closed, 'done')).toBe('2026-11-03T10:00:00Z')
	expect(roadmapItemDate(closed, 'planned')).toBe('2026-11-01T10:00:00Z')
	expect(roadmapItemDate(open, 'done')).toBe('2026-11-01T10:00:00Z')
	expect(roadmapItemDate(open, 'inProgress')).toBe('2026-11-01T10:00:00Z')
})

const release = (extra: Record<string, unknown> = {}) => ({
	version: '0.36.1-beta.1',
	tag: 'mod-v0.36.1-beta.1',
	date: '2026-11-06T18:00:00Z',
	prerelease: true,
	notes: [{ type: 'feature', text: 'AFK captures', pr: 210 }],
	more: 0,
	downloadUrl: 'https://minemories.xenos.lightin.io/downloads',
	changelogUrl: 'https://minemories.xenos.lightin.io/changelog',
	compareUrl: 'https://github.com/For-Hives/minemories/compare/mod-v0.36.0...mod-v0.36.1-beta.1',
	...extra,
})

test('the latest release is optional: a board without it, or with an unusable one, still parses', () => {
	expect(parseRoadmap(board()).latestRelease).toBeNull()
	expect(parseRoadmap({ ...board(), latestRelease: null }).latestRelease).toBeNull()
	expect(parseRoadmap({ ...board(), latestRelease: { tag: 'v1' } }).latestRelease).toBeNull()
	expect(parseRoadmap({ ...board(), latestRelease: release() }).latestRelease).toEqual({
		version: '0.36.1-beta.1',
		tag: 'mod-v0.36.1-beta.1',
		date: '2026-11-06T18:00:00Z',
		prerelease: true,
		notes: [{ type: 'feature', text: 'AFK captures', pr: 210 }],
		more: 0,
		compareUrl: 'https://github.com/For-Hives/minemories/compare/mod-v0.36.0...mod-v0.36.1-beta.1',
	})
})

test('rejects a latest release whose tag, version or date is unusable', () => {
	for (const value of [
		null,
		'mod-v1.0.0',
		release({ tag: 'v0.36.1' }),
		release({ tag: 'mod-v0.36' }),
		release({ tag: 'mod-v0.36.1-rc.1' }),
		release({ tag: 42 }),
		release({ version: '0.36.0' }),
		release({ date: 'today' }),
		release({ date: undefined }),
	])
		expect(parseLatestRelease(value)).toBeNull()
	expect(parseLatestRelease(release({ version: undefined }))?.version).toBe('0.36.1-beta.1')
})

test('a missing prerelease flag is derived from the version', () => {
	expect(parseLatestRelease(release({ prerelease: undefined }))?.prerelease).toBe(true)
	expect(parseLatestRelease(release({ version: '0.37.0', tag: 'mod-v0.37.0', prerelease: 'no' }))?.prerelease).toBe(
		false
	)
	expect(parseLatestRelease(release({ prerelease: false }))?.prerelease).toBe(false)
})

test('keeps usable notes, trims them, counts the cut ones as more and treats unknown types as other', () => {
	expect(parseReleaseNote({ type: 'fix', text: '  Fix leaves  ', pr: null })).toEqual({
		type: 'fix',
		text: 'Fix leaves',
		pr: null,
	})
	expect(parseReleaseNote({ type: 'perf', text: 'Faster', pr: 0 })).toEqual({ type: 'other', text: 'Faster', pr: null })
	expect(parseReleaseNote({ type: 'fix', text: 'Typo', pr: '12' })?.pr).toBeNull()
	for (const value of [null, 'note', { type: 'fix' }, { type: 'fix', text: '   ' }, { text: 3 }])
		expect(parseReleaseNote(value)).toBeNull()
	const notes = Array.from({ length: releaseNoteCap + 2 }, (_, index) => ({
		type: 'fix',
		text: `Fix ${index}`,
		pr: index + 1,
	}))
	const parsed = parseLatestRelease(release({ notes: [...notes, { broken: true }], more: 3 }))
	expect(parsed?.notes).toHaveLength(releaseNoteCap)
	expect(parsed?.more).toBe(5)
	expect(parseLatestRelease(release({ notes: 'none', more: -1 }))).toMatchObject({ notes: [], more: 0 })
})

test('the compare link only ever points at this repository, falling back to the tag tree', () => {
	const tree = 'https://github.com/For-Hives/minemories/tree/mod-v0.36.1-beta.1'
	expect(parseLatestRelease(release({ compareUrl: tree }))?.compareUrl).toBe(tree)
	for (const compareUrl of [
		undefined,
		'javascript:alert(1)',
		'https://evil.example/For-Hives/minemories/compare/mod-v1.0.0...mod-v1.0.1',
		'https://github.com/For-Hives/minemories/compare/main...evil',
		'https://github.com/For-Hives/minemories/tree/mod-v1.0.0?x=<script>',
	])
		expect(parseLatestRelease(release({ compareUrl }))?.compareUrl).toBe(tree)
	expect(pullRequestUrl(210)).toBe('https://github.com/For-Hives/minemories/pull/210')
})
