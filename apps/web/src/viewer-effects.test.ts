import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import { disposeImportedObject as disposeModel } from './viewer-scene'

test('releasing a world releases shared material and texture resources once', () => {
	const texture = new THREE.Texture()
	const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture })
	const root = new THREE.Group()
	root.add(new THREE.Mesh(new THREE.BoxGeometry(), material), new THREE.Mesh(new THREE.BoxGeometry(), [material]))
	const materialDispose = vi.spyOn(material, 'dispose')
	const textureDispose = vi.spyOn(texture, 'dispose')
	disposeModel(root)
	expect(materialDispose).toHaveBeenCalledTimes(1)
	expect(textureDispose).toHaveBeenCalledTimes(1)
})

test('the depth atmosphere pass binds the current scene depth without writing to it', async () => {
	const { AtmospherePass } = await import('./viewer-atmosphere-pass')
	const { ShaderPass } = await import('three/addons/postprocessing/ShaderPass.js')
	const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 1000)
	const pass = new AtmospherePass(camera)
	const read = new THREE.WebGLRenderTarget(128, 64)
	read.depthTexture = new THREE.DepthTexture(128, 64)
	const write = new THREE.WebGLRenderTarget(128, 64)
	const render = vi.spyOn(ShaderPass.prototype, 'render').mockImplementation(() => undefined)
	pass.render({} as THREE.WebGLRenderer, write, read, 0, false)
	expect(pass.uniforms.tDepth.value).toBe(read.depthTexture)
	expect(pass.uniforms.resolution.value.toArray()).toEqual([128, 64])
	expect(pass.uniforms.inverseProjection.value).toBe(camera.projectionMatrixInverse)
	expect(pass.material.depthWrite).toBe(false)
	expect(pass.material.depthTest).toBe(false)
	expect(render).toHaveBeenCalledOnce()
	render.mockRestore()
	pass.dispose()
	read.dispose()
	write.dispose()
})

test('the composer retains depth through resize and eco disables the expensive passes', async () => {
	const { ViewerEffects } = await import('./viewer-effects')
	const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js')
	const { AtmospherePass } = await import('./viewer-atmosphere-pass')
	const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js')
	const renderer = {
		getSize: (size: THREE.Vector2) => size.set(640, 480),
		getPixelRatio: () => 1,
	} as THREE.WebGLRenderer
	const effects = new ViewerEffects(renderer, new THREE.Scene(), new THREE.PerspectiveCamera())
	const composer = (effects as unknown as { composer: InstanceType<typeof EffectComposer> }).composer
	const atmosphere = composer.passes.find(pass => pass instanceof AtmospherePass)
	const bloom = composer.passes.find(pass => pass instanceof UnrealBloomPass)
	const render = vi.spyOn(EffectComposer.prototype, 'render').mockImplementation(() => undefined)
	const disposeTarget = vi.spyOn(composer.renderTarget1, 'dispose')
	effects.resize(320, 240, 1.5)
	expect(composer.renderTarget1.width).toBe(480)
	expect(composer.renderTarget2.depthTexture).not.toBe(composer.renderTarget1.depthTexture)
	effects.setQuality('eco')
	expect(bloom?.enabled).toBe(false)
	expect(atmosphere?.uniforms.strength.value).toBe(0)
	effects.setAtmosphere(new THREE.Vector3(0, 0, -1), 1, 'clear', 10, new THREE.Color(0xffffff), false)
	effects.renderFrame()
	expect(atmosphere?.uniforms.shafts.value).toBe(0)
	effects.setQuality('cinematic')
	expect(bloom?.enabled).toBe(true)
	expect(atmosphere?.uniforms.strength.value).toBeGreaterThan(0)
	effects.dispose()
	expect(disposeTarget).toHaveBeenCalled()
	render.mockRestore()
})
