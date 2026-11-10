import { expect, test } from 'vitest'
import fixtures from '../../../../scripts/discord/fixtures/curated-notes.json'
import { compareModVersions, parseReleaseNotes, releaseHistory } from './release-notes'

test('parses the curated notes exactly like the Discord and API readers', () => {
	for (const fixture of fixtures) expect(parseReleaseNotes(fixture.markdown), fixture.name).toEqual(fixture.expected)
})

test('orders mod versions semantically, a release after its betas', () => {
	const versions = [
		'0.36.5-beta.1',
		'0.37.0-beta.1',
		'0.36.10-beta.1',
		'0.37.0',
		'0.37.0-beta.2',
		'0.37.0-alpha',
		'0.37',
	]
	expect(versions.sort(compareModVersions)).toEqual([
		'0.36.5-beta.1',
		'0.36.10-beta.1',
		'0.37',
		'0.37.0-alpha',
		'0.37.0-beta.1',
		'0.37.0-beta.2',
		'0.37.0',
	])
	expect(compareModVersions('1.0.0-beta.1', '1.0.0-beta.1')).toBe(0)
	expect(compareModVersions('1.0.1', '1.0')).toBeGreaterThan(0)
	expect(compareModVersions('1.0', '1.0.1')).toBeLessThan(0)
	expect(compareModVersions('1.0.0-beta', '1.0.0-beta.1')).toBeLessThan(0)
	expect(compareModVersions('1.0.0-rc.1', '1.0.0-beta.9')).toBeGreaterThan(0)
})

test('the history lists releases with notes, newest first, and skips the README and empty files', () => {
	const history = releaseHistory({
		'../mod/release-notes/README.md': '- New: not a release.',
		'../mod/release-notes/0.36.1-beta.1.md': '- Fixed: first.\n- Changed: second. (#2)',
		'../mod/release-notes/0.37.0-beta.1.md': '- New: newest.',
		'../mod/release-notes/0.36.5-beta.1.md': '# nothing here',
		'notes.txt': '- New: not Markdown.',
	})
	expect(history).toEqual([
		{ version: '0.37.0-beta.1', notes: [{ type: 'feature', text: 'newest.', pr: null }] },
		{
			version: '0.36.1-beta.1',
			notes: [
				{ type: 'fix', text: 'first.', pr: null },
				{ type: 'other', text: 'second.', pr: 2 },
			],
		},
	])
})
