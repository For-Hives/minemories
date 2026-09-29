import { expect, it } from 'vitest'
import { groupCaptures } from './gallery'

it('groups worlds by name and seed, servers by name, and preserves newest-first order', () => {
	const capture = (id: string, worldName: string | null, serverName: string | null, seed: string | null = null) => ({
		id,
		metadata: { worldName, serverName, seed },
	})
	const captures = [
		capture('1', 'Home', null, '42'),
		capture('2', null, 'Friends'),
		capture('3', 'Home', null, '42'),
		capture('4', 'Home', null, '43'),
		capture('5', null, null),
	]
	expect(groupCaptures(captures).map(group => [group.name, group.captures.map(item => item.id)])).toEqual([
		['Home', ['1', '3']],
		['Friends', ['2']],
		['Home', ['4']],
		['Other captures', ['5']],
	])
	expect(groupCaptures([])).toEqual([])
})
