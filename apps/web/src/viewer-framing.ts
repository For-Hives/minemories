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

/** Only explicit local coordinates are trustworthy; legacy x/y/z were volume centres. */
export function capturePosition(root: THREE.Object3D): THREE.Vector3 | null {
	const value: unknown = root.userData.minemoriesPlayerPosition
	if (
		!Array.isArray(value) ||
		value.length !== 3 ||
		!value.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 60000000)
	)
		return null
	return root.localToWorld(new THREE.Vector3(value[0], value[1], value[2]))
}

/**
 * Orbit focus of a capture: the recorded player when they stood inside it, else the topmost visible surface at
 * its centre. A selection made from afar, or a deep volume, must never leave the pivot floating in empty air.
 */
export function orbitFocus(root: THREE.Object3D): THREE.Vector3 {
	const bounds = framingBounds(root)
	const player = capturePosition(root)
	if (player && bounds.clone().expandByScalar(2).containsPoint(player)) return player
	const center = bounds.getCenter(new THREE.Vector3())
	const meshes: THREE.Object3D[] = []
	root.traverseVisible(object => {
		if (object instanceof THREE.Mesh && !isLightBeam(object.material as THREE.Material)) meshes.push(object)
	})
	const ray = new THREE.Raycaster(
		new THREE.Vector3(center.x, bounds.max.y + 1, center.z),
		new THREE.Vector3(0, -1, 0),
		0,
		bounds.max.y - bounds.min.y + 2
	)
	return ray.intersectObjects(meshes, false)[0]?.point.clone() ?? surfaceFocus(bounds)
}
