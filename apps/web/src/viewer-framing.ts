import * as THREE from 'three'

export function isLightBeam(material: THREE.Material): boolean {
	return material.name.includes('beacon_beam')
}

/** Beacon effects can extend a kilometre beyond the actual capture. */
export function framingBounds(root: THREE.Object3D): THREE.Box3 {
	root.updateWorldMatrix(true, true)
	const bounds = new THREE.Box3()
	root.traverse(object => {
		if (!(object instanceof THREE.Mesh)) return
		const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material]
		if (materials.every(isLightBeam)) return
		if (!object.geometry.boundingBox) object.geometry.computeBoundingBox()
		if (object.geometry.boundingBox) bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld))
	})
	return bounds.isEmpty() ? new THREE.Box3().setFromObject(root) : bounds
}

export function surfaceFocus(bounds: THREE.Box3): THREE.Vector3 {
	const size = bounds.getSize(new THREE.Vector3())
	const focus = bounds.getCenter(new THREE.Vector3())
	const footprint = Math.max(size.x, size.z, 1)
	if (size.y > footprint * 1.5) focus.y = bounds.max.y - footprint * 0.15
	return focus
}
