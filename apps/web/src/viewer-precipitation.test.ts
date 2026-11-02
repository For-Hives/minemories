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

test('weather is sheltered below the highest surface of each column', () => {
	const weather = new ViewerPrecipitation()
	const rain = weather.object.children[0] as THREE.LineSegments
	const material = rain.material as THREE.ShaderMaterial
	expect(material.uniforms.hasCeiling?.value).toBe(0)
	expect(material.vertexShader).toContain('vSheltered')
	expect(material.fragmentShader).toContain('discard')
	weather.setCeiling({ data: new Float32Array([1, 2, 3, 4]), width: 2, depth: 2, minX: -1, minZ: 5, cell: 3 })
	expect(material.uniforms.hasCeiling?.value).toBe(1)
	expect((material.uniforms.ceilingRect as { value: THREE.Vector4 }).value.toArray()).toEqual([-1, 5, 6, 6])
	const texture = material.uniforms.ceilingMap?.value as THREE.DataTexture
	const dispose = vi.spyOn(texture, 'dispose')
	weather.setCeiling(null)
	expect(dispose).toHaveBeenCalledOnce()
	expect(material.uniforms.ceilingMap?.value).toBeNull()
	weather.setCeiling({ data: new Float32Array([1]), width: 1, depth: 1, minX: 0, minZ: 0, cell: 1 })
	weather.dispose()
})
