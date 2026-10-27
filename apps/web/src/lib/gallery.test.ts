import { expect, it } from 'vitest'
import { collapseTimelines, groupCaptures, stackCaptures } from './gallery'

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

it('stacks nearby captures and isolates unknown locations', () => {
	const capture = (id: string, x: number | null, y: number | null, z: number | null) => ({
		id,
		metadata: { x, y, z },
	})
	const stacks = stackCaptures(
		[
			capture('d', null, null, null),
			capture('a', 0, 64, 0),
			capture('b', 10, 70, 10),
			capture('c', 500, 64, 500),
			capture('e', 900, null, 900),
		],
		64
	)
	expect(stacks.map(stack => [stack.key, stack.captures.map(item => item.id)])).toEqual([
		['unknown', ['d']],
		['at-0-64-0', ['a', 'b']],
		['at-500-64-500', ['c']],
		['at-900-0-900', ['e']],
	])
	expect(stackCaptures([])).toEqual([])
	expect(
		stackCaptures([capture('e', null, null, null), capture('f', null, null, null)]).map(stack => stack.captures.length)
	).toEqual([2])
})

it('collapseTimelines keeps the latest capture of each timeline and untouched captures', () => {
	const timeline = (latestId: string) => ({ seriesId: 'a'.repeat(64), frames: 2, latestId })
	const captures = [{ id: 'old', timeline: timeline('new') }, { id: 'new', timeline: timeline('new') }, { id: 'alone' }]
	expect(collapseTimelines(captures).map(capture => capture.id)).toEqual(['new', 'alone'])
})
