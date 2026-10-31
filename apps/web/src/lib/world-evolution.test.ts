import { expect, it } from 'vitest'
import {
	type BlockBounds,
	buildPrimitive,
	cellKey,
	containsBlock,
	createCapture,
	type EvolutionPrimitive,
	WorldComposition,
} from './world-evolution'

const origin = { x: 0, y: 0, z: 0 }

/** Top faces (normal +Y) of the given world blocks, written like the mod: four vertices and two triangles. */
function tops(blocks: [number, number, number][], at = origin) {
	const positions: number[] = [],
		index: number[] = []
	for (const [x, y, z] of blocks) {
		const base = positions.length / 3,
			top = y + 1 - at.y
		positions.push(x - at.x, top, z - at.z, x - at.x, top, z + 1 - at.z, x + 1 - at.x, top, z + 1 - at.z)
		positions.push(x + 1 - at.x, top, z - at.z)
		index.push(base, base + 1, base + 2, base, base + 2, base + 3)
	}
	return { positions, index }
}

function row(fromX: number, toX: number, y = 64, z = 0): [number, number, number][] {
	return Array.from({ length: toX - fromX + 1 }, (_, offset) => [fromX + offset, y, z])
}

function bounds(minX: number, maxX: number, minY = 0, maxY = 100, minZ = -8, maxZ = 8): BlockBounds {
	return { minX, minY, minZ, maxX, maxY, maxZ }
}

function visibleBlocks(primitive: EvolutionPrimitive): number[] {
	const xs = new Set<number>()
	for (let offset = 0; offset < primitive.count; offset += 3) {
		const triangle = primitive.sorted.indexOf(primitive.visible[offset] as number)
		xs.add(primitive.blocks[triangle - (triangle % 3)] as number)
	}
	return [...xs].sort((left, right) => left - right)
}

it('assigns boundary faces to the block that owns them, including negative coordinates', () => {
	const east = buildPrimitive([16, 0, 0, 16, 1, 0, 16, 1, 1, 16, 0, 1], [0, 1, 2, 0, 2, 3], origin)
	expect(east.cells.map(cell => cell.key)).toEqual([cellKey(15, 0)])
	expect(Array.from(east.blocks.subarray(0, 3))).toEqual([15, 0, 0])
	const west = buildPrimitive([16, 0, 0, 16, 0, 1, 16, 1, 1, 16, 1, 0], [0, 1, 2, 0, 2, 3], origin)
	expect(west.cells.map(cell => cell.key)).toEqual([cellKey(16, 0)])
	expect(cellKey(-1, -17)).not.toBe(cellKey(0, 0))
	expect(cellKey(-1, 0)).toBe(cellKey(-16, 15))
	expect(containsBlock(bounds(0, 3), 4, 1, 0)).toBe(false)
})

it('sorts triangles by chunk column and skips non-finite or unindexed leftovers', () => {
	const primitive = buildPrimitive(
		tops([
			[20, 64, 0],
			[1, 64, 0],
			[21, 64, 0],
		]).positions,
		tops([
			[20, 64, 0],
			[1, 64, 0],
			[21, 64, 0],
		]).index,
		origin
	)
	expect(primitive.cells.map(cell => [cell.start, cell.end])).toEqual([
		[0, 2],
		[2, 6],
	])
	expect(primitive.cells[1]?.box).toEqual({ minX: 20, minY: 64, minZ: 0, maxX: 21, maxY: 64, maxZ: 0 })
	const loose = buildPrimitive([0, 0, 0, 0, 0, 1, 1, 0, 0, Number.NaN, 0, 0, 1, 0, 0, 0, 0, 1, 5, 5], null, origin)
	expect(loose.sorted.length).toBe(3)
	const flat = buildPrimitive([2, 3, 4, 2, 3, 4, 2, 3, 4], null, { x: 10, y: 0, z: 0 })
	expect(Array.from(flat.blocks)).toEqual([12, 3, 4])
})

