import { describe, expect, it } from 'vitest'
import { startStep } from './world-start'

describe('startStep', () => {
	const ids = ['a', 'b', 'c']
	it('opens on the oldest loaded capture without a link', () => {
		expect(startStep(ids, [false, true, true])).toBe(1)
		expect(startStep(ids, [true, true, true], null)).toBe(0)
	})
	it("opens on the link's capture when it is loaded", () => {
		expect(startStep(ids, [true, true, true], 'c')).toBe(2)
	})
	it('falls back when the linked capture is unknown or not loaded', () => {
		expect(startStep(ids, [false, true, true], 'x')).toBe(1)
		expect(startStep(ids, [true, false, true], 'b')).toBe(0)
	})
	it('starts at zero when nothing is loaded', () => {
		expect(startStep(ids, [false, false, false], 'a')).toBe(0)
		expect(startStep([], [])).toBe(0)
	})
})
