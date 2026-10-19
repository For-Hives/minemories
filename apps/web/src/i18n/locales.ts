/** Stable legacy IDs remain valid in saved preferences; Intl/HTML use their regional tags. */
export const localeOptions = [
	{ id: 'en', tag: 'en-US', label: 'English (US)', country: 'US' },
	{ id: 'ru', tag: 'ru-RU', label: 'Русский', country: 'RU' },
	{ id: 'de', tag: 'de-DE', label: 'Deutsch', country: 'DE' },
	{ id: 'en-GB', tag: 'en-GB', label: 'English (UK)', country: 'GB' },
	{ id: 'fr', tag: 'fr-FR', label: 'Français (FR)', country: 'FR' },
	{ id: 'ko', tag: 'ko-KR', label: '한국어', country: 'KR' },
	{ id: 'pt-BR', tag: 'pt-BR', label: 'Português (BR)', country: 'BR' },
	{ id: 'pl', tag: 'pl-PL', label: 'Polski', country: 'PL' },
	{ id: 'en-CA', tag: 'en-CA', label: 'English (CA)', country: 'CA' },
	{ id: 'fr-CA', tag: 'fr-CA', label: 'Français (CA)', country: 'CA' },
	{ id: 'ja', tag: 'ja-JP', label: '日本語', country: 'JP' },
] as const
export type Locale = (typeof localeOptions)[number]['id']
export function isLocale(value: unknown): value is Locale {
	return localeOptions.some(option => option.id === value)
}
export function localeTag(locale: Locale): string {
	return localeOptions.find(option => option.id === locale)?.tag ?? 'en-US'
}
export function isFrench(locale: Locale): boolean {
	return locale === 'fr' || locale === 'fr-CA'
}
/** A country selects a language variant, never an inferred location or time zone. */
export function resolveLocale(value: string): Locale | null {
	const normalized = value.replaceAll('_', '-').toLowerCase()
	const exact = localeOptions.find(
		option => option.id.toLowerCase() === normalized || option.tag.toLowerCase() === normalized
	)
	if (exact) return exact.id
	const language = normalized.split('-')[0]
	if (language === 'pt') return 'pt-BR'
	return localeOptions.find(option => option.id === language)?.id ?? null
}
export function preferredLocale(languages: readonly string[]): Locale {
	for (const language of languages) {
		const locale = resolveLocale(language)
		if (locale) return locale
	}
	return 'en'
}
