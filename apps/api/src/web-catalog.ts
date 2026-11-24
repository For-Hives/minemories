import { readFileSync } from 'node:fs'

/** The site's languages with a URL prefix (apps/web/src/i18n/locales.ts), mapped to their catalog file. */
export const catalogs: Record<string, string> = {
	fr: 'fr',
	de: 'de',
	ru: 'ru',
	ko: 'ko',
	'pt-br': 'pt-BR',
	pl: 'pl',
	ja: 'ja',
}
const loaded = new Map<string, Record<string, string>>()

/** The web catalog's translation of an English message, for what the API writes itself (link cards, emails). */
export function translateWeb(lang: string | undefined, message: string): string {
	const file = lang ? catalogs[lang] : undefined
	if (!file) return message
	let catalog = loaded.get(file)
	if (!catalog) {
		try {
			const url = new URL(`../../web/src/i18n/locales/${file}.json`, import.meta.url)
			catalog = JSON.parse(readFileSync(url, 'utf8')) as Record<string, string>
		} catch {
			catalog = {}
		}
		loaded.set(file, catalog)
	}
	return catalog[message] || message
}

/** The language prefix of a site URL (`/fr/login/reset` → `fr`), or undefined for English and anything unknown. */
export function siteLanguage(url: string | null | undefined): string | undefined {
	if (!url) return undefined
	try {
		const segment = new URL(url).pathname.split('/')[1]?.toLowerCase()
		return segment && catalogs[segment] ? segment : undefined
	} catch {
		return undefined
	}
}
