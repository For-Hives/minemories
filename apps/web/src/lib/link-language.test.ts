import { expect, test } from 'vitest'
import { localeFromSearch, ogLocale, previewUrl, withoutLanguageParam } from './link-language'

test('a link asks for a language with ?lang=, by id or regional tag, in any case', () => {
	expect(localeFromSearch('?lang=fr')).toBe('fr')
	expect(localeFromSearch('?x=1&lang=pt-br')).toBe('pt-BR')
	expect(localeFromSearch('?lang=de-AT')).toBe('de')
	expect(localeFromSearch('?lang=FR-CA')).toBe('fr-CA')
	expect(localeFromSearch('?lang=xx')).toBeNull()
	expect(localeFromSearch('?lang=')).toBeNull()
	expect(localeFromSearch('')).toBeNull()
})

test('the switcher drops the link language and keeps the rest of the URL', () => {
	expect(withoutLanguageParam('https://example.org/faq?lang=fr&x=1#q')).toBe('https://example.org/faq?x=1#q')
	expect(withoutLanguageParam('https://example.org/faq?x=1')).toBeNull()
})

test('Open Graph locales and preview URLs', () => {
	expect(ogLocale('en')).toBe('en_US')
	expect(ogLocale('fr-CA')).toBe('fr_CA')
	expect(ogLocale('ja')).toBe('ja_JP')
	expect(previewUrl('/faq', 'https://example.org', 'en')).toBe('https://example.org/faq')
	expect(previewUrl('/', 'https://example.org', 'pt-BR')).toBe('https://example.org/?lang=pt-BR')
})
