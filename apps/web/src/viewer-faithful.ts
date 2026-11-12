import * as THREE from 'three'
import type { LightVolume } from './lib/light-volume'
import { FACE_SHADE } from './lib/viewer-lighting'

/** Shared by every imported material, so switching the lighting style is a uniform flip, never a recompilation. */
export interface FaithfulUniforms {
	memoryFaithful: THREE.IUniform<number>
	/** Linear sky light colour of the hour. */
	memoryFaithfulSky: THREE.IUniform<THREE.Color>
	/** Block light as a voxel field (see `lib/light-volume.ts`): the brightest light level per channel, 0-1. */
	memoryLightVolume: THREE.IUniform<THREE.Data3DTexture>
	/** World position of the volume's minimum corner, in blocks. */
	memoryLightOrigin: THREE.IUniform<THREE.Vector3>
	/** One over the volume's size in blocks, per axis. */
	memoryLightScale: THREE.IUniform<THREE.Vector3>
}

/** A 1x1x1 black volume: before any capture (and for captures without lights) the sampler is valid and lights nothing. */
function emptyLightVolume(): THREE.Data3DTexture {
	const texture = new THREE.Data3DTexture(new Uint8Array(4), 1, 1, 1)
	texture.format = THREE.RGBAFormat
	texture.type = THREE.UnsignedByteType
	texture.minFilter = texture.magFilter = THREE.LinearFilter
	texture.unpackAlignment = 1
	texture.needsUpdate = true
	return texture
}

export function createFaithfulUniforms(): FaithfulUniforms {
	return {
		memoryFaithful: { value: 0 },
		memoryFaithfulSky: { value: new THREE.Color(1, 1, 1) },
		memoryLightVolume: { value: emptyLightVolume() },
		memoryLightOrigin: { value: new THREE.Vector3(1e9, 1e9, 1e9) },
		memoryLightScale: { value: new THREE.Vector3(1, 1, 1) },
	}
}

/**
 * Swaps the block light volume every material samples. The sampler type never changes, so no program is rebuilt;
 * the previous texture is released. `null` (a capture without lights) goes back to the black volume.
 */
export function setLightVolume(uniforms: FaithfulUniforms, volume: LightVolume | null): void {
	const previous = uniforms.memoryLightVolume.value
	if (!volume) {
		uniforms.memoryLightVolume.value = emptyLightVolume()
		uniforms.memoryLightOrigin.value.set(1e9, 1e9, 1e9)
	} else {
		const [nx, ny, nz] = volume.size
		const texture = new THREE.Data3DTexture(volume.data, nx, ny, nz)
		texture.format = THREE.RGBAFormat
		texture.type = THREE.UnsignedByteType
		texture.minFilter = texture.magFilter = THREE.LinearFilter
		texture.unpackAlignment = 1
		texture.needsUpdate = true
		uniforms.memoryLightVolume.value = texture
		uniforms.memoryLightOrigin.value.set(...volume.origin)
		uniforms.memoryLightScale.value.set(1 / (nx * volume.cell), 1 / (ny * volume.cell), 1 / (nz * volume.cell))
	}
	previous.dispose()
}

/** Where the block light is read: after the point-light loop, before sun, sky and environment light. */
const afterPointLights = '#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )'

/**
 * The block light volume at the fragment, one fetch whatever the number of captured lights. The sample sits half a
 * block out along the normal, in the air a face looks at. Levels are curved like the game's light map (block light
 * brightness level / (4 - 3 level), then its brightness option), which gives an sRGB factor.
 */
const blockLightGlsl = `
vec3 memoryBlockCurve( vec3 level ) {
	vec3 curved = level / ( 4.0 - 3.0 * level );
	return curved + ( 1.0 - pow( 1.0 - curved, vec3( 4.0 ) ) - curved ) * 0.5;
}
`

/** How much the studio look amplifies the block light so torches stand out against a sun-lit, tone-mapped scene. */
const REALISTIC_GAIN = '2.0'

const blockLightRead = `
vec3 memoryVolumeUv = ( memoryWorldPosition + inverseTransformDirection( normal, viewMatrix ) * 0.5 - memoryLightOrigin ) * memoryLightScale;
vec3 memoryBlockFactor = pow( memoryBlockCurve( texture( memoryLightVolume, memoryVolumeUv ).rgb ), vec3( 2.2 ) );
memoryBlockLight = diffuseColor.rgb * memoryBlockFactor;
if ( memoryFaithful < 0.5 ) reflectedLight.indirectDiffuse += memoryBlockLight * ${REALISTIC_GAIN};
`

export function faithfulLightsChunk(chunk = THREE.ShaderChunk.lights_fragment_begin): string {
	if (!chunk.includes(afterPointLights)) return chunk
	return chunk.replace(afterPointLights, `${blockLightRead}\n${afterPointLights}`)
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

const fragmentUniforms = `uniform float memoryFaithful;
uniform vec3 memoryFaithfulSky;
uniform highp sampler3D memoryLightVolume;
uniform vec3 memoryLightOrigin;
uniform vec3 memoryLightScale;
varying vec3 memoryWorldPosition;`

export function patchFaithfulShader(shader: THREE.WebGLProgramParametersWithUniforms, uniforms: FaithfulUniforms) {
	shader.uniforms.memoryFaithful = uniforms.memoryFaithful
	shader.uniforms.memoryFaithfulSky = uniforms.memoryFaithfulSky
	shader.uniforms.memoryLightVolume = uniforms.memoryLightVolume
	shader.uniforms.memoryLightOrigin = uniforms.memoryLightOrigin
	shader.uniforms.memoryLightScale = uniforms.memoryLightScale
	shader.vertexShader = `varying vec3 memoryWorldPosition;\n${shader.vertexShader}`.replace(
		'#include <project_vertex>',
		'#include <project_vertex>\nmemoryWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'
	)
	shader.fragmentShader = `${fragmentUniforms}\n${blockLightGlsl}\n${shader.fragmentShader}`
		.replace('#include <lights_fragment_begin>', `vec3 memoryBlockLight = vec3( 0.0 );\n${faithfulLightsChunk()}`)
		.replace('#include <opaque_fragment>', faithfulFragment)
}

const patched = new WeakSet<THREE.Material>()

/** Adds the faithful branch to an imported PBR material once; other material kinds are left alone. */
export function prepareFaithfulLighting(material: THREE.Material, uniforms: FaithfulUniforms): boolean {
	if (!(material as THREE.MeshStandardMaterial).isMeshStandardMaterial) return false
	if (patched.has(material)) return true
	patched.add(material)
	const cacheKey = `${material.customProgramCacheKey()}:minemories-faithful-v2`
	const previousCompile = material.onBeforeCompile
	material.onBeforeCompile = (shader, renderer) => {
		previousCompile.call(material, shader, renderer)
		patchFaithfulShader(shader, uniforms)
	}
	material.customProgramCacheKey = () => cacheKey
	return true
}
