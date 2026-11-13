/**
 * One entry per language (no regional variant: owner decision, 12 November 2026). `id` is stored in saved preferences (a
 * retired en-GB, en-CA or fr-CA falls back to its language through resolveLocale); `tag` is for Intl and HTML; `prefix` is
 * the language's URL segment (/fr/concept), empty for English, the default.
 */
export const localeOptions = [
	{ id: 'en', tag: 'en-US', label: 'English', prefix: '' },
	{ id: 'ru', tag: 'ru-RU', label: 'Русский', prefix: 'ru' },
	{ id: 'de', tag: 'de-DE', label: 'Deutsch', prefix: 'de' },
	{ id: 'fr', tag: 'fr-FR', label: 'Français', prefix: 'fr' },
	{ id: 'ko', tag: 'ko-KR', label: '한국어', prefix: 'ko' },
	{ id: 'pt-BR', tag: 'pt-BR', label: 'Português', prefix: 'pt-br' },
	{ id: 'pl', tag: 'pl-PL', label: 'Polski', prefix: 'pl' },
	{ id: 'ja', tag: 'ja-JP', label: '日本語', prefix: 'ja' },
] as const
export type Locale = (typeof localeOptions)[number]['id']
export function isLocale(value: unknown): value is Locale {
	return localeOptions.some(option => option.id === value)
}
export function localeTag(locale: Locale): string {
	return localeOptions.find(option => option.id === locale)?.tag ?? 'en-US'
}
export function isFrench(locale: Locale): boolean {
	return locale === 'fr'
}
/** A regional tag selects its language (fr-CA reads French); never an inferred location or time zone. */
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
