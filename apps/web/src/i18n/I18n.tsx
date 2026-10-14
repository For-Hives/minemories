import { createContext, type ReactNode, startTransition, useContext, useEffect, useState } from 'react'
import { frenchMessages } from './messages'

export type Locale = 'fr' | 'en'
const interpolationPattern = /\{(\w+)\}/g
export function translate(locale: Locale, message: string, values: Record<string, string | number> = {}) {
	const text = locale === 'fr' ? (frenchMessages[message] ?? message) : message
	return text.replace(interpolationPattern, (match, key: string) => String(values[key] ?? match))
}
const I18nContext = createContext<{
	locale: Locale
	setLocale: (value: Locale) => void
	t: (message: string) => string
}>({
	locale: 'en' as Locale,
	setLocale: (_value: Locale) => undefined,
	t: (message: string) => message,
})
export function I18nProvider({ children, initialLocale = 'fr' }: { children: ReactNode; initialLocale?: Locale }) {
	const [locale, setLocale] = useState(initialLocale)
	useEffect(() => {
		try {
			const saved = localStorage.getItem('minemories-locale')
			if (saved === 'fr' || saved === 'en') startTransition(() => setLocale(saved))
		} catch {
			/* Local preferences are optional. */
		}
	}, [])
	useEffect(() => {
		document.documentElement.lang = locale
	}, [locale])
	function changeLocale(value: Locale) {
		setLocale(value)
		try {
			localStorage.setItem('minemories-locale', value)
		} catch {
			/* The current session still changes language. */
		}
	}
	return (
		<I18nContext.Provider
			value={{ locale, setLocale: changeLocale, t: (message: string) => translate(locale, message) }}
		>
			{children}
		</I18nContext.Provider>
	)
}
export function useI18n() {
	return useContext(I18nContext)
}

export function T({ message }: { message: string }) {
	const { t } = useI18n()
	return <>{t(message)}</>
}
