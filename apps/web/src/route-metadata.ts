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
		path: '/discover',
		title: 'Discover Minemories — One world, many memories',
		description: 'Public code, nostalgia, sharing and discovery: explore ways to use Minemories.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/explore',
		title: 'Public gallery of Minecraft builds in 3D',
		description: 'Explore Minecraft memories deliberately published after moderation and their rankings.',
		indexable: true,
		language: 'fr',
	},
	...discoveryPages.map(page => {
		if (page.path === '/sharing')
			return {
				path: page.path,
				title: 'Share a Minecraft build in 3D with a link',
				description:
					'A link to your 3D memory. The other person opens it in their browser, without Minecraft or an account. You stop sharing whenever you want.',
				indexable: true,
				language: 'fr' as const,
			}
		return {
			path: page.path,
			title: `${page.label} — Minemories`,
			description: page.lead,
			indexable: true,
			language: 'fr' as const,
		}
	}),
	{
		path: '/',
		title: 'Minemories: your Minecraft builds in 3D',
		description:
			'A Minecraft Java mod that keeps the corner where you play in 3D. Revisit it in your browser and show people around it with a link.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/concept',
		title: 'See your Minecraft world in 3D in the browser',
		description:
			'Minemories keeps an area of your Java world and makes it visitable in 3D in the browser. What it does, and what it does not.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/how-it-works',
		title: 'How Minemories captures your Minecraft build',
		description:
			'A memory on demand or while you are AFK, a 3D file on your computer, a private gallery if you connect the game. What goes online, and when.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/installation',
		title: 'Install Minemories on Fabric, Forge or NeoForge',
		description:
			'Choose your Minecraft Java version and your loader, install the mod, then connect the game to your gallery.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/downloads',
		title: 'Download Minemories for Fabric, Forge and NeoForge',
		description:
			'The Minemories JAR for each supported Minecraft Java version and each loader, with its SHA-256 checksum.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/versions',
		title: 'What’s new in Minemories, version by version',
		description: 'The notes of each Minemories mod version, dated.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/changelog',
		title: 'Mod updates — Minemories',
		description: 'Official Minemories mod builds: dates, sizes and checksums.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/roadmap',
		title: 'Roadmap — Minemories',
		description: 'What the Minemories team is building now, what comes next and what shipped recently.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/faq',
		title: 'Minemories questions: versions, safety, sharing',
		description: 'Bedrock? Your version? The server? What goes online? Who sees your memories? The short answers.',
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
		path: '/privacy',
		title: 'Privacy — Minemories',
		description:
			'Your account, private gallery, sharing links, capture retention, mod diagnostics, optional public-page diagnostics and mod download requests.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/terms',
		title: 'Minemories terms of use',
		description: 'Guidance for using this experimental version, capturing and sharing with respect for others.',
		indexable: true,
		language: 'fr',
	},
	{
		path: '/legal',
		title: 'About Minemories and legal notice',
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
/** Private pages that still deserve their own tab title: never prerendered, never indexed. */
const privateMessages: PageMetadata[] = [
	{
		path: '/login',
		title: 'Sign in — Minemories',
		description: 'Your Minemories space.',
		indexable: false,
		language: 'fr',
	},
	{
		path: '/register',
		title: 'Create an account — Minemories',
		description: 'Your Minemories space.',
		indexable: false,
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
	const page: PageMetadata = [...metadataMessages, ...privateMessages].find(page => page.path === path) ?? {
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
/** The link preview of every public page (og:image, twitter:image): the logo on the night background, built by `bun run brand:icons`. */
export const socialImage = { path: '/brand/og-image.png', width: 1200, height: 630, alt: 'Minemories' } as const
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
