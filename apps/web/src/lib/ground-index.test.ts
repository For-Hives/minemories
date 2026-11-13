import { expect, it } from 'vitest'
import {
	type GroundCorners,
	type GroundGrid,
	GroundGridBuilder,
	type GroundPositions,
	groundHeights,
} from './ground-index'

function positions(points: number[]): GroundPositions {
	return {
		count: points.length / 3,
		getX: i => points[i * 3] as number,
		getY: i => points[i * 3 + 1] as number,
		getZ: i => points[i * 3 + 2] as number,
	}
}

function corners(list: number[]): GroundCorners {
	return { count: list.length, getX: i => list[i] as number }
}

/** A square at height `y` over [x0, x1] x [z0, z1], front up (counter-clockwise seen from above) unless `down`. */
function square(x0: number, z0: number, x1: number, z1: number, y: number, down = false): number[] {
	const up = [x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0]
	if (!down) return up
	const flipped: number[] = []
	for (let t = 0; t < up.length; t += 9)
		flipped.push(...up.slice(t, t + 3), ...up.slice(t + 6, t + 9), ...up.slice(t + 3, t + 6))
	return flipped
}

function build(builder: GroundGridBuilder): GroundGrid {
	for (let k = 0; k < 10_000; k++) {
		const grid = builder.step(1)
		if (grid) return grid
	}
	throw new Error('never finished')
}

function heights(
	grid: GroundGrid,
	source: GroundPositions,
	x: number,
	z: number,
	more: Partial<{ facing: 'up' | 'down' | 'both'; start: number; end: number; index: GroundCorners | null }> = {}
) {
	const found: number[] = []
	groundHeights(
		grid,
		source,
		more.index ?? null,
		{ x, z, facing: more.facing ?? 'up', start: more.start ?? 0, end: more.end ?? 1e9 },
		h => found.push(h)
	)
	return found.sort((a, b) => a - b)
}

const bounds = { minX: 0, minZ: 0, maxX: 4, maxZ: 4 }

it('finds every face above or below a point, with the side a falling ray can hit', () => {
	const points = [...square(0, 0, 4, 4, 1), ...square(1, 1, 2, 2, 3, true), ...square(1, 1, 3, 3, 5)]
	const source = positions(points)
	const builder = new GroundGridBuilder(source, null, bounds)
	expect(builder.grid).toBeNull()
	const grid = build(builder)
	expect(builder.grid).toBe(grid)
	expect(heights(grid, source, 1.7, 1.2)).toEqual([1, 5])
	expect(heights(grid, source, 1.7, 1.2, { facing: 'down' })).toEqual([3])
	expect(heights(grid, source, 1.7, 1.2, { facing: 'both' })).toEqual([1, 3, 5])
	expect(heights(grid, source, 3.5, 0.5)).toEqual([1])
})

it('reads a sloped face at the height under the point', () => {
	const source = positions([0, 0, 0, 0, 4, 4, 4, 0, 0])
	const grid = build(new GroundGridBuilder(source, null, bounds))
	expect(heights(grid, source, 1, 2)[0]).toBeCloseTo(2)
	expect(heights(grid, source, 3, 3)).toEqual([])
})

it('leaves walls out and ignores points outside the grid', () => {
	const wall = [0, 0, 0, 0, 2, 0, 2, 2, 0]
	const source = positions([...wall, ...square(0, 0, 2, 2, 1)])
	const grid = build(new GroundGridBuilder(source, null, { minX: 0, minZ: 0, maxX: 2, maxZ: 2 }))
	expect(grid.triangles.length).toBeGreaterThan(0)
	expect(heights(grid, source, 1, 0.01)).toEqual([1])
	expect(heights(grid, source, -1, 1)).toEqual([])
	expect(heights(grid, source, 1, 9)).toEqual([])
})

it('follows an index buffer and honours the drawn range', () => {
	const points = [0, 2, 0, 0, 2, 4, 4, 2, 4, 4, 2, 0, 0, 7, 0, 0, 7, 4, 4, 7, 4, 4, 7, 0]
	const list = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]
	const source = positions(points)
	const index = corners(list)
	const grid = build(new GroundGridBuilder(source, index, bounds))
	expect(heights(grid, source, 3, 1, { index })).toEqual([2, 7])
	expect(heights(grid, source, 3, 1, { index, start: 6 })).toEqual([7])
	expect(heights(grid, source, 3, 1, { index, end: 6 })).toEqual([2])
})

it('spreads its columns with the triangle count and clamps faces on the border', () => {
	const points: number[] = []
	for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) points.push(...square(x, z, x + 1, z + 1, x))
	const source = positions(points)
	const grid = build(new GroundGridBuilder(source, null, { minX: 0, minZ: 0, maxX: 16, maxZ: 16 }))
	expect(grid.width).toBeGreaterThan(1)
	expect(grid.width).toBe(grid.depth)
	expect(heights(grid, source, 9.7, 3.2)).toEqual([9])
	expect(heights(grid, source, 15.99, 15.5)).toEqual([15])
	const lot = new GroundGridBuilder(source, null, { minX: 0, minZ: 0, maxX: 16, maxZ: 16 })
	expect(lot.step(10_000)).toBeNull()
	expect(lot.step(10_000)).not.toBeNull()
})

it('finishes at once on an empty or flat geometry', () => {
	const empty = new GroundGridBuilder(positions([]), null, { minX: 0, minZ: 0, maxX: 0, maxZ: 0 })
	const grid = empty.step(0) as GroundGrid
	expect(grid).toMatchObject({ width: 1, depth: 1 })
	expect(heights(grid, positions([]), 0, 0)).toEqual([])
})
