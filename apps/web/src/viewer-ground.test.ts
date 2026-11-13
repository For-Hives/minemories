import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import { GROUND_ABOVE, GROUND_BELOW, GroundIndex } from './viewer-ground'

function drain(index: GroundIndex) {
	while (index.pending) index.work(1000)
}

function viaIndex(index: GroundIndex, meshes: THREE.Mesh[], x: number, z: number, top: number): number[] {
	const found: number[] = []
	for (const mesh of meshes) index.heights(mesh, x, z, top, height => found.push(height))
	return found.sort((a, b) => a - b)
}

function viaRay(meshes: THREE.Mesh[], x: number, z: number, top: number): number[] {
	const ray = new THREE.Raycaster(
		new THREE.Vector3(x, top, z),
		new THREE.Vector3(0, -1, 0),
		0,
		GROUND_ABOVE + GROUND_BELOW
	)
	return ray
		.intersectObjects(meshes, false)
		.map(hit => hit.point.y)
		.sort((a, b) => a - b)
}

function expectSame(a: number[], b: number[]) {
	expect(a.length).toBe(b.length)
	a.forEach((value, i) => {
		expect(value).toBeCloseTo(b[i] as number, 5)
	})
}

test('finds the same surfaces as a raycast through every face, for each side a material shows', () => {
	let seed = 11
	const random = () => {
		seed = (seed * 16807) % 2147483647
		return seed / 2147483647
	}
	const sides = [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide]
	const root = new THREE.Group()
	const meshes: THREE.Mesh[] = []
	for (let k = 0; k < 24; k++) {
		const geometry = k % 2 ? new THREE.BoxGeometry(3, 1, 2) : new THREE.IcosahedronGeometry(1.5, 1).toNonIndexed()
		const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: sides[k % 3] as THREE.Side }))
		mesh.position.set(random() * 16 - 8, random() * 10 - 5, random() * 16 - 8)
		mesh.scale.set(0.5 + random(), 0.5 + random(), 0.5 + random())
		root.add(mesh)
		meshes.push(mesh)
	}
	root.position.set(100, -40, 3)
	root.updateMatrixWorld(true)
	const index = new GroundIndex()
	index.track(root)
	drain(index)
	let crossed = 0
	for (let k = 0; k < 400; k++) {
		const x = 100 + random() * 20 - 10
		const z = 3 + random() * 20 - 10
		const top = -40 + random() * 20 - 10 + GROUND_ABOVE
		const expected = viaRay(meshes, x, z, top)
		crossed += expected.length
		expectSame(viaIndex(index, meshes, x, z, top), expected)
	}
	expect(crossed).toBeGreaterThan(100)
})

test('keeps the probe window, the drawn range, and falls back to a raycast for turned or multi-material meshes', () => {
	const index = new GroundIndex()
	const far = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4))
	far.position.y = -600
	const partial = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4))
	partial.geometry.setDrawRange(0, 12)
	const turned = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4))
	turned.position.y = 3
	turned.rotation.y = 0.3
	const mirrored = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4))
	mirrored.position.y = 6
	mirrored.scale.x = -1
	const grouped = new THREE.Mesh(
		new THREE.BoxGeometry(4, 1, 4),
		Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial())
	)
	grouped.position.y = 9
	const meshes = [far, partial, turned, mirrored, grouped]
	const root = new THREE.Group().add(...meshes)
	root.updateMatrixWorld(true)
	index.track(root)
	drain(index)
	expect(viaIndex(index, [far], 0.3, 0.2, 0 + GROUND_ABOVE)).toEqual([])
	// The first 12 corners of a box are its +x and -x sides: walls, nothing to stand on.
	expect(viaIndex(index, [partial], 0.3, 0.2, GROUND_ABOVE)).toEqual([])
	for (const mesh of [turned, mirrored, grouped])
		expectSame(viaIndex(index, [mesh], 0.3, 0.2, GROUND_ABOVE), viaRay([mesh], 0.3, 0.2, GROUND_ABOVE))
	expect(viaIndex(index, [turned], 0.3, 0.2, GROUND_ABOVE)).toHaveLength(1)
})

test('builds within its time budget, a geometry once, and forgets a geometry disposed before its turn', () => {
	const index = new GroundIndex()
	const big = new THREE.Mesh(new THREE.PlaneGeometry(10, 10, 100, 100).rotateX(-Math.PI / 2))
	const shared = new THREE.Mesh(big.geometry)
	const empty = new THREE.Mesh(new THREE.BufferGeometry())
	const dropped = new THREE.Mesh(new THREE.BoxGeometry())
	const root = new THREE.Group().add(big, shared, empty, dropped, new THREE.Group())
	root.updateMatrixWorld(true)
	index.track(root)
	index.track(root)
	expect(index.pending).toBe(true)
	expect(viaIndex(index, [big], 1, 1, GROUND_ABOVE)).toEqual([])
	let clock = 0
	const now = vi.fn(() => {
		clock += 0.5
		return clock
	})
	index.work(1, now)
	expect(index.pending).toBe(true)
	dropped.geometry.dispose()
	drain(index)
	expect(index.pending).toBe(false)
	expectSame(viaIndex(index, [big, shared], 1.05, 1.03, GROUND_ABOVE), [0, 0])
	expect(viaIndex(index, [dropped], 0.1, 0.1, GROUND_ABOVE)).toEqual([])
	const later = new THREE.Mesh(new THREE.BoxGeometry())
	expect(viaIndex(index, [later], 0.1, 0.1, GROUND_ABOVE)).toEqual([])
	index.track(later)
	index.dispose()
	expect(index.pending).toBe(false)
})
