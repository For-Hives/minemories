import * as THREE from 'three'
import { expect, test } from 'vitest'
import { framingBounds } from './viewer-framing'

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
