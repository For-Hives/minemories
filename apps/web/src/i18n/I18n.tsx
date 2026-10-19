import {
	createContext,
	type ReactNode,
	startTransition,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from 'react'
import { loadLocale, translate } from './catalog'
import { isFrench, isLocale, type Locale, localeTag, preferredLocale, resolveLocale } from './locales'

export { translate } from './catalog'
export type { Locale } from './locales'

const I18nContext = createContext<{
	locale: Locale
	pendingLocale: Locale | null
	localeError: boolean
	setLocale: (value: Locale) => void
	t: (message: string, values?: Record<string, string | number>) => string
}>({
	locale: 'en',
	pendingLocale: null,
	localeError: false,
	setLocale: () => undefined,
	t: (message, values) => translate('en', message, values),
})
function initialLanguage(locale: Locale): Locale {
	return isFrench(locale) ? 'fr' : 'en'
}
export function I18nProvider({
	children,
	initialLocale = 'fr',
	detectLocale = false,
}: {
	children: ReactNode
	initialLocale?: Locale
	detectLocale?: boolean
}) {
	const [locale, setLocale] = useState<Locale>(() => initialLanguage(initialLocale))
	const [pendingLocale, setPendingLocale] = useState<Locale | null>(null)
	const [localeError, setLocaleError] = useState(false)
	const revision = useRef(0)
	const activate = useCallback((value: Locale, persist: boolean) => {
		if (!isLocale(value)) return
		const version = ++revision.current
		setLocaleError(false)
		function commit() {
			if (version !== revision.current) return
			setLocale(value)
			setPendingLocale(null)
			if (persist)
				try {
					localStorage.setItem('minemories-locale', value)
				} catch {
					/* Preferences are optional. */
				}
		}
		if (value === 'fr' || value === 'en') {
			commit()
			return
		}
		setPendingLocale(value)
		void loadLocale(value)
			.then(commit)
			.catch(() => {
				if (version !== revision.current) return
				setPendingLocale(null)
				setLocaleError(true)
			})
	}, [])
	useEffect(() => {
		let saved: Locale | null = null
		try {
			saved = resolveLocale(localStorage.getItem('minemories-locale') ?? '')
		} catch {
			/* Preferences are optional. */
		}
		const value = saved ?? (detectLocale ? preferredLocale(navigator.languages) : initialLocale)
		startTransition(() => activate(value, false))
		return () => {
			revision.current += 1
		}
		// Initialization is intentionally stable; changing languages is an explicit action.
	}, [activate, detectLocale, initialLocale])
	useEffect(() => {
		document.documentElement.lang = localeTag(locale)
	}, [locale])
	const t = useCallback(
		(message: string, values?: Record<string, string | number>) => translate(locale, message, values),
		[locale]
	)

	return (
		<I18nContext.Provider
			value={{
				locale,
				pendingLocale,
				localeError,
				setLocale: value => activate(value, true),
				t,
			}}
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
