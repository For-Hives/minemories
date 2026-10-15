import { Readable } from 'node:stream'
import type { TimelapseFiles } from './timelapse-files'

/** Resolve access again after asynchronous storage open; conversion may have changed only the physical key. */
export async function openAuthorizedCapture(
	files: Pick<TimelapseFiles, 'read'>,
	lookup: () => string | null,
	signal: AbortSignal,
	onOpened?: () => void
): Promise<Readable | null> {
	const key = lookup()
	if (!key) return null
	let stream: Readable
	try {
		stream = await files.read(key, signal)
	} catch (error) {
		const current = lookup()
		if (!current) return null
		if (current === key) throw error
		stream = await files.read(current, signal)
	}
	if (!lookup()) {
		stream.destroy()
		return null
	}
	if (!onOpened) return stream
	const tracked = Readable.from(trackOpening(stream, signal, onOpened))
	tracked.once('close', () => stream.destroy())
	return tracked
}

/** Count delivery of the first nonempty GLB chunk, never metadata or an unopened storage handle. */
async function* trackOpening(stream: Readable, signal: AbortSignal, onOpened: () => void) {
	let opened = false
	try {
		for await (const chunk of stream) {
			signal.throwIfAborted()
			if (!opened && chunk.length > 0) {
				onOpened()
				opened = true
			}
			yield chunk
		}
	} finally {
		stream.destroy()
	}
}
