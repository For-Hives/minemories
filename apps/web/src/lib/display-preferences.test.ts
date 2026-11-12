// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { applyDisplay } from './display-preferences'

test('the root carries the Unifont class of Korean and Japanese, and never the retired display options', () => {
	const root = document.createElement('html')
	root.setAttribute('data-mc-font', 'read')
	root.setAttribute('data-mc-motion', 'reduced')
	applyDisplay(root, 'ko')
	expect(root.hasAttribute('data-mc-font')).toBe(false)
	expect(root.hasAttribute('data-mc-motion')).toBe(false)
	expect(root.classList.contains('mm-cjk')).toBe(true)
	applyDisplay(root, 'fr')
	expect(root.classList.contains('mm-cjk')).toBe(false)
})
