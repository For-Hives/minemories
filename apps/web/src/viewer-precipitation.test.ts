import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import { ViewerPrecipitation } from './viewer-precipitation'

test('weather animates a bounded particle field, respects motion/quality controls and releases GPU resources', () => {
	const weather = new ViewerPrecipitation()
	const center = new THREE.Vector3(3, 12, -8)
	expect(weather.points.geometry.getAttribute('position').count).toBe(768)
	weather.update(1, 'rain', center, true)
	expect(weather.points.visible).toBe(true)
	expect(weather.points.position.toArray()).toEqual(center.toArray())
	const material = weather.points.material as THREE.ShaderMaterial
	expect(material.uniforms.time?.value).toBe(1)
	weather.update(1, 'snow', center, true)
	expect(material.uniforms.snow?.value).toBe(1)
	weather.update(1, 'snow', center, false)
	expect(weather.points.visible).toBe(false)
	expect(material.uniforms.time?.value).toBe(2)
	weather.update(1, 'clear', center, true)
	expect(weather.points.visible).toBe(false)
	const geometryDispose = vi.spyOn(weather.points.geometry, 'dispose')
	const materialDispose = vi.spyOn(material, 'dispose')
	weather.dispose()
	expect(geometryDispose).toHaveBeenCalledOnce()
	expect(materialDispose).toHaveBeenCalledOnce()
})
