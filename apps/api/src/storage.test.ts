import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'minemories-storage-'))
process.env.STORAGE_DRIVER = 'filesystem'
process.env.LOCAL_OBJECTS_PATH = temporaryDirectory

const { readMemory, removeMemory, storeMemory } = await import('./storage')

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
