import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { MeshoptEncoder } from 'meshoptimizer'
import { pngDifference, proveEquivalent } from './equivalence.mjs'
import { buildGlb, parseGlb } from './glb.mjs'
import { rebuildGlb } from './rebuild.mjs'
import { pngOf, syntheticGlb } from './synthetic.mjs'
import { realTools } from './tools.mjs'

let tools
let source
before(async () => {
	tools = await realTools()
	await MeshoptEncoder.ready
	source = syntheticGlb({ MeshoptEncoder })
})

test('the container reader and writer round-trip, and refuse what is not a GLB', () => {
	const { json, bin } = parseGlb(source)
	assert.deepEqual(parseGlb(buildGlb(json, bin)).json, json)
	assert.throws(() => parseGlb(new Uint8Array(40)), { message: 'not a GLB 2.0' })
	const wrongLength = new Uint8Array(source)
	new DataView(wrongLength.buffer).setUint32(8, 1, true)
	assert.throws(() => parseGlb(wrongLength), { message: 'GLB length field does not match the file' })
	const wrongChunk = new Uint8Array(source)
	new DataView(wrongChunk.buffer).setUint32(16, 0, true)
	assert.throws(() => parseGlb(wrongChunk), { message: 'first GLB chunk is not JSON' })
})

test('the rebuild keeps everything the renderer sees, and says so with an independent decoder', async () => {
	const { glb, stats } = await rebuildGlb(source, tools.rebuildTools)
	assert.equal(stats.vertexStreams, 1)
	assert.equal(stats.pngs, 1)
	assert.ok(glb.length < source.length, 'the rebuilt file is smaller')
	assert.equal(stats.renamed, true, 'a v1 vertex stream is announced under KHR_meshopt_compression')
	assert.ok(JSON.stringify(parseGlb(glb).json).includes('KHR_meshopt_compression'))
	assert.ok(!JSON.stringify(parseGlb(glb).json).includes('EXT_meshopt_compression'))
	const proof = await proveEquivalent(source, glb, tools.proofDecoder)
	assert.deepEqual(proof.mismatches, [])
	assert.ok(proof.compared >= 4)
})

test('a rebuilt file that lost one vertex is caught', async () => {
	const { glb } = await rebuildGlb(source, tools.rebuildTools)
	const { json, bin } = parseGlb(glb)
	// re-encode the vertices with one position moved: valid stream, different data
	const extension = json.bufferViews[1].extensions.KHR_meshopt_compression
	const decoded = new Uint8Array(extension.count * extension.byteStride)
	tools.proofDecoder.decodeGltfBuffer(
		decoded,
		extension.count,
		extension.byteStride,
		bin.subarray(extension.byteOffset, extension.byteOffset + extension.byteLength),
		'ATTRIBUTES',
		'NONE'
	)
	new Float32Array(decoded.buffer)[5] += 0.5
	const moved = MeshoptEncoder.encodeVertexBuffer(decoded, extension.count, extension.byteStride)
	const patched = new Uint8Array(bin.length + moved.length)
	patched.set(bin)
	patched.set(moved, bin.length)
	extension.byteOffset = bin.length
	extension.byteLength = moved.length
	json.buffers[0].byteLength = patched.length
	const proof = await proveEquivalent(source, buildGlb(json, patched), tools.proofDecoder)
	assert.deepEqual(proof.mismatches, ['bufferView 1: decoded data'])
})

