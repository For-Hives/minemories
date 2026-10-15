import { useCallback } from 'react'
import { useI18n } from './I18n'

/** Paired editorial copy, alongside the shared interface message catalog. */
export function useLocalizedCopy() {
	const context = useI18n()
	const copy = useCallback(<T>(fr: T, en: T): T => (context.locale === 'fr' ? fr : en), [context.locale])
	return { ...context, copy }
}
