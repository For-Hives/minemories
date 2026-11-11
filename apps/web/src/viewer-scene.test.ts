import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import { UnsupportedGlbError } from './lib/glb'
import { legacyEmissiveToLinear, srgbToLinear } from './lib/glb-colours'
import { LightPool } from './lib/light-pool'
import { disposeImportedObject, ViewerScene } from './viewer-scene'

test('viewer clears loading and refuses unsafe files before calling its texture loader', async () => {
	const parseAsync = vi.fn()
	const onLoading = vi.fn()
	const scene = Object.create(ViewerScene.prototype) as ViewerScene
	Object.assign(scene, {
		loader: { parseAsync },
		events: { onLoading },
		preparingWorld: false,
	})
	const json = new TextEncoder().encode(
		JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: '//private.test/world.bin' }] })
	)
	const buffer = new ArrayBuffer(20 + Math.ceil(json.length / 4) * 4)
	new Uint8Array(buffer).fill(0x20)
	const header = new DataView(buffer)
	const fields: Array<[number, number]> = [
		[0, 0x46546c67],
		[4, 2],
		[8, buffer.byteLength],
		[12, buffer.byteLength - 20],
		[16, 0x4e4f534a],
	]
	for (const [offset, value] of fields) {
		header.setUint32(offset, value, true)
	}
	new Uint8Array(buffer).set(json, 20)
	const file = { name: 'external.glb', arrayBuffer: async () => buffer } as File
	await expect(scene.loadFile(file)).rejects.toBeInstanceOf(UnsupportedGlbError)
	expect(parseAsync).not.toHaveBeenCalled()
	expect(onLoading).toHaveBeenLastCalledWith(null)
})

function embeddedBuffer() {
	const json = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' } }))
	const buffer = new ArrayBuffer(20 + Math.ceil(json.length / 4) * 4)
	new Uint8Array(buffer).fill(32)
	const header = new DataView(buffer)
	const fields: Array<[number, number]> = [
		[0, 0x46546c67],
		[4, 2],
		[8, buffer.byteLength],
		[12, buffer.byteLength - 20],
		[16, 0x4e4f534a],
	]
	for (const [offset, value] of fields) {
		header.setUint32(offset, value, true)
	}
	new Uint8Array(buffer).set(json, 20)
	return buffer
}

function deferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>(done => {
		resolve = done
	})
	return { promise, resolve }
}

function sceneFixture() {
	const previous = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: new THREE.Texture() }))
	const next = new THREE.Group()
	next.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: new THREE.Texture() })))
	const modelRoot = new THREE.Group()
	modelRoot.add(previous)
	const compile = deferred<void>()
	const scene = Object.create(ViewerScene.prototype) as ViewerScene
	const fields = {
		modelRoot,
		hiddenCategories: new Set(),
		camera: new THREE.PerspectiveCamera(),
		sky: new THREE.Mesh(),
		loader: { parseAsync: vi.fn(async (): Promise<{ scene: THREE.Group; asset?: unknown }> => ({ scene: next })) },
		events: { onLoading: vi.fn(), onFileInfo: vi.fn(), onEmptyChange: vi.fn() },
		renderer: { compileAsync: vi.fn(() => compile.promise), render: vi.fn() },
		prepareWorldLighting: vi.fn(),
		updateEnvironment: vi.fn(),
		clouds: { update: vi.fn() },
		effects: { renderFrame: vi.fn() },
		frameModel: vi.fn(),
	}
	Object.assign(scene, fields)
	const file = { name: 'capture.glb', size: 64, arrayBuffer: async () => embeddedBuffer() } as File
	return { scene, fields, previous, next, modelRoot, compile, file }
}

test('a capture is replaced only after compilation; origin translation and preserved camera reach the renderer', async () => {
	const f = sceneFixture()
	const disposeGeometry = vi.spyOn(f.previous.geometry, 'dispose')
	const disposeTexture = vi.spyOn(f.previous.material.map as THREE.Texture, 'dispose')
	const loading = f.scene.loadFile(f.file, { originDelta: { x: 0, y: -21, z: 4 }, preserveView: true })
	await vi.waitFor(() => expect(f.fields.renderer.compileAsync).toHaveBeenCalledOnce())
	expect(f.previous.parent).toBe(f.modelRoot)
	expect(f.previous.visible).toBe(false)
	expect(disposeGeometry).not.toHaveBeenCalled()
	expect(f.next.position.toArray()).toEqual([0, -21, 4])
	await expect(f.scene.loadFile(f.file)).rejects.toThrow('already loading')
	f.compile.resolve()
	await loading
	expect(f.fields.frameModel).toHaveBeenCalledWith(f.next, true)
	expect(f.modelRoot.children).toEqual([f.next])
	expect(disposeGeometry).toHaveBeenCalledOnce()
	expect(disposeTexture).toHaveBeenCalledOnce()
	expect(f.fields.events.onFileInfo).toHaveBeenCalledWith('capture.glb', 64)
})

