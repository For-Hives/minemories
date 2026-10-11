import { expect, test } from 'bun:test'
import { isGlbContainer } from './glb'
import { minimalGlb } from './test-support/glb-fixture'

test('accepts a version 2 JSON chunk and an optional padded BIN chunk', async () => {
	expect(await isGlbContainer(minimalGlb())).toBe(true)
	expect(await isGlbContainer(minimalGlb(Buffer.from([0, 1, 2])))).toBe(true)
})

test('rejects wrong header and truncated input at every boundary', async () => {
	const valid = minimalGlb(Buffer.from([0, 1, 2]))
	for (let length = 0; length < valid.length; length += 1) {
		// biome-ignore lint/performance/noAwaitInLoops: Exercise every truncation independently.
		expect(await isGlbContainer(valid.subarray(0, length))).toBe(false)
	}
	const corruptions: Array<[number, number]> = [
		[0, 0], // magic
		[4, 1], // GLB version
		[8, valid.length + 4], // declared length
		[12, 0], // empty JSON chunk
		[16, 0], // wrong first chunk type
		[20 + valid.readUInt32LE(12), 100], // overflowing BIN chunk
	]
	for (const [offset, value] of corruptions) {
		const malformed = Buffer.from(valid)
		malformed.writeUInt32LE(value, offset)
		// biome-ignore lint/performance/noAwaitInLoops: Check each distinct malformed container.
		expect(await isGlbContainer(malformed)).toBe(false)
	}
})

test('rejects invalid JSON and the wrong glTF asset version', async () => {
	const malformed = minimalGlb()
	malformed.fill(0x20, 20, 20 + malformed.readUInt32LE(12))
	expect(await isGlbContainer(malformed)).toBe(false)

	const oldVersion = minimalGlb()
	oldVersion.write('1.0', oldVersion.indexOf('2.0'), 'utf8')
	expect(await isGlbContainer(oldVersion)).toBe(false)
})

test('rejects bad chunk alignment and trailing incomplete chunks', async () => {
	const unaligned = minimalGlb(Buffer.from([0, 1, 2]))
	unaligned.writeUInt32LE(3, 20 + unaligned.readUInt32LE(12))
	expect(await isGlbContainer(unaligned)).toBe(false)

	const trailing = Buffer.concat([minimalGlb(), Buffer.alloc(4)])
	trailing.writeUInt32LE(trailing.length, 8)
	expect(await isGlbContainer(trailing)).toBe(false)
})
