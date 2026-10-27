import { expect, test } from 'bun:test'
import { Readable } from 'node:stream'
import { text } from 'node:stream/consumers'
import { gunzipSync } from 'node:zlib'
import { acceptsGzip, encodedCapture } from './response-encoding'

test('gzip is negotiated from Accept-Encoding with explicit refusals respected', () => {
	expect(acceptsGzip(undefined)).toBe(false)
	expect(acceptsGzip('')).toBe(false)
	expect(acceptsGzip('br, gzip;q=0.5')).toBe(true)
	expect(acceptsGzip('GZIP')).toBe(true)
	expect(acceptsGzip('*')).toBe(true)
	expect(acceptsGzip('gzip;q=0')).toBe(false)
	expect(acceptsGzip('identity, deflate')).toBe(false)
})

test('captures are streamed through gzip losslessly and left untouched for refusing clients', async () => {
	const bytes = Buffer.from(new Uint8Array(200_000).map((_, index) => index % 7))
	const packed = encodedCapture('gzip, br', Readable.from([bytes.subarray(0, 70_000), bytes.subarray(70_000)]))
	expect(packed.headers).toEqual({ 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' })
	const chunks: Buffer[] = []
	for await (const chunk of packed.body) chunks.push(chunk as Buffer)
	const compressed = Buffer.concat(chunks)
	expect(compressed.length).toBeLessThan(bytes.length / 4)
	expect(gunzipSync(compressed).equals(bytes)).toBe(true)
	const plain = encodedCapture(null, Readable.from(['glb']))
	expect(plain.headers).toEqual({ Vary: 'Accept-Encoding' })
	expect(await text(plain.body)).toBe('glb')
})

test('a failing source aborts the compressed stream instead of ending it cleanly', async () => {
	const failing = new Readable({
		read() {
			this.destroy(new Error('storage lost'))
		},
	})
	const packed = encodedCapture('gzip', failing)
	await expect(text(packed.body)).rejects.toThrow('storage lost')
})
