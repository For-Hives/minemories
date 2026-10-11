import { expect, test } from 'bun:test'
import {
	embeddedGltfJson,
	glbChunk,
	glbJsonLength,
	isSelfContainedGlb,
	MAX_GLB_JSON_BYTES,
} from '@minemories/api-contract/glb'
import { minimalGlb } from './test-support/glb-fixture'

const asset = { version: '2.0' }
const externalUris = [
	'https://private.test/image.png',
	'http://127.0.0.1/private',
	'//private.test/file',
	'../file',
	'file:///private',
	'blob:https://private.test/id',
	'',
	'data:image/svg+xml,%3Csvg%3E',
	'DATA:invalid',
	4,
	null,
]

test('embedded BIN references and supported inline data remain accepted', () => {
	for (const document of [
		{ asset },
		{ asset, buffers: [{ byteLength: 4 }], images: [{ bufferView: 0, mimeType: 'image/png' }] },
		{ asset, buffers: [{ byteLength: 3, uri: 'data:application/octet-stream;base64,AAAA' }] },
		{ asset, buffers: [{ byteLength: 3, uri: 'data:application/gltf-buffer;base64,AAAA' }] },
		{ asset, images: [{ uri: 'data:image/png;base64,AAAA' }, { uri: 'data:image/jpeg,%FF%D8%FF' }] },
		{ asset, images: [{ uri: 'data:image/webp;base64,AAAA' }, { uri: 'DATA:image/ktx2;custom=value;base64,AAAA' }] },
		{ asset, extras: { uri: 'https://documentation.test' }, buffers: [], images: [] },
		{ asset, images: [{ uri: 'data:image/avif;base64,AAAA', mimeType: 'image/avif' }] },
	])
		expect(isSelfContainedGlb(minimalGlb(Buffer.alloc(4), document))).toBe(true)
})

test('all resource entries are checked and external, relative, blob and malformed URIs are refused', () => {
	for (const uri of externalUris) {
		for (const field of ['buffers', 'images']) {
			expect(
				isSelfContainedGlb(
					minimalGlb(Buffer.alloc(4), {
						asset,
						[field]: [
							field === 'buffers' ? { byteLength: 4 } : { bufferView: 0, mimeType: 'image/png' },
							{ byteLength: 3, uri },
						],
					})
				)
			).toBe(false)
		}
	}
	for (const field of ['buffers', 'images']) {
		for (const resources of [null, {}, [null], [4], [[]]]) {
			expect(isSelfContainedGlb(minimalGlb(undefined, { asset, [field]: resources }))).toBe(false)
		}
	}
	for (const document of [null, [], {}, { asset: null }, { asset: [] }, { asset: {} }, { asset: { version: '1.0' } }]) {
		expect(embeddedGltfJson(Buffer.from(JSON.stringify(document)))).toBe(false)
	}
	expect(embeddedGltfJson(Buffer.from([0xff]))).toBe(false)
})

function appendedChunks(bytes: Buffer, ...chunks: Buffer[]): Buffer {
	const result = Buffer.concat([bytes, ...chunks])
	result.writeUInt32LE(result.length, 8)
	return result
}

test('duplicate JSON cannot replace validated content and BIN occurs only immediately after JSON', () => {
	const safe = minimalGlb()
	const unsafe = minimalGlb(undefined, { asset, images: [{ uri: 'https://private.test' }] })
	expect(isSelfContainedGlb(appendedChunks(safe, unsafe.subarray(12)))).toBe(false)
	const bin = minimalGlb(Buffer.alloc(4)).subarray(safe.length)
	expect(isSelfContainedGlb(appendedChunks(safe, bin, bin))).toBe(false)
	const unknown = Buffer.alloc(8)
	unknown.writeUInt32LE(0x12345678, 4)
	expect(isSelfContainedGlb(appendedChunks(safe, bin, unknown))).toBe(true)
	expect(isSelfContainedGlb(appendedChunks(safe, unknown, bin))).toBe(false)
	expect(isSelfContainedGlb(appendedChunks(safe, ...Array.from({ length: 64 }, () => unknown)))).toBe(true)
	expect(isSelfContainedGlb(appendedChunks(safe, ...Array.from({ length: 65 }, () => unknown)))).toBe(false)
	expect(glbChunk(new Uint8Array(4), 0, 8)).toBeNull()
	expect(glbChunk(new Uint8Array(8), 0, 4)).toBeNull()
})

test('JSON allocation is capped and validation respects byte offsets', () => {
	const valid = minimalGlb()
	const backed = Buffer.concat([Buffer.alloc(7), valid, Buffer.alloc(7)])
	expect(isSelfContainedGlb(backed.subarray(7, 7 + valid.length))).toBe(true)
	expect(glbJsonLength(valid, 16)).toBeNull()
	const large = Buffer.alloc(20 + MAX_GLB_JSON_BYTES + 4, 0x20)
	valid.subarray(0, 20).copy(large)
	large.writeUInt32LE(large.length, 8)
	large.writeUInt32LE(MAX_GLB_JSON_BYTES + 4, 12)
	expect(isSelfContainedGlb(large)).toBe(false)
	const unaligned = Buffer.from(valid)
	unaligned.writeUInt32LE(3, 12)
	expect(isSelfContainedGlb(unaligned)).toBe(false)
	const overflow = Buffer.from(valid)
	overflow.writeUInt32LE(valid.length, 12)
	expect(isSelfContainedGlb(overflow)).toBe(false)
})

test('buffers without URI require the single embedded BIN with matching length', () => {
	const document = { asset, buffers: [{ byteLength: 3 }] }
	expect(isSelfContainedGlb(minimalGlb(Buffer.alloc(4), document))).toBe(true)
	expect(isSelfContainedGlb(minimalGlb(undefined, document))).toBe(false)
	expect(isSelfContainedGlb(minimalGlb(Buffer.alloc(8), document))).toBe(false)
	for (const byteLength of [undefined, null, '4', 0, -1, 1.5, 5]) {
		expect(isSelfContainedGlb(minimalGlb(Buffer.alloc(4), { asset, buffers: [{ byteLength }] }))).toBe(false)
	}
	expect(
		isSelfContainedGlb(minimalGlb(Buffer.alloc(4), { asset, buffers: [{ byteLength: 4 }, { byteLength: 4 }] }))
	).toBe(false)
	for (const image of [
		{},
		{ bufferView: '0' },
		{ bufferView: 0 },
		{ bufferView: -1, mimeType: 'image/png' },
		{ bufferView: 0.5, mimeType: 'image/png' },
		{ bufferView: 0, uri: 'data:image/png;base64,AAAA' },
		{ bufferView: 0, mimeType: 'image/svg+xml' },
		{ uri: 'data:image/png;base64,AAAA', mimeType: 4 },
	]) {
		expect(isSelfContainedGlb(minimalGlb(undefined, { asset, images: [image] }))).toBe(false)
	}
})
