import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js'

import { AtmospherePass } from './viewer-atmosphere-pass'

export type ViewerQuality = 'auto' | 'cinematic' | 'eco'
export type ViewerWeather = 'clear' | 'mist' | 'overcast'

export class ViewerEffects {
	private readonly composer: EffectComposer
	private readonly bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.24, 0.6, 1.1)
	private readonly output = new OutputPass()
	private readonly antialias = new ShaderPass(FXAAShader)
	private readonly render: RenderPass
	private readonly atmosphere: AtmospherePass
	private readonly sunDirection = new THREE.Vector3()
	private readonly projectedSun = new THREE.Vector3()
	private daylight = 1
	private cloudiness = 0

	constructor(
		renderer: THREE.WebGLRenderer,
		scene: THREE.Scene,
		private readonly camera: THREE.PerspectiveCamera
	) {
		const size = renderer.getSize(new THREE.Vector2())
		const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType })
		target.depthTexture = new THREE.DepthTexture(size.x, size.y, THREE.UnsignedIntType)
		this.composer = new EffectComposer(renderer, target)
		this.atmosphere = new AtmospherePass(camera)
		this.output.material.depthTest = false
		this.output.material.depthWrite = false
		this.antialias.material.depthTest = false
		this.antialias.material.depthWrite = false
		this.render = new RenderPass(scene, camera)
		this.composer.addPass(this.render)
		this.composer.addPass(this.atmosphere)
		this.composer.addPass(this.bloom)
		this.composer.addPass(this.output)
		this.composer.addPass(this.antialias)
	}

	setQuality(quality: ViewerQuality): void {
		this.bloom.enabled = quality !== 'eco'
		this.atmosphere.uniforms.strength.value = quality === 'eco' ? 0 : 1.1
	}

	resize(width: number, height: number, ratio: number): void {
		this.composer.setPixelRatio(ratio)
		this.composer.setSize(width, height)
		this.antialias.uniforms.resolution?.value.set(1 / (width * ratio), 1 / (height * ratio))
	}

	setAtmosphere(
		sun: THREE.Vector3,
		daylight: number,
		weather: ViewerWeather,
		height: number,
		color: THREE.Color,
		celestial = true
	): void {
		this.sunDirection.copy(sun)
		this.daylight = daylight
		this.cloudiness = weather === 'overcast' || !celestial ? 1 : 0
		this.atmosphere.uniforms.daylight.value = daylight
		this.atmosphere.uniforms.fogHeight.value = height
		this.atmosphere.uniforms.fogColor.value.copy(color)
		this.atmosphere.uniforms.fogDensity.value = weather === 'mist' ? 0.004 : 0.00025
	}

	renderFrame(): void {
		this.camera.updateMatrixWorld()
		this.projectedSun.copy(this.camera.position).addScaledVector(this.sunDirection, 1000).project(this.camera)
		this.atmosphere.uniforms.sun.value.set(this.projectedSun.x * 0.5 + 0.5, this.projectedSun.y * 0.5 + 0.5)
		const visible =
			this.projectedSun.z < 1 && Math.abs(this.projectedSun.x) < 1.2 && Math.abs(this.projectedSun.y) < 1.2
		this.atmosphere.uniforms.shafts.value =
			visible && this.bloom.enabled ? this.daylight * (1 - this.cloudiness) * 0.12 : 0
		this.composer.render()
	}

	dispose(): void {
		this.render.dispose()
		this.bloom.dispose()
		this.atmosphere.dispose()
		this.output.dispose()
		this.antialias.dispose()
		this.composer.dispose()
	}
}
