import { readFileSync } from 'node:fs'
import { Hono } from 'hono'

/**
 * Link previews of shared links (/share/:token) and public memories (/public/:id).
 *
 * The site is static: its shell carries one neutral card for every such link. The web nginx sends the link-preview
 * robots (Discord, X, WhatsApp, Slack...) here instead (deploy/nginx.web.conf, `$mm_link_card`), and this card shows the
 * build itself: its picture, and the name its owner gave it. People keep getting the 3D page. See
 * docs/features/link-previews.md.
 */

/** What a card may show. `image` is the stored picture (a data URL), or null for the site's own image. */
export interface CardContent {
	title: string | null
	description: string | null
	image: string | null
}

export interface LinkCardSources {
	/** A shared link's card, or null once the link is unknown or stopped. Must not count as an opening. */
	shared(token: string): CardContent | null
	/** An approved publication's card, or null. Pending, rejected and revoked ones never show. */
	published(id: string): CardContent | null
	/** The public site (og:url, fallback image). */
	siteUrl: string
	/** This API's own public origin (og:image). */
	apiUrl: string
}

/** The site's languages with a URL prefix (apps/web/src/i18n/locales.ts), mapped to their catalog file. */
const catalogs: Record<string, string> = {
	fr: 'fr',
	de: 'de',
	ru: 'ru',
	ko: 'ko',
	'pt-br': 'pt-BR',
	pl: 'pl',
	ja: 'ja',
}
const loaded = new Map<string, Record<string, string>>()

/** The web catalog's translation of an English message, so the card speaks the language of the link. */
export function translateCard(lang: string | undefined, message: string): string {
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

const DEFAULT_TITLE = 'A Minecraft place in 3D, shared with you'
const DEFAULT_DESCRIPTION = 'Open it in your browser and walk around it in 3D.'

const escapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, character => escapes[character] ?? character)
}

/** One line of at most `limit` characters: previews cut long text anyway. */
function line(value: string | null, limit: number): string | null {
	const text = value?.replace(/\s+/g, ' ').trim() ?? ''
	if (!text) return null
	if (text.length <= limit) return text
	// Cut between words when there is one in the second half.
	const cut = text.slice(0, limit - 1)
	const space = cut.lastIndexOf(' ')
	return `${(space > limit / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}

const dataUrl = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]*={0,2})$/

/** The bytes of a stored picture (validated as a PNG or JPEG data URL on the way in), or null. */
export function decodeImage(value: string | null): { type: string; bytes: ArrayBuffer } | null {
	const match = value ? dataUrl.exec(value) : null
	if (!(match?.[1] && match[2])) return null
	return { type: match[1], bytes: Uint8Array.from(Buffer.from(match[2], 'base64')).buffer }
}

export function cardHtml(input: {
	content: CardContent | null
	lang: string | undefined
	pageUrl: string
	imageUrl: string
}): string {
	const title = line(input.content?.title ?? null, 120) ?? translateCard(input.lang, DEFAULT_TITLE)
	const description = line(input.content?.description ?? null, 300) ?? translateCard(input.lang, DEFAULT_DESCRIPTION)
	const language = input.lang ? (catalogs[input.lang] ?? 'en') : 'en'
	const meta = (attribute: string, name: string, value: string) =>
		`<meta ${attribute}="${name}" content="${escapeHtml(value)}">`
	return [
		'<!doctype html>',
		`<html lang="${escapeHtml(language)}">`,
		'<head>',
		'<meta charset="utf-8">',
		`<title>${escapeHtml(title)}</title>`,
		meta('name', 'description', description),
		meta('name', 'robots', 'noindex, nofollow'),
		meta('name', 'theme-color', '#0d1321'),
		meta('property', 'og:site_name', 'Minemories'),
		meta('property', 'og:type', 'website'),
		meta('property', 'og:title', title),
		meta('property', 'og:description', description),
		meta('property', 'og:url', input.pageUrl),
		meta('property', 'og:image', input.imageUrl),
		meta('property', 'og:image:alt', title),
		meta('name', 'twitter:card', 'summary_large_image'),
		meta('name', 'twitter:title', title),
		meta('name', 'twitter:description', description),
		meta('name', 'twitter:image', input.imageUrl),
		'</head>',
		`<body><a href="${escapeHtml(input.pageUrl)}">${escapeHtml(title)}</a></body>`,
		'</html>',
	].join('\n')
}

const kinds = {
	shared: { page: 'share', find: (sources: LinkCardSources, key: string) => sources.shared(key) },
	public: { page: 'public', find: (sources: LinkCardSources, key: string) => sources.published(key) },
} as const

/** Mounted at /api/cards: `/shared/:token`, `/public/:id`, and each one's `/image`. */
export function createLinkCards(sources: LinkCardSources) {
	const cards = new Hono()
	cards.use('*', (context, next) => {
		// A stopped link stops previewing at the next fetch; the robots keep their own copy for a while.
		context.header('Cache-Control', 'private, no-store')
		context.header('X-Content-Type-Options', 'nosniff')
		return next()
	})
	for (const [kind, { page, find }] of Object.entries(kinds)) {
		cards.get(`/${kind}/:key`, context => {
			const key = context.req.param('key')
			const lang = context.req.query('lang') || undefined
			const content = find(sources, key)
			const prefix = lang && catalogs[lang] ? `/${lang}` : ''
			const pageUrl = `${sources.siteUrl}${prefix}/${page}/${encodeURIComponent(key)}`
			const imageUrl = decodeImage(content?.image ?? null)
				? `${sources.apiUrl}/api/cards/${kind}/${encodeURIComponent(key)}/image`
				: `${sources.siteUrl}/brand/og-image.png`
			return context.html(cardHtml({ content, lang, pageUrl, imageUrl }), content ? 200 : 404)
		})
		cards.get(`/${kind}/:key/image`, context => {
			const image = decodeImage(find(sources, context.req.param('key'))?.image ?? null)
			if (!image) return context.json({ error: 'image_not_found' }, 404)
			return context.body(image.bytes, 200, { 'Content-Type': image.type })
		})
	}
	return cards
}
