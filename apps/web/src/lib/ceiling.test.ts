import { expect, it } from 'vitest'
import { CeilingGrid, NO_CEILING } from './ceiling'

it('keeps the highest face of each column and ignores faces outside the area', () => {
	const grid = new CeilingGrid(-2.5, 0, 2, 2)
	grid.addTriangle(-1, 5, 0.2, -1, 5, 0.8, -0.2, 5, 0.5)
	grid.addTriangle(-1, 9, 0.2, -1, 7, 0.8, -0.2, 7, 0.5)
	grid.addTriangle(-1, 1, 0.2, -1, 1, 0.8, -0.2, 1, 0.5)
	grid.addTriangle(50, 1, 0, 50, 1, 1, 51, 1, 0)
	grid.addTriangle(0, 1, -5, 0, 1, -4, 1, 1, -5)
	const { data, width, depth, minX, minZ, cell } = grid.value
	expect({ width, depth, minX, minZ, cell }).toEqual({ width: 5, depth: 2, minX: -3, minZ: 0, cell: 1 })
	expect(data[2]).toBe(9)
	expect(data[0]).toBe(NO_CEILING)
})

it('widens columns evenly when the area exceeds the cell budget', () => {
	const grid = new CeilingGrid(0, 0, 100, 100, 100)
	expect(grid.value).toMatchObject({ cell: 10, width: 10, depth: 10 })
	const flat = new CeilingGrid(3, 3, 3, 3)
	expect(flat.value).toMatchObject({ width: 1, depth: 1 })
})
