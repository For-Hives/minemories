import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import { ViewerPivot } from './viewer-pivot'

test('the pivot gizmo follows the orbit target while interacting, then fades out and frees its GPU resources', () => {
	const pivot = new ViewerPivot()
	const camera = new THREE.PerspectiveCamera()
	camera.position.set(0, 0, 10)
	const target = new THREE.Vector3(1, 2, 3)
	const material = pivot.object.material as THREE.LineBasicMaterial
	pivot.update(0.1, camera, target, true)
	expect(pivot.object.visible).toBe(false)
	pivot.show()
	pivot.update(0.1, camera, target, true)
	expect(pivot.object.visible).toBe(true)
	expect(pivot.object.position.toArray()).toEqual([1, 2, 3])
	expect(pivot.object.scale.x).toBeCloseTo(camera.position.distanceTo(target) * 0.045)
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
	const dispose = vi.spyOn(material, 'dispose')
	pivot.dispose()
	expect(dispose).toHaveBeenCalledOnce()
})
