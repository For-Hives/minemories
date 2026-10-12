import { expect, test } from 'bun:test'
import { av1Dimensions } from '../../../packages/api-contract/src/av1-dimensions'
import { avifCost } from '../../../packages/api-contract/src/avif-dimensions'
import {
	ImageReader,
	ImageWork,
	MAX_IMAGE_HEADER_BYTES,
	MAX_IMAGE_HEADERS,
} from '../../../packages/api-contract/src/image-reader'
import { ktxCost } from '../../../packages/api-contract/src/ktx-dimensions'
import { jpegCost, pngCost, webpCost } from '../../../packages/api-contract/src/raster-dimensions'
import { avifFixture, isoBox, obu, sequenceHeader } from './test-support/avif-fixture'
import { animatedWebpImage, apngImage, jpegImage, ktxImage, pngImage, webpImage } from './test-support/image-fixture'

function reader(bytes: Buffer, work = new ImageWork()): ImageReader {
	return new ImageReader(
		bytes.length,
		(offset, length) => Promise.resolve(bytes.subarray(offset, offset + length)),
		work
	)
}
function view(bytes: Buffer): DataView {
	return new DataView(bytes.buffer, bytes.byteOffset, bytes.length)
}
function mutate(bytes: Buffer, offset: number, value: number): Buffer {
	const copy = Buffer.from(bytes)
	copy[offset] = value
	return copy
}

test('PNG rejects malformed IHDR and animation geometry instead of trusting compressed byte size', async () => {
	await Promise.all(
		[
			[0, 0],
			[11, 12],
			[12, 0],
			[24, 3],
			[25, 1],
			[26, 1],
			[27, 1],
			[28, 2],
		].map(async ([offset, value]) =>
			expect(await pngCost(reader(mutate(pngImage, offset as number, value as number)))).toBeNull()
		)
	)
	const control = apngImage.indexOf('acTL')
	const frame = apngImage.indexOf('fcTL')
	await Promise.all(
		[
			mutate(apngImage, control + 4, 0xff),
			mutate(apngImage, frame + 8, 0xff),
			mutate(apngImage, control - 1, 9),
			mutate(apngImage, frame - 1, 25),
			Buffer.concat([pngImage, Buffer.from([0])]),
			pngImage.subarray(0, pngImage.length - 12),
		].map(async bytes => expect(await pngCost(reader(bytes))).toBeNull())
	)
})

test('JPEG checks SOF dimensions and marker bounds, including fills and standalone TEM markers', async () => {
	const frame = jpegImage.indexOf(Buffer.from([0xff, 0xc0]))
	const large = Buffer.from(jpegImage)
	large.writeUInt16BE(16385, frame + 7)
	const invalid = [
		large,
		mutate(jpegImage, frame + 4, 1),
		mutate(jpegImage, frame + 9, 5),
		jpegImage.subarray(0, frame + 8),
		Buffer.from([255, 216, 255, 217]),
		Buffer.from([255, 216, 255, 0]),
		Buffer.from([255, 216, 255, 224, 0, 1]),
	]
	await Promise.all(invalid.map(async bytes => expect(await jpegCost(reader(bytes))).toBeNull()))
	const filled = Buffer.concat([jpegImage.subarray(0, 2), Buffer.from([255, 255, 1]), jpegImage.subarray(2)])
	expect(await jpegCost(reader(filled))).not.toBeNull()
	const duplicated = Buffer.concat([
		jpegImage.subarray(0, frame),
		jpegImage.subarray(frame, frame + 19),
		jpegImage.subarray(frame),
	])
	expect(await jpegCost(reader(duplicated))).toBeNull()
})

test('WebP checks coded dimensions as well as the VP8X canvas and each animated frame', async () => {
	const vp8 = webpImage.indexOf('VP8 ')
	const mismatch = Buffer.from(webpImage)
	mismatch.writeUInt16LE(17, vp8 + 14)
	const frame = animatedWebpImage.indexOf('ANMF')
	await Promise.all(
		[
			mutate(webpImage, 0, 0),
			mutate(webpImage, 4, 0),
			mutate(webpImage, 20, 0xc1),
			mutate(webpImage, vp8 + 8, 1),
			mutate(webpImage, vp8 + 11, 0),
			mismatch,
			mutate(animatedWebpImage, frame + 10, 0xff),
			mutate(animatedWebpImage, frame + 19, 0xff),
			mutate(animatedWebpImage, frame + 4, 0xff),
		].map(async bytes => expect(await webpCost(reader(bytes))).toBeNull())
	)
})

test('KTX2 counts depth/layers/faces and bounds every supercompressed level before allocation', async () => {
	await Promise.all(
		[0, 1, 2, 3].map(async scheme => expect(await ktxCost(reader(ktxImage(16, 16, scheme)))).not.toBeNull())
	)
	const cases: Buffer[] = []
	for (const [offset, value] of [
		[20, 0],
		[28, 65536],
		[32, 65536],
		[36, 2],
		[40, 100],
		[44, 4],
		[48, 0xffffffff],
		[52, 1],
		[60, 4],
	]) {
		const bytes = ktxImage()
		bytes.writeUInt32LE(value as number, offset as number)
		cases.push(bytes)
	}
	for (const offset of [64, 72, 80, 88, 96]) {
		const bytes = ktxImage()
		bytes.writeBigUInt64LE(2n ** 63n, offset)
		cases.push(bytes)
	}
	const raw = ktxImage(1, 1, 2)
	raw.writeBigUInt64LE(129n * 1024n * 1024n, 96)
	cases.push(raw)
	await Promise.all(cases.map(async bytes => expect(await ktxCost(reader(bytes))).toBeNull()))
	const cube = ktxImage(16, 16)
	cube.writeUInt32LE(6, 36)
	expect((await ktxCost(reader(cube)))?.pixels).toBe(16 * 16 * 6)
	cube.writeUInt32LE(15, 24)
	expect(await ktxCost(reader(cube))).toBeNull()
})

