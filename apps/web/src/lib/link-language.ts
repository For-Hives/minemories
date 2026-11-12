import { type Locale, localeTag, resolveLocale } from '../i18n/locales'

/**
 * A shared link's language: `?lang=fr` (any supported id or regional tag, case-insensitive) asks for the page, its title,
 * description and link preview in that language. Without it, the head (title, description, Open Graph) is in English.
 */
export const languageParam = 'lang'

export function localeFromSearch(search: string): Locale | null {
	const value = new URLSearchParams(search).get(languageParam)
	return value ? resolveLocale(value) : null
}

/** The current URL without its `lang` parameter, or null when it has none (a choice in the switcher replaces the link's). */
export function withoutLanguageParam(href: string): string | null {
	const url = new URL(href)
	if (!url.searchParams.has(languageParam)) return null
	url.searchParams.delete(languageParam)
	return url.href
}

/** Open Graph wants an underscore: fr-FR becomes fr_FR. */
export function ogLocale(locale: Locale): string {
	return localeTag(locale).replace('-', '_')
}

/** The page's URL for a link preview in `locale`: the bare path in English, `?lang=<id>` otherwise. */
export function previewUrl(path: string, origin: string, locale: Locale): string {
	const url = new URL(path, origin)
	if (locale !== 'en') url.searchParams.set(languageParam, locale)
	return url.href
}
