import aliases from './aliases.json' with { type: 'json' }
import editorialFrench from './editorial-fr.json' with { type: 'json' }
import { guideEnglishMessages } from './guide-messages.ts'
import { isFrench, isLocale, type Locale } from './locales.ts'
import { frenchMessages } from './messages.ts'

export type Catalog = Record<string, string>
const catalogs: Partial<Record<Locale, Catalog>> = {}
const pending = new Map<Locale, Promise<void>>()
const loaders: Partial<Record<Locale, () => Promise<Catalog>>> = {
	ru: () => import('./locales/ru.json', { with: { type: 'json' } }).then(module => module.default),
	de: () => import('./locales/de.json', { with: { type: 'json' } }).then(module => module.default),
	ko: () => import('./locales/ko.json', { with: { type: 'json' } }).then(module => module.default),
	'pt-BR': () => import('./locales/pt-BR.json', { with: { type: 'json' } }).then(module => module.default),
	pl: () => import('./locales/pl.json', { with: { type: 'json' } }).then(module => module.default),
	ja: () => import('./locales/ja.json', { with: { type: 'json' } }).then(module => module.default),
	'en-GB': () => import('./locales/en-GB.json', { with: { type: 'json' } }).then(module => module.default),
	'en-CA': () => import('./locales/en-CA.json', { with: { type: 'json' } }).then(module => module.default),
	'fr-CA': () => import('./locales/fr-CA.json', { with: { type: 'json' } }).then(module => module.default),
}
const interpolationPattern = /\{(\w+)\}/g
function own(catalog: Catalog, key: string): string | undefined {
	return Object.hasOwn(catalog, key) ? catalog[key] : undefined
}
export function loadLocale(locale: Locale): Promise<void> {
	if (!isLocale(locale)) return Promise.reject(new Error('Unsupported language'))
	if (locale === 'fr' || locale === 'en' || catalogs[locale]) return Promise.resolve()
	const existing = pending.get(locale)
	if (existing) return existing
	const loader = loaders[locale]
	if (!loader) return Promise.reject(new Error('Language catalogue unavailable'))
	const request = loader()
		.then(catalog => {
			catalogs[locale] = catalog
		})
		.finally(() => pending.delete(locale))
	pending.set(locale, request)
	return request
}
export function translate(locale: Locale, message: string, values: Record<string, string | number> = {}): string {
	const english = own(aliases, message) ?? own(guideEnglishMessages, message) ?? message
	let text: string
	if (isFrench(locale))
		text =
			own(catalogs[locale] ?? {}, english) ??
			(Object.hasOwn(aliases, message)
				? message
				: (own(frenchMessages, english) ?? own(editorialFrench, english) ?? message))
	else text = own(catalogs[locale] ?? {}, english) ?? english
	return text.replace(interpolationPattern, (match, key: string) => {
		const value = Object.hasOwn(values, key) ? values[key] : undefined
		return String(value ?? match)
	})
}
export function localize(value: { fr: string; en: string }, locale: Locale): string {
	if (locale === 'fr') return value.fr
	return isFrench(locale) ? translate(locale, value.fr) : translate(locale, value.en)
}
/** Only editorial values are translated. Object keys, numbers and protocol data retain their shape. */
export function translateCopy<T>(locale: Locale, value: T): T {
	if (typeof value === 'string') return translate(locale, value) as T
	if (Array.isArray(value)) return value.map(item => translateCopy(locale, item)) as T
	if (value && typeof value === 'object')
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, translateCopy(locale, item)])) as T
	return value
}