test('cancelling an in-flight compile retains the visible previous capture and releases the rejected assets', async () => {
	const f = sceneFixture()
	const controller = new AbortController()
	const nextMesh = f.next.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
	const disposeNext = vi.spyOn(nextMesh.material.map as THREE.Texture, 'dispose')
	const disposePrevious = vi.spyOn(f.previous.geometry, 'dispose')
	const loading = f.scene.loadFile(f.file, { signal: controller.signal })
	const rejection = expect(loading).rejects.toMatchObject({ name: 'AbortError' })
	await vi.waitFor(() => expect(f.fields.renderer.compileAsync).toHaveBeenCalledOnce())
	controller.abort()
	f.compile.resolve()
	await rejection
	expect(f.modelRoot.children).toEqual([f.previous])
	expect(f.previous.visible).toBe(true)
	expect(disposeNext).toHaveBeenCalledOnce()
	expect(disposePrevious).not.toHaveBeenCalled()
	expect(f.fields.events.onEmptyChange).not.toHaveBeenCalled()
	expect(f.fields.events.onLoading).toHaveBeenLastCalledWith(null)
})

test('an unmounted viewer releases a model which finishes parsing after disposal', async () => {
	const f = sceneFixture()
	const parsed = deferred<{ scene: THREE.Group }>()
	f.fields.loader.parseAsync.mockImplementation(() => parsed.promise)
	const mesh = f.next.children[0] as THREE.Mesh
	const dispose = vi.spyOn(mesh.geometry, 'dispose')
	const loading = f.scene.loadFile(f.file)
	const rejection = expect(loading).rejects.toMatchObject({ name: 'AbortError' })
	await vi.waitFor(() => expect(f.fields.loader.parseAsync).toHaveBeenCalledOnce())
	Object.assign(f.scene, { disposed: true })
	parsed.resolve({ scene: f.next })
	await rejection
	expect(dispose).toHaveBeenCalledOnce()
	expect(f.fields.renderer.compileAsync).not.toHaveBeenCalled()
})

test('shared materials, geometry and texture maps are disposed once across meshes and skeletons', () => {
	const root = new THREE.Group()
	const geometry = new THREE.BoxGeometry()
	const texture = new THREE.Texture()
	const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture })
	const skeleton = new THREE.Skeleton([])
	skeleton.boneTexture = texture as THREE.DataTexture
	const a = new THREE.SkinnedMesh(geometry, [material, material])
	a.skeleton = skeleton
	const b = new THREE.SkinnedMesh(geometry, material)
	b.skeleton = skeleton
	root.add(a, b, new THREE.PointLight())
	const calls = [
		vi.spyOn(geometry, 'dispose'),
		vi.spyOn(material, 'dispose'),
		vi.spyOn(texture, 'dispose'),
		vi.spyOn(skeleton, 'dispose'),
	]
	disposeImportedObject(root)
	for (const call of calls) expect(call).toHaveBeenCalledOnce()
})

test('a shader compilation failure restores the previous capture and allows a later retry', async () => {
	const f = sceneFixture()
	f.fields.renderer.compileAsync.mockRejectedValueOnce(new Error('GPU compilation failed'))
	const mesh = f.next.children[0] as THREE.Mesh
	const dispose = vi.spyOn(mesh.geometry, 'dispose')
	await expect(f.scene.loadFile(f.file)).rejects.toThrow('Could not read this GLB')
	expect(f.modelRoot.children).toEqual([f.previous])
	expect(f.previous.visible).toBe(true)
	expect(dispose).toHaveBeenCalledOnce()
	expect(f.fields.frameModel).not.toHaveBeenCalled()
	const fresh = new THREE.Group()
	f.fields.loader.parseAsync.mockResolvedValueOnce({ scene: fresh })
	f.compile.resolve()
	await f.scene.loadFile(f.file)
	expect(f.modelRoot.children).toEqual([fresh])
})

