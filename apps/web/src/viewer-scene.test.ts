import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import { UnsupportedGlbError } from './lib/glb'
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
		camera: new THREE.PerspectiveCamera(),
		sky: new THREE.Mesh(),
		loader: { parseAsync: vi.fn(async () => ({ scene: next })) },
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
	expect(target.y).toBeCloseTo(75.2)
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

test('surface lights remain in the bounded lighting budget even when deeper lava is brighter', () => {
	const root = new THREE.Group()
	root.add(new THREE.Mesh(new THREE.BoxGeometry(32, 160, 32), new THREE.MeshStandardMaterial()))
	const surfaceLight = new THREE.PointLight(0xff6600, 900, 14)
	surfaceLight.position.set(0, 72, 0)
	root.add(surfaceLight)
	for (let i = 0; i < 16; i++) {
		const light = new THREE.PointLight(0xffffff, 1400, 20)
		light.position.set(i * 7, -70, 0)
		root.add(light)
	}
	const scene = Object.create(ViewerScene.prototype) as { prepareWorldLighting(root: THREE.Object3D): void }
	scene.prepareWorldLighting(root)
	const lights = root.children.filter(child => child instanceof THREE.PointLight)
	expect(lights).toHaveLength(12)
	expect(lights.some(light => light.position.y === 72 && light.intensity === 9)).toBe(true)
	disposeImportedObject(root)
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

const tileOffset = { x: 16, y: 0, z: -32 }

function tileGroup() {
	const group = new THREE.Group()
	group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: new THREE.Texture() })))
	return group
}

function tileMeshOf(group: THREE.Object3D) {
	return group.children[0] as THREE.Mesh
}

function tileRuntime(scene: ViewerScene) {
	return scene as unknown as { tileRoot: THREE.Group | null }
}

function tileScene(options: { previous?: boolean } = {}) {
	const modelRoot = new THREE.Group()
	const previous = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
	if (options.previous) modelRoot.add(previous)
	const hold: { current: Promise<void> | null } = { current: null }
	const scene = Object.create(ViewerScene.prototype) as ViewerScene
	const fields = {
		modelRoot,
		camera: new THREE.PerspectiveCamera(),
		sky: new THREE.Mesh(),
		tileRoot: null,
		tiles: new Map(),
		loadingFile: false,
		preparingWorld: false,
		disposed: false,
		loader: { parseAsync: vi.fn(async () => ({ scene: tileGroup() })) },
		events: { onLoading: vi.fn(), onFileInfo: vi.fn(), onEmptyChange: vi.fn() },
		renderer: { compileAsync: vi.fn(() => hold.current ?? Promise.resolve()) },
		prepareWorldLighting: vi.fn(),
		updateEnvironment: vi.fn(),
		clouds: { update: vi.fn() },
		effects: { renderFrame: vi.fn() },
		frameModel: vi.fn(),
	}
	Object.assign(scene, fields)
	return { scene, fields, modelRoot, previous, hold }
}

type TileFixture = ReturnType<typeof tileScene>

async function addTile(f: TileFixture, id: string) {
	await f.scene.setTile(id, embeddedBuffer(), { translation: tileOffset })
}

function tileIdsOf(root: THREE.Object3D): unknown[] {
	return root.children.map(child => child.userData.tileId)
}

test('the first tile creates one tile root in the model root and reports the capture as non-empty', async () => {
	const f = tileScene()
	await addTile(f, 'a')
	expect(f.modelRoot.children).toHaveLength(1)
	const root = f.modelRoot.children[0] as THREE.Group
	expect(root.children).toHaveLength(1)
	expect(root.children[0]?.userData.tileId).toBe('a')
	expect(root.children[0]?.position.toArray()).toEqual([16, 0, -32])
	expect(f.scene.tileIds()).toEqual(['a'])
	expect(f.fields.events.onEmptyChange).toHaveBeenCalledOnce()
	expect(f.fields.events.onEmptyChange).toHaveBeenCalledWith(false)
	expect(f.fields.updateEnvironment).toHaveBeenCalledOnce()
	expect(f.fields.events.onFileInfo).not.toHaveBeenCalled()
	expect(f.fields.events.onLoading).toHaveBeenLastCalledWith(null)
})

