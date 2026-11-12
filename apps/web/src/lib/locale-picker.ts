import { type Locale, localeOptions } from '../i18n/locales'

/**
 * The language picker's own order (i18n/locales.ts keeps its historical one): the languages by their own name, the Latin scripts
 * first, then Cyrillic, Japanese and Korean.
 */
const pickerOrder: readonly Locale[] = ['de', 'en', 'fr', 'pl', 'pt-BR', 'ru', 'ja', 'ko']

const region = /-.*/

type LocaleOption = (typeof localeOptions)[number]

/** Every language of the site in the picker's order; one missing from the order (a new catalog) goes last rather than vanish. */
export function pickerLocales(options: readonly LocaleOption[] = localeOptions): LocaleOption[] {
	const rank = (id: Locale) => {
		const index = pickerOrder.indexOf(id)
		return index < 0 ? pickerOrder.length : index
	}
	return [...options].sort((a, b) => rank(a.id) - rank(b.id))
}

/** The compact button's code: the language alone ("DE", "RU"); the full name stays the button's accessible name. */
export function localeCode(tag: string): string {
	return tag.replace(region, '').toUpperCase()
}
