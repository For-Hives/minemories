// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { applyDisplay, readDisplayOption, setDisplayOption, storeDisplayOption } from './display-preferences'

function memory() {
	const values = new Map<string, string>()
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
	}
}

test('the options are stored under the kit keys and read back', () => {
	const storage = memory()
	expect(readDisplayOption(storage, 'font')).toBe(false)
	storeDisplayOption(storage, 'font', true)
	storeDisplayOption(storage, 'motion', false)
	expect(storage.getItem('mcui-font')).toBe('1')
	expect(storage.getItem('mcui-motion')).toBe('0')
	expect(readDisplayOption(storage, 'font')).toBe(true)
	expect(readDisplayOption(storage, 'motion')).toBe(false)
})

test('a missing or blocked storage never breaks the page', () => {
	const blocked = {
		getItem: () => {
			throw new Error('blocked')
		},
		setItem: () => {
			throw new Error('blocked')
		},
	}
	expect(readDisplayOption(blocked, 'font')).toBe(false)
	expect(readDisplayOption(undefined, 'motion')).toBe(false)
	expect(() => storeDisplayOption(blocked, 'font', true)).not.toThrow()
	expect(() => storeDisplayOption(undefined, 'font', true)).not.toThrow()
})

test('the root carries the options and the Unifont class of Korean and Japanese', () => {
	const root = document.createElement('html')
	const storage = memory()
	storeDisplayOption(storage, 'font', true)
	storeDisplayOption(storage, 'motion', true)
	applyDisplay(root, storage, 'ko')
	expect(root.getAttribute('data-mc-font')).toBe('read')
	expect(root.getAttribute('data-mc-motion')).toBe('reduced')
	expect(root.classList.contains('mm-cjk')).toBe(true)
	storeDisplayOption(storage, 'font', false)
	applyDisplay(root, storage, 'fr')
	expect(root.hasAttribute('data-mc-font')).toBe(false)
	expect(root.classList.contains('mm-cjk')).toBe(false)
	setDisplayOption(root, 'motion', false)
	expect(root.hasAttribute('data-mc-motion')).toBe(false)
})
