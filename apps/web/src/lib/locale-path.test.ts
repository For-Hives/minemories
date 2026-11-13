import { expect, test } from 'vitest'
import {
	localePrefix,
	localizedPath,
	localizedUrl,
	ogLocale,
	savedLanguageRedirect,
	splitLocalePath,
	switchedHref,
} from './locale-path'

test('a URL path names its language with a prefix, English has none', () => {
	expect(splitLocalePath('/concept')).toEqual({ locale: 'en', prefix: '', path: '/concept' })
	expect(splitLocalePath('/')).toEqual({ locale: 'en', prefix: '', path: '/' })
	expect(splitLocalePath('')).toEqual({ locale: 'en', prefix: '', path: '/' })
	expect(splitLocalePath('/fr')).toEqual({ locale: 'fr', prefix: '/fr', path: '/' })
	expect(splitLocalePath('/fr/concept')).toEqual({ locale: 'fr', prefix: '/fr', path: '/concept' })
	expect(splitLocalePath('/pt-br/share/abc')).toEqual({ locale: 'pt-BR', prefix: '/pt-br', path: '/share/abc' })
	// a page whose name starts like a prefix is not one
	expect(splitLocalePath('/french')).toEqual({ locale: 'en', prefix: '', path: '/french' })
	expect(splitLocalePath('/en/concept').locale).toBe('en')
	expect(splitLocalePath('/en/concept').path).toBe('/en/concept')
})

test('router paths and URLs in each language', () => {
	expect(localePrefix('en')).toBe('')
	expect(localePrefix('pt-BR')).toBe('/pt-br')
	expect(localizedPath('/', 'en')).toBe('/')
	expect(localizedPath('/', 'fr')).toBe('/fr')
	expect(localizedPath('/faq', 'ja')).toBe('/ja/faq')
	expect(localizedUrl('/faq', 'https://example.org', 'de')).toBe('https://example.org/de/faq')
	expect(localizedUrl('/', 'https://example.org', 'en')).toBe('https://example.org/')
	expect(ogLocale('en')).toBe('en_US')
	expect(ogLocale('pt-BR')).toBe('pt_BR')
})

test('the switcher keeps the page, query and anchor', () => {
	const place = { pathname: '/fr/installation', search: '?step=2', hash: '#help' }
	expect(switchedHref(place, 'en')).toBe('/installation?step=2#help')
	expect(switchedHref(place, 'de')).toBe('/de/installation?step=2#help')
	expect(switchedHref({ pathname: '/de', search: '', hash: '' }, 'fr')).toBe('/fr')
})

test('a saved language redirects an unprefixed URL only', () => {
	const bare = { pathname: '/faq', search: '?x=1', hash: '#q' }
	expect(savedLanguageRedirect(bare, 'fr')).toBe('/fr/faq?x=1#q')
	expect(savedLanguageRedirect(bare, 'en')).toBeNull()
	expect(savedLanguageRedirect(bare, null)).toBeNull()
	expect(savedLanguageRedirect({ ...bare, pathname: '/de/faq' }, 'fr')).toBeNull()
})
