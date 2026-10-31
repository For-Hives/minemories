/** Inclusive block bounds in absolute world coordinates, as written by the mod in `captureBounds`. */
export interface BlockBounds {
	minX: number
	minY: number
	minZ: number
	maxX: number
	maxY: number
	maxZ: number
}

export interface BlockPoint {
	x: number
	y: number
	z: number
}

interface CellRange {
	key: number
	start: number
	end: number
	box: BlockBounds
}

/** One glTF primitive whose triangles are grouped by chunk column; `visible` is the index buffer to draw. */
export interface EvolutionPrimitive {
	readonly sorted: Uint32Array
	readonly blocks: Int32Array
	readonly cells: readonly CellRange[]
	readonly visible: Uint32Array
	count: number
}

export interface EvolutionCapture {
	readonly bounds: BlockBounds
	readonly primitives: readonly EvolutionPrimitive[]
	readonly cells: ReadonlySet<number>
}

// Faces lie on block boundaries: probing slightly behind the face assigns it to the block that owns it.
const FACE_PROBE = 1 / 64
const CELL_OFFSET = 2 ** 22

export function cellKey(blockX: number, blockZ: number): number {
	return ((blockX >> 4) + CELL_OFFSET) * 2 ** 23 + (blockZ >> 4) + CELL_OFFSET
}

export function containsBlock(bounds: BlockBounds, x: number, y: number, z: number): boolean {
	return (
		x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY && z >= bounds.minZ && z <= bounds.maxZ
	)
}

function containsBox(outer: BlockBounds, inner: BlockBounds): boolean {
	return (
		containsBlock(outer, inner.minX, inner.minY, inner.minZ) && containsBlock(outer, inner.maxX, inner.maxY, inner.maxZ)
	)
}

function intersects(a: BlockBounds, b: BlockBounds): boolean {
	return (
		a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY && a.minZ <= b.maxZ && b.minZ <= a.maxZ
	)
}

/** Block that owns a triangle: its centroid pushed slightly against the face normal. */
function triangleBlock(
	positions: ArrayLike<number>,
	a: number,
	b: number,
	c: number,
	origin: BlockPoint,
	out: number[]
) {
	const ax = positions[a * 3] as number,
		ay = positions[a * 3 + 1] as number,
		az = positions[a * 3 + 2] as number
	const ux = (positions[b * 3] as number) - ax,
		uy = (positions[b * 3 + 1] as number) - ay,
		uz = (positions[b * 3 + 2] as number) - az
	const vx = (positions[c * 3] as number) - ax,
		vy = (positions[c * 3 + 1] as number) - ay,
		vz = (positions[c * 3 + 2] as number) - az
	const nx = uy * vz - uz * vy,
		ny = uz * vx - ux * vz,
		nz = ux * vy - uy * vx
	const length = Math.hypot(nx, ny, nz)
	const scale = length > 0 ? FACE_PROBE / length : 0
	out[0] = Math.floor(ax + (ux + vx) / 3 - nx * scale + origin.x)
	out[1] = Math.floor(ay + (uy + vy) / 3 - ny * scale + origin.y)
	out[2] = Math.floor(az + (uz + vz) / 3 - nz * scale + origin.z)
	return out.every(Number.isFinite)
}

function vertexIndex(index: ArrayLike<number> | null, position: number): number {
	return index ? (index[position] as number) : position
}

/**
 * Sorts the triangles of a primitive by chunk column once, so each later composition copies contiguous runs.
 * Positions are local to `origin` (the capture origin), as in Minemories GLB files.
 */
export function buildPrimitive(
	positions: ArrayLike<number>,
	index: ArrayLike<number> | null,
	origin: BlockPoint
): EvolutionPrimitive {
	const total = Math.floor((index ? index.length : positions.length / 3) / 3)
	const keys: number[] = [],
		accepted: number[] = [],
		found: number[] = [],
		block = [0, 0, 0]
	for (let triangle = 0; triangle < total; triangle++) {
		const a = vertexIndex(index, triangle * 3),
			b = vertexIndex(index, triangle * 3 + 1),
			c = vertexIndex(index, triangle * 3 + 2)
		if (!triangleBlock(positions, a, b, c, origin, block)) continue
		keys.push(cellKey(block[0] as number, block[2] as number))
		accepted.push(triangle)
		found.push(...block)
	}
	const order = accepted
		.map((_, position) => position)
		.sort((left, right) => (keys[left] as number) - (keys[right] as number))
	const sorted = new Uint32Array(order.length * 3),
		blocks = new Int32Array(order.length * 3),
		cells: CellRange[] = []
	for (const [target, source] of order.entries()) {
		const triangle = accepted[source] as number
		for (let corner = 0; corner < 3; corner++) {
			sorted[target * 3 + corner] = vertexIndex(index, triangle * 3 + corner)
			blocks[target * 3 + corner] = found[source * 3 + corner] as number
		}
		extendCell(cells, keys[source] as number, target, blocks)
	}
	return { sorted, blocks, cells, visible: new Uint32Array(sorted.length), count: 0 }
}