test('an already cancelled selection does not read or parse the file', async () => {
	const f = sceneFixture()
	const file = { ...f.file, arrayBuffer: vi.fn() } as unknown as File
	await expect(f.scene.loadFile(file, { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' })
	expect(file.arrayBuffer).not.toHaveBeenCalled()
	expect(f.fields.loader.parseAsync).not.toHaveBeenCalled()
})

test('CPU ImageBitmap pixels shared by multiple texture sources close once when a capture is released', () => {
	class Bitmap {
		close = vi.fn()
	}
	vi.stubGlobal('ImageBitmap', Bitmap)
	try {
		const image = new Bitmap()
		const material = new THREE.MeshStandardMaterial({
			map: new THREE.Texture(image),
			emissiveMap: new THREE.Texture(image),
		})
		const root = new THREE.Mesh(new THREE.BoxGeometry(), material)
		disposeImportedObject(root)
		expect(image.close).toHaveBeenCalledOnce()
	} finally {
		vi.unstubAllGlobals()
	}
})

test('a deep capture opens near the surface and concentrates shadow texels on the surface', async () => {
	const THREE = await import('three')
	const modelRoot = new THREE.Group()
	modelRoot.add(new THREE.Mesh(new THREE.BoxGeometry(32, 160, 32)))
	const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 4000)
	const target = new THREE.Vector3()
	const shadowCenter = new THREE.Vector3()
	const setBaseHeight = vi.fn()
	const scene = Object.create(ViewerScene.prototype) as ViewerScene
	Object.assign(scene, {
		modelRoot,
		camera,
		shadowCenter,
		navigation: { active: false },
		controls: { target, update: vi.fn() },
		clouds: { setBaseHeight },
		updateSunShadow: vi.fn(),
	})
	scene.resetView()
	// The pivot rests on the top surface at the centre, not in the middle of the volume.
	expect(target.y).toBeCloseTo(80)
	expect(shadowCenter.y).toBeCloseTo(target.y)
	expect(camera.position.y).toBeGreaterThan(target.y)
	expect(setBaseHeight.mock.calls[0]?.[0]).toBeGreaterThan(camera.position.y)
})

test('lighting preparation preserves imported face normals instead of forcing derivative normals', () => {
	const scene = Object.create(ViewerScene.prototype) as {
		prepareMesh(mesh: THREE.Mesh): void
	}
	const geometry = new THREE.BoxGeometry()
	const normals = geometry.getAttribute('normal')
	const material = new THREE.MeshStandardMaterial()
	const mesh = new THREE.Mesh(geometry, material)

	scene.prepareMesh(mesh)

	expect(material.flatShading).toBe(false)
	expect(geometry.getAttribute('normal')).toBe(normals)
	expect(mesh.castShadow).toBe(true)
	expect(mesh.receiveShadow).toBe(true)
	// GLTFLoader intentionally uses flat shading for assets with no authored normals.
	material.flatShading = true
	scene.prepareMesh(mesh)
	expect(material.flatShading).toBe(true)
	geometry.dispose()
	material.dispose()
})

test('hundreds of imported lights leave the scene graph and a constant pool lights the surface first', () => {
	const root = new THREE.Group()
	root.add(new THREE.Mesh(new THREE.BoxGeometry(32, 160, 32), new THREE.MeshStandardMaterial()))
	const surfaceLight = new THREE.PointLight(0xff6600, 900, 14)
	surfaceLight.position.set(0, 72, 0)
	root.add(surfaceLight)
	for (let i = 0; i < 600; i++) {
		const light = new THREE.PointLight(0xffffff, 1400, 20)
		light.position.set((i % 30) * 7, -70, Math.floor(i / 30) * 7)
		root.add(light)
	}
	const pool = Array.from({ length: 12 }, () => new THREE.PointLight(0xffffff, 0, 1, 2))
	const scene = Object.create(ViewerScene.prototype) as { prepareWorldLighting(root: THREE.Object3D): void }
	Object.assign(scene, { worldLights: pool, lightPool: new LightPool(12), scene: new THREE.Scene() })
	scene.prepareWorldLighting(root)
	expect(root.children.filter(child => child instanceof THREE.PointLight)).toHaveLength(0)
	expect(pool.every(light => light.parent)).toBe(true)
	expect(pool.some(light => light.position.y === 72 && light.intensity === 9)).toBe(true)
	expect(pool.filter(light => light.intensity > 0)).toHaveLength(12)
	disposeImportedObject(root)
})

test('the light pool follows the orbit target or the walking camera and fades its lights', () => {
	const pool = Array.from({ length: 2 }, () => new THREE.PointLight(0xffffff, 0, 1, 2))
	const lightPool = new LightPool(2, 1)
	lightPool.setEmitters([
		{ x: 0, y: 0, z: 0, r: 1, g: 1, b: 1, intensity: 100, distance: 6 },
		{ x: 90, y: 0, z: 0, r: 1, g: 1, b: 1, intensity: 100, distance: 6 },
	])
	const camera = new THREE.PerspectiveCamera()
	camera.position.set(90, 0, 0)
	const scene = Object.create(ViewerScene.prototype) as { updateWorldLights(seconds: number): void }
	Object.assign(scene, {
		worldLights: pool,
		lightPool,
		scene: new THREE.Scene(),
		camera,
		controls: { target: new THREE.Vector3() },
		navigation: { active: false },
	})
	scene.updateWorldLights(0.5)
	expect(pool.map(light => light.intensity)).toEqual([0.5, 0.5])
	scene.updateWorldLights(1)
	expect(pool.map(light => light.intensity)).toEqual([1, 1])
	Object.assign(scene, { navigation: { active: true } })
	scene.updateWorldLights(0)
	expect(pool.map(light => light.intensity)).toEqual([1, 1])
})

test('orbit remains centered on the captured player when switching captures with a preserved view', () => {
	const root = new THREE.Group()
	root.userData.minemoriesPlayerPosition = [4, 20, -3]
	root.add(new THREE.Mesh(new THREE.BoxGeometry(64, 100, 64)))
	const camera = new THREE.PerspectiveCamera()
	camera.position.set(12, 14, 16)
	const controls = { target: new THREE.Vector3(2, 3, 4), update: vi.fn() }
	const scene = Object.create(ViewerScene.prototype) as { frameModel(root: THREE.Object3D, preserve: boolean): void }
	Object.assign(scene, {
		camera,
		controls,
		shadowCenter: new THREE.Vector3(),
		navigation: { active: false },
		clouds: { setBaseHeight: vi.fn() },
		updateSunShadow: vi.fn(),
	})
	const offset = camera.position.clone().sub(controls.target)
	scene.frameModel(root, true)
	expect(controls.target.toArray()).toEqual([4, 20, -3])
	expect(camera.position.clone().sub(controls.target).toArray()).toEqual(offset.toArray())
	disposeImportedObject(root)
})

function worldFixture() {
	const f = sceneFixture()
	f.modelRoot.clear()
	const light = new THREE.PointLight(0xffffff, 300, 6)
	f.next.add(light)
	Object.assign(f.scene, {
		disposed: false,
		prepareMesh: vi.fn(),
		worldLights: Array.from({ length: 12 }, () => new THREE.PointLight(0xffffff, 0, 1, 2)),
		lightPool: new LightPool(12),
		scene: new THREE.Scene(),
		controls: { target: new THREE.Vector3() },
		captureFocus: null,
		keyLight: { shadow: { needsUpdate: false } },
	})
	const shadowMap = { needsUpdate: false }
	Object.assign(f.fields.renderer, { shadowMap })
	f.compile.resolve()
	return { ...f, shadowMap }
}

const capture = {
	origin: { x: 10, y: 64, z: 0 },
	bounds: { minX: 2, minY: 40, minZ: -8, maxX: 18, maxY: 88, maxZ: 8 },
	offset: { x: 5, y: 0, z: -2 },
}

test('world layers stack without replacing each other and only the first one frames the camera', async () => {
	const f = worldFixture()
	const layer = await f.scene.addLayer(f.file, capture)
	expect(layer.root).toBe(f.next)
	expect(f.next.parent).toBe(f.modelRoot)
	expect(f.next.position.toArray()).toEqual([5, 0, -2])
	expect(layer.lights[0]?.position.toArray()).toEqual([5, 0, -2])
	expect(f.fields.frameModel).toHaveBeenCalledOnce()
	expect(f.fields.events.onEmptyChange).toHaveBeenCalledWith(false)
	const second = new THREE.Group()
	f.fields.loader.parseAsync.mockResolvedValueOnce({ scene: second })
	await f.scene.addLayer(f.file, capture)
	expect(f.modelRoot.children).toEqual([f.next, second])
	expect(f.fields.frameModel).toHaveBeenCalledOnce()
	f.scene.showWorld(layer.lights)
	const lights = (f.scene as unknown as { worldLights: THREE.PointLight[] }).worldLights
	expect(lights[0]?.intensity).toBe(3)
	expect(lights[0]?.position.toArray()).toEqual([5, 0, -2])
	expect(lights[1]?.intensity).toBe(0)
	expect(f.shadowMap.needsUpdate).toBe(true)
	f.scene.focusLayer(second)
	expect(f.fields.frameModel).toHaveBeenLastCalledWith(second, false)
})

test('a cancelled world layer is detached and released', async () => {
	const f = worldFixture()
	const dispose = vi.spyOn((f.next.children[0] as THREE.Mesh).geometry, 'dispose')
	const controller = new AbortController()
	f.fields.renderer.compileAsync.mockImplementationOnce(async () => controller.abort())
	await expect(f.scene.addLayer(f.file, capture, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
	expect(f.next.parent).toBeNull()
	expect(dispose).toHaveBeenCalled()
	await expect(f.scene.addLayer(f.file, capture, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' })
})

/** A parsed capture as GLTFLoader returns it: raw factors, one material shared by two meshes, one imported light. */
function colouredCapture() {
	const material = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 })
	material.color.setRGB(0.5, 0.25, 0.1, THREE.LinearSRGBColorSpace)
	material.emissive.setRGB(0.65, 0.65 * 0.5, 0, THREE.LinearSRGBColorSpace)
	const scene = new THREE.Group()
	const first = new THREE.Mesh(new THREE.BoxGeometry(), material)
	const second = new THREE.Mesh(new THREE.BoxGeometry(), material)
	const light = new THREE.PointLight()
	light.color.setRGB(1, 0.5, 0.2, THREE.LinearSRGBColorSpace)
	scene.add(first, second, light)
	return { scene, material, light }
}

const legacyFormat = { version: '2.0', extras: { minemories: { format: 2 } } }
const linearFormat = { version: '2.0', extras: { minemories: { format: 3 } } }

function expectLinearised(colour: THREE.Color, [r, g, b]: [number, number, number]) {
	expect(colour.r).toBeCloseTo(srgbToLinear(r), 9)
	expect(colour.g).toBeCloseTo(srgbToLinear(g), 9)
	expect(colour.b).toBeCloseTo(srgbToLinear(b), 9)
}

test.each([
	['a format 2 capture', legacyFormat],
	['an unversioned capture', { version: '2.0', generator: 'glTF-Transform v4.5.1' }],
	['a capture without asset', undefined],
])('loading %s linearises shared material and light colours once, never the opacity', async (_, asset) => {
	const f = sceneFixture()
	f.compile.resolve()
	const capture = colouredCapture()
	f.fields.loader.parseAsync.mockResolvedValueOnce({ scene: capture.scene, asset })
	await f.scene.loadFile(f.file)
	// Both meshes share the material: converting it twice would give srgbToLinear(srgbToLinear(0.5)).
	expectLinearised(capture.material.color, [0.5, 0.25, 0.1])
	const [er, eg, eb] = legacyEmissiveToLinear([0.65, 0.65 * 0.5, 0])
	expect(capture.material.emissive.r).toBeCloseTo(er, 9)
	expect(capture.material.emissive.g).toBeCloseTo(eg, 9)
	expect(capture.material.emissive.b).toBe(eb)
	expect(capture.material.opacity).toBe(0.5)
	expectLinearised(capture.light.color, [1, 0.5, 0.2])
})

test('a format 3 capture keeps its linear colours', async () => {
	const f = sceneFixture()
	f.compile.resolve()
	const capture = colouredCapture()
	f.fields.loader.parseAsync.mockResolvedValueOnce({ scene: capture.scene, asset: linearFormat })
	await f.scene.loadFile(f.file)
	expect(capture.material.color.toArray()).toEqual([0.5, 0.25, 0.1])
	expect(capture.material.emissive.toArray()).toEqual([0.65, 0.65 * 0.5, 0])
	expect(capture.light.color.toArray()).toEqual([1, 0.5, 0.2])
})

test('world layers linearise legacy colours before their lights are collected, and leave format 3 alone', async () => {
	const f = worldFixture()
	const legacy = colouredCapture()
	f.fields.loader.parseAsync.mockResolvedValueOnce({ scene: legacy.scene, asset: legacyFormat })
	const layer = await f.scene.addLayer(f.file, capture)
	expectLinearised(legacy.material.color, [0.5, 0.25, 0.1])
	expect(legacy.material.opacity).toBe(0.5)
	expect(layer.lights).toHaveLength(1)
	expectLinearised(layer.lights[0]?.color ?? new THREE.Color(), [1, 0.5, 0.2])
	const linear = colouredCapture()
	f.fields.loader.parseAsync.mockResolvedValueOnce({ scene: linear.scene, asset: linearFormat })
	const linearLayer = await f.scene.addLayer(f.file, capture)
	expect(linear.material.color.toArray()).toEqual([0.5, 0.25, 0.1])
	expect(linearLayer.lights[0]?.color.toArray()).toEqual([1, 0.5, 0.2])
})

interface GlideInternals {
	advanceGlides(delta: number): void
	probeGround(timestamp: number): void
	ground: number | null
	dayTime: number
}

function glideFixture(reducedMotion = false) {
	const scene = Object.create(ViewerScene.prototype) as ViewerScene
	const camera = new THREE.PerspectiveCamera()
	camera.position.set(10, 10, 10)
	const fields = {
		camera,
		controls: { target: new THREE.Vector3() },
		navigation: { active: false },
		reducedMotion,
		cameraGlide: null,
		timeGlide: null,
		dayTime: 0.9,
		shadowCenter: new THREE.Vector3(),
		updateDayCycle: vi.fn(),
		updateSunShadow: vi.fn(),
		updateEnvironment: vi.fn(),
	}
	Object.assign(scene, fields)
	return { scene, fields, internals: scene as unknown as GlideInternals }
}

function captureRoot(x: number) {
	const root = new THREE.Group()
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4))
	mesh.position.set(x, 0, 0)
	root.add(mesh)
	return root
}

test('switching captures glides the pivot and camera together, never while walking in first person', () => {
	const f = glideFixture()
	f.scene.glideToLayer(captureRoot(20))
	f.internals.advanceGlides(0.55)
	expect(f.fields.controls.target.x).toBeCloseTo(10)
	expect(f.fields.camera.position.x).toBeCloseTo(20)
	f.internals.advanceGlides(1)
	expect(f.fields.controls.target.toArray()).toEqual([20, 2, 0])
	expect(f.fields.camera.position.toArray()).toEqual([30, 12, 10])
	expect(f.fields.shadowCenter.x).toBeCloseTo(20)
	expect(f.fields.updateSunShadow).toHaveBeenCalledWith(true)
	f.scene.glideToLayer(new THREE.Group())
	f.scene.glideToLayer(captureRoot(0))
	f.internals.advanceGlides(2)
	expect(f.fields.controls.target.x).toBeCloseTo(0)
	f.fields.navigation.active = true
	f.scene.glideToLayer(captureRoot(20))
	f.internals.advanceGlides(1)
	expect(f.fields.controls.target.x).toBeCloseTo(0)
})

test('reduced motion jumps straight to the capture and the hour', () => {
	const f = glideFixture(true)
	f.scene.glideToLayer(captureRoot(20))
	expect(f.fields.controls.target.x).toBeCloseTo(20)
	expect(f.fields.camera.position.x).toBeCloseTo(30)
	f.scene.setMinutes(360, true)
	expect(f.internals.dayTime).toBe(0.25)
	expect(f.fields.updateEnvironment).toHaveBeenCalledOnce()
})

test('the sun turns the short way to the next capture hour, then refreshes the environment once', () => {
	const f = glideFixture()
	f.scene.setMinutes(144, true)
	expect(f.internals.dayTime).toBe(0.9)
	f.internals.advanceGlides(0.8)
	expect(f.internals.dayTime).toBeCloseTo(1)
	expect(f.fields.updateEnvironment).not.toHaveBeenCalled()
	f.internals.advanceGlides(1)
	expect(f.internals.dayTime).toBeCloseTo(1.1)
	expect(f.fields.updateEnvironment).toHaveBeenCalledOnce()
	f.scene.setMinutes(1584 % 1440, true)
	expect(f.fields.updateEnvironment).toHaveBeenCalledTimes(2)
})

test('the ground below the pivot is measured on visible surfaces only, throttled and only while shown', () => {
	const scene = Object.create(ViewerScene.prototype) as ViewerScene
	const modelRoot = new THREE.Group()
	const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 10))
	floor.position.y = -5
	const hidden = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 10))
	hidden.position.y = -2
	hidden.visible = false
	const beam = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ name: 'beacon_beam' }))
	beam.position.y = -1
	modelRoot.add(floor, hidden, beam)
	modelRoot.updateMatrixWorld(true)
	const pivot = { wanted: true }
	const target = new THREE.Vector3(0, 0, 0)
	Object.assign(scene, {
		modelRoot,
		pivot,
		navigation: { active: false },
		controls: { target },
		groundRay: new THREE.Raycaster(),
		probedTarget: new THREE.Vector3(Number.NaN, 0, 0),
		ground: null,
		lastProbe: 0,
	})
	const internals = scene as unknown as GlideInternals
	internals.probeGround(1000)
	expect(internals.ground).toBeCloseTo(-4.5)
	const roof = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 10))
	roof.position.y = 2
	modelRoot.add(roof)
	modelRoot.updateMatrixWorld(true)
	target.set(0, 0.1, 0)
	internals.probeGround(1150)
	expect(internals.ground).toBeCloseTo(2.5)
	roof.removeFromParent()
	target.set(0, 0, 0)
	internals.probeGround(1300)
	expect(internals.ground).toBeCloseTo(-4.5)
	target.set(50, 0, 0)
	internals.probeGround(1350)
	expect(internals.ground).toBeCloseTo(-4.5)
	internals.probeGround(1500)
	expect(internals.ground).toBeNull()
	target.set(0, 0, 0)
	pivot.wanted = false
	internals.probeGround(2000)
	expect(internals.ground).toBeNull()
})

