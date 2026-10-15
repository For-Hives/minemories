import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'minemories-storage-'))
process.env.STORAGE_DRIVER = 'filesystem'
process.env.LOCAL_OBJECTS_PATH = temporaryDirectory

const { readMemory, readMemoryStream, removeMemory, storeMemory } = await import('./storage')

afterAll(() => rmSync(temporaryDirectory, { recursive: true, force: true }))

test('filesystem storage round trip, without overwriting an existing memory', async () => {
	const key = 'user-1/capture.glb'
	const contents = Buffer.from('glTF-memory')
	await storeMemory(key, contents)
	expect(await readMemory(key)).toEqual(contents)
	await expect(storeMemory(key, Buffer.from('replacement'))).rejects.toThrow()
	expect(await readMemory(key)).toEqual(contents)
	await removeMemory(key)
	await expect(readMemory(key)).rejects.toThrow()
})

test('filesystem storage rejects paths outside the configured root', async () => {
	const key = '../escape.glb'
	await expect(storeMemory(key, Buffer.from('glTF'))).rejects.toThrow('Invalid object key.')
	await expect(readMemory(key)).rejects.toThrow('Invalid object key.')
	await expect(removeMemory(key)).rejects.toThrow('Invalid object key.')
})

test('filesystem streams and writes honor caller cancellation', async () => {
	const controller = new AbortController()
	controller.abort(new Error('cancelled filesystem'))
	await expect(storeMemory('user-1/aborted.glb', Buffer.from('glTF'), controller.signal)).rejects.toThrow(
		'cancelled filesystem'
	)
	await expect(readMemoryStream('user-1/aborted.glb', controller.signal)).rejects.toThrow('cancelled filesystem')
	const key = 'user-1/cancel-stream.glb'
	await storeMemory(key, Buffer.alloc(512 * 1024))
	const during = new AbortController(),
		body = await readMemoryStream(key, during.signal)
	const reading = (async () => {
		for await (const _chunk of body) {
			during.abort(new Error('stop reading'))
		}
	})()
	await expect(reading).rejects.toThrow()
	expect(body.destroyed).toBe(true)
})
