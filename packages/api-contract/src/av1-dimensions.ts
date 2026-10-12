import { type ImageCost, imageCost } from './image-reader'

class Bits {
	position = 0
	constructor(readonly data: DataView) {}
	read(count: number): number {
		if (this.position + count > this.data.byteLength * 8) throw new RangeError('Truncated AV1 sequence header')
		let value = 0
		for (let index = 0; index < count; index++) {
			const position = this.position++
			value = value * 2 + ((this.data.getUint8(Math.floor(position / 8)) >> (7 - (position % 8))) & 1)
		}
		return value
	}
	uvlc() {
		let zeros = 0
		while (zeros < 32 && this.read(1) === 0) zeros++
		if (zeros < 32) this.read(zeros)
	}
}
function timing(bits: Bits): number {
	if (!bits.read(1)) return 0
	bits.read(32)
	bits.read(32)
	if (bits.read(1)) bits.uvlc()
	if (!bits.read(1)) return 0
	const delayBits = bits.read(5) + 1
	bits.read(32)
	bits.read(5)
	bits.read(5)
	return delayBits
}
function operatingPoints(bits: Bits) {
	const delayBits = timing(bits)
	const initialDelay = bits.read(1)
	const points = bits.read(5) + 1
	for (let index = 0; index < points; index++) {
		bits.read(12)
		if (bits.read(5) > 7) bits.read(1)
		if (delayBits && bits.read(1)) {
			bits.read(delayBits)
			bits.read(delayBits)
			bits.read(1)
		}
		if (initialDelay && bits.read(1)) bits.read(4)
	}
}
/** AV1 sequence-header maxima bound intermediate frames too; AVIF ispe alone does not. */
export function av1Dimensions(view: DataView): ImageCost | null {
	try {
		const bits = new Bits(view)
		if (bits.read(3) > 2) return null
		const still = bits.read(1)
		const reduced = bits.read(1)
		if (reduced) {
			if (!still) return null
			bits.read(5)
		} else operatingPoints(bits)
		const widthBits = bits.read(4) + 1
		const heightBits = bits.read(4) + 1
		return imageCost(bits.read(widthBits) + 1, bits.read(heightBits) + 1)
	} catch {
		return null
	}
}
