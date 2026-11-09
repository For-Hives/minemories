import { describe, expect, it } from 'vitest'
import { storageLevel } from './GalleryPage'

describe('storageLevel', () => {
	it('moves from green to gold, ember and red as the gallery fills', () => {
		const room = { availableBytes: 1 }
		expect(storageLevel(room, 0)).toBe('ok')
		expect(storageLevel(room, 49)).toBe('ok')
		expect(storageLevel(room, 50)).toBe('mid')
		expect(storageLevel(room, 74)).toBe('mid')
		expect(storageLevel(room, 75)).toBe('high')
		expect(storageLevel(room, 89)).toBe('high')
		expect(storageLevel(room, 90)).toBe('full')
	})

	it('is red as soon as no space is left, whatever the rounded percentage', () => {
		expect(storageLevel({ availableBytes: 0 }, 12)).toBe('full')
	})
})