it('replaces only the newer bounds inside chunks where the newer capture really has geometry', () => {
	const old = tops(row(0, 31))
	const oldPrimitive = buildPrimitive(old.positions, old.index, origin)
	// The newer capture spans x 8..23 but its second chunk was not loaded: only x 8..15 changes.
	const newerOrigin = { x: 16, y: 64, z: 0 }
	const newer = tops(row(8, 15, 70), newerOrigin)
	const newerPrimitive = buildPrimitive(newer.positions, newer.index, newerOrigin)
	const composition = new WorldComposition(2)
	expect(composition.length).toBe(2)
	composition.set(1, createCapture(bounds(8, 23), [newerPrimitive]))
	expect(composition.compose(0)).toEqual([1])
	expect(newerPrimitive.count).toBe(0)
	composition.set(0, createCapture(bounds(0, 31), [oldPrimitive]))
	expect(composition.capture(0)?.cells.size).toBe(2)
	expect(composition.compose(0)).toEqual([0])
	expect(visibleBlocks(oldPrimitive)).toEqual(row(0, 31).map(([x]) => x))
	expect(composition.compose(1)).toEqual([0, 1])
	expect(visibleBlocks(oldPrimitive)).toEqual([...row(0, 7), ...row(16, 31)].map(([x]) => x))
	expect(visibleBlocks(newerPrimitive)).toEqual(row(8, 15).map(([x]) => x))
	expect(composition.compose(1)).toEqual([])
	expect(composition.covered(0, 1, { x: 9.5, y: 64.2, z: 0.5 })).toBe(true)
	expect(composition.covered(0, 1, { x: 17, y: 64, z: 0 })).toBe(false)
	expect(composition.covered(0, 1, { x: 900, y: 64, z: 0 })).toBe(false)
	expect(composition.covered(0, 0, { x: 9, y: 64, z: 0 })).toBe(false)
	expect(composition.covered(1, 1, { x: 9, y: 64, z: 0 })).toBe(false)
	expect(composition.compose(0)).toEqual([0, 1])
	expect(newerPrimitive.count).toBe(0)
})

it('keeps older content outside the newer vertical range and drops whole chunks contained by it', () => {
	const old = tops([...row(0, 3, 10), ...row(0, 3, 64), [40, 64, 0]])
	const oldPrimitive = buildPrimitive(old.positions, old.index, origin)
	const shallow = tops(row(0, 3, 64))
	const shallowPrimitive = buildPrimitive(shallow.positions, shallow.index, origin)
	const composition = new WorldComposition(3)
	composition.set(0, createCapture(bounds(0, 47), [oldPrimitive]))
	composition.set(1, createCapture(bounds(0, 15, 40, 100), [shallowPrimitive]))
	composition.compose(1)
	expect(oldPrimitive.count).toBe(5 * 6)
	const whole = tops(row(0, 15, 64))
	const wholePrimitive = buildPrimitive(whole.positions, whole.index, origin)
	composition.set(2, createCapture(bounds(-16, 63, -64, 200), [wholePrimitive]))
	expect(composition.compose(2)).toEqual([0, 1, 2])
	expect(oldPrimitive.count).toBe(6)
	expect(shallowPrimitive.count).toBe(0)
	expect(wholePrimitive.count).toBe(16 * 6)
})

it('rejects invalid or duplicated positions', () => {
	const composition = new WorldComposition(1)
	const capture = createCapture(bounds(0, 1), [])
	expect(() => composition.set(1, capture)).toThrow(RangeError)
	expect(() => composition.set(-1, capture)).toThrow(RangeError)
	expect(() => composition.set(0.5, capture)).toThrow(RangeError)
	composition.set(0, capture)
	expect(() => composition.set(0, capture)).toThrow(RangeError)
	expect(composition.compose(0)).toEqual([0])
})
