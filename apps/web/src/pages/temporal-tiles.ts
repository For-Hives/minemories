import type { TemporalFrame } from '@minemories/api-contract'
import { apiBase } from '../api-client'
import { requireCaptureReady } from '../lib/capture-file'
import { RetryableTileError, type TileSummary, verifyTileDigest } from '../lib/tiles'

export async function fetchTemporalTile(
	frame: TemporalFrame,
	tile: TileSummary,
	signal: AbortSignal
): Promise<ArrayBuffer> {
	const response = await fetch(
		`${apiBase}/api/memories/${encodeURIComponent(tile.memoryId ?? frame.id)}/tiles/${tile.x}/${tile.z}`,
		{
			credentials: 'include',
			signal,
		}
	)
	await requireCaptureReady(response)
	if (response.status === 429 || response.status === 503) throw new RetryableTileError('Tile temporarily unavailable')
	if (!(response.ok && response.body)) throw new Error('Tile unavailable')
	const data = await readTileBytes(response.body, tile.size, signal)
	if (!(await verifyTileDigest(data, tile.sha256))) throw new Error('Tile failed integrity validation')
	return data
}

async function readTileBytes(
	body: ReadableStream<Uint8Array>,
	size: number,
	signal: AbortSignal
): Promise<ArrayBuffer> {
	const bytes = new Uint8Array(size)
	const reader = body.getReader()
	let offset = 0
	try {
		while (true) {
			signal.throwIfAborted()
			// biome-ignore lint/performance/noAwaitInLoops: read one bounded stream sequentially and stop before buffering oversized data.
			const { done, value } = await reader.read()
			if (done) break
			if (offset + value.byteLength > size) throw new Error('Tile size changed')
			bytes.set(value, offset)
			offset += value.byteLength
		}
		signal.throwIfAborted()
		if (offset !== size) throw new Error('Tile size changed')
		return bytes.buffer
	} finally {
		await reader.cancel().catch(() => undefined)
		reader.releaseLock()
	}
}
