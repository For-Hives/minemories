import { type Locale, localeOptions, localeTag } from '../i18n/locales'

/**
 * Every page exists once per language: /concept in English (the default, what a pasted link shows), /fr/concept in
 * French, /pt-br/concept in Portuguese… The router only sees the path after the prefix (its basename), so internal
 * links and route checks never name a language.
 */
export interface LocalePath {
	locale: Locale
	/** The URL segment with its slash ("/fr"), empty for English. */
	prefix: string
	/** The path the router sees ("/concept", "/" for a language's home). */
	path: string
}
const prefixed = localeOptions.filter(option => option.prefix)

export function splitLocalePath(pathname: string): LocalePath {
	for (const option of prefixed) {
		const prefix = `/${option.prefix}`
		if (pathname === prefix || pathname.startsWith(`${prefix}/`))
			return { locale: option.id, prefix, path: pathname.slice(prefix.length) || '/' }
	}
	return { locale: 'en', prefix: '', path: pathname || '/' }
}
export function localePrefix(locale: Locale): string {
	const prefix = localeOptions.find(option => option.id === locale)?.prefix
	return prefix ? `/${prefix}` : ''
}
/** A router path in a language: ("/concept", "fr") is "/fr/concept", ("/", "fr") is "/fr". */
export function localizedPath(path: string, locale: Locale): string {
	const prefix = localePrefix(locale)
	return path === '/' && prefix ? prefix : `${prefix}${path}`
}
export function localizedUrl(path: string, origin: string, locale: Locale): string {
	return new URL(localizedPath(path, locale), origin).href
}
/** Open Graph wants an underscore: fr-FR becomes fr_FR. */
export function ogLocale(locale: Locale): string {
	return localeTag(locale).replace('-', '_')
}
interface Place {
	pathname: string
	search: string
	hash: string
}
/** The same page, query and anchor in another language (the language switcher). */
export function switchedHref(place: Place, locale: Locale): string {
	return `${localizedPath(splitLocalePath(place.pathname).path, locale)}${place.search}${place.hash}`
}
/**
 * A visitor who saved a language and opens an unprefixed (English) URL is sent to that language's page before anything
 * renders. A prefixed URL names its language on purpose and is never redirected; crawlers save nothing.
 */
export function savedLanguageRedirect(place: Place, saved: Locale | null): string | null {
	if (!saved || saved === 'en' || splitLocalePath(place.pathname).prefix) return null
	return switchedHref(place, saved)
}
