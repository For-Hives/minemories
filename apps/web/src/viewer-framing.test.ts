import * as THREE from 'three'
import { expect, test } from 'vitest'
import { framingBounds, orbitFocus } from './viewer-framing'

test('a distant beacon does not displace the initial framing of the actual world', () => {
	const root = new THREE.Group()
	const terrain = new THREE.Mesh(new THREE.BoxGeometry(64, 128, 64), new THREE.MeshStandardMaterial())
	const beamMaterial = new THREE.MeshStandardMaterial({ name: 'minecraft:beacon / textures/entity/beacon_beam.png' })
	const beam = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1000, 0.2), beamMaterial)
	beam.position.y = 500
	root.position.set(10, 20, 30)
	root.add(terrain, beam)
	const bounds = framingBounds(root)
	expect(bounds.min.toArray()).toEqual([-22, -44, -2])
	expect(bounds.max.toArray()).toEqual([42, 84, 62])
	expect(beam.visible).toBe(true)
	terrain.geometry.dispose()
	terrain.material.dispose()
	beam.geometry.dispose()
	beamMaterial.dispose()
})

test('a beam-only GLB still has a finite usable frame', () => {
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 20, 1), new THREE.MeshBasicMaterial({ name: 'beacon_beam' }))
	expect(framingBounds(mesh).max.y).toBe(10)
	mesh.geometry.dispose()
	mesh.material.dispose()
})

test('explicit player coordinates are transformed from capture space; malformed extras are ignored', async () => {
	const { capturePosition } = await import('./viewer-framing')
	const root = new THREE.Group()
	root.position.set(10, -20, 30)
	for (const value of [undefined, [], [0, 1], ['1', 2, 3], [NaN, 2, 3], [Infinity, 2, 3], [1e12, 2, 3]]) {
		root.userData.minemoriesPlayerPosition = value
		expect(capturePosition(root)).toBeNull()
	}
	root.userData.minemoriesPlayerPosition = [2, 4, 6]
	expect(capturePosition(root)?.toArray()).toEqual([12, -16, 36])
})

test('the orbit focus is the recorded player inside the capture, else the topmost surface at its centre', () => {
	const root = new THREE.Group()
	const ground = new THREE.Mesh(new THREE.BoxGeometry(32, 1, 32))
	ground.position.y = -40
	const tower = new THREE.Mesh(new THREE.BoxGeometry(2, 80, 2))
	tower.position.set(12, 0, 12)
	root.add(ground, tower)
	root.position.set(100, 0, 0)
	root.updateMatrixWorld(true)
	expect(orbitFocus(root).toArray()).toEqual([100, -39.5, 0])
	root.userData.minemoriesPlayerPosition = [3, -39.5, 4]
	expect(orbitFocus(root).toArray()).toEqual([103, -39.5, 4])
	root.userData.minemoriesPlayerPosition = [300, 0, 0]
	expect(orbitFocus(root).toArray()).toEqual([100, -39.5, 0])
	const hollow = new THREE.Group()
	hollow.add(
		new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)).translateX(10),
		new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)).translateX(-10)
	)
	hollow.updateMatrixWorld(true)
	expect(orbitFocus(hollow).toArray()).toEqual([0, 0, 0])
})
