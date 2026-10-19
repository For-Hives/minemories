import { useCallback } from 'react'
import { translateCopy } from './catalog'
import { useI18n } from './I18n'
import { isFrench } from './locales'

/** Paired editorial copy, including arrays/objects, shares the interface catalogues. */
export function useLocalizedCopy() {
	const context = useI18n()
	const copy = useCallback(
		<T>(fr: T, en: T): T => {
			if (context.locale === 'en') return en
			if (isFrench(context.locale)) return context.locale === 'fr' ? fr : translateCopy(context.locale, fr)
			return translateCopy(context.locale, en)
		},
		[context.locale]
	)
	return { ...context, copy }
}
