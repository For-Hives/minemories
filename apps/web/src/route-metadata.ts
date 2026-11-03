import { discoveryPages } from './content/discovery.ts'
import { articles } from './content/site-content.ts'
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
		path: '/decouvrir',
		title: 'Discover Minemories — One world, many memories',
		description: 'Open source, nostalgia, sharing and discovery: explore ways to use Minemories.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/explorer',
		title: 'Public gallery — Minemories',
		description: 'Explore Minecraft memories deliberately published after moderation and their rankings.',
		indexable: true,
		language: 'fr',
	},
	...discoveryPages.map(page => ({
		path: page.path,
		title: `${page.label} — Minemories`,
		description: page.lead,
		indexable: true,
		language: 'fr' as const,
	})),
	{
		path: '/',
		title: 'Minemories — Worlds built together',
		description:
			'Capture a Minecraft area as a 3D memory and revisit it in your browser. Installation, a private gallery and sharing you choose.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/concept',
		title: 'The concept — Minemories',
		description: 'Keep places built together: a 3D memory to revisit alongside your Minecraft world backup.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/fonctionnement',
		title: 'How it works — Minemories',
		description: 'From Minecraft world to 3D memory: local capture, pairing, private gallery and sharing.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/installation',
		title: 'Install the mod — Minemories',
		description:
			'Step-by-step guide for Minecraft Java 1.21.1 and NeoForge 21.1.248. Download the JAR, install it and create your first memory.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/versions',
		title: 'Mod versions — Minemories',
		description:
			'Download Minemories JARs for Minecraft Java 1.21.1 with NeoForge, Fabric or Forge, and find previous releases.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/changelog',
		title: 'Mod updates — Minemories',
		description: 'Official Minemories release notes: features, fixes and downloads from GitHub.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/faq',
		title: 'Frequently asked questions — Minemories',
		description: 'Mod compatibility, GLB files, AFK captures, privacy and sharing: answers to get started.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/blog',
		title: 'The memory journal — Minemories',
		description: 'Guides and ideas for keeping and revisiting your Minecraft memories.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/pricing',
		title: 'Snapshots and long-term cloud — Minemories',
		description:
			'Estimate storage for your captures. Payments are disabled and the commercial offer remains unconfirmed.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/privacy',
		title: 'Privacy — Minemories',
		description:
			'Your account, private gallery, sharing links, capture retention and optional public-page diagnostics.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/terms',
		title: 'Terms of use — Minemories',
		description: 'Guidance for using this experimental version, capturing and sharing with respect for others.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/legal',
		title: 'About the service — Minemories',
		description: 'Independent project, public repository and legal information still to be completed.',
		indexable: true,
		language: 'fr',
	},
	...articles.map(article => ({
		path: `/blog/${article.slug}`,
		title: `${article.title} — Minemories`,
		description: article.summary,
		indexable: true,
		language: 'fr' as const,
		articleDate: article.published,
	})),
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
