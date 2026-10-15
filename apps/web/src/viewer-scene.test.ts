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
