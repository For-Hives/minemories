import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js'

export type ViewerQuality = 'auto' | 'cinematic' | 'eco'
export type ViewerWeather = 'clear' | 'mist' | 'overcast'

export class ViewerEffects {
	private readonly composer: EffectComposer
	private readonly bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.18, 0.65, 1.4)
	private readonly output = new OutputPass()
	private readonly antialias = new ShaderPass(FXAAShader)
	private readonly render: RenderPass

	constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
		this.composer = new EffectComposer(renderer)
		this.render = new RenderPass(scene, camera)
		this.composer.addPass(this.render)
		this.composer.addPass(this.bloom)
		this.composer.addPass(this.output)
		this.composer.addPass(this.antialias)
	}

	setQuality(quality: ViewerQuality): void {
		this.bloom.enabled = quality !== 'eco'
	}

	resize(width: number, height: number, ratio: number): void {
		this.composer.setPixelRatio(ratio)
		this.composer.setSize(width, height)
		this.antialias.uniforms.resolution?.value.set(1 / (width * ratio), 1 / (height * ratio))
	}

	renderFrame(): void {
		this.composer.render()
	}

	dispose(): void {
		this.render.dispose()
		this.bloom.dispose()
		this.output.dispose()
		this.antialias.dispose()
		this.composer.dispose()
	}
}
