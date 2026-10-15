import * as z from 'zod'

export const captureTime = z.string().max(64).datetime()
/** UTC seconds plus a fixed fractional field retain Java Instant precision without millisecond rounding. */
export function captureTimeKey(value: string): string | null {
	if (!captureTime.safeParse(value).success) return null
	const dot = value.indexOf('.')
	const seconds = value.slice(0, 19)
	const fraction = dot === -1 ? '' : value.slice(dot + 1, -1)
	return `${seconds}.${fraction.padEnd(43, '0')}`
}
