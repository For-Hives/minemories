const key = 'minemories-temporal-resume-v1'
const seriesPattern = /^[a-f0-9]{64}$/
const framePattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

function entries(): Array<{ series: string; frame: string }> {
	try {
		const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
		if (!Array.isArray(saved)) return []
		return saved
			.slice(0, 32)
			.filter(
				value =>
					value &&
					typeof value.series === 'string' &&
					typeof value.frame === 'string' &&
					seriesPattern.test(value.series) &&
					framePattern.test(value.frame)
			)
	} catch {
		return []
	}
}

export function resumedFrame(series: string): string | undefined {
	return entries().find(value => value.series === series)?.frame
}

export function rememberFrame(series: string, frame: string): void {
	if (!(seriesPattern.test(series) && framePattern.test(frame))) return
	try {
		localStorage.setItem(
			key,
			JSON.stringify([{ series, frame }, ...entries().filter(value => value.series !== series)].slice(0, 32))
		)
	} catch {
		// Storage is optional; playback still works in private browsing.
	}
}
