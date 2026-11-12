import { expect, test } from 'vitest'
import { suggestedLocale } from './locale-suggestion'

const base = { current: 'fr', saved: null, dismissed: null } as const

test('a browser in another supported language is suggested, never applied', () => {
	expect(suggestedLocale({ ...base, languages: ['en-US', 'en'] })).toBe('en')
	expect(suggestedLocale({ ...base, languages: ['es-MX', 'de-AT'] })).toBe('de')
	expect(suggestedLocale({ ...base, languages: ['en-GB'] })).toBe('en-GB')
})
test('an unsupported browser language falls back to an English suggestion, as the switcher does', () => {
	expect(suggestedLocale({ ...base, languages: ['zh-CN'] })).toBe('en')
	expect(suggestedLocale({ ...base, languages: [] })).toBe('en')
})
test('nothing is suggested when the browser already reads the page language, in any of its variants', () => {
	expect(suggestedLocale({ ...base, languages: ['fr-FR'] })).toBeNull()
	expect(suggestedLocale({ ...base, languages: ['fr-CA', 'en-CA'] })).toBeNull()
	expect(suggestedLocale({ ...base, current: 'en', languages: ['en-GB'] })).toBeNull()
})
test('a saved choice or a declined suggestion silences it', () => {
	expect(suggestedLocale({ ...base, saved: 'fr', languages: ['en-US'] })).toBeNull()
	expect(suggestedLocale({ ...base, saved: 'ja', languages: ['en-US'] })).toBeNull()
	expect(suggestedLocale({ ...base, dismissed: 'en', languages: ['en-US'] })).toBeNull()
	expect(suggestedLocale({ ...base, dismissed: 'en', languages: ['de-DE'] })).toBe('de')
})
test('declining a language covers its regional variants, not other languages', () => {
	expect(suggestedLocale({ ...base, dismissed: 'en', languages: ['en-GB'] })).toBeNull()
	expect(suggestedLocale({ ...base, dismissed: 'en-CA', languages: ['en-US'] })).toBeNull()
	expect(suggestedLocale({ ...base, dismissed: 'pt-BR', languages: ['pt-PT'] })).toBeNull()
	expect(suggestedLocale({ ...base, dismissed: 'en', languages: ['pl-PL'] })).toBe('pl')
})
