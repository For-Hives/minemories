import { createHash } from 'node:crypto'
import { setImmediate } from 'node:timers/promises'
import { MAX_UPLOAD_BYTES } from './upload-files'

export const MIN_TIMELAPSE_CHUNK = 16 * 1024
export const MAX_TIMELAPSE_CHUNK = 256 * 1024
const WORK_BYTES = 64 * 1024
const WINDOW = 63
const table = new Uint32Array(256)
let seed = 0x9e3779b9
for (let index = 0; index < table.length; index++) {
	seed ^= seed << 13
	seed ^= seed >>> 17
	seed ^= seed << 5
	table[index] = seed >>> 0
}
function rotate(value: number, count: number) {
	return (value << count) | (value >>> (32 - count))
}

export interface TimelapseChunk {
	sha256: string
	size: number
	data: Buffer
}

class RollingChunks {
	private readonly payload = Buffer.allocUnsafe(MAX_TIMELAPSE_CHUNK)
	private readonly window = new Uint8Array(WINDOW)
	private used = 0
	private hash = 0
	private cursor = 0
	private filled = 0
	total = 0
	push(value: number): Buffer | null {
		this.hash = rotate(this.hash, 1) ^ (table[value] as number)
		if (this.filled === WINDOW) this.hash ^= rotate(table[this.window[this.cursor] as number] as number, WINDOW % 32)
		else this.filled++
		this.window[this.cursor] = value
		this.cursor = (this.cursor + 1) % WINDOW
		this.payload[this.used++] = value
		this.total++
		return this.used === MAX_TIMELAPSE_CHUNK || (this.used >= MIN_TIMELAPSE_CHUNK && (this.hash & 0xffff) === 0)
			? this.take()
			: null
	}
	take(): Buffer | null {
		if (!this.used) return null
		const data = Buffer.from(this.payload.subarray(0, this.used))
		this.used = 0
		return data
	}
}
function packet(data: Buffer): TimelapseChunk {
	return { sha256: createHash('sha256').update(data).digest('hex'), size: data.length, data }
}

function requireFrameSize(size: number) {
	if (!Number.isSafeInteger(size) || size < 1 || size > MAX_UPLOAD_BYTES)
		throw new RangeError('Invalid timelapse frame size')
}

/** Content-defined boundaries survive insertions; only one bounded payload is retained by the codec. */
export async function* splitTimelapseCapture(
	source: AsyncIterable<Uint8Array>,
	expectedBytes: number,
	signal?: AbortSignal
): AsyncGenerator<TimelapseChunk> {
	requireFrameSize(expectedBytes)
	const chunks = new RollingChunks()
	for await (const incoming of source) {
		if (incoming.byteLength > expectedBytes - chunks.total) throw new Error('Timelapse frame size changed')
		for (let offset = 0; offset < incoming.byteLength; offset += WORK_BYTES) {
			signal?.throwIfAborted()
			const end = Math.min(incoming.byteLength, offset + WORK_BYTES)
			for (let index = offset; index < end; index++) {
				const data = chunks.push(incoming[index] as number)
				if (data) {
					yield packet(data)
					signal?.throwIfAborted()
				}
			}
			// biome-ignore lint/performance/noAwaitInLoops: yield CPU after each bounded window, even when all chunks already exist.
			await setImmediate()
		}
	}
	signal?.throwIfAborted()
	if (chunks.total !== expectedBytes) throw new Error('Timelapse frame size changed')
	const final = chunks.take()
	if (final) {
		yield packet(final)
		signal?.throwIfAborted()
	}
}
