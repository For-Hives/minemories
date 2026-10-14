import { useI18n } from './I18n'

/** Paired editorial copy, alongside the shared interface message catalog. */
export function useLocalizedCopy() {
	const context = useI18n()
	function copy<T>(fr: T, en: T): T {
		return context.locale === 'fr' ? fr : en
	}
	return { ...context, copy }
}
