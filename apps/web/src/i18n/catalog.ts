import english from './locales/en.json' with { type: 'json' }
import french from './locales/fr.json' with { type: 'json' }
import { isFrench, isLocale, type Locale } from './locales.ts'

export type Catalog = Record<string, string>
const catalogs: Partial<Record<Locale, Catalog>> = {}
const pending = new Map<Locale, Promise<void>>()
// Vite serves lazy JSON as JavaScript modules; JSON import attributes would make browsers reject their MIME type.
const loaders: Partial<Record<Locale, () => Promise<Catalog>>> = {
	ru: () => import('./locales/ru.json').then(module => module.default),
	de: () => import('./locales/de.json').then(module => module.default),
	ko: () => import('./locales/ko.json').then(module => module.default),
	'pt-BR': () => import('./locales/pt-BR.json').then(module => module.default),
	pl: () => import('./locales/pl.json').then(module => module.default),
	ja: () => import('./locales/ja.json').then(module => module.default),
	'en-GB': () => import('./locales/en-GB.json').then(module => module.default),
	'en-CA': () => import('./locales/en-CA.json').then(module => module.default),
	'fr-CA': () => import('./locales/fr-CA.json').then(module => module.default),
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
	const text =
		own(catalogs[locale] ?? {}, message) ??
		(isFrench(locale) ? own(french, message) : undefined) ??
		own(english, message) ??
		message
	return text.replace(interpolationPattern, (match, key: string) => {
		const value = Object.hasOwn(values, key) ? values[key] : undefined
		return String(value ?? match)
	})
}
