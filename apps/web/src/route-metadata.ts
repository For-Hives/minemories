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
	/** The day the page's content last changed (YYYY-MM-DD): the sitemap's lastmod, required on every indexable page (the production build has no `.git` to read it from). */
	updated?: string
}
const metadataMessages: PageMetadata[] = [
	// The public gallery stays out of search results until it holds 20 real published memories.
	{
		path: '/explore',
		title: 'Public gallery of Minecraft builds in 3D',
		description:
			'Minecraft builds other players chose to share, checked before they go up. Walk around them in 3D in your browser.',
		indexable: false,
		language: 'fr',
	},
	{
		path: '/sharing',
		title: 'Share a Minecraft build in 3D with a link',
		description:
			'A link to your 3D memory. The other person opens it in their browser, without Minecraft or an account. You stop sharing whenever you want.',
		indexable: true,
		language: 'fr',
		updated: '2026-11-10',
	},
	{
		path: '/',
		title: 'Minemories: your Minecraft builds in 3D',
		description:
			'A Minecraft Java mod that keeps a 3D copy of your base. Open it in your browser and send your friends a link to walk around it.',
		indexable: true,
		language: 'fr',
		updated: '2026-11-10',
	},
	{
		path: '/concept',
		title: 'See your Minecraft world in 3D in the browser',
		description:
			'Minemories keeps an area of your Java world and lets you walk around it in 3D in the browser. What it does, and what it doesn’t.',
		indexable: true,
		language: 'fr',
		updated: '2026-11-10',
	},
	{
		path: '/how-it-works',
		title: 'How Minemories captures your Minecraft build',
		description:
			'A memory on demand or while you’re AFK, a 3D file on your computer, a private gallery if you connect the game. What goes online, and when.',
		indexable: true,
		language: 'fr',
		updated: '2026-11-10',
	},
	{
		path: '/installation',
		title: 'Install Minemories on Fabric, Forge or NeoForge',
		description:
			'Choose your Minecraft Java version and your loader, install the mod, then connect the game to your gallery.',
		indexable: true,
		language: 'fr',
		updated: '2026-11-10',
	},
	{
		path: '/downloads',
		title: 'Download Minemories for Fabric, Forge and NeoForge',
		description:
			'The Minemories JAR for each supported Minecraft Java version and each loader, with the Java version it needs and its SHA-256 checksum.',
		indexable: true,
		language: 'fr',
		updated: '2026-11-10',
	},
	{
		path: '/versions',
		title: 'What’s new in Minemories, version by version',
		description: 'Every Minemories version and what it changed, with dates.',
		indexable: true,
		language: 'fr',
		updated: '2026-11-10',
	},
	{
		path: '/server-closing',
		title: 'Minecraft server closing: keep your builds',
		description:
			'End of season, wipe, SMP closing: keep your base in 3D before it closes, without being an admin and without installing anything on the server.',
		indexable: true,
		language: 'fr',
		updated: '2026-11-10',
	},
	{
		path: '/safety',
		title: 'Is Minemories safe? Mod, children and privacy',
		description:
			'Where to download the mod, what goes online and when, who sees your child’s memories, how to delete everything.',
		indexable: true,
		language: 'fr',
		updated: '2026-11-10',
	},
	{
		path: '/guides/minecraft-blender',
		title: 'Export a Minecraft build to Blender (GLB)',
		description:
			'Export an area of your Minecraft Java world as GLB from the game, textures and lights included, in multiplayer and with mods. Blender import step by step.',
		indexable: true,
		language: 'fr',
		articleDate: '2026-11-10',
		updated: '2026-11-10',
	},
	{
		path: '/roadmap',
		title: 'Roadmap · Minemories',
		description: 'What the Minemories team is building right now and what’s coming next.',
		indexable: false,
		language: 'fr',
	},
	{
		path: '/faq',
		title: 'Minemories questions: versions, safety, sharing',
		description: 'Bedrock? Your version? The server? What goes online? Who sees your memories? The short answers.',
		indexable: true,
		language: 'fr',
		updated: '2026-11-10',
	},
	{
		path: '/privacy',
		title: 'Privacy · Minemories',
		description:
			'Your account, private gallery, sharing links, capture retention, mod diagnostics, optional public-page diagnostics and mod download requests.',
		indexable: true,
		language: 'fr',
		updated: '2026-11-09',
	},
	{
		path: '/terms',
		title: 'Minemories terms of use',
		description: 'The rules for this beta: keep your backups, and respect other players when you capture and share.',
		indexable: true,
		language: 'fr',
		updated: '2026-11-10',
	},
	// Kept out of search results until the publisher, the host and a contact are named.
	{
		path: '/legal',
		title: 'About Minemories and legal notice',
		description: 'Independent project, public repository and legal information still to be completed.',
		indexable: false,
		language: 'fr',
	},
]
/** Private pages that still deserve their own tab title: never prerendered, never indexed. */
const privateMessages: PageMetadata[] = [
	{
		path: '/login',
		title: 'Sign in · Minemories',
		description: 'Your Minemories space.',
		indexable: false,
		language: 'fr',
	},
	{
		path: '/register',
		title: 'Create an account · Minemories',
		description: 'Your Minemories space.',
		indexable: false,
		language: 'fr',
	},
]
/**
 * A shared link (/share/:token) or a public memory (/public/:id): one neutral card, since a per-link preview would need
 * a server-side render. Link previews read it from app.html (the private shell, which crawlers get without JavaScript),
 * and the tab shows it too (`sharedLinkPath`).
 */
const sharedCard = {
	title: 'A Minecraft place in 3D, shared with you',
	description: 'Open it in your browser and walk around it in 3D.',
}
const sharedPath = /^\/(?:share|public)\//
/**
 * The page's own text (body and JSON-LD) is French by default, but its head (title, description, Open Graph) is English
 * unless the link names a language with `?lang=` (owner decision, 12 November 2026): a pasted link never previews in French
 * unless asked to. `headFor` gives that head in any locale; the prerender writes the English one into each page and one
 * variant per other locale, which nginx serves for `?lang=`.
 */
export const publicMetadata = metadataMessages.map(page => ({
	...page,
	title: translate('fr', page.title),
	description: translate('fr', page.description),
}))
/** The title and description of a page's head in `locale` (catalogues other than French and English must be loaded). */
export function headFor(path: string, locale: Locale = 'en') {
	const { title, description } = metadataFor(path, locale)
	return { title, description }
}
/** Any /share or /public link: the private shell (app.html) carries their card. */
export const sharedLinkPath = '/share/link'
const trailingSlash = /\/$/
export function metadataFor(pathname: string, locale: Locale = 'fr'): PageMetadata {
	const path = pathname.replace(trailingSlash, '') || '/'
	const page: PageMetadata = [...metadataMessages, ...privateMessages].find(page => page.path === path) ?? {
		path,
		...(sharedPath.test(path)
			? sharedCard
			: { title: 'Minemories · Your space', description: 'Your Minemories space.' }),
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
