/** Vertex positions as three's BufferAttribute exposes them (normalized and interleaved data already decoded). */
export interface GroundPositions {
	readonly count: number
	getX(index: number): number
	getY(index: number): number
	getZ(index: number): number
}

/** Triangle corners, three per triangle; absent for a non-indexed geometry. */
export interface GroundCorners {
	readonly count: number
	getX(index: number): number
}

/** Which way a face must point to be hit by a ray going straight down: its front up, its back up, or either. */
export type GroundFacing = 'up' | 'down' | 'both'

/**
 * Triangles of one geometry sorted into square columns of its own (local) XZ plane, so the surfaces under a point
 * are found among a few faces instead of all of them. Faces seen edge-on from above (walls) are left out: a vertical
 * ray never meets them.
 */
export interface GroundGrid {
	readonly minX: number
	readonly minZ: number
	readonly cell: number
	readonly width: number
	readonly depth: number
	/** `triangles[starts[c]..starts[c + 1]]` are the triangles (first corner / 3) whose XZ box overlaps column `c`. */
	readonly starts: Uint32Array
	readonly triangles: Uint32Array
}

/** Below this XZ area (in squared local units, relative to the triangle's own size) a face is a wall. */
const EDGE_ON = 1e-9
/** Columns per side grow with the square root of the triangle count, up to this. */
const MAX_SIDE = 256

interface Corners {
	ax: number
	ay: number
	az: number
	bx: number
	by: number
	bz: number
	cx: number
	cy: number
	cz: number
}

function readTriangle(positions: GroundPositions, corners: GroundCorners | null, triangle: number, out: Corners) {
	const first = triangle * 3
	const a = corners ? corners.getX(first) : first
	const b = corners ? corners.getX(first + 1) : first + 1
	const c = corners ? corners.getX(first + 2) : first + 2
	out.ax = positions.getX(a)
	out.ay = positions.getY(a)
	out.az = positions.getZ(a)
	out.bx = positions.getX(b)
	out.by = positions.getY(b)
	out.bz = positions.getZ(b)
	out.cx = positions.getX(c)
	out.cy = positions.getY(c)
	out.cz = positions.getZ(c)
}

/** Twice the signed XZ area; positive when the face's front looks up (counter-clockwise seen from above). */
function upArea(t: Corners): number {
	return (t.cx - t.ax) * (t.bz - t.az) - (t.bx - t.ax) * (t.cz - t.az)
}

function edgeOn(t: Corners, area: number): boolean {
	const size = Math.max(Math.abs(t.bx - t.ax), Math.abs(t.cx - t.ax), Math.abs(t.bz - t.az), Math.abs(t.cz - t.az))
	return Math.abs(area) <= EDGE_ON * size * size
}

/**
 * Builds a geometry's grid a slice at a time, so a capture of a million faces never blocks a frame: `step` reads at
 * most `budget` triangles and returns the grid once every triangle has been read twice (count, then fill).
 */