test('later tiles join the same root without reloading the others or regenerating the environment', async () => {
	const f = tileScene()
	await addTile(f, 'a')
	await addTile(f, 'b')
	expect(f.modelRoot.children).toHaveLength(1)
	expect(tileIdsOf(f.modelRoot.children[0] as THREE.Group)).toEqual(['a', 'b'])
	expect(f.fields.updateEnvironment).toHaveBeenCalledOnce()
	expect(f.fields.events.onEmptyChange).toHaveBeenCalledOnce()
	expect(f.fields.renderer.compileAsync).toHaveBeenCalledTimes(2)
})

test('replacing a tile keeps the old one until the new one compiled, then disposes the old exactly once', async () => {
	const f = tileScene()
	await addTile(f, 'a')
	await addTile(f, 'b')
	const root = f.modelRoot.children[0] as THREE.Group
	const oldA = root.children[0] as THREE.Group
	const disposeOld = vi.spyOn(tileMeshOf(oldA).geometry, 'dispose')
	const replacement = tileGroup()
	f.fields.loader.parseAsync.mockResolvedValueOnce({ scene: replacement })
	const gate = deferred<void>()
	f.hold.current = gate.promise
	const pending = f.scene.setTile('a', embeddedBuffer(), { translation: tileOffset })
	await vi.waitFor(() => expect(f.fields.renderer.compileAsync).toHaveBeenCalledTimes(3))
	expect(oldA.parent).toBe(root)
	expect(oldA.visible).toBe(true)
	expect(root.children).toHaveLength(3)
	expect(disposeOld).not.toHaveBeenCalled()
	gate.resolve()
	await pending
	expect(oldA.parent).toBeNull()
	expect(root.children).toHaveLength(2)
	expect(root.children[1]).toBe(replacement)
	expect(disposeOld).toHaveBeenCalledOnce()
	expect(f.scene.tileIds()).toEqual(['a', 'b'])
	expect(f.fields.events.onEmptyChange).toHaveBeenCalledOnce()
})

test('tile ids keep their insertion order across replacement and removal', async () => {
	const f = tileScene()
	await addTile(f, 'a')
	await addTile(f, 'b')
	await addTile(f, 'c')
	await addTile(f, 'a')
	expect(f.scene.tileIds()).toEqual(['a', 'b', 'c'])
	f.scene.removeTile('b')
	expect(f.scene.tileIds()).toEqual(['a', 'c'])
	expect(tileIdsOf(f.modelRoot.children[0] as THREE.Group)).toEqual(['c', 'a'])
})

test('removing a tile among several keeps the root and does not report the capture empty', async () => {
	const f = tileScene()
	await addTile(f, 'a')
	await addTile(f, 'b')
	f.fields.events.onEmptyChange.mockClear()
	f.scene.removeTile('a')
	expect(f.modelRoot.children).toHaveLength(1)
	expect(f.scene.tileIds()).toEqual(['b'])
	expect(f.fields.events.onEmptyChange).not.toHaveBeenCalled()
})

test('removing the last tile disposes the tile root and reports the capture empty', async () => {
	const f = tileScene()
	await addTile(f, 'a')
	const root = f.modelRoot.children[0] as THREE.Group
	const dispose = vi.spyOn(tileMeshOf(root.children[0] as THREE.Group).geometry, 'dispose')
	f.scene.removeTile('a')
	expect(dispose).toHaveBeenCalledOnce()
	expect(root.parent).toBeNull()
	expect(f.modelRoot.children).toEqual([])
	expect(tileRuntime(f.scene).tileRoot).toBeNull()
	expect(f.scene.tileIds()).toEqual([])
	expect(f.fields.events.onEmptyChange).toHaveBeenLastCalledWith(true)
})

