import { expect, it } from 'vitest'
import { dayDelta, easeInOut, Glide } from './transitions'

it('eases in and out within bounds', () => {
	expect(easeInOut(-1)).toBe(0)
	expect(easeInOut(0.5)).toBe(0.5)
	expect(easeInOut(0.25)).toBeLessThan(0.25)
	expect(easeInOut(0.75)).toBeGreaterThan(0.75)
	expect(easeInOut(2)).toBe(1)
})

it('turns the clock the short way round midnight', () => {
	expect(dayDelta(0.9, 0.1)).toBeCloseTo(0.2)
	expect(dayDelta(0.1, 0.9)).toBeCloseTo(-0.2)
	expect(dayDelta(0.25, 0.5)).toBeCloseTo(0.25)
	expect(dayDelta(0.3, 0.3)).toBeCloseTo(0)
})

it('glides over its duration and finishes exactly once reached', () => {
	const glide = new Glide(1)
	expect(glide.advance(-1)).toBe(0)
	expect(glide.advance(0.5)).toBe(0.5)
	expect(glide.done).toBe(false)
	expect(glide.advance(5)).toBe(1)
	expect(glide.done).toBe(true)
	const instant = new Glide(0)
	expect(instant.value).toBe(1)
	expect(instant.done).toBe(true)
})