test('AV1 sequence maxima cover reduced headers, full timing/operating points and truncation', () => {
	for (const sequence of [sequenceHeader(), sequenceHeader(16, 16, false), sequenceHeader(16, 16, false, true)])
		expect(av1Dimensions(view(sequence))?.pixels).toBe(256)
	expect(av1Dimensions(view(sequenceHeader(65536, 65536)))).toBeNull()
	expect(av1Dimensions(view(Buffer.alloc(0)))).toBeNull()
	expect(av1Dimensions(view(mutate(sequenceHeader(), 0, 0xe0)))).toBeNull()
	expect(av1Dimensions(view(mutate(sequenceHeader(), 0, 0x08)))).toBeNull()
})

test('AVIF inspects actual item OBUs instead of only the ispe display dimensions', async () => {
	expect(await avifCost(reader(avifFixture()))).not.toBeNull()
	expect(await avifCost(reader(avifFixture(16, 16, true)))).not.toBeNull()
	expect(await avifCost(reader(avifFixture(65536, 65536)))).toBeNull()
	const missing = avifFixture(16, 16, false, obu(6, Buffer.from([0])))
	expect(await avifCost(reader(missing))).toBeNull()
	const repeated = Buffer.concat([obu(1, sequenceHeader()), obu(1, sequenceHeader()), obu(6, Buffer.from([0]))])
	expect(await avifCost(reader(avifFixture(16, 16, false, repeated)))).toBeNull()
	const illegal = avifFixture(16, 16, false, Buffer.from([0x80, 0]))
	expect(await avifCost(reader(illegal))).toBeNull()
	const ext = Buffer.concat([
		Buffer.from([0x0e, 0]),
		Buffer.from([sequenceHeader().length]),
		sequenceHeader(),
		obu(6, Buffer.from([0])),
	])
	expect(await avifCost(reader(avifFixture(16, 16, false, ext)))).not.toBeNull()
	ext[1] = 7
	expect(await avifCost(reader(avifFixture(16, 16, false, ext)))).toBeNull()
})

test('AVIF boxes, item ranges and external data references fail closed within work limits', async () => {
	const source = avifFixture()
	const location = source.indexOf('iloc') + 4
	const item = source.indexOf('infe') + 4
	const extent = source.indexOf('ispe') + 4
	await Promise.all(
		[
			mutate(source, 4, 0),
			mutate(source, location, 3),
			mutate(source, location + 4, 0xff),
			mutate(source, location + 10, 1),
			mutate(source, location + 14, 0xff),
			mutate(source, item, 4),
			mutate(source, extent + 4, 0xff),
			Buffer.concat([source, isoBox('moov', Buffer.alloc(0))]),
		].map(async bytes => expect(await avifCost(reader(bytes))).toBeNull())
	)
	const idat = avifFixture(16, 16, true)
	const idatLocation = idat.indexOf('iloc') + 4
	expect(await avifCost(reader(mutate(idat, idatLocation + 16, 0xff)))).toBeNull()
	let nested = isoBox('free', Buffer.alloc(0))
	for (let index = 0; index < 14; index++) nested = isoBox('iprp', nested)
	expect(await avifCost(reader(nested))).toBeNull()
})

test('AVIF grids count coded and auxiliary planes for every possible tile alias', async () => {
	const grid = { rows: 2, columns: 2, width: 32, height: 32 }
	await Promise.all(
		[false, true].map(async wide => {
			const cost = await avifCost(reader(avifFixture(16, 16, false, undefined, { ...grid, wide })))
			expect(cost?.pixels).toBe(16 * 16 * 4 + 32 * 32)
		})
	)
	expect(await avifCost(reader(avifFixture(16, 16, true, undefined, { ...grid, rows: 256, columns: 256 })))).toBeNull()
	expect(
		await avifCost(reader(avifFixture(16, 16, false, undefined, { ...grid, width: 16385, wide: true })))
	).toBeNull()
	const invalid = avifFixture(16, 16, false, undefined, grid)
	const data = invalid.indexOf('mdat') + 4 + obu(1, sequenceHeader()).length + obu(6, Buffer.from([0])).length
	expect(await avifCost(reader(mutate(invalid, data + 1, 2)))).toBeNull()
})

test('header read limits stop metadata floods and keep the read window bounded', async () => {
	const bytes = Buffer.alloc(10000)
	const work = new ImageWork()
	work.bytes = MAX_IMAGE_HEADER_BYTES
	expect(await reader(bytes, work).view(0, 1)).toBeNull()
	const headers = new ImageWork()
	headers.headers = MAX_IMAGE_HEADERS
	expect(await pngCost(reader(pngImage, headers))).toBeNull()
	expect(await reader(bytes).view(-1, 1)).toBeNull()
	expect(await reader(bytes).view(0, 4097)).toBeNull()
	expect(await reader(bytes).view(0, 0)).toBeNull()
	expect(await reader(bytes).view(10000, 1)).toBeNull()
	const yieldWork = new ImageWork()
	yieldWork.bytes = 262140
	expect(await reader(pngImage, yieldWork).view(0, 1)).not.toBeNull()
})
