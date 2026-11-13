import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import { GroundGridBuilder } from './lib/ground-index'
import { WorldComposition } from './lib/world-evolution'
import { GROUND_ABOVE, GROUND_BELOW, GroundIndex } from './viewer-ground'
import { applyLayer, prepareLayer } from './viewer-world'

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

/** A strip of one-block floor tiles over [x0, x1) at height `y`, each tile its own two triangles. */
function floor(x0: number, x1: number, y: number): THREE.Mesh {
	const points: number[] = []
	for (let x = x0; x < x1; x++) points.push(x, y, 0, x, y, 1, x + 1, y, 1, x, y, 0, x + 1, y, 1, x + 1, y, 0)
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
	return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
}

test('a composed world is indexed from its stable triangle order, and follows each new composition', () => {
	const origin = { x: 0, y: 63, z: 0 }
	const older = new THREE.Group().add(floor(0, 4, 1))
	const newer = new THREE.Group().add(floor(0, 2, 3))
	const layers = [
		prepareLayer(older, origin, { minX: -8, minY: 0, minZ: -8, maxX: 8, maxY: 100, maxZ: 8 }),
		prepareLayer(newer, origin, { minX: 0, minY: 0, minZ: -8, maxX: 1, maxY: 100, maxZ: 8 }),
	]
	// Indexed before any composition, while the layers' index buffers are still empty, as `addLayer` does.
	const index = new GroundIndex()
	for (const root of [older, newer]) index.track(root)
	drain(index)
	const composition = new WorldComposition(2)
	for (const [position, layer] of layers.entries()) composition.set(position, layer.capture)
	const meshes = () => layers.flatMap(layer => layer.meshes.map(entry => entry.mesh)).filter(mesh => mesh.visible)
	const probe = (x: number) => {
		const expected = viaRay(meshes(), x, 0.4, GROUND_ABOVE)
		expectSame(viaIndex(index, meshes(), x, 0.4, GROUND_ABOVE), expected)
		return expected.map(height => Math.round(height * 1e6) / 1e6)
	}
	composition.compose(0)
	for (const layer of layers) applyLayer(layer)
	expect(probe(0.5)).toEqual([1])
	expect(probe(3.5)).toEqual([1])
	composition.compose(1)
	for (const layer of layers) applyLayer(layer)
	expect(probe(0.5)).toEqual([3])
	expect(probe(1.5)).toEqual([3])
	expect(probe(3.5)).toEqual([1])
	composition.compose(0)
	for (const layer of layers) applyLayer(layer)
	expect(probe(0.5)).toEqual([1])
})

test('rebuilds a grid whose geometry got a new index, and raycasts a mesh whose grid could not be built', () => {
	const index = new GroundIndex()
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4))
	mesh.updateMatrixWorld(true)
	index.track(mesh)
	drain(index)
	expect(viaIndex(index, [mesh], 0.3, 0.2, GROUND_ABOVE)).toEqual([0.5])
	const flat = new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2)
	mesh.geometry.setIndex(flat.index)
	mesh.geometry.setAttribute('position', flat.getAttribute('position'))
	mesh.geometry.computeBoundingBox()
	expect(viaIndex(index, [mesh], 0.3, 0.2, GROUND_ABOVE)).toEqual([])
	expect(index.pending).toBe(true)
	drain(index)
	expectSame(viaIndex(index, [mesh], 0.3, 0.2, GROUND_ABOVE), [0])
	const broken = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4))
	broken.updateMatrixWorld(true)
	index.track(broken)
	const failing = vi.spyOn(GroundGridBuilder.prototype, 'step').mockImplementationOnce(() => {
		throw new RangeError('Out of memory')
	})
	expect(() => drain(index)).not.toThrow()
	failing.mockRestore()
	expectSame(viaIndex(index, [broken], 0.3, 0.2, GROUND_ABOVE), viaRay([broken], 0.3, 0.2, GROUND_ABOVE))
	expect(viaIndex(index, [broken], 0.3, 0.2, GROUND_ABOVE)).toEqual([0.5])
})

test('the raycast fallback really applies to turned and mirrored meshes', () => {
	const index = new GroundIndex()
	// A long thin bar turned a quarter: its unturned footprint would answer at x = 3, the turned one at z = 3.
	const turned = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 0.5))
	turned.rotation.y = Math.PI / 2
	// Upside down, a falling ray goes up in the mesh's own space and meets its bottom face, now on top.
	const mirrored = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(-3, 0.2, 0))
	mirrored.position.z = 10
	mirrored.scale.y = -1
	const root = new THREE.Group().add(turned, mirrored)
	root.updateMatrixWorld(true)
	index.track(root)
	drain(index)
	expect(viaIndex(index, [turned], 3, 0.1, GROUND_ABOVE)).toEqual([])
	expectSame(viaIndex(index, [turned], 0.1, 3, GROUND_ABOVE), [0.5])
	const expected = viaRay([mirrored], -3, 10.1, GROUND_ABOVE)
	expect(expected).toHaveLength(1)
	expect(expected[0]).toBeCloseTo(0.3)
	expectSame(viaIndex(index, [mirrored], -3, 10.1, GROUND_ABOVE), expected)
})

test('instanced, skinned and morphed meshes are raycast, since their vertices move at draw time', () => {
	const index = new GroundIndex()
	const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
	const instanced = new THREE.InstancedMesh(plane, new THREE.MeshBasicMaterial(), 2)
	instanced.setMatrixAt(0, new THREE.Matrix4().makeTranslation(10, 5, 0))
	instanced.setMatrixAt(1, new THREE.Matrix4().makeTranslation(20, 7, 0))
	const morphed = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2))
	morphed.geometry.morphAttributes.position = [morphed.geometry.getAttribute('position').clone()]
	morphed.morphTargetInfluences = [0]
	const skinned = new THREE.SkinnedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2))
	const root = new THREE.Group().add(instanced, morphed, skinned)
	root.updateMatrixWorld(true)
	index.track(root)
	drain(index)
	expect(viaIndex(index, [instanced], 0.1, 0.1, GROUND_ABOVE)).toEqual([])
	expectSame(viaIndex(index, [instanced], 10.1, 0.1, GROUND_ABOVE), [5])
	expectSame(viaIndex(index, [morphed], 0.1, 0.1, GROUND_ABOVE), viaRay([morphed], 0.1, 0.1, GROUND_ABOVE))
	// No bones in this fixture: check the route only, three's skinned raycast is its own business.
	const spy = vi.spyOn(skinned, 'raycast').mockImplementation(() => undefined)
	viaIndex(index, [skinned], 0.1, 0.1, GROUND_ABOVE)
	expect(spy).toHaveBeenCalled()
})

test('a queued geometry whose entry went missing is dropped from the queue', () => {
	const index = new GroundIndex()
	const mesh = new THREE.Mesh(new THREE.BoxGeometry())
	index.track(mesh)
	;(index as unknown as { entries: WeakMap<object, unknown> }).entries.delete(mesh.geometry)
	drain(index)
	expect(index.pending).toBe(false)
})
