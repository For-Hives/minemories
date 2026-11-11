import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import {
	createFaithfulUniforms,
	faithfulLightsChunk,
	patchFaithfulShader,
	prepareFaithfulLighting,
	setLightVolume,
} from './viewer-faithful'
import { prepareWater } from './viewer-water'

function standardShader() {
	return {
		uniforms: {},
		vertexShader: THREE.ShaderLib.physical.vertexShader,
		fragmentShader: THREE.ShaderLib.physical.fragmentShader,
	} as unknown as THREE.WebGLProgramParametersWithUniforms
}

test('block light is read from the light volume right after the point lights, before sun and sky light', () => {
	const chunk = faithfulLightsChunk()
	const block = chunk.indexOf('memoryBlockLight = diffuseColor.rgb * memoryBlockFactor;')
	expect(chunk).toContain('texture( memoryLightVolume, memoryVolumeUv )')
	expect(block).toBeGreaterThan(chunk.indexOf('#if ( NUM_POINT_LIGHTS > 0 )'))
	const laterLights = [
		'#if ( NUM_SPOT_LIGHTS > 0 )',
		'#if ( NUM_SUN_LIGHTS > 0 )',
		'#if ( NUM_DIR_LIGHTS > 0 )',
		'#if defined( RE_IndirectDiffuse )',
	]
	for (const later of laterLights) expect(block).toBeLessThan(chunk.indexOf(later))
	expect(faithfulLightsChunk('void main() {}')).toBe('void main() {}')
})

test('the faithful branch replaces the PBR result with face shade, sky light and capped block light', () => {
	const uniforms = createFaithfulUniforms()
	const shader = standardShader()
	patchFaithfulShader(shader, uniforms)
	expect(shader.uniforms.memoryFaithful).toBe(uniforms.memoryFaithful)
	expect(shader.uniforms.memoryFaithfulSky).toBe(uniforms.memoryFaithfulSky)
	expect(shader.fragmentShader).toContain('uniform float memoryFaithful;')
	expect(shader.fragmentShader).toContain('vec3 memoryBlockLight = vec3( 0.0 );')
	expect(shader.fragmentShader).not.toContain('#include <lights_fragment_begin>')
	expect(shader.fragmentShader).toContain('0.60 + memoryNormal.y * memoryNormal.y * memoryVertical')
	expect(shader.fragmentShader).toContain('memoryNormal.y > 0.0 ? 1.00 : 0.50')
	// Alpha is written by the untouched opaque chunk, after the faithful colour.
	expect(shader.fragmentShader.indexOf('outgoingLight = max(')).toBeLessThan(
		shader.fragmentShader.indexOf('#include <opaque_fragment>')
	)
	expect(uniforms.memoryFaithful.value).toBe(0)
	expect(uniforms.memoryFaithfulSky.value.toArray()).toEqual([1, 1, 1])
	expect(shader.fragmentShader).toContain('uniform vec3 memoryFaithfulSky;')
	expect(shader.fragmentShader).toContain('uniform highp sampler3D memoryLightVolume;')
	expect(shader.uniforms.memoryLightVolume).toBe(uniforms.memoryLightVolume)
	expect(shader.uniforms.memoryLightOrigin).toBe(uniforms.memoryLightOrigin)
	expect(shader.uniforms.memoryLightScale).toBe(uniforms.memoryLightScale)
	expect(shader.vertexShader).toContain('memoryWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;')
})

test('imported PBR materials are patched once and keep the water shader', () => {
	const uniforms = createFaithfulUniforms()
	const water = new THREE.MeshStandardMaterial({ name: 'minecraft:water' })
	prepareWater(water, { value: 0 })
	expect(prepareFaithfulLighting(water, uniforms)).toBe(true)
	expect(prepareFaithfulLighting(water, uniforms)).toBe(true)
	expect(water.customProgramCacheKey()).toContain('minemories-water-v1:minemories-faithful-v2')
	const shader = standardShader()
	water.onBeforeCompile(shader, {} as THREE.WebGLRenderer)
	expect(shader.uniforms.memoryWaterTime).toBeDefined()
	expect(shader.fragmentShader).toContain('memoryFaithfulSky')
	expect(shader.fragmentShader.match(/uniform float memoryFaithful;/g)).toHaveLength(1)
	const basic = new THREE.MeshBasicMaterial()
	const compile = vi.fn()
	basic.onBeforeCompile = compile
	expect(prepareFaithfulLighting(basic, uniforms)).toBe(false)
	expect(basic.onBeforeCompile).toBe(compile)
})

test('swapping the light volume keeps the sampler and releases the previous texture', () => {
	const uniforms = createFaithfulUniforms()
	const first = uniforms.memoryLightVolume.value
	const disposeFirst = vi.spyOn(first, 'dispose')
	setLightVolume(uniforms, { origin: [-3, 0, 5], cell: 2, size: [2, 4, 8], data: new Uint8Array(2 * 4 * 8 * 4) })
	expect(disposeFirst).toHaveBeenCalledOnce()
	const volume = uniforms.memoryLightVolume.value
	expect(volume).not.toBe(first)
	expect([volume.image.width, volume.image.height, volume.image.depth]).toEqual([2, 4, 8])
	expect(uniforms.memoryLightOrigin.value.toArray()).toEqual([-3, 0, 5])
	expect(uniforms.memoryLightScale.value.toArray()).toEqual([1 / 4, 1 / 8, 1 / 16])
	const disposeVolume = vi.spyOn(volume, 'dispose')
	setLightVolume(uniforms, null)
	expect(disposeVolume).toHaveBeenCalledOnce()
	expect(uniforms.memoryLightVolume.value.image.width).toBe(1)
	expect(uniforms.memoryLightOrigin.value.x).toBeGreaterThan(1e8)
})
