import type { Readable } from 'node:stream'
import type { TimelapseFiles } from './timelapse-files'

/** Resolve access again after asynchronous storage open; conversion may have changed only the physical key. */
export async function openAuthorizedCapture(
	files: Pick<TimelapseFiles, 'read'>,
	lookup: () => string | null,
	signal: AbortSignal
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
	return stream
}