test('the weather ceiling covers visible drawn triangles only, in scene coordinates', () => {
	const scene = Object.create(ViewerScene.prototype) as ViewerScene
	const modelRoot = new THREE.Group()
	const roof = new THREE.Mesh(new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2))
	roof.position.set(2, 10, 2)
	const hidden = new THREE.Mesh(new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2))
	hidden.position.set(2, 50, 2)
	hidden.visible = false
	const loose = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2).toNonIndexed())
	loose.position.set(-3, 4, -3)
	modelRoot.add(roof, hidden, loose)
	const setCeiling = vi.fn()
	Object.assign(scene, { modelRoot, precipitation: { setCeiling } })
	;(scene as unknown as { refreshCeiling(): void }).refreshCeiling()
	const ceiling = setCeiling.mock.lastCall?.[0]
	expect(Math.max(...ceiling.data)).toBe(10)
	expect(ceiling.data).toContain(4)
	modelRoot.clear()
	;(scene as unknown as { refreshCeiling(): void }).refreshCeiling()
	expect(setCeiling).toHaveBeenLastCalledWith(null)
})

test('categories of a format 2 capture can be hidden and restored, including on later captures', async () => {
	const THREE = await import('three')
	const modelRoot = new THREE.Group()
	const terrain = new THREE.Mesh(new THREE.BoxGeometry())
	terrain.name = 'terrain'
	const decor = new THREE.Group()
	decor.name = 'decor'
	const composed = new THREE.Mesh(new THREE.BoxGeometry())
	composed.name = 'fluids'
	composed.geometry.setDrawRange(0, 0)
	modelRoot.add(terrain, decor, composed, new THREE.Object3D())
	const scene = Object.create(ViewerScene.prototype) as ViewerScene
	Object.assign(scene, {
		modelRoot,
		hiddenCategories: new Set(),
		keyLight: { shadow: { needsUpdate: false } },
		renderer: { shadowMap: { needsUpdate: false } },
	})
	expect(scene.categories()).toEqual(['terrain', 'decor', 'fluids'])
	scene.setCategoryVisible('terrain', false)
	scene.setCategoryVisible('decor', false)
	scene.setCategoryVisible('fluids', true)
	expect(terrain.visible).toBe(false)
	expect(decor.visible).toBe(false)
	// A mesh a composed world does not draw stays hidden even when its category is on.
	expect(composed.visible).toBe(false)
	expect(scene.isCategoryVisible('terrain')).toBe(false)
	expect(scene.isCategoryVisible('fluids')).toBe(true)
	scene.setCategoryVisible('terrain', true)
	expect(terrain.visible).toBe(true)
	expect(terrain.userData.categoryHidden).toBe(false)
	const later = new THREE.Group()
	later.name = 'decor'
	;(scene as unknown as { applyCategories(root: THREE.Object3D): void }).applyCategories(later)
	expect(later.visible).toBe(false)
})

