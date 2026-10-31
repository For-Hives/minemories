/** Smooth start and stop, so a glide never jolts the camera or the sun. */
export function easeInOut(t: number): number {
	const clamped = Math.min(1, Math.max(0, t))
	return clamped < 0.5 ? 4 * clamped ** 3 : 1 - (-2 * clamped + 2) ** 3 / 2
}

/** Signed shortest turn between two times of day expressed as fractions of a day. */
export function dayDelta(from: number, to: number): number {
	const delta = (((to - from) % 1) + 1.5) % 1
	return delta - 0.5
}

/** A fixed-length progression advanced by frame deltas; `value` is eased from 0 to 1. */
export class Glide {
	private elapsed = 0

	constructor(private readonly duration: number) {}

	advance(seconds: number): number {
		this.elapsed = Math.min(this.duration, this.elapsed + Math.max(0, seconds))
		return this.value
	}

	get value(): number {
		return this.duration > 0 ? easeInOut(this.elapsed / this.duration) : 1
	}

	get done(): boolean {
		return this.elapsed >= this.duration
	}
}
