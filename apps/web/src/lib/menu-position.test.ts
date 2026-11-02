import { expect, it } from 'vitest'
import { menuPosition } from './menu-position'

it('opens at the pointer and flips or clamps to stay inside the viewport', () => {
	const viewport = { width: 800, height: 600 }
	const menu = { width: 200, height: 160 }
	expect(menuPosition({ x: 100, y: 100 }, menu, viewport)).toEqual({ x: 100, y: 100 })
	expect(menuPosition({ x: 750, y: 550 }, menu, viewport)).toEqual({ x: 550, y: 390 })
	expect(menuPosition({ x: 150, y: 120 }, { width: 900, height: 700 }, viewport)).toEqual({ x: 8, y: 8 })
})