test('switching the lighting style flips shared uniforms, tone mapping and post effects, and back', async () => {
	const { createFaithfulUniforms } = await import('./viewer-faithful')
	const scene = Object.create(ViewerScene.prototype) as ViewerScene
	const uniforms = createFaithfulUniforms()
	const effects = { setFaithful: vi.fn() }
	const renderer = { toneMapping: THREE.ACESFilmicToneMapping }
	const updateDayCycle = vi.fn()
	Object.assign(scene, { lighting: 'realistic', faithfulUniforms: uniforms, effects, renderer, updateDayCycle })
	scene.setLighting('realistic')
	expect(updateDayCycle).not.toHaveBeenCalled()
	scene.setLighting('faithful')
	expect(uniforms.memoryFaithful.value).toBe(1)
	expect(renderer.toneMapping).toBe(THREE.NoToneMapping)
	expect(effects.setFaithful).toHaveBeenLastCalledWith(true)
	scene.setLighting('realistic')
	expect(uniforms.memoryFaithful.value).toBe(0)
	expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping)
	expect(effects.setFaithful).toHaveBeenLastCalledWith(false)
	expect(updateDayCycle).toHaveBeenCalledTimes(2)
})

/** Every point light a render or compilation of the scene would see. */
function renderedPointLights(scene: THREE.Object3D): number {
	let count = 0
	scene.traverseVisible(object => {
		if (object instanceof THREE.PointLight) count++
	})
	return count
}

