import { expect, test } from 'vitest'
import { localeOptions } from '../i18n/locales'
import { localeCode, pickerLocales } from './locale-picker'

test('the picker lists every language by its own name, each language’s regions together', () => {
	expect(pickerLocales().map(option => option.label)).toEqual([
		'Deutsch',
		'English (US)',
		'English (UK)',
		'English (CA)',
		'Français (FR)',
		'Français (CA)',
		'Polski',
		'Português (BR)',
		'Русский',
		'日本語',
		'한국어',
	])
	expect(pickerLocales()).toHaveLength(localeOptions.length)
})

test('a language missing from the order goes last instead of vanishing', () => {
	const extra = { ...localeOptions[0], id: 'xx' } as unknown as (typeof localeOptions)[number]
	expect(pickerLocales([extra, ...localeOptions]).at(-1)).toBe(extra)
})

test('the compact code is the language alone', () => {
	expect(localeCode('de-DE')).toBe('DE')
	expect(localeCode('ru')).toBe('RU')
})