test('a texture that changed colour, a changed material and a changed raw view are all caught', async () => {
	const { glb } = await rebuildGlb(source, tools.rebuildTools)
	const other = syntheticGlb({ MeshoptEncoder }, { tint: 7 })
	const { glb: rebuiltOther } = await rebuildGlb(other, tools.rebuildTools)
	const proof = await proveEquivalent(source, rebuiltOther, tools.proofDecoder)
	assert.deepEqual(proof.mismatches, ['image bufferView 0: pixels'])
	const { json, bin } = parseGlb(glb)
	json.materials[0].name = 'renamed'
	assert.deepEqual((await proveEquivalent(source, buildGlb(json, bin), tools.proofDecoder)).mismatches, ['json'])
	const broken = parseGlb(source)
	const garbled = new Uint8Array(broken.bin)
	garbled[broken.json.bufferViews[1].extensions.EXT_meshopt_compression.byteOffset + 4] ^= 0xff
	const result = await proveEquivalent(source, buildGlb(broken.json, garbled), tools.proofDecoder)
	assert.ok(result.mismatches.some(line => line.startsWith('bufferView 1')))
	const noImage = parseGlb(source)
	noImage.json.images = []
	noImage.json.textures = []
	const rawBin = new Uint8Array(noImage.bin)
	rawBin[2] ^= 1
	const raw = await proveEquivalent(
		buildGlb(noImage.json, noImage.bin),
		buildGlb(noImage.json, rawBin),
		tools.proofDecoder
	)
	assert.deepEqual(raw.mismatches, ['bufferView 0: raw data'])
	const fewer = parseGlb(source)
	fewer.json.bufferViews.pop()
	assert.ok(
		(await proveEquivalent(source, buildGlb(fewer.json, fewer.bin), tools.proofDecoder)).mismatches.includes(
			'bufferView count'
		)
	)
	const dropped = parseGlb(source)
	delete dropped.json.bufferViews[2].extensions
	assert.ok(
		(await proveEquivalent(source, buildGlb(dropped.json, dropped.bin), tools.proofDecoder)).mismatches.some(line =>
			line.includes('compression changed')
		)
	)
})

test('PNG comparison: identical pixels pass, colour-space chunks and sizes are enforced', () => {
	const pixel = (x, y) => [x * 10, y * 10, 3, 255]
	const plain = pngOf(8, 8, pixel)
	assert.equal(pngDifference(plain, pngOf(8, 8, pixel, { deflateLevel: 9 })), null)
	assert.equal(pngDifference(plain, pngOf(8, 4, pixel)), 'size')
	assert.equal(
		pngDifference(
			plain,
			pngOf(8, 8, (x, y) => [x * 10, y * 10, 4, 255])
		),
		'pixels'
	)
	assert.equal(pngDifference(plain, new Uint8Array(32)), 'not a PNG')
	const withGamma = new Uint8Array(plain.length + 16)
	withGamma.set(plain.subarray(0, 33))
	const view = new DataView(withGamma.buffer)
	view.setUint32(33, 4, false)
	withGamma.set(Buffer.from('gAMA'), 37)
	withGamma.set(plain.subarray(33), 49)
	assert.equal(pngDifference(plain, withGamma), 'chunk gAMA')
})

test('colour-space chunks must keep their content, not only their presence', () => {
	const plain = pngOf(8, 8, (x, y) => [x * 10, y * 10, 3, 255])
	const withGamma = value => {
		const out = new Uint8Array(plain.length + 16)
		out.set(plain.subarray(0, 33))
		new DataView(out.buffer).setUint32(33, 4, false)
		out.set(Buffer.from('gAMA'), 37)
		out.set(value, 41)
		out.set(plain.subarray(33), 49)
		return out
	}
	assert.equal(pngDifference(withGamma([0, 1, 134, 160]), withGamma([0, 2, 0, 0])), 'chunk gAMA')
})

test('a stream the encoder cannot make smaller is kept, and an unsupported filter is refused', async () => {
	const stubborn = {
		...tools.rebuildTools,
		encoder: { ready: Promise.resolve(), encodeVertexBuffer: () => new Uint8Array(100000) },
		optimisePng: async png => png,
	}
	const { glb, stats } = await rebuildGlb(source, stubborn)
	assert.equal(stats.renamed, false)
	assert.equal((await proveEquivalent(source, glb, tools.proofDecoder)).mismatches.length, 0)
	const filtered = parseGlb(source)
	filtered.json.bufferViews[1].extensions.EXT_meshopt_compression.filter = 'EXPONENTIAL'
	await assert.rejects(rebuildGlb(buildGlb(filtered.json, filtered.bin), tools.rebuildTools), {
		message: 'bufferView 1: meshopt filter EXPONENTIAL',
	})
	const outside = parseGlb(source)
	outside.json.bufferViews[1].extensions.EXT_meshopt_compression.buffer = 1
	await assert.rejects(rebuildGlb(buildGlb(outside.json, outside.bin), tools.rebuildTools), {
		message: 'bufferView 1: compressed data outside buffer 0',
	})
})
