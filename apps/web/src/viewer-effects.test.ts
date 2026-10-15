import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import { disposeImportedObject as disposeModel } from './viewer-scene'

test('releasing a world releases shared material and texture resources once', () => {
	const texture = new THREE.Texture()
	const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture })
	const root = new THREE.Group()
	root.add(new THREE.Mesh(new THREE.BoxGeometry(), material), new THREE.Mesh(new THREE.BoxGeometry(), [material]))
	const materialDispose = vi.spyOn(material, 'dispose')
	const textureDispose = vi.spyOn(texture, 'dispose')
	disposeModel(root)
	expect(materialDispose).toHaveBeenCalledTimes(1)
	expect(textureDispose).toHaveBeenCalledTimes(1)
})
