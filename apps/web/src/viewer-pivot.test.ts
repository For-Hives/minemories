import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import { ViewerPivot } from './viewer-pivot'

function parts(pivot: ViewerPivot) {
	const [ring, shadow, stem] = pivot.object.children as [THREE.LineSegments, THREE.Mesh, THREE.Line]
	return { ring, shadow, stem }
}

test('the pivot gizmo follows the orbit target while interacting, then fades out and frees its GPU resources', () => {
	const pivot = new ViewerPivot()
	const { ring } = parts(pivot)
	const camera = new THREE.PerspectiveCamera()
	camera.position.set(0, 0, 10)
	const target = new THREE.Vector3(1, 2, 3)
	const material = ring.material as THREE.LineBasicMaterial
	expect(pivot.wanted).toBe(false)
	pivot.update(0.1, camera, target, true)
	expect(pivot.object.visible).toBe(false)
	pivot.show()
	expect(pivot.wanted).toBe(true)
	pivot.update(0.1, camera, target, true)
	expect(pivot.object.visible).toBe(true)
	expect(pivot.object.position.toArray()).toEqual([1, 2, 3])
	expect(ring.scale.x).toBeCloseTo(camera.position.distanceTo(target) * 0.045)
	pivot.update(1, camera, target, true)
	expect(material.opacity).toBeCloseTo(0.55)
	pivot.update(1, camera, target, false)
	pivot.update(1, camera, target, true)
	pivot.show()
	pivot.release()
	pivot.update(1, camera, target, true)
	expect(material.opacity).toBeGreaterThan(0)
	pivot.update(1, camera, target, true)
	pivot.update(1, camera, target, true)
	expect(pivot.object.visible).toBe(false)
	expect(pivot.wanted).toBe(false)
	const disposals = [ring.material, ring.geometry].map(resource => vi.spyOn(resource as THREE.Material, 'dispose'))
	pivot.dispose()
	for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce()
})

test('a soft shadow marks the nearest surface below or above the pivot, spreading and fading with distance', () => {
	const pivot = new ViewerPivot()
	const { shadow, stem } = parts(pivot)
	const camera = new THREE.PerspectiveCamera()
	camera.position.set(0, 0, 10)
	const target = new THREE.Vector3(0, 0, 0)
	pivot.show()
	pivot.update(1, camera, target, true, -0.1)
	expect(shadow.visible).toBe(true)
	expect(stem.visible).toBe(false)
	const near = (shadow.material as THREE.MeshBasicMaterial).opacity
	pivot.update(1, camera, target, true, -20)
	expect(shadow.position.y).toBeCloseTo(-19.98)
	expect(stem.visible).toBe(true)
	expect(stem.scale.y).toBe(20)
	expect((shadow.material as THREE.MeshBasicMaterial).opacity).toBeLessThan(near)
	pivot.update(1, camera, target, true, 5)
	expect(shadow.visible).toBe(true)
	expect(shadow.position.y).toBeCloseTo(5.02)
	expect(stem.scale.y).toBe(-5)
	pivot.update(1, camera, target, true, null)
	expect(shadow.visible).toBe(false)
	expect(stem.visible).toBe(false)
})
