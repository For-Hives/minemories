import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { MAX_TIMELAPSE_CHUNK, MIN_TIMELAPSE_CHUNK, splitTimelapseCapture } from './timelapse-chunks'

function bytes(size: number) {
	const data = Buffer.alloc(size)
	let state = 37
	for (let index = 0; index < size; index++) {
		state ^= state << 13
		state ^= state >>> 17
		state ^= state << 5
		data[index] = state & 255
	}
	return data
}
async function* bands(data: Buffer, width = 65536) {
	for (let offset = 0; offset < data.length; offset += width) yield data.subarray(offset, offset + width)
}
async function chunks(data: Buffer, width = 65536) {
	return Array.fromAsync(splitTimelapseCapture(bands(data, width), data.length))
}

test('streaming boundaries and hashes are independent of incoming band sizes and preserve every byte', async () => {
	const data = bytes(2 * 1024 * 1024 + 37)
	const first = await chunks(data),
		second = await chunks(data, 10007)
	expect(first.map(c => c.sha256)).toEqual(second.map(c => c.sha256))
	expect(Buffer.concat(first.map(c => c.data))).toEqual(data)
	for (const chunk of first) {
		expect(chunk.size).toBeLessThanOrEqual(MAX_TIMELAPSE_CHUNK)
		expect(chunk.sha256).toBe(createHash('sha256').update(chunk.data).digest('hex'))
	}
	for (const chunk of first.slice(0, -1)) expect(chunk.size).toBeGreaterThanOrEqual(MIN_TIMELAPSE_CHUNK)
	// Later producer reads cannot mutate a previously yielded payload.
	expect(first[0]?.data).not.toBe(first[1]?.data)
})

test('an insertion reuses most unchanged content rather than shifting every following block', async () => {
	const data = bytes(4 * 1024 * 1024)
	const first = await chunks(data),
		second = await chunks(Buffer.concat([Buffer.from('inserted prefix'), data]))
	const known = new Set(first.map(c => c.sha256))
	const reused = second.filter(c => known.has(c.sha256)).reduce((sum, c) => sum + c.size, 0)
	expect(reused).toBeGreaterThan(data.length * 0.8)
})

test('bounds repeated data, exact final chunks, invalid declarations and changed streams', async () => {
	const data = Buffer.alloc(MAX_TIMELAPSE_CHUNK * 2)
	const result = await chunks(data)
	expect(result).toHaveLength(2)
	expect(result[0]?.sha256).toBe(result[1]?.sha256)
	await Promise.all(
		[0, -1, 0.5, 201 * 1024 * 1024].map(size =>
			expect(Array.fromAsync(splitTimelapseCapture(bands(data), size))).rejects.toThrow('Invalid timelapse frame size')
		)
	)
	await expect(Array.fromAsync(splitTimelapseCapture(bands(data), data.length - 1))).rejects.toThrow('size changed')
	await expect(Array.fromAsync(splitTimelapseCapture(bands(data), data.length + 1))).rejects.toThrow('size changed')
})

test('cancellation closes the upstream iterator and never consumes the complete frame', async () => {
	const controller = new AbortController()
	let closed = false
	let reads = 0
	async function* source() {
		try {
			for (let i = 0; i < 100; i++) {
				reads++
				yield Buffer.alloc(MAX_TIMELAPSE_CHUNK)
			}
		} finally {
			closed = true
		}
	}
	const iterator = splitTimelapseCapture(source(), MAX_TIMELAPSE_CHUNK * 100, controller.signal)
	await iterator.next()
	controller.abort()
	await expect(iterator.next()).rejects.toMatchObject({ name: 'AbortError' })
	expect(closed).toBe(true)
	expect(reads).toBeLessThan(100)
})
