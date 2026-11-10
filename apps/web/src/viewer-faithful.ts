import * as THREE from 'three'
import { FACE_SHADE } from './lib/viewer-lighting'

/** Shared by every imported material, so switching the lighting style is a uniform flip, never a recompilation. */
export interface FaithfulUniforms {
	memoryFaithful: THREE.IUniform<number>
	/** Linear sky light colour of the hour. */
	memoryFaithfulSky: THREE.IUniform<THREE.Color>
}

export function createFaithfulUniforms(): FaithfulUniforms {
	return { memoryFaithful: { value: 0 }, memoryFaithfulSky: { value: new THREE.Color(1, 1, 1) } }
}

/** Point lights run first in three.js's light loop: what they added so far is the captured block light. */
const afterPointLights = '#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )'

export function faithfulLightsChunk(chunk = THREE.ShaderChunk.lights_fragment_begin): string {
	if (!chunk.includes(afterPointLights)) return chunk
	return chunk.replace(afterPointLights, `memoryBlockLight = reflectedLight.directDiffuse;\n${afterPointLights}`)
}

const glslNumber = (value: number) => value.toFixed(2)

/**
 * The game's look: base colour × face shade × sky light (both sRGB multipliers, hence the 2.2 power),
 * block light from captured lights and emissive blocks on top, capped at the full-daylight face colour.
 * Alpha, alpha test and water transparency stay those of the material; no sun, shadow or reflection.
 */
const faithfulFragment = `
if ( memoryFaithful > 0.5 ) {
	vec3 memoryNormal = normalize( ( vec4( nonPerturbedNormal, 0.0 ) * viewMatrix ).xyz );
	float memoryVertical = memoryNormal.y > 0.0 ? ${glslNumber(FACE_SHADE.up)} : ${glslNumber(FACE_SHADE.down)};
	float memoryShade = pow( memoryNormal.x * memoryNormal.x * ${glslNumber(FACE_SHADE.eastWest)} + memoryNormal.y * memoryNormal.y * memoryVertical + memoryNormal.z * memoryNormal.z * ${glslNumber(FACE_SHADE.northSouth)}, 2.2 );
	vec3 memoryFull = diffuseColor.rgb * memoryShade;
	vec3 memoryLit = min( memoryFull * memoryFaithfulSky + memoryBlockLight * memoryShade, memoryFull );
	outgoingLight = max( memoryLit, min( totalEmissiveRadiance, memoryFull ) );
}
#include <opaque_fragment>`

export function patchFaithfulShader(shader: THREE.WebGLProgramParametersWithUniforms, uniforms: FaithfulUniforms) {
	shader.uniforms.memoryFaithful = uniforms.memoryFaithful
	shader.uniforms.memoryFaithfulSky = uniforms.memoryFaithfulSky
	shader.fragmentShader = `uniform float memoryFaithful;\nuniform vec3 memoryFaithfulSky;\n${shader.fragmentShader}`
		.replace('#include <lights_fragment_begin>', `vec3 memoryBlockLight = vec3( 0.0 );\n${faithfulLightsChunk()}`)
		.replace('#include <opaque_fragment>', faithfulFragment)
}

const patched = new WeakSet<THREE.Material>()

/** Adds the faithful branch to an imported PBR material once; other material kinds are left alone. */
export function prepareFaithfulLighting(material: THREE.Material, uniforms: FaithfulUniforms): boolean {
	if (!(material as THREE.MeshStandardMaterial).isMeshStandardMaterial) return false
	if (patched.has(material)) return true
	patched.add(material)
	const cacheKey = `${material.customProgramCacheKey()}:minemories-faithful-v1`
	const previousCompile = material.onBeforeCompile
	material.onBeforeCompile = (shader, renderer) => {
		previousCompile.call(material, shader, renderer)
		patchFaithfulShader(shader, uniforms)
	}
	material.customProgramCacheKey = () => cacheKey
	return true
}
