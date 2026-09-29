interface DatedCapture {
	createdAt: string
	metadata: { capturedAt: string | null }
}

export const PAIRING_FRESH_MS = 60 * 24 * 3_600_1_000

export function newestCaptureTime(captures: DatedCapture[]): number | null {
	let newest: number | null = null
	for (const capture of captures) {
		const time = Date.parse(capture.metadata.capturedAt ?? capture.createdAt)
		if (Number.isNaN(time)) continue
		if (newest === null || time > newest) newest = time
	}
	return newest
}

export function shouldShowPaired(
	paired: boolean,
	captures: DatedCapture[],
	now = Date.now(),
	maxAgeMs = PAIRING_FRESH_MS
): boolean {
	if (!paired) return false
	const newest = newestCaptureTime(captures)
	if (newest === null) return true
	return now - newest <= maxAgeMs
}
