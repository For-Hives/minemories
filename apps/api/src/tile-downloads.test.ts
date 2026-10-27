import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readAuthorizedTile, TILE_INTEGRITY_ERROR, type TileReader } from './tile-downloads'
import type { TileLocation } from './tile-index'

const bytes = Buffer.from('glTF-tile-bytes')
const sha256 = createHash('sha256').update(bytes).digest('hex')
const location: TileLocation = { objectKey: 'owner/a.glb', offset: 12, size: bytes.length, sha256 }
const signal = new AbortController().signal

function reader(read: TileReader['readRange'] = async () => bytes) {
	const calls: unknown[][] = []
	return {
		calls,
		files: {
			readRange: (...args: Parameters<TileReader['readRange']>) => {
				calls.push(args)
				return read(...args)
			},
		} satisfies TileReader,
	}
}

test('authorized tile returns the bytes of the located range', async () => {
	const { files, calls } = reader()
	expect(await readAuthorizedTile(files, () => location, signal)).toEqual(bytes)
	expect(calls).toEqual([[location.objectKey, location.offset, location.size, signal]])
})

test('a missing location answers null without touching storage', async () => {
	const { files, calls } = reader()
	expect(await readAuthorizedTile(files, () => null, signal)).toBeNull()
	expect(calls).toEqual([])
})

test('a tile revoked while reading answers null', async () => {
	let present = true
	const { files } = reader(async () => {
		present = false
		return bytes
	})
	expect(await readAuthorizedTile(files, () => (present ? location : null), signal)).toBeNull()
})

test('a failed read whose key was swapped retries once with the new location', async () => {
	const moved = { ...location, objectKey: 'owner/a-converted.glb', offset: 40 }
	let current = location
	let attempts = 0
	const { files, calls } = reader(async key => {
		attempts++
		if (attempts === 1) {
			current = moved
			throw new Error('object moved')
		}
		expect(key).toBe(moved.objectKey)
		return bytes
	})
	expect(await readAuthorizedTile(files, () => current, signal)).toEqual(bytes)
	expect(calls.map(call => call[0])).toEqual([location.objectKey, moved.objectKey])
	expect(calls[1]?.[1]).toBe(moved.offset)
})

test('a failed read with an unchanged key rethrows the storage error', async () => {
	const { files, calls } = reader(async () => {
		throw new Error('storage offline')
	})
	await expect(readAuthorizedTile(files, () => location, signal)).rejects.toThrow('storage offline')
	expect(calls).toHaveLength(1)
})

test('a failed read whose tile disappeared answers null', async () => {
	let current: TileLocation | null = location
	const { files } = reader(async () => {
		current = null
		throw new Error('storage offline')
	})
	expect(await readAuthorizedTile(files, () => current, signal)).toBeNull()
})

test('bytes that do not match the located digest throw an integrity error', async () => {
	const { files } = reader(async () => Buffer.from('tampered-tile-bytes'))
	await expect(readAuthorizedTile(files, () => location, signal)).rejects.toThrow(TILE_INTEGRITY_ERROR)
})

test('the caller abort signal is passed through to the range read', async () => {
	const controller = new AbortController()
	const { files, calls } = reader()
	await readAuthorizedTile(files, () => location, controller.signal)
	expect(calls[0]?.[3]).toBe(controller.signal)
})
