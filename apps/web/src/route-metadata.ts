import { translate } from './i18n/catalog.ts'
import type { Locale } from './i18n/I18n.tsx'
import { localeTag } from './i18n/locales.ts'
export interface PageMetadata {
	path: string
	title: string
	description: string
	indexable: boolean
	language: string
	articleDate?: string
}
const metadataMessages: PageMetadata[] = [
	{
		path: '/',
		title: 'Minemories — Worlds built together',
		description:
			'Capture a Minecraft area as a 3D memory and revisit it in your browser. Installation, a private gallery and sharing you choose.',
		indexable: true,
		language: 'fr',
	},
]
export const publicMetadata = metadataMessages.map(page => ({
	...page,
	title: translate('fr', page.title),
	description: translate('fr', page.description),
}))
const trailingSlash = /\/$/
export function metadataFor(pathname: string, locale: Locale = 'fr'): PageMetadata {
	const path = pathname.replace(trailingSlash, '') || '/'
	const page: PageMetadata = metadataMessages.find(page => page.path === path) ?? {
		path,
		title: 'Minemories — Your space',
		description: 'Your Minemories space.',
		indexable: false,
		language: 'fr',
	}
	return {
		...page,
		title: translate(locale, page.title),
		description: translate(locale, page.description),
		language: locale === 'fr' || locale === 'en' ? locale : localeTag(locale),
	}
}
export const siteOrigin = import.meta.env?.VITE_SITE_URL ?? 'https://minemories.net'

export function structuredDataFor(page: PageMetadata) {
	const canonical = new URL(page.path, siteOrigin).href
	if (page.articleDate)
		return {
			'@context': 'https://schema.org',
			'@type': 'Article',
			inLanguage: page.language,
			headline: page.title,
			description: page.description,
			datePublished: page.articleDate,
			mainEntityOfPage: canonical,
		}
	return {
		'@context': 'https://schema.org',
		'@type': 'WebPage',
		inLanguage: page.language,
		name: page.title,
		description: page.description,
		url: canonical,
	}
}