test('removing an unknown tile is a no-op', async () => {
	const f = tileScene()
	await addTile(f, 'a')
	f.fields.events.onEmptyChange.mockClear()
	f.scene.removeTile('missing')
	expect(f.scene.tileIds()).toEqual(['a'])
	expect(f.modelRoot.children).toHaveLength(1)
	expect(f.fields.events.onEmptyChange).not.toHaveBeenCalled()
})

test('a tile that fails to parse is rolled back and the previous tiles stay visible', async () => {
	const f = tileScene()
	await addTile(f, 'a')
	f.fields.loader.parseAsync.mockRejectedValueOnce(new Error('bad glb'))
	await expect(f.scene.setTile('b', embeddedBuffer(), { translation: tileOffset })).rejects.toThrow(
		'Could not read this GLB'
	)
	const root = f.modelRoot.children[0] as THREE.Group
	expect(f.scene.tileIds()).toEqual(['a'])
	expect(root.children).toHaveLength(1)
	expect(root.children[0]?.visible).toBe(true)
	expect(f.fields.renderer.compileAsync).toHaveBeenCalledOnce()
	expect(f.fields.events.onLoading).toHaveBeenLastCalledWith(null)
})

test('an unsupported tile is reported as such and attaches nothing', async () => {
	const f = tileScene()
	f.fields.loader.parseAsync.mockRejectedValueOnce(new UnsupportedGlbError('too complex'))
	await expect(f.scene.setTile('a', embeddedBuffer(), { translation: tileOffset })).rejects.toBeInstanceOf(
		UnsupportedGlbError
	)
	expect(f.modelRoot.children).toEqual([])
	expect(f.scene.tileIds()).toEqual([])
})

test('a compile failure of the first tile restores the previous whole capture and disposes the tile', async () => {
	const f = tileScene({ previous: true })
	const tile = tileGroup()
	f.fields.loader.parseAsync.mockResolvedValueOnce({ scene: tile })
	const dispose = vi.spyOn(tileMeshOf(tile).geometry, 'dispose')
	f.fields.renderer.compileAsync.mockRejectedValueOnce(new Error('GPU compilation failed'))
	await expect(f.scene.setTile('a', embeddedBuffer(), { translation: tileOffset })).rejects.toThrow(
		'Could not read this GLB'
	)
	expect(f.modelRoot.children).toEqual([f.previous])
	expect(f.previous.visible).toBe(true)
	expect(dispose).toHaveBeenCalledOnce()
	expect(tileRuntime(f.scene).tileRoot).toBeNull()
	expect(f.scene.tileIds()).toEqual([])
	expect(f.fields.events.onEmptyChange).not.toHaveBeenCalled()
	expect(f.fields.updateEnvironment).not.toHaveBeenCalled()
})

test('a tile with an already cancelled signal is not read or parsed', async () => {
	const f = tileScene()
	await expect(
		f.scene.setTile('a', embeddedBuffer(), { signal: AbortSignal.abort(), translation: tileOffset })
	).rejects.toMatchObject({ name: 'AbortError' })
	expect(f.fields.loader.parseAsync).not.toHaveBeenCalled()
	expect(f.modelRoot.children).toEqual([])
})

test('aborting while a tile parses releases it and leaves the attached tiles untouched', async () => {
	const f = tileScene()
	await addTile(f, 'a')
	const root = f.modelRoot.children[0] as THREE.Group
	const parsed = deferred<{ scene: THREE.Group }>()
	const tile = tileGroup()
	const dispose = vi.spyOn(tileMeshOf(tile).geometry, 'dispose')
	f.fields.loader.parseAsync.mockImplementationOnce(() => parsed.promise)
	const controller = new AbortController()
	const pending = f.scene.setTile('b', embeddedBuffer(), { signal: controller.signal, translation: tileOffset })
	const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
	await vi.waitFor(() => expect(f.fields.loader.parseAsync).toHaveBeenCalledTimes(2))
	controller.abort()
	parsed.resolve({ scene: tile })
	await rejection
	expect(dispose).toHaveBeenCalledOnce()
	expect(f.scene.tileIds()).toEqual(['a'])
	expect(root.children).toHaveLength(1)
	expect(f.fields.events.onLoading).toHaveBeenLastCalledWith(null)
})

