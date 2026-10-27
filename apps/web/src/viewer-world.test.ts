import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import { WorldComposition } from './lib/world-evolution'
import { applyLayer, chooseLights, prepareLayer } from './viewer-world'

function quadMesh(x: number) {
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute([x, 1, 0, x, 1, 1, x + 1, 1, 1, x + 1, 1, 0], 3))
	geometry.setIndex([0, 1, 2, 0, 2, 3])
	return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: x === 0 ? atlas : null }))
}

const atlas = new THREE.Texture()
const bounds = { minX: -8, minY: 0, minZ: -8, maxX: 40, maxY: 100, maxZ: 8 }

test('layers detach lights, share rewritable index buffers and draw only composed triangles', () => {
	const root = new THREE.Group()
	const moved = new THREE.Group()
	moved.position.set(20, 0, 0)
	moved.add(quadMesh(0))
	const light = new THREE.PointLight(0xff0000, 50, 8)
	light.position.set(1, 2, 3)
	root.add(quadMesh(0), moved, light, new THREE.Mesh(new THREE.BufferGeometry()))
	const layer = prepareLayer(root, { x: 0, y: 63, z: 0 }, bounds)
	expect(light.parent).toBeNull()
	expect(layer.lights[0]?.position.toArray()).toEqual([1, 2, 3])
	expect(layer.meshes).toHaveLength(2)
	expect(layer.capture.cells.size).toBe(2)
	const [first, second] = layer.meshes
	expect(first?.mesh.geometry.index?.array).toBe(first?.primitive.visible)
	const composition = new WorldComposition(1)
	composition.set(0, layer.capture)
	composition.compose(0)
	applyLayer(layer)
	expect(first?.mesh.geometry.drawRange.count).toBe(6)
	expect(second?.mesh.visible).toBe(true)
	expect(first?.mesh.geometry.index?.updateRanges).toEqual([{ start: 0, count: 6 }])
	if (first) first.primitive.count = 0
	applyLayer(layer)
	expect(first?.mesh.visible).toBe(false)
	expect(layer.resident).toBe(true)
	for (const entry of layer.meshes) entry.primitive.count = 0
	const disposed = vi.fn()
	for (const texture of layer.textures) texture.addEventListener('dispose', disposed)
	applyLayer(layer)
	applyLayer(layer)
	expect(layer.resident).toBe(false)
	expect(disposed).toHaveBeenCalledTimes(1)
	if (second) second.primitive.count = 6
	applyLayer(layer)
	expect(layer.resident).toBe(true)
	expect(disposed).toHaveBeenCalledTimes(1)
})

test('one light per cell, strongest and nearest first, within the limit', () => {
	const light = (x: number, intensity: number) => ({
		position: new THREE.Vector3(x, 0, 0),
		color: new THREE.Color(),
		intensity,
		distance: 4,
	})
	const lights = [light(0, 1), light(1, 5), light(100, 50), light(20, 3)]
	expect(chooseLights(lights, new THREE.Vector3(), 2).map(item => item.position.x)).toEqual([1, 100])
	expect(chooseLights([light(1, 1), light(2, 0.5)], new THREE.Vector3())).toHaveLength(1)
})
