import type { TemporalFrame } from '@minemories/api-contract'
import { apiBase } from '../api-client'
import { requireCaptureReady } from '../lib/capture-file'

const maximumSize = 450 * 1024 * 1024

export async function fetchTemporalFile(frame: TemporalFrame, signal: AbortSignal): Promise<File> {
	if (frame.size <= 0 || frame.size > maximumSize) throw new Error('Unsupported capture size')
	const response = await fetch(`${apiBase}/api/memories/${encodeURIComponent(frame.id)}/file`, {
		credentials: 'include',
		signal,
	})
	await requireCaptureReady(response)
	if (!(response.ok && response.body)) throw new Error('Capture unavailable')
	const reader = response.body.getReader()
	const chunks: BlobPart[] = []
	let size = 0
	try {
		while (true) {
			signal.throwIfAborted()
			// biome-ignore lint/performance/noAwaitInLoops: read one bounded stream sequentially and stop before buffering oversized data.
			const { done, value } = await reader.read()
			if (done) break
			size += value.byteLength
			if (size > frame.size) throw new Error('Capture size changed')
			chunks.push(value)
		}
		signal.throwIfAborted()
		if (size !== frame.size) throw new Error('Capture size changed')
		return new File(chunks, `${frame.name}.glb`, { type: 'model/gltf-binary' })
	} finally {
		await reader.cancel().catch(() => undefined)
		reader.releaseLock()
	}
}
