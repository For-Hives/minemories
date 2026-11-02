import { expect, test } from 'vitest'
import { GLB_CATEGORIES, isGlbCategory, meshVisible, presentCategories } from './glb-categories'

test('only the five mod categories are recognised, in a stable display order', () => {
	expect(GLB_CATEGORIES).toEqual(['terrain', 'decor', 'fluids', 'block_entities', 'entities'])
	expect(isGlbCategory('fluids')).toBe(true)
	expect(isGlbCategory('Terrain')).toBe(false)
	expect(isGlbCategory('Point')).toBe(false)
	expect(presentCategories(['entities', 'Point', 'terrain', 'terrain', 'light'])).toEqual(['terrain', 'entities'])
	expect(presentCategories([])).toEqual([])
})

test('a hidden category never shows, and a mesh outside the composed draw range stays hidden', () => {
	expect(meshVisible(Number.POSITIVE_INFINITY, false)).toBe(true)
	expect(meshVisible(12, false)).toBe(true)
	expect(meshVisible(0, false)).toBe(false)
	expect(meshVisible(12, true)).toBe(false)
})
