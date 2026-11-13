import * as THREE from 'three'
import { type GroundFacing, type GroundGrid, GroundGridBuilder, groundHeights } from './lib/ground-index'

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
 * Finds the surfaces straight above and below a point without casting a ray through every face of a capture: each
 * geometry gets a column grid (`lib/ground-index`), built in the background a few milliseconds per frame. Until a
 * geometry's grid is ready it is skipped, so the pivot's shadow may appear a moment after a capture loads.
 */
export class GroundIndex {
	private readonly builders = new WeakMap<THREE.BufferGeometry, GroundGridBuilder>()
	private readonly queue: THREE.BufferGeometry[] = []
	private readonly ray = new THREE.Raycaster()
	private readonly forget = (event: { target: THREE.BufferGeometry }) => {
		const at = this.queue.indexOf(event.target)
		if (at >= 0) this.queue.splice(at, 1)
	}

	/** Queues the meshes under `root` for indexing. */
	track(root: THREE.Object3D): void {
		root.traverse(object => {
			if (!(object instanceof THREE.Mesh)) return
			const geometry = object.geometry as THREE.BufferGeometry
			const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
			if (!position || this.builders.has(geometry)) return
			if (!geometry.boundingBox) geometry.computeBoundingBox()
			const box = geometry.boundingBox as THREE.Box3
			const bounds = { minX: box.min.x, minZ: box.min.z, maxX: box.max.x, maxZ: box.max.z }
			this.builders.set(geometry, new GroundGridBuilder(position, geometry.index, bounds))
			geometry.addEventListener('dispose', this.forget)
			this.queue.push(geometry)
		})
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
			if ((this.builders.get(geometry) as GroundGridBuilder).step(STEP_TRIANGLES)) {
				this.queue.shift()
				geometry.removeEventListener('dispose', this.forget)
			}
		}
	}

	/** Calls `visit` with the world height of every face of `mesh` crossed by a vertical line through `(x, z)`. */
	heights(mesh: THREE.Mesh, x: number, z: number, top: number, visit: (height: number) => void): void {
		const geometry = mesh.geometry as THREE.BufferGeometry
		const material = mesh.material as THREE.Material | THREE.Material[]
		if (Array.isArray(material) || !upright(mesh.matrixWorld)) {
			this.cast(mesh, x, z, top, visit)
			return
		}
		const grid: GroundGrid | null | undefined = this.builders.get(geometry)?.grid
		if (!grid) return
		const e = mesh.matrixWorld.elements
		const position = geometry.getAttribute('position') as THREE.BufferAttribute
		const corners = geometry.index ? geometry.index.count : position.count
		const start = Math.max(0, geometry.drawRange.start)
		const query = {
			x: (x - e[12]) / e[0],
			z: (z - e[14]) / e[10],
			facing: FACING[material.side],
			start,
			end: Math.min(corners, start + geometry.drawRange.count),
		}
		groundHeights(grid, position, geometry.index, query, height => {
			const world = height * e[5] + e[13]
			if (world <= top && world >= top - GROUND_ABOVE - GROUND_BELOW) visit(world)
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
