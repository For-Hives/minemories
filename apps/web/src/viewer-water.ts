import type * as THREE from 'three'

const preparedWater = new WeakSet<THREE.Material>()
const waterMaterialName = /(?:minecraft:water\b|block\/water_(?:still|flow))/

/** Recognize exported Minecraft water, never infer glass/water from transparency alone. */
export function prepareWater(material: THREE.MeshStandardMaterial, time: THREE.IUniform<number>): boolean {
	if (!waterMaterialName.test(material.name)) return false
	material.roughness = 0.12
	material.envMapIntensity = 1.15
	if (preparedWater.has(material)) return true
	preparedWater.add(material)
	const cacheKey = `${material.customProgramCacheKey()}:minemories-water-v1`
	const previousCompile = material.onBeforeCompile
	material.onBeforeCompile = (shader, renderer) => {
		previousCompile.call(material, shader, renderer)
		shader.uniforms.memoryWaterTime = time
		shader.vertexShader = `varying vec3 memoryWaterPosition;\n${shader.vertexShader}`.replace(
			'#include <worldpos_vertex>',
			'#include <worldpos_vertex>\nmemoryWaterPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;'
		)
		shader.fragmentShader =
			`uniform float memoryWaterTime; varying vec3 memoryWaterPosition;\n${shader.fragmentShader}`.replace(
				'#include <normal_fragment_maps>',
				`#include <normal_fragment_maps>
			vec2 wave = vec2(
				sin(memoryWaterPosition.x * 1.7 + memoryWaterPosition.z * 0.8 + memoryWaterTime * 0.6),
				cos(memoryWaterPosition.z * 1.9 - memoryWaterPosition.x * 0.6 + memoryWaterTime * 0.45)
			) * 0.065;
			normal = normalize(normal + mat3(viewMatrix) * vec3(wave.x, 0.0, wave.y));`
			)
	}
	material.customProgramCacheKey = () => cacheKey
	return true
}
