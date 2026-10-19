import { type Locale, localeTag } from './locales'

type Forms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }
const english = { one: '{count} capture', other: '{count} captures' }
const french = { one: '{count} capture', other: '{count} captures' }
const forms: Record<Locale, Forms> = {
	en: english,
	'en-GB': english,
	'en-CA': english,
	fr: french,
	'fr-CA': french,
	ru: { one: '{count} снимок', few: '{count} снимка', many: '{count} снимков', other: '{count} снимка' },
	de: { one: '{count} Aufnahme', other: '{count} Aufnahmen' },
	ko: { other: '캡처 {count}개' },
	'pt-BR': { one: '{count} captura', other: '{count} capturas' },
	pl: { one: '{count} zrzut', few: '{count} zrzuty', many: '{count} zrzutów', other: '{count} zrzutu' },
	ja: { other: 'キャプチャ{count}件' },
}
export function formatCaptureCount(locale: Locale, count: number): string {
	const tag = localeTag(locale)
	const category = new Intl.PluralRules(tag).select(count)
	const template = forms[locale][category] ?? forms[locale].other
	return template.replace('{count}', new Intl.NumberFormat(tag).format(count))
}
