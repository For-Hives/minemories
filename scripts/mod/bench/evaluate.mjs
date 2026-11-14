// What a bench run says about each block: placed or not, geometry found in its area, triangles drawn twice.
//
// A block's area is its cell and the ring around it, and the layer above (not below: that is the floor the grid
// stands on): the driver spaces blocks
// `spacing` apart (4 by default), so a 3x3 block such as a large water wheel stays inside its own area and never
// reaches a neighbour's.

/** Sums the cells of `cells` (from cellTriangles) around (x, y, z): ±reach horizontally, its layer and the next. */
export function areaTriangles(cells, x, y, z, reach = 1) {
	const area = { triangles: 0, duplicates: 0, categories: {} }
	for (let dx = -reach; dx <= reach; dx++)
		for (let dy = 0; dy <= 1; dy++)
			for (let dz = -reach; dz <= reach; dz++) {
				const cell = cells.get(`${x + dx},${y + dy},${z + dz}`)
				if (!cell) continue
				area.triangles += cell.triangles
				area.duplicates += cell.duplicates
				for (const [name, count] of Object.entries(cell.categories))
					area.categories[name] = (area.categories[name] ?? 0) + count
			}
	return area
}

/**
 * One row per planned block: `status` is `unplaced` (the world did not keep it: it needs support or context),
 * `missing` (placed, no geometry in its area), `doubled` (some triangles drawn twice) or `ok`. Blocks in
 * `drawsNothing` (technical blocks the game itself never draws) are `ok` with no geometry.
 */
export function evaluate(placed, cells, { drawsNothing = [] } = {}) {
	const invisible = new Set(drawsNothing)
	const reach = Math.max(0, Math.floor(((placed.spacing ?? 4) - 1) / 2))
	const rows = placed.cells.map(cell => {
		if (cell.actual !== cell.id) return { id: cell.id, status: 'unplaced', actual: cell.actual }
		const area = areaTriangles(cells, cell.x, cell.y, cell.z, reach)
		let status = 'ok'
		if (area.triangles === 0 && !invisible.has(cell.id)) status = 'missing'
		else if (area.duplicates > 0) status = 'doubled'
		return { id: cell.id, status, ...area }
	})
	const summary = { blocks: rows.length, ok: 0, missing: 0, doubled: 0, unplaced: 0 }
	for (const row of rows) summary[row.status]++
	let contraption = null
	if (placed.contraption) {
		const { x, y, z } = placed.contraption
		const cell = cells.get(`${x},${y},${z}`) ?? { triangles: 0, duplicates: 0, categories: {} }
		contraption = {
			entities: placed.contraptions ?? 0,
			...cell,
			status: contraptionStatus(placed.contraptions ?? 0, cell),
		}
	}
	return { summary, rows, contraption }
}

function contraptionStatus(entities, cell) {
	if (entities === 0) return 'unassembled'
	if (cell.triangles === 0) return 'missing'
	return cell.duplicates > 0 ? 'doubled' : 'ok'
}
