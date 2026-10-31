import { expect, it } from 'vitest'
import { bundleWorlds, captureAreas, groupCaptures, latestCapture, stackCaptures, viewPath } from './gallery'

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
		['at-10-70-10', ['a', 'b']],
		['at-500-64-500', ['c']],
		['at-900-0-900', ['e']],
	])
	expect(stackCaptures([])).toEqual([])
	expect(
		stackCaptures([capture('e', null, null, null), capture('f', null, null, null)]).map(stack => stack.captures.length)
	).toEqual([2])
})

it('bundles identified captures per world, scope and dimension and keeps the others apart', () => {
	const capture = (id: string, worldId: string | null, dimension: string | null, worldScope?: string) => ({
		id,
		metadata: { worldId, dimension, ...(worldScope ? { worldScope } : {}) },
	})
	const captures = [
		capture('1', 'a', 'minecraft:overworld'),
		capture('2', 'a', 'minecraft:the_nether'),
		capture('3', null, null),
		capture('4', 'a', 'minecraft:overworld', 'world'),
		capture('5', 'a', 'minecraft:overworld', 'namespace'),
	]
	const { worlds, others } = bundleWorlds(captures, item => item.metadata.worldId !== null)
	expect(worlds.map(world => [world.dimension, world.captures.map(item => item.id)])).toEqual([
		['minecraft:overworld', ['1', '4']],
		['minecraft:the_nether', ['2']],
		['minecraft:overworld', ['5']],
	])
	expect(others.map(item => item.id)).toEqual(['3'])
})
it('keeps an area key anchored on its oldest capture and ignores unlocated stacks', () => {
	const capture = (id: string, x: number | null, y: number | null, z: number | null) => ({
		id,
		metadata: { x, y, z },
	})
	const grow = (extra: ReturnType<typeof capture>[]) =>
		stackCaptures([...extra, capture('old', 3, null, 4)]).map(stack => stack.key)
	expect(grow([])).toEqual(['at-3-0-4'])
	expect(grow([capture('new', 20, 80, 20)])).toEqual(['at-3-0-4'])
	expect(stackCaptures([capture('lost', null, null, null)]).map(stack => stack.key)).toEqual(['unknown'])
})

it('opens the most recently captured snapshot and links the timeline only for several snapshots', () => {
	const capture = (id: string, createdAt: string, capturedAt: string | null) => ({
		id,
		createdAt,
		metadata: { capturedAt },
	})
	expect(latestCapture([])).toBeUndefined()
	expect(
		latestCapture([
			capture('uploaded-late', '2026-03-01T00:00:00Z', '2026-01-01T00:00:00Z'),
			capture('captured-last', '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z'),
			capture('no-capture-time', '2026-01-15T00:00:00Z', null),
		])?.id
	).toBe('captured-last')
	expect(
		latestCapture([capture('broken', 'not a date', null), capture('fine', '2026-01-01T00:00:00Z', null)])?.id
	).toBe('fine')
	expect(viewPath('a b', false)).toBe('/viewer?memory=a%20b')
	expect(viewPath('x', true)).toBe('/viewer?memory=x&timelapse=1')
})

it('turns identified captures into one evolving area per world and keeps the others by position', () => {
	const capture = (id: string, worldId: string | null, x: number | null) => ({
		id,
		metadata: { worldId, worldScope: null, dimension: 'minecraft:overworld', x, y: 64, z: x },
	})
	const areas = captureAreas(
		[capture('a', 'w1', 0), capture('b', 'w1', 900), capture('c', null, 0), capture('d', null, 10)],
		item => item.metadata.worldId !== null
	)
	expect(areas.map(area => [area.evolving, area.stack.captures.map(item => item.id)])).toEqual([
		[true, ['a', 'b']],
		[false, ['c', 'd']],
	])
	expect(areas[0]?.stack.key).toContain('w1')
})
