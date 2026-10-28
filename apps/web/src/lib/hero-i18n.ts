import { translate } from '../i18n/catalog'
import type { Locale } from '../i18n/locales'

/** Locales whose characters the game's own font atlases do not draw: GNU Unifont, with the game's metrics, takes them (`html.mm-cjk`). */
export const unifontLocales: readonly Locale[] = ['ko', 'ja']
/** The film's player is always called Efe, in every language. */
export const playerName = 'Efe'

export type TranslateValues = Record<string, string | number>
export interface HeroI18n {
	readonly locale: Locale
	t(key: string, values?: TranslateValues): string
	/** Writes the current language into `data-i18n` / `data-i18n-attr` elements under `root`, and the font class on <html>. */
	apply(root?: ParentNode): void
	/** Calls `listener` after each language change; returns the function that stops it. */
	onChange(listener: () => void): () => void
	/** The app changed language: the film is told. */
	set(locale: Locale): void
}

function parseValues(raw: string | null): TranslateValues {
	if (!raw) return {}
	try {
		const parsed: unknown = JSON.parse(raw)
		return parsed && typeof parsed === 'object' ? (parsed as TranslateValues) : {}
	} catch {
		return {}
	}
}
/** "aria-label:Key one;title:Key two": the attribute name never holds a colon, the key may (the first colon splits). */
export function parseAttributeSpec(spec: string): [string, string][] {
	const pairs: [string, string][] = []
	for (const part of spec.split(';')) {
		const trimmed = part.trim()
		const cut = trimmed.indexOf(':')
		if (cut > 0) pairs.push([trimmed.slice(0, cut).trim(), trimmed.slice(cut + 1).trim()])
	}
	return pairs
}
/**
 * The film's translation bridge: same `t` / `apply` / `onChange` contract as the film's own former catalogue module, backed by the app's catalogues (`translate`),
 * so the film and the site have one language, one selector and one set of keys. Keys are the English text.
 */
export function createHeroI18n(
	initial: Locale,
	doc?: Document,
	translateMessage: typeof translate = translate
): HeroI18n {
	let locale = initial
	const listeners = new Set<() => void>()
	const t = (key: string, values: TranslateValues = {}) =>
		translateMessage(locale, key, { ...values, name: playerName })
	return {
		get locale() {
			return locale
		},
		t,
		apply(root?: ParentNode) {
			const page = doc ?? document
			const scope = root ?? page
			for (const element of scope.querySelectorAll('[data-i18n]'))
				element.textContent = t(
					String(element.getAttribute('data-i18n')),
					parseValues(element.getAttribute('data-i18n-values'))
				)
			for (const element of scope.querySelectorAll('[data-i18n-attr]')) {
				const values = parseValues(element.getAttribute('data-i18n-values'))
				for (const [name, key] of parseAttributeSpec(String(element.getAttribute('data-i18n-attr'))))
					element.setAttribute(name, t(key, values))
			}
			page.documentElement.classList.toggle('mm-cjk', unifontLocales.includes(locale))
		},
		onChange(listener) {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		set(next) {
			if (next === locale) return
			locale = next
			for (const listener of [...listeners]) listener()
		},
	}
}
