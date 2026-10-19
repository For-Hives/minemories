import { translate } from './catalog'
import { type Locale, localeTag } from './locales'

export function formatCaptureCount(locale: Locale, count: number): string {
	const tag = localeTag(locale)
	const category = new Intl.PluralRules(tag).select(count)
	return translate(locale, `capture.count.${category}`, { count: new Intl.NumberFormat(tag).format(count) })
}
