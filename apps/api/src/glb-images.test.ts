import { expect, test } from 'bun:test'
import { validateSelfContainedGlb, validEmbeddedGltfValues } from '@minemories/api-contract/glb'
import { MAX_GLB_IMAGES, MAX_GLB_TEXTURES } from '../../../packages/api-contract/src/glb-images'
import { MAX_IMAGE_PIXELS, MAX_TEXTURE_PIXELS } from '../../../packages/api-contract/src/image-reader'
import { minimalGlb } from './test-support/glb-fixture'
import {
	animatedWebpImage,
	apngImage,
	avifImage,
	jpegImage,
	ktxImage,
	losslessWebpImage,
	pngImage,
	webpImage,
} from './test-support/image-fixture'

function document(bytes: Buffer, mime = 'image/png') {
	return {
		asset: { version: '2.0' },
		buffers: [{ byteLength: bytes.length }],
		bufferViews: [{ buffer: 0, byteLength: bytes.length }],
		images: [{ bufferView: 0, mimeType: mime }],
		textures: [{ source: 0 }],
	}
}
function accepts(bytes: Buffer, mime = 'image/png') {
	return validateSelfContainedGlb(minimalGlb(bytes, document(bytes, mime)))
}

test('real static/animated raster fixtures and bounded KTX2 headers pass before decoding', async () => {
	await Promise.all(
		[
			[pngImage, 'image/png'],
			[apngImage, 'image/png'],
			[jpegImage, 'image/jpeg'],
			[webpImage, 'image/webp'],
			[losslessWebpImage, 'image/webp'],
			[animatedWebpImage, 'image/webp'],
			[avifImage, 'image/avif'],
			[ktxImage(), 'image/ktx2'],
		].map(async ([bytes, mime]) => expect(await accepts(bytes as Buffer, mime as string)).toBe(true))
	)
})

test('oversized dimensions and pixels are refused even in tiny encoded files', async () => {
	const size = Buffer.from(pngImage)
	size.writeUInt32BE(16385, 16)
	expect(await accepts(size)).toBe(false)
	size.writeUInt32BE(4097, 16)
	size.writeUInt32BE(4097, 20)
	expect(await accepts(size)).toBe(false)
	size.writeUInt32BE(4096, 16)
	size.writeUInt32BE(4096, 20)
	expect(await accepts(size)).toBe(true)
	expect(MAX_IMAGE_PIXELS).toBe(4096 * 4096)
	expect(MAX_TEXTURE_PIXELS).toBe(4 * MAX_IMAGE_PIXELS)
	size.writeUInt32BE(0, 20)
	expect(await accepts(size)).toBe(false)
})

test('total pixel budgets include repeated texture sources and fallback extension sources', async () => {
	const bytes = Buffer.from(pngImage)
	bytes.writeUInt32BE(4096, 16)
	bytes.writeUInt32BE(4096, 20)
	const source = document(bytes)
	source.textures = Array.from({ length: 4 }, () => ({ source: 0 }))
	expect(await validateSelfContainedGlb(minimalGlb(bytes, source))).toBe(true)
	source.textures.push({ source: 0 })
	expect(await validateSelfContainedGlb(minimalGlb(bytes, source))).toBe(false)
	const extensions = {
		...document(pngImage),
		textures: [
			{
				extensions: {
					KHR_texture_basisu: { source: 0 },
					EXT_texture_webp: { source: 0 },
					EXT_texture_avif: { source: 0 },
				},
			},
		],
	}
	expect(await validateSelfContainedGlb(minimalGlb(pngImage, extensions))).toBe(true)
	const extension = extensions.textures[0]
	if (!extension) throw new Error('Missing texture extension fixture')
	extension.extensions.EXT_texture_avif.source = 1
	expect(await validateSelfContainedGlb(minimalGlb(pngImage, extensions))).toBe(false)
})