function extendCell(cells: CellRange[], key: number, triangle: number, blocks: Int32Array) {
	const x = blocks[triangle * 3] as number,
		y = blocks[triangle * 3 + 1] as number,
		z = blocks[triangle * 3 + 2] as number
	const cell = cells.at(-1)
	if (cell?.key !== key) {
		cells.push({
			key,
			start: triangle,
			end: triangle + 1,
			box: { minX: x, minY: y, minZ: z, maxX: x, maxY: y, maxZ: z },
		})
		return
	}
	cell.end = triangle + 1
	const box = cell.box
	box.minX = Math.min(box.minX, x)
	box.minY = Math.min(box.minY, y)
	box.minZ = Math.min(box.minZ, z)
	box.maxX = Math.max(box.maxX, x)
	box.maxY = Math.max(box.maxY, y)
	box.maxZ = Math.max(box.maxZ, z)
}

/** Only chunk columns that really contain geometry replace older content: unloaded chunks never erase the past. */
export function createCapture(bounds: BlockBounds, primitives: EvolutionPrimitive[]): EvolutionCapture {
	const cells = new Set<number>()
	for (const primitive of primitives) for (const cell of primitive.cells) cells.add(cell.key)
	return { bounds, primitives, cells }
}

/**
 * Chronological composition of partial captures of one world. At step `n`, every block shows the most recent
 * capture up to `n` whose bounds contain it, among captures that hold geometry in that chunk column.
 */
export class WorldComposition {
	private readonly captures: (EvolutionCapture | undefined)[]
	private readonly owners = new Map<number, number[]>()
	private readonly signatures: string[]

	constructor(length: number) {
		this.captures = Array.from({ length })
		this.signatures = Array.from({ length }, () => '')
	}

	get length(): number {
		return this.captures.length
	}

	capture(position: number): EvolutionCapture | undefined {
		return this.captures[position]
	}

	set(position: number, capture: EvolutionCapture): void {
		if (!Number.isInteger(position) || position < 0 || position >= this.captures.length || this.captures[position])
			throw new RangeError('Invalid or duplicated capture position')
		this.captures[position] = capture
		for (const key of capture.cells) {
			const owners = this.owners.get(key) ?? []
			owners.push(position)
			owners.sort((left, right) => left - right)
			this.owners.set(key, owners)
		}
	}

	/** True when a newer capture shown at `step` replaces this block of the capture at `position`. */
	covered(position: number, step: number, block: BlockPoint): boolean {
		const key = cellKey(Math.floor(block.x), Math.floor(block.z))
		return this.coveringBounds(position, step, key).some(bounds =>
			containsBlock(bounds, Math.floor(block.x), Math.floor(block.y), Math.floor(block.z))
		)
	}

	/** Recomputes visible index buffers; returns the capture positions whose buffers changed. */
	compose(step: number): number[] {
		const changed: number[] = []
		for (const [position, capture] of this.captures.entries()) {
			if (!capture) continue
			const signature = this.signature(capture, position, step)
			if (signature === this.signatures[position]) continue
			this.signatures[position] = signature
			for (const primitive of capture.primitives) this.fill(primitive, position, step)
			changed.push(position)
		}
		return changed
	}

	private signature(capture: EvolutionCapture, position: number, step: number): string {
		if (position > step) return 'hidden'
		const newer = new Set<number>()
		for (const key of capture.cells)
			for (const owner of this.owners.get(key) as number[]) if (owner > position && owner <= step) newer.add(owner)
		return [...newer].sort((left, right) => left - right).join(',') || 'whole'
	}

	private coveringBounds(position: number, step: number, key: number): BlockBounds[] {
		const bounds: BlockBounds[] = []
		for (const owner of this.owners.get(key) ?? []) {
			if (owner > position && owner <= step) bounds.push((this.captures[owner] as EvolutionCapture).bounds)
		}
		return bounds
	}

	private fill(primitive: EvolutionPrimitive, position: number, step: number): void {
		primitive.count = 0
		if (position > step) return
		for (const cell of primitive.cells) {
			const covering = this.coveringBounds(position, step, cell.key).filter(bounds => intersects(bounds, cell.box))
			if (covering.some(bounds => containsBox(bounds, cell.box))) continue
			if (covering.length === 0) copyTriangles(primitive, cell.start, cell.end)
			else copyUncovered(primitive, cell, covering)
		}
	}
}

function copyTriangles(primitive: EvolutionPrimitive, start: number, end: number) {
	primitive.visible.set(primitive.sorted.subarray(start * 3, end * 3), primitive.count)
	primitive.count += (end - start) * 3
}

function copyUncovered(primitive: EvolutionPrimitive, cell: CellRange, covering: BlockBounds[]) {
	const { blocks } = primitive
	for (let triangle = cell.start; triangle < cell.end; triangle++) {
		const x = blocks[triangle * 3] as number,
			y = blocks[triangle * 3 + 1] as number,
			z = blocks[triangle * 3 + 2] as number
		if (!covering.some(bounds => containsBlock(bounds, x, y, z))) copyTriangles(primitive, triangle, triangle + 1)
	}
}