test('aborting during compile removes the half-attached tile and keeps the previous tiles visible', async () => {
	const f = tileScene()
	await addTile(f, 'a')
	const root = f.modelRoot.children[0] as THREE.Group
	const tile = tileGroup()
	f.fields.loader.parseAsync.mockResolvedValueOnce({ scene: tile })
	const dispose = vi.spyOn(tileMeshOf(tile).geometry, 'dispose')
	const gate = deferred<void>()
	f.hold.current = gate.promise
	const controller = new AbortController()
	const pending = f.scene.setTile('b', embeddedBuffer(), { signal: controller.signal, translation: tileOffset })
	const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
	await vi.waitFor(() => expect(f.fields.renderer.compileAsync).toHaveBeenCalledTimes(2))
	controller.abort()
	gate.resolve()
	await rejection
	expect(tile.parent).toBeNull()
	expect(dispose).toHaveBeenCalledOnce()
	expect(root.children).toHaveLength(1)
	expect(root.children[0]?.userData.tileId).toBe('a')
	expect(root.children[0]?.visible).toBe(true)
	expect(f.scene.tileIds()).toEqual(['a'])
	expect(f.fields.events.onEmptyChange).toHaveBeenCalledOnce()
})

test('tile loads cannot overlap another tile load, a file load or a removal of a tile being loaded', async () => {
	const f = tileScene()
	await addTile(f, 'a')
	const gate = deferred<void>()
	f.hold.current = gate.promise
	const pending = f.scene.setTile('b', embeddedBuffer(), { translation: tileOffset })
	await vi.waitFor(() => expect(f.fields.renderer.compileAsync).toHaveBeenCalledTimes(2))
	await expect(f.scene.setTile('c', embeddedBuffer(), { translation: tileOffset })).rejects.toThrow('already loading')
	const file = { name: 'capture.glb', size: 64, arrayBuffer: async () => embeddedBuffer() } as File
	await expect(f.scene.loadFile(file)).rejects.toThrow('already loading')
	expect(() => f.scene.removeTile('a')).toThrow('already loading')
	gate.resolve()
	await pending
	expect(f.scene.tileIds()).toEqual(['a', 'b'])
})

test('a whole capture replaces the tile set, and a later tile starts a fresh root', async () => {
	const f = tileScene()
	await addTile(f, 'a')
	const oldRoot = f.modelRoot.children[0] as THREE.Group
	const dispose = vi.spyOn(tileMeshOf(oldRoot.children[0] as THREE.Group).geometry, 'dispose')
	const whole = new THREE.Group()
	f.fields.loader.parseAsync.mockResolvedValueOnce({ scene: whole })
	await f.scene.loadFile({ name: 'capture.glb', size: 64, arrayBuffer: async () => embeddedBuffer() } as File)
	expect(f.modelRoot.children).toEqual([whole])
	expect(dispose).toHaveBeenCalledOnce()
	expect(f.scene.tileIds()).toEqual([])
	expect(tileRuntime(f.scene).tileRoot).toBeNull()
	await addTile(f, 'b')
	expect(f.modelRoot.children).toHaveLength(1)
	const freshRoot = f.modelRoot.children[0] as THREE.Group
	expect(freshRoot).not.toBe(oldRoot)
	expect(freshRoot).not.toBe(whole)
	expect(whole.parent).toBeNull()
	expect(tileIdsOf(freshRoot)).toEqual(['b'])
	expect(f.fields.events.onEmptyChange).toHaveBeenLastCalledWith(false)
})

