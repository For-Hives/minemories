import { expect, test, vi } from 'vitest'
import { UnsupportedGlbError } from './lib/glb'
import { ViewerScene } from './viewer-scene'

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