test('unreferenced images count too; invalid texture references and excessive counts are refused', async () => {
	const source = document(pngImage)
	source.images = Array.from({ length: MAX_GLB_IMAGES }, () => ({ bufferView: 0, mimeType: 'image/png' }))
	expect(await validateSelfContainedGlb(minimalGlb(pngImage, source))).toBe(true)
	source.images.push({ bufferView: 0, mimeType: 'image/png' })
	expect(await validateSelfContainedGlb(minimalGlb(pngImage, source))).toBe(false)
	await Promise.all(
		[
			null,
			{},
			[{}],
			[{ source: null }],
			[{ source: -1 }],
			[{ source: 1 }],
			Array.from({ length: MAX_GLB_TEXTURES + 1 }, () => ({ source: 0 })),
		].map(async textures =>
			expect(await validateSelfContainedGlb(minimalGlb(pngImage, { ...document(pngImage), textures }))).toBe(false)
		)
	)
})

test('KTX2 declared decompression also consumes the shared byte budget when dimensions stay small', async () => {
	const bytes = ktxImage(1, 1, 2)
	bytes.writeBigUInt64LE(128n * 1024n * 1024n, 96)
	const source = document(bytes, 'image/ktx2')
	source.textures = Array.from({ length: 4 }, () => ({ source: 0 }))
	expect(await validateSelfContainedGlb(minimalGlb(bytes, source))).toBe(true)
	source.textures.push({ source: 0 })
	expect(await validateSelfContainedGlb(minimalGlb(bytes, source))).toBe(false)
})

test('inline image data accepts base64 and percent bytes, rejects invalid encoding and MIME conflicts', async () => {
	const encoded = [...pngImage].map(byte => `%${byte.toString(16).padStart(2, '0')}`).join('')
	const base64 = pngImage.toString('base64')
	await Promise.all(
		[`data:image/png;base64,${base64}`, `DATA:image/png;custom=value,${encoded}`].map(async uri => {
			expect(
				await validateSelfContainedGlb(minimalGlb(undefined, { asset: { version: '2.0' }, images: [{ uri }] }))
			).toBe(true)
		})
	)
	await Promise.all(
		[
			`data:image/png,${encoded}%ZZ`,
			'data:image/png,é',
			'data:image/png;base64,???',
			'data:image/png;base64,%FF',
			'data:image/png,%',
			'data:image/png;base64,A',
		].map(async uri => {
			expect(
				await validateSelfContainedGlb(minimalGlb(undefined, { asset: { version: '2.0' }, images: [{ uri }] }))
			).toBe(false)
		})
	)
	expect(
		await validateSelfContainedGlb(
			minimalGlb(undefined, {
				asset: { version: '2.0' },
				images: [{ uri: `data:image/png;base64,${base64}`, mimeType: 'image/jpeg' }],
			})
		)
	).toBe(false)
	expect(await accepts(pngImage, 'image/jpeg')).toBe(false)
})

test('resumable image inspection skips a large compressed payload and uses bounded reads', async () => {
	const bytes = Buffer.alloc(8 * 1024 * 1024)
	pngImage.copy(bytes, 0, 0, 33)
	bytes.writeUInt32BE(bytes.length - 57, 33)
	bytes.write('IDAT', 37, 'ascii')
	bytes.writeUInt32BE(0, bytes.length - 12)
	bytes.write('IEND', bytes.length - 8, 'ascii')
	const source = document(bytes)
	let total = 0
	let largest = 0
	const valid = await validEmbeddedGltfValues(
		Buffer.from(JSON.stringify(source)),
		bytes.length,
		async (_buffer, offset, length) => {
			total += length
			largest = Math.max(largest, length)
			return bytes.subarray(offset, offset + length)
		}
	)
	expect(valid).toBe(true)
	expect(largest).toBeLessThanOrEqual(4096)
	expect(total).toBeLessThan(8192)
	expect(
		await validEmbeddedGltfValues(Buffer.from(JSON.stringify(source)), bytes.length, () =>
			Promise.resolve(new Uint8Array(1))
		)
	).toBe(false)
})

test('malformed headers fail safely rather than throwing during image inspection', async () => {
	await Promise.all(
		['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/ktx2'].flatMap(mime =>
			Array.from({ length: 90 }, (_, length) =>
				accepts(Buffer.alloc(length), mime).then(valid => expect(valid).toBe(false))
			)
		)
	)
})
