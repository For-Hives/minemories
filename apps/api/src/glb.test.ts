import { expect, test } from 'bun:test'
import { isGlbContainer } from './glb'
import { minimalGlb } from './test-support/glb-fixture'

test('accepts a version 2 JSON chunk and an optional padded BIN chunk', () => {
	expect(isGlbContainer(minimalGlb())).toBe(true)
	expect(isGlbContainer(minimalGlb(Buffer.from([0, 1, 2])))).toBe(true)
})

test('rejects wrong header and truncated input at every boundary', () => {
	const valid = minimalGlb(Buffer.from([0, 1, 2]))
	for (let length = 0; length < valid.length; length += 1) {
		expect(isGlbContainer(valid.subarray(0, length))).toBe(false)
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
		expect(isGlbContainer(malformed)).toBe(false)
	}
})

test('rejects invalid JSON and the wrong glTF asset version', () => {
	const malformed = minimalGlb()
	malformed.fill(0x20, 20, 20 + malformed.readUInt32LE(12))
	expect(isGlbContainer(malformed)).toBe(false)

	const oldVersion = minimalGlb()
	oldVersion.write('1.0', oldVersion.indexOf('2.0'), 'utf8')
	expect(isGlbContainer(oldVersion)).toBe(false)
})

test('rejects bad chunk alignment and trailing incomplete chunks', () => {
	const unaligned = minimalGlb(Buffer.from([0, 1, 2]))
	unaligned.writeUInt32LE(3, 20 + unaligned.readUInt32LE(12))
	expect(isGlbContainer(unaligned)).toBe(false)

	const trailing = Buffer.concat([minimalGlb(), Buffer.alloc(4)])
	trailing.writeUInt32LE(trailing.length, 8)
	expect(isGlbContainer(trailing)).toBe(false)
})