function manyLights(count: number): THREE.Group {
	const root = new THREE.Group()
	root.add(new THREE.Mesh(new THREE.BoxGeometry(64, 8, 64), new THREE.MeshStandardMaterial()))
	for (let i = 0; i < count; i++) {
		const light = new THREE.PointLight(0xffaa55, 1500, 14)
		light.position.set((i % 40) * 1.5 - 30, 1, Math.floor(i / 40) * 1.5 - 30)
		root.add(light)
	}
	return root
}

test('no loader entry point ever compiles or renders more point lights than the pool holds', async () => {
	const rendered: number[] = []
	for (const entry of ['loadFile', 'addLayer'] as const) {
		const f = worldFixture()
		const three = new THREE.Scene()
		three.add(f.modelRoot)
		const imported = manyLights(1000)
		f.fields.loader.parseAsync.mockResolvedValue({ scene: imported })
		f.fields.renderer.compileAsync.mockImplementation(async () => {
			rendered.push(renderedPointLights(three))
		})
		const internals = f.scene as unknown as Record<string, unknown>
		Object.assign(internals, {
			scene: three,
			lightPool: new LightPool(12),
			navigation: { active: false },
			applyCategories: vi.fn(),
			ceilingDirty: false,
			preparingWorld: false,
			loadingFile: false,
			ensureLoadActive: vi.fn(),
		})
		const prepare = (ViewerScene.prototype as unknown as Record<string, unknown>).prepareWorldLighting
		internals.prepareWorldLighting = prepare
		f.compile.resolve()
		if (entry === 'loadFile') await f.scene.loadFile(f.file)
		else {
			const layer = await f.scene.addLayer(f.file, capture)
			rendered.push(renderedPointLights(three))
			f.scene.showWorld(layer.lights)
		}
		rendered.push(renderedPointLights(three))
		const pool = (f.scene as unknown as { worldLights: THREE.PointLight[] }).worldLights
		expect(pool.every(light => light.parent === three)).toBe(true)
		expect(pool.filter(light => light.intensity > 0).length).toBeLessThanOrEqual(12)
		expect(renderedPointLights(imported)).toBe(0)
	}
	expect(rendered.length).toBeGreaterThanOrEqual(5)
	expect(new Set(rendered)).toEqual(new Set([12]))
})
