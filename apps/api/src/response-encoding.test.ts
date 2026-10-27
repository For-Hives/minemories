import { expect, test } from 'bun:test'
import { gunzipSync } from 'node:zlib'
import { acceptsGzip, encodeBuffered } from './response-encoding'

test('gzip is negotiated from Accept-Encoding with explicit refusals respected', () => {
	expect(acceptsGzip(undefined)).toBe(false)
	expect(acceptsGzip('')).toBe(false)
	expect(acceptsGzip('br, gzip;q=0.5')).toBe(true)
	expect(acceptsGzip('GZIP')).toBe(true)
	expect(acceptsGzip('*')).toBe(true)
	expect(acceptsGzip('gzip;q=0')).toBe(false)
	expect(acceptsGzip('identity, deflate')).toBe(false)
})

test('large buffers are compressed losslessly while small ones and refusing clients are untouched', async () => {
	const bytes = new Uint8Array(100_000).map((_, index) => index % 7)
	const packed = await encodeBuffered('gzip', bytes)
	expect(packed.headers).toEqual({ 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' })
	expect(packed.body.byteLength).toBeLessThan(bytes.byteLength / 4)
	expect(new Uint8Array(gunzipSync(packed.body))).toEqual(bytes)
	expect((await encodeBuffered(null, bytes)).body).toBe(bytes)
	const small = new Uint8Array(10)
	expect(await encodeBuffered('gzip', small)).toEqual({ body: small, headers: { Vary: 'Accept-Encoding' } })
})
