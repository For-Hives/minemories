import {
	createContext,
	Fragment,
	type ReactNode,
	startTransition,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from 'react'
import { withoutLanguageParam } from '../lib/link-language'
import { dismissedSuggestionKey, savedLocaleKey, suggestedLocale } from '../lib/locale-suggestion'
import { loadLocale, translate } from './catalog'
import { isFrench, isLocale, type Locale, localeTag, resolveLocale } from './locales'

export { translate } from './catalog'
export type { Locale } from './locales'

const I18nContext = createContext<{
	locale: Locale
	/** The language comes from the link (`?lang=`), a saved choice or the switcher, not from the page's default. */
	chosen: boolean
	pendingLocale: Locale | null
	localeError: boolean
	setLocale: (value: Locale) => void
	/** The browser's language when it differs from the page's, offered (never applied) until the visitor picks or declines it. */
	suggestedLocale: Locale | null
	dismissSuggestion: () => void
	t: (message: string, values?: Record<string, string | number>) => string
}>({
	locale: 'en',
	chosen: false,
	pendingLocale: null,
	localeError: false,
	setLocale: () => undefined,
	suggestedLocale: null,
	dismissSuggestion: () => undefined,
	t: (message, values) => translate('en', message, values),
})
function initialLanguage(locale: Locale): Locale {
	return isFrench(locale) ? 'fr' : 'en'
}
function readPreference(key: string): string | null {
	try {
		return localStorage.getItem(key)
	} catch {
		/* Preferences are optional. */
		return null
	}
}
/**
 * The page renders in `initialLocale` unless the link names a language (`urlLocale`, from `?lang=`, not saved) or the
 * visitor saved a choice in the language switcher. The browser's languages never
 * switch the rendered text (a crawler and a visitor must read the same language on the same URL); with `suggestLocale` they only
 * feed `suggestedLocale`, which the language suggestion offers.
 */
export function I18nProvider({
	children,
	initialLocale = 'fr',
	suggestLocale = false,
	urlLocale = null,
}: {
	children: ReactNode
	initialLocale?: Locale
	suggestLocale?: boolean
	urlLocale?: Locale | null
}) {
	const [locale, setLocale] = useState<Locale>(() => initialLanguage(initialLocale))
	const [chosen, setChosen] = useState(false)
	const [pendingLocale, setPendingLocale] = useState<Locale | null>(null)
	const [localeError, setLocaleError] = useState(false)
	const [suggestion, setSuggestion] = useState<Locale | null>(null)
	const revision = useRef(0)
	const activate = useCallback((value: Locale, persist: boolean, explicit: boolean) => {
		if (!isLocale(value)) return
		const version = ++revision.current
		setLocaleError(false)
		function commit() {
			if (version !== revision.current) return
			setLocale(value)
			setChosen(explicit)
			setPendingLocale(null)
			if (persist)
				try {
					localStorage.setItem(savedLocaleKey, value)
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
		const saved = resolveLocale(readPreference(savedLocaleKey) ?? '')
		const requested = urlLocale ?? saved
		startTransition(() => activate(requested ?? initialLocale, false, requested !== null))
		let active = true
		// A link that names its language is already an explicit choice: nothing to suggest.
		const target =
			suggestLocale && !urlLocale
				? suggestedLocale({
						current: initialLanguage(initialLocale),
						saved,
						dismissed: readPreference(dismissedSuggestionKey),
						languages: navigator.languages,
					})
				: null
		// The suggestion speaks the target language: it appears once that catalogue is here, or not at all.
		if (target)
			void loadLocale(target)
				.then(() => {
					if (active) setSuggestion(target)
				})
				.catch(() => undefined)
		return () => {
			active = false
			revision.current += 1
		}
		// Initialization is intentionally stable; changing languages is an explicit action.
	}, [activate, suggestLocale, initialLocale, urlLocale])
	useEffect(() => {
		document.documentElement.lang = localeTag(locale)
	}, [locale])
	const t = useCallback(
		(message: string, values?: Record<string, string | number>) => translate(locale, message, values),
		[locale]
	)
	const dismissSuggestion = useCallback(() => {
		setSuggestion(null)
		if (suggestion)
			try {
				localStorage.setItem(dismissedSuggestionKey, suggestion)
			} catch {
				/* Preferences are optional. */
			}
	}, [suggestion])

	return (
		<I18nContext.Provider
			value={{
				locale,
				chosen,
				pendingLocale,
				localeError,
				setLocale: value => {
					setSuggestion(null)
					// The switcher's choice replaces the link's: drop ?lang= so a reload keeps it.
					const href = withoutLanguageParam(window.location.href)
					if (href) window.history.replaceState(window.history.state, '', href)
					activate(value, true, true)
				},
				suggestedLocale: suggestion,
				dismissSuggestion,
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
export function T({ message, params }: { message: string; params?: Record<string, string | number> }) {
	const { t } = useI18n()
	return <>{t(message, params)}</>
}
/** Splits a translated sentence on its slots so that links or bold text keep their place in every language. */
const slotMark = '\u0000'
export function Rich({ message, slots }: { message: string; slots: Record<string, ReactNode> }) {
	const { t } = useI18n()
	const marks = Object.fromEntries(Object.keys(slots).map(name => [name, `${slotMark}${name}${slotMark}`]))
	const parts = t(message, marks).split(slotMark)
	return (
		<>
			{parts.map((part, index) => (
				// Parts are positional: a sentence never reorders between renders.
				// biome-ignore lint/suspicious/noArrayIndexKey: the split position is the only stable identity of a text part.
				<Fragment key={index}>{index % 2 === 1 ? slots[part] : part}</Fragment>
			))}
		</>
	)
}