test('a whole capture that fails to compile keeps the attached tiles and the tile root', async () => {
	const f = tileScene()
	await addTile(f, 'a')
	const root = f.modelRoot.children[0] as THREE.Group
	f.fields.renderer.compileAsync.mockRejectedValueOnce(new Error('GPU compilation failed'))
	await expect(
		f.scene.loadFile({ name: 'capture.glb', size: 64, arrayBuffer: async () => embeddedBuffer() } as File)
	).rejects.toThrow('Could not read this GLB')
	expect(f.modelRoot.children).toEqual([root])
	expect(root.visible).toBe(true)
	expect(f.scene.tileIds()).toEqual(['a'])
})

test('frameTiles frames the tile root, stores the player position and refreshes the view', async () => {
	const f = tileScene()
	await addTile(f, 'a')
	const root = f.modelRoot.children[0] as THREE.Group
	f.fields.updateEnvironment.mockClear()
	f.scene.frameTiles({ preserveView: true, player: { x: 4, y: 70, z: -9 } })
	expect(root.userData.minemoriesPlayerPosition).toEqual([4, 70, -9])
	expect(f.fields.frameModel).toHaveBeenCalledWith(root, true)
	expect(f.fields.updateEnvironment).toHaveBeenCalledOnce()
	expect(f.fields.clouds.update).toHaveBeenCalledOnce()
	expect(f.fields.effects.renderFrame).toHaveBeenCalled()
})

test('frameTiles without a player keeps the stored player position', async () => {
	const f = tileScene()
	await addTile(f, 'a')
	const root = f.modelRoot.children[0] as THREE.Group
	f.scene.frameTiles({ player: { x: 4, y: 70, z: -9 } })
	f.scene.frameTiles()
	expect(f.fields.frameModel).toHaveBeenLastCalledWith(root, undefined)
	expect(root.userData.minemoriesPlayerPosition).toEqual([4, 70, -9])
})

test('frameTiles does nothing when no tile is attached', () => {
	const f = tileScene()
	f.scene.frameTiles({ player: { x: 1, y: 2, z: 3 } })
	expect(f.fields.frameModel).not.toHaveBeenCalled()
	expect(f.fields.updateEnvironment).not.toHaveBeenCalled()
	expect(f.fields.clouds.update).not.toHaveBeenCalled()
})

test('dispose releases every tile and forgets the tile bookkeeping', async () => {
	const f = tileScene()
	await addTile(f, 'a')
	await addTile(f, 'b')
	const root = f.modelRoot.children[0] as THREE.Group
	const dispose = vi.spyOn(tileMeshOf(root.children[0] as THREE.Group).geometry, 'dispose')
	const sceneGraph = new THREE.Scene()
	sceneGraph.add(f.modelRoot)
	Object.assign(f.scene, {
		scene: sceneGraph,
		onWindowResize: () => undefined,
		resizeObserver: { disconnect: vi.fn() },
		navigation: { dispose: vi.fn() },
		controls: { dispose: vi.fn() },
		clouds: { dispose: vi.fn(), removeFromParent: vi.fn() },
		precipitation: { points: new THREE.Object3D(), dispose: vi.fn() },
		keyLight: { shadow: { dispose: vi.fn() } },
		effects: { dispose: vi.fn() },
		environment: null,
		environmentGenerator: { dispose: vi.fn() },
		renderer: { setAnimationLoop: vi.fn(), dispose: vi.fn() },
	})
	vi.stubGlobal('window', { removeEventListener: vi.fn() })
	try {
		f.scene.dispose()
	} finally {
		vi.unstubAllGlobals()
	}
	expect(dispose).toHaveBeenCalledOnce()
	expect(f.scene.tileIds()).toEqual([])
	expect(tileRuntime(f.scene).tileRoot).toBeNull()
})
