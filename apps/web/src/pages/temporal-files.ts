import type { TemporalFrame } from '@minemories/api-contract'
import { apiBase } from '../api-client'
import { requireCaptureReady } from '../lib/capture-file'
import { expandMeshoptGlb, VARIANT_HEADER, withMeshoptVariant } from '../lib/glb-meshopt'

const maximumSize = 450 * 1024 * 1024

export async function fetchTemporalFile(frame: TemporalFrame, signal: AbortSignal): Promise<File> {
	if (frame.size <= 0 || frame.size > maximumSize) throw new Error('Unsupported capture size')
	const response = await fetch(withMeshoptVariant(`${apiBase}/api/memories/${encodeURIComponent(frame.id)}/file`), {
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
		// A Meshopt variant is never larger than the stored original, so the declared size stays its ceiling.
		const variant = response.headers.get(VARIANT_HEADER) === 'meshopt'
		if (!variant && size !== frame.size) throw new Error('Capture size changed')
		if (!variant) return new File(chunks, `${frame.name}.glb`, { type: 'model/gltf-binary' })
		const expanded = await expandMeshoptGlb(new Uint8Array(await new Blob(chunks).arrayBuffer()))
		signal.throwIfAborted()
		if (!expanded) throw new Error('Capture unavailable')
		return new File([expanded as BlobPart], `${frame.name}.glb`, { type: 'model/gltf-binary' })
	} finally {
		await reader.cancel().catch(() => undefined)
		reader.releaseLock()
	}
}
