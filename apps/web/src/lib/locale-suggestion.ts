import { type Locale, preferredLocale } from '../i18n/locales'

/** The language the visitor picked in the switcher (an explicit choice, honoured on every page). */
export const savedLocaleKey = 'minemories-locale'
/** The suggested language the visitor declined: that suggestion is not offered again on this device. */
export const dismissedSuggestionKey = 'minemories-locale-suggestion-dismissed'

/** Every supported id starts with its two-letter ISO 639-1 language. */
function language(locale: string): string {
	return locale.slice(0, 2).toLowerCase()
}
/**
 * The browser's language only ever becomes a suggestion: a page renders in its own language (or the saved choice), so a crawler
 * and a visitor read the same text on the same URL. Nothing is suggested once a choice is saved, when the browser already reads
 * the page's language (a French Canadian browser on a French page), or when the visitor declined that language before, in
 * any of its variants (declining English also covers a later en-GB browser).
 */
export function suggestedLocale({
	current,
	saved,
	dismissed,
	languages,
}: {
	current: Locale
	saved: Locale | null
	dismissed: string | null
	languages: readonly string[]
}): Locale | null {
	if (saved) return null
	const preferred = preferredLocale(languages)
	if (language(preferred) === language(current)) return null
	if (dismissed !== null && language(preferred) === language(dismissed)) return null
	return preferred
}
