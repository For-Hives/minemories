import * as THREE from 'three'
import {
	type BlockBounds,
	type BlockPoint,
	buildPrimitive,
	createCapture,
	type EvolutionCapture,
	type EvolutionPrimitive,
} from './lib/world-evolution'

export interface WorldLight {
	position: THREE.Vector3
	color: THREE.Color
	intensity: number
	distance: number
}

export interface WorldLayer {
	readonly root: THREE.Object3D
	readonly capture: EvolutionCapture
	readonly meshes: readonly { mesh: THREE.Mesh; primitive: EvolutionPrimitive }[]
	readonly lights: readonly WorldLight[]
}

function localPositions(mesh: THREE.Mesh, root: THREE.Object3D): Float32Array {
	const attribute = mesh.geometry.getAttribute('position')
	const relative = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld)
	const point = new THREE.Vector3(),
		positions = new Float32Array(attribute.count * 3)
	for (let vertex = 0; vertex < attribute.count; vertex++) {
		point.fromBufferAttribute(attribute, vertex).applyMatrix4(relative)
		positions.set([point.x, point.y, point.z], vertex * 3)
	}
	return positions
}

/**
 * Turns an imported capture into a composable layer: triangles are sorted per chunk column once and each mesh
 * draws a shared, rewritable index buffer. Point lights are detached so the scene keeps a constant light count.
 */
export function prepareLayer(root: THREE.Object3D, origin: BlockPoint, bounds: BlockBounds): WorldLayer {
	root.updateMatrixWorld(true)
	const meshes: { mesh: THREE.Mesh; primitive: EvolutionPrimitive }[] = [],
		lights: WorldLight[] = [],
		detached: THREE.Object3D[] = []
	root.traverse(object => {
		if (object instanceof THREE.PointLight) {
			lights.push({
				position: root.worldToLocal(object.getWorldPosition(new THREE.Vector3())),
				color: object.color.clone(),
				intensity: object.intensity,
				distance: object.distance,
			})
			detached.push(object)
			return
		}
		if (!(object instanceof THREE.Mesh && object.geometry.getAttribute('position'))) return
		const geometry = object.geometry as THREE.BufferGeometry
		const primitive = buildPrimitive(localPositions(object, root), geometry.index?.array ?? null, origin)
		const index = new THREE.BufferAttribute(primitive.visible, 1)
		index.setUsage(THREE.DynamicDrawUsage)
		geometry.setIndex(index)
		geometry.setDrawRange(0, 0)
		meshes.push({ mesh: object, primitive })
	})
	for (const light of detached) light.removeFromParent()
	return {
		root,
		meshes,
		lights,
		capture: createCapture(
			bounds,
			meshes.map(entry => entry.primitive)
		),
	}
}

/** Uploads the composed index ranges; empty meshes cost no draw call. */
export function applyLayer(layer: WorldLayer): void {
	for (const { mesh, primitive } of layer.meshes) {
		const index = mesh.geometry.index as THREE.BufferAttribute
		mesh.geometry.setDrawRange(0, primitive.count)
		mesh.visible = primitive.count > 0
		if (primitive.count === 0) continue
		index.clearUpdateRanges()
		index.addUpdateRange(0, primitive.count)
		index.needsUpdate = true
	}
}

/** One light per 6-block cell, strongest first, weighted by distance: far lava must not use the whole budget. */
export function chooseLights<T extends WorldLight>(lights: readonly T[], focus: THREE.Vector3, limit = 12): T[] {
	const cellSize = 6
	const cells = new Map<string, T>()
	for (const light of lights) {
		const { x, y, z } = light.position
		const cell = `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)},${Math.floor(z / cellSize)}`
		const current = cells.get(cell)
		if (!current || light.intensity > current.intensity) cells.set(cell, light)
	}
	const relevance = (light: T) => light.intensity / (1 + light.position.distanceToSquared(focus) / 400)
	return [...cells.values()].sort((left, right) => relevance(right) - relevance(left)).slice(0, limit)
}
