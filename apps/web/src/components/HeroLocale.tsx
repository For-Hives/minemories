import { createContext, type ReactNode, useContext, useState } from 'react'
import { translate } from '../i18n/catalog'
import { useI18n } from '../i18n/I18n'
import type { Locale } from '../i18n/locales'
import type { TranslateValues } from '../lib/hero-i18n'

const HeroLocale = createContext<Locale>('en')

/**
 * The film's page is written once, in the page's language (the URL's), so the prerendered HTML already reads in that language. The locale is frozen at the
 * first render: later language changes go through the film's bridge (`data-i18n`), and React never writes those nodes again.
 */
export function HeroLocaleProvider({ children }: { children: ReactNode }) {
	const { locale } = useI18n()
	const [frozen] = useState(locale)
	return <HeroLocale.Provider value={frozen}>{children}</HeroLocale.Provider>
}

/** Translates a film message in the frozen page language; `{name}` is the sample player name of the film. */
export function useHeroT() {
	const locale = useContext(HeroLocale)
	return (key: string, values?: TranslateValues) => translate(locale, key, { name: 'Efe', ...values })
}

/** A fixed film language, without the site's language provider (a clip or an illustration shown on its own). */
export function HeroLocaleFixed({ locale, children }: { locale: Locale; children: ReactNode }) {
	return <HeroLocale.Provider value={locale}>{children}</HeroLocale.Provider>
}