export class GroundGridBuilder {
	private readonly total: number
	private readonly t: Corners = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, cx: 0, cy: 0, cz: 0 }
	private readonly minX: number
	private readonly minZ: number
	private readonly cell: number
	private readonly width: number
	private readonly depth: number
	private readonly counts: Uint32Array
	private starts: Uint32Array | null = null
	private triangles: Uint32Array | null = null
	private next = 0
	private filling = false
	private done: GroundGrid | null = null

	constructor(
		private readonly positions: GroundPositions,
		private readonly corners: GroundCorners | null,
		bounds: { minX: number; minZ: number; maxX: number; maxZ: number }
	) {
		this.total = Math.floor((corners ? corners.count : positions.count) / 3)
		const spanX = Math.max(bounds.maxX - bounds.minX, 0)
		const spanZ = Math.max(bounds.maxZ - bounds.minZ, 0)
		const side = Math.min(MAX_SIDE, Math.max(1, Math.round(Math.sqrt(this.total) / 2)))
		this.cell = Math.max(spanX, spanZ, 1e-6) / side
		this.minX = bounds.minX
		this.minZ = bounds.minZ
		this.width = Math.min(side, Math.floor(spanX / this.cell) + 1)
		this.depth = Math.min(side, Math.floor(spanZ / this.cell) + 1)
		this.counts = new Uint32Array(this.width * this.depth)
	}

	/** The finished grid, or null while triangles remain. */
	get grid(): GroundGrid | null {
		return this.done
	}

	private column(value: number, origin: number, size: number): number {
		return Math.min(size - 1, Math.max(0, Math.floor((value - origin) / this.cell)))
	}

	/** Reads up to `budget` triangles; returns the grid when finished. */
	step(budget: number): GroundGrid | null {
		const end = Math.min(this.total, this.next + Math.max(1, budget))
		for (let triangle = this.next; triangle < end; triangle++) this.place(triangle)
		this.next = end
		if (end < this.total) return null
		if (this.filling) return this.finish()
		this.startFilling()
		return this.total === 0 ? this.finish() : null
	}

	/** Counts a face in the columns its XZ box overlaps (first pass), or stores it there (second pass). */
	private place(triangle: number): void {
		const t = this.t
		readTriangle(this.positions, this.corners, triangle, t)
		if (edgeOn(t, upArea(t))) return
		const x0 = this.column(Math.min(t.ax, t.bx, t.cx), this.minX, this.width)
		const x1 = this.column(Math.max(t.ax, t.bx, t.cx), this.minX, this.width)
		const z0 = this.column(Math.min(t.az, t.bz, t.cz), this.minZ, this.depth)
		const z1 = this.column(Math.max(t.az, t.bz, t.cz), this.minZ, this.depth)
		for (let z = z0; z <= z1; z++)
			for (let x = x0; x <= x1; x++) {
				const c = z * this.width + x
				const seen = this.counts[c] as number
				this.counts[c] = seen + 1
				if (this.starts && this.triangles) this.triangles[(this.starts[c] as number) + seen] = triangle
			}
	}

	/** Every face counted: size each column, then read the faces again to store them. */
	private startFilling(): void {
		this.filling = true
		this.next = 0
		const starts = new Uint32Array(this.counts.length + 1)
		for (let c = 0; c < this.counts.length; c++) starts[c + 1] = (starts[c] as number) + (this.counts[c] as number)
		this.starts = starts
		this.triangles = new Uint32Array(starts[this.counts.length] as number)
		this.counts.fill(0)
	}

	private finish(): GroundGrid {
		this.done = {
			minX: this.minX,
			minZ: this.minZ,
			cell: this.cell,
			width: this.width,
			depth: this.depth,
			starts: this.starts as Uint32Array,
			triangles: this.triangles as Uint32Array,
		}
		return this.done
	}
}

/** What a straight-down ray at local `(x, z)` may hit in one geometry. */
export interface GroundQuery {
	x: number
	z: number
	facing: GroundFacing
	/** Drawn corners `[start, end)`, as three's drawRange. */
	start: number
	end: number
}

/**
 * Calls `visit` with the local height of every face of the grid's geometry that a ray going straight down through
 * `(x, z)` crosses, honouring which side of a face can be hit and the drawn range.
 */
export function groundHeights(
	grid: GroundGrid,
	positions: GroundPositions,
	corners: GroundCorners | null,
	query: GroundQuery,
	visit: (height: number) => void
): void {
	const cx = Math.floor((query.x - grid.minX) / grid.cell)
	const cz = Math.floor((query.z - grid.minZ) / grid.cell)
	if (cx < 0 || cz < 0 || cx >= grid.width || cz >= grid.depth) return
	const column = cz * grid.width + cx
	const t: Corners = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, cx: 0, cy: 0, cz: 0 }
	const last = grid.starts[column + 1] as number
	for (let k = grid.starts[column] as number; k < last; k++) {
		const triangle = grid.triangles[k] as number
		if (triangle * 3 < query.start || triangle * 3 + 3 > query.end) continue
		readTriangle(positions, corners, triangle, t)
		const area = upArea(t)
		if ((query.facing === 'up' && area < 0) || (query.facing === 'down' && area > 0)) continue
		// Barycentric weights of (x, z) in the face's XZ projection; outside when any is negative.
		const u = ((t.cx - t.ax) * (query.z - t.az) - (query.x - t.ax) * (t.cz - t.az)) / area
		const v = ((query.x - t.ax) * (t.bz - t.az) - (t.bx - t.ax) * (query.z - t.az)) / area
		if (u < 0 || v < 0 || u + v > 1) continue
		visit(t.ay + u * (t.by - t.ay) + v * (t.cy - t.ay))
	}
}
