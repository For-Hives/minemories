import * as THREE from 'three'
import {
	type GroundCorners,
	type GroundFacing,
	type GroundGrid,
	GroundGridBuilder,
	type GroundQuery,
	groundHeights,
} from './lib/ground-index'

/** Triangles read per builder step; small enough that the time budget is checked often. */
const STEP_TRIANGLES = 8192
/** The pivot looks for surfaces from this far above it down to this far below it (the former probe ray). */
export const GROUND_ABOVE = 256
export const GROUND_BELOW = 512

const FACING: Record<THREE.Side, GroundFacing> = {
	[THREE.FrontSide]: 'up',
	[THREE.BackSide]: 'down',
	[THREE.DoubleSide]: 'both',
}

/** True when the mesh only moves and scales up (no turn, no mirror): a vertical ray stays vertical in its own space. */
function upright(matrix: THREE.Matrix4): boolean {
	const e = matrix.elements
	const turned = [e[1], e[2], e[4], e[6], e[8], e[9]].some(value => Math.abs(value) > 1e-9)
	return !turned && e[0] > 0 && e[5] > 0 && e[10] > 0
}

/**
 * Set on `geometry.userData.ground` by a composed world layer, whose index buffer is rewritten at each composition:
 * the grid is then built over the layer's stable triangle order, and `shown` says which of them are drawn.
 */
export interface GroundSource {
	corners: Uint32Array
	shown: Uint8Array
}

interface Entry {
	builder: GroundGridBuilder
	/** The index the grid was built from; a different one later means the grid is stale. */
	index: THREE.BufferAttribute | null
	corners: GroundCorners | null
	shown?: Uint8Array
	failed: boolean
}

function layerSource(geometry: THREE.BufferGeometry): GroundSource | undefined {
	return geometry.userData.ground as GroundSource | undefined
}

/**
 * Finds the surfaces straight above and below a point without casting a ray through every face of a capture: each
 * geometry gets a column grid (`lib/ground-index`), built in the background a few milliseconds per frame. Until a
 * geometry's grid is ready it is skipped, so the pivot's shadow may appear a moment after a capture loads. A
 * turned, mirrored or multi-material mesh, or one whose grid could not be built, is raycast as before.
 */
export class GroundIndex {
	private readonly entries = new WeakMap<THREE.BufferGeometry, Entry>()
	private readonly queue: THREE.BufferGeometry[] = []
	private readonly ray = new THREE.Raycaster()
	private readonly forget = (event: { target: THREE.BufferGeometry }) => {
		const at = this.queue.indexOf(event.target)
		if (at >= 0) this.queue.splice(at, 1)
	}

	/** Queues the meshes under `root` for indexing. */
	track(root: THREE.Object3D): void {
		root.traverse(object => {
			if (object instanceof THREE.Mesh && !this.entries.has(object.geometry)) this.enqueue(object.geometry)
		})
	}

	private enqueue(geometry: THREE.BufferGeometry): void {
		const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
		if (!position) return
		if (!geometry.boundingBox) geometry.computeBoundingBox()
		const box = geometry.boundingBox as THREE.Box3
		const bounds = { minX: box.min.x, minZ: box.min.z, maxX: box.max.x, maxZ: box.max.z }
		const layer = layerSource(geometry)
		const corners: GroundCorners | null = layer
			? { count: layer.corners.length, getX: i => layer.corners[i] as number }
			: geometry.index
		const builder = new GroundGridBuilder(position, corners, bounds)
		const entry: Entry = { builder, index: geometry.index, corners, failed: false }
		if (layer) entry.shown = layer.shown
		this.entries.set(geometry, entry)
		if (!this.queue.includes(geometry)) {
			geometry.addEventListener('dispose', this.forget)
			this.queue.push(geometry)
		}
	}

	/** True while some tracked geometry still waits for its grid. */
	get pending(): boolean {
		return this.queue.length > 0
	}

	/** Builds grids for at most `budgetMs` milliseconds. */
	work(budgetMs: number, now: () => number = () => performance.now()): void {
		const until = now() + budgetMs
		while (this.queue.length > 0 && now() < until) {
			const geometry = this.queue[0] as THREE.BufferGeometry
			const entry = this.entries.get(geometry) as Entry
			let done = true
			try {
				done = entry.builder.step(STEP_TRIANGLES) !== null
			} catch {
				// Out of memory on a hostile file, for instance: never break the frame, raycast this mesh instead.
				entry.failed = true
			}
			if (done) {
				this.queue.shift()
				geometry.removeEventListener('dispose', this.forget)
			}
		}
	}

	/** Calls `visit` with the world height of every face of `mesh` crossed by a vertical line through `(x, z)`. */
	heights(mesh: THREE.Mesh, x: number, z: number, top: number, visit: (height: number) => void): void {
		const geometry = mesh.geometry as THREE.BufferGeometry
		const material = mesh.material as THREE.Material | THREE.Material[]
		const entry = this.entries.get(geometry)
		if (Array.isArray(material) || !upright(mesh.matrixWorld) || entry?.failed) {
			this.cast(mesh, x, z, top, visit)
			return
		}
		if (entry && !entry.shown && entry.index !== geometry.index) {
			// The geometry got a new index since its grid was made: rebuild it rather than read stale triangles.
			this.entries.delete(geometry)
			this.enqueue(geometry)
			return
		}
		const grid = entry?.builder.grid
		if (!(entry && grid)) return
		this.read(mesh, entry, grid, material, { x, z, top }, visit)
	}

	private read(
		mesh: THREE.Mesh,
		entry: Entry,
		grid: GroundGrid,
		material: THREE.Material,
		point: { x: number; z: number; top: number },
		visit: (height: number) => void
	): void {
		const geometry = mesh.geometry as THREE.BufferGeometry
		const e = mesh.matrixWorld.elements
		const position = geometry.getAttribute('position') as THREE.BufferAttribute
		const total = entry.corners ? entry.corners.count : position.count
		const start = Math.max(0, geometry.drawRange.start)
		const query: GroundQuery = {
			x: (point.x - e[12]) / e[0],
			z: (point.z - e[14]) / e[10],
			facing: FACING[material.side],
			start,
			end: Math.min(total, start + geometry.drawRange.count),
		}
		if (entry.shown) query.shown = entry.shown
		groundHeights(grid, position, entry.corners, query, height => {
			const world = height * e[5] + e[13]
			if (world <= point.top && world >= point.top - GROUND_ABOVE - GROUND_BELOW) visit(world)
		})
	}

	/** The general case (a turned, mirrored or multi-material mesh): three's raycast on that one mesh. */
	private cast(mesh: THREE.Mesh, x: number, z: number, top: number, visit: (height: number) => void): void {
		this.ray.set(new THREE.Vector3(x, top, z), new THREE.Vector3(0, -1, 0))
		this.ray.far = GROUND_ABOVE + GROUND_BELOW
		for (const hit of this.ray.intersectObject(mesh, false)) visit(hit.point.y)
	}

	dispose(): void {
		for (const geometry of this.queue) geometry.removeEventListener('dispose', this.forget)
		this.queue.length = 0
	}
}
