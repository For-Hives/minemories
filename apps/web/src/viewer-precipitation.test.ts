import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import { ViewerPrecipitation } from './viewer-precipitation'

test('weather animates a bounded Minecraft-style particle field and releases GPU resources', () => {
	const weather = new ViewerPrecipitation()
	const center = new THREE.Vector3(3, 12, -8)
	const [rain, snow] = weather.object.children as [THREE.LineSegments, THREE.Points]
	expect(rain.geometry.getAttribute('position').count).toBe(10_000)
	expect(snow.geometry.getAttribute('position').count).toBe(2500)
	weather.update(1, 'rain', center, true, 0.5)
	expect(weather.object.visible).toBe(true)
	expect([rain.visible, snow.visible]).toEqual([true, false])
	expect(weather.object.position.toArray()).toEqual(center.toArray())
	const material = rain.material as THREE.ShaderMaterial
	expect(material.uniforms.time?.value).toBe(1)
	expect(material.uniforms.light?.value).toBe(0.5)
	weather.update(1, 'snow', center, true)
	expect([rain.visible, snow.visible]).toEqual([false, true])
	weather.update(1, 'snow', center, false)
	expect(weather.object.visible).toBe(false)
	expect(material.uniforms.time?.value).toBe(2)
	weather.update(1, 'clear', center, true)
	expect(weather.object.visible).toBe(false)
	const disposals = [rain.geometry, snow.geometry, material, snow.material as THREE.Material].map(item =>
		vi.spyOn(item, 'dispose')
	)
	weather.dispose()
	for (const spy of disposals) expect(spy).toHaveBeenCalledOnce()
})
