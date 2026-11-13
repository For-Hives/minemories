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
import { dismissedSuggestionKey, savedLocaleKey, suggestedLocale } from '../lib/locale-suggestion'
import { isLoaded, loadLocale, translate } from './catalog'
import { isFrench, isLocale, type Locale, localeTag, resolveLocale } from './locales'

export { translate } from './catalog'
export type { Locale } from './locales'

const I18nContext = createContext<{
	locale: Locale
	pendingLocale: Locale | null
	localeError: boolean
	setLocale: (value: Locale) => void
	/** The browser's language when it differs from the page's, offered (never applied) until the visitor picks or declines it. */
	suggestedLocale: Locale | null
	dismissSuggestion: () => void
	t: (message: string, values?: Record<string, string | number>) => string
}>({
	locale: 'en',
	pendingLocale: null,
	localeError: false,
	setLocale: () => undefined,
	suggestedLocale: null,
	dismissSuggestion: () => undefined,
	t: (message, values) => translate('en', message, values),
})
/** The first render must match the static HTML: a catalogue that is not here yet renders in its fallback language. */
function initialLanguage(locale: Locale): Locale {
	if (isLoaded(locale)) return locale
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
 * The page renders in `initialLocale`. With `onLocaleChange` (the routed site, where the URL names the language: /fr/…),
 * that language is the URL's, and a choice saves it, then hands it to `onLocaleChange`, which moves to the page's URL in
 * that language. Without it, a choice saved in the language switcher wins over `initialLocale`. The browser's languages never
 * switch the rendered text (a crawler and a visitor must read the same language on the same URL); with `suggestLocale` they only
 * feed `suggestedLocale`, which the language suggestion offers.
 */
export function I18nProvider({
	children,
	initialLocale = 'fr',
	suggestLocale = false,
	onLocaleChange,
}: {
	children: ReactNode
	initialLocale?: Locale
	suggestLocale?: boolean
	onLocaleChange?: (locale: Locale) => void
}) {
	const [locale, setLocale] = useState<Locale>(() => initialLanguage(initialLocale))
	const [pendingLocale, setPendingLocale] = useState<Locale | null>(null)
	const [localeError, setLocaleError] = useState(false)
	const [suggestion, setSuggestion] = useState<Locale | null>(null)
	const revision = useRef(0)
	const routed = useRef(onLocaleChange)
	routed.current = onLocaleChange
	const activate = useCallback((value: Locale, persist: boolean) => {
		if (!isLocale(value)) return
		const version = ++revision.current
		setLocaleError(false)
		function commit() {
			if (version !== revision.current) return
			setPendingLocale(null)
			if (persist)
				try {
					localStorage.setItem(savedLocaleKey, value)
				} catch {
					/* Preferences are optional. */
				}
			// On the routed site a choice is a move to the page in that language (its catalogue is already here).
			if (persist && routed.current) routed.current(value)
			else setLocale(value)
		}
		if (isLoaded(value)) {
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
		// The routed site's language is its URL's (main.tsx already sent a saved choice to its URL).
		startTransition(() => activate(routed.current ? initialLocale : (saved ?? initialLocale), false))
		let active = true
		const target = suggestLocale
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
	}, [activate, suggestLocale, initialLocale])
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
				pendingLocale,
				localeError,
				setLocale: value => {
					setSuggestion(null)
					activate(value, true)
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
