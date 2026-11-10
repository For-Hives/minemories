import { expect, test } from 'vitest'
import { hasCurrentPage, isCurrentPage, listKeyIndex, rowKeyIndex, typeaheadIndex } from './site-menu'

test('the arrows wrap through a list, Home and End jump to its ends, other keys do nothing', () => {
	expect(listKeyIndex('ArrowDown', -1, 4)).toBe(0)
	expect(listKeyIndex('ArrowDown', 1, 4)).toBe(2)
	expect(listKeyIndex('ArrowDown', 3, 4)).toBe(0)
	expect(listKeyIndex('ArrowUp', 0, 4)).toBe(3)
	expect(listKeyIndex('ArrowUp', -1, 4)).toBe(3)
	expect(listKeyIndex('ArrowUp', 2, 4)).toBe(1)
	expect(listKeyIndex('Home', 2, 4)).toBe(0)
	expect(listKeyIndex('End', 0, 4)).toBe(3)
	expect(listKeyIndex('Enter', 0, 4)).toBeNull()
	expect(listKeyIndex('ArrowDown', 0, 0)).toBeNull()
})

test('left and right move along the bar, Home and End too', () => {
	expect(rowKeyIndex('ArrowRight', 2, 3)).toBe(0)
	expect(rowKeyIndex('ArrowLeft', 0, 3)).toBe(2)
	expect(rowKeyIndex('Home', 2, 3)).toBe(0)
	expect(rowKeyIndex('End', 0, 3)).toBe(2)
	expect(rowKeyIndex('ArrowDown', 0, 3)).toBeNull()
})

test('typeahead finds the next label starting with the typed text, accents and case aside', () => {
	const labels = ['English (US)', 'Русский', 'Deutsch', 'English (UK)', 'Français (FR)', 'Polski', 'Français (CA)']
	expect(typeaheadIndex(labels, 'e', 0)).toBe(3)
	expect(typeaheadIndex(labels, 'ee', 3)).toBe(0)
	expect(typeaheadIndex(labels, 'fra', 0)).toBe(4)
	expect(typeaheadIndex(labels, 'FRANC', 5)).toBe(6)
	expect(typeaheadIndex(labels, 'ру', 0)).toBe(1)
	expect(typeaheadIndex(labels, 'z', 0)).toBeNull()
	expect(typeaheadIndex(labels, '', 0)).toBeNull()
	expect(typeaheadIndex(['', 'a'], 'a', -3)).toBe(1)
	expect(typeaheadIndex([], 'a', 0)).toBeNull()
})

test('a link is current on its own page, a trailing slash aside, and marks its menu', () => {
	expect(isCurrentPage('/faq', '/faq')).toBe(true)
	expect(isCurrentPage('/faq/', '/faq')).toBe(true)
	expect(isCurrentPage('/', '/')).toBe(true)
	expect(isCurrentPage('/guides/minecraft-blender', '/guides')).toBe(false)
	expect(hasCurrentPage('/roadmap', [{ to: '/faq' }, { href: '#faq' }, { to: '/roadmap' }])).toBe(true)
	expect(hasCurrentPage('/roadmap', [{ to: '/faq' }, { href: '/roadmap' }])).toBe(false)
})
