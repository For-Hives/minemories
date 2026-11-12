import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const escapeHtml = text =>
	String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const htmlLanguagePattern = /<html lang="[^"]*">/
const titlePattern = /<title>[^<]*<\/title>/
const descriptionPattern = /<meta name="description"[^>]*>/
/** The landing's loading screen (scripts/boot-screen/gen.mjs): its style, markup and script, each between <!-- boot:begin --> and <!-- boot:end -->. */
const bootPattern = /<!-- boot:begin -->.*?<!-- boot:end -->/gs
/** Only the landing and the app fallback (the viewers) keep it: anywhere else its opaque cover would hide the page until the inline script drops it, or for 20 s without JavaScript. */
const withoutBootScreen = html => html.replace(bootPattern, '')
/** The page's URL as a link preview names it (`og:url`): the bare URL in English, `?lang=<id>` in any other language. */
const previewUrl = (path, origin, language) => {
	const url = new URL(path, origin)
	if (language.id !== 'en') url.searchParams.set('lang', language.id)
	return url.href
}
/**
 * Heads are English by default (no French in a pasted link's preview, title or description); `?lang=<id>` asks for another
 * language, which nginx serves from `_lang/<id>/` (deploy/nginx.web.conf). The page body and its JSON-LD stay French.
 */
const headLanguages = previewLanguages => [
	{ id: 'en', ogLocale: 'en_US', folder: '' },
	...previewLanguages.map(language => ({ ...language, folder: `_lang/${language.id}` })),
]
export async function prerenderWeb(directory, entry) {
	const template = (await readFile(resolve(directory, 'index.html'), 'utf8')).replace(/<meta name="robots"[^>]*>/g, '')
	const {
		publicMetadata,
		renderPage,
		siteOrigin,
		structuredDataFor,
		firstPaintScripts = {},
		socialImage,
		headFor,
		sharedLinkPath,
		previewLanguages = [],
		loadPreviewLanguages,
	} = entry
	const origin = new URL(siteOrigin)
	if (!['https:', 'http:'].includes(origin.protocol) || origin.pathname !== '/' || origin.search || origin.hash)
		throw new Error('VITE_SITE_URL must be an HTTP(S) origin.')
	await loadPreviewLanguages?.()
	const languages = headLanguages(previewLanguages)
	const indexable = process.env.VITE_INDEXABLE === 'true'
	// The link preview (og:image, twitter:image) is the same image on every page, with an absolute URL from the site's origin.
	const socialTags = socialImage
		? `<meta property="og:image" content="${escapeHtml(new URL(socialImage.path, origin).href)}" /><meta property="og:image:width" content="${socialImage.width}" /><meta property="og:image:height" content="${socialImage.height}" /><meta property="og:image:alt" content="${escapeHtml(socialImage.alt)}" /><meta name="twitter:card" content="summary_large_image" /><meta name="twitter:image" content="${escapeHtml(new URL(socialImage.path, origin).href)}" />`
		: ''
	/** The head's text in one language: title, description, og:title, og:description, og:locale. */
	const headText = (html, head) =>
		html
			.replace(titlePattern, `<title>${escapeHtml(head.title)}</title>`)
			.replace(descriptionPattern, `<meta name="description" content="${escapeHtml(head.description)}" />`)
	const previewText = (head, language) =>
		`<meta property="og:site_name" content="Minemories" /><meta property="og:title" content="${escapeHtml(head.title)}" /><meta property="og:description" content="${escapeHtml(head.description)}" /><meta property="og:locale" content="${language.ogLocale}" />`
	/** A public page's canonical URL (always the bare one), link preview and JSON-LD. */
	const previewHead = (page, head, language) =>
		`<link rel="canonical" href="${escapeHtml(new URL(page.path, origin).href)}" />${previewText(head, language)}<meta property="og:url" content="${escapeHtml(previewUrl(page.path, origin, language))}" /><meta property="og:type" content="${page.articleDate ? 'article' : 'website'}" />${socialTags}<script type="application/ld+json" data-page-schema>${JSON.stringify(structuredDataFor(page)).replaceAll('<', '\\u003c')}</script>`
	// Every indexable page names its own last change (route-metadata `updated`): the sitemap's lastmod.
	const undated = publicMetadata.filter(page => page.indexable && !page.updated).map(page => page.path)
	if (undated.length) throw new Error(`Indexable pages without an updated date: ${undated.join(', ')}`)
	const writePage = async (page, language) => {
		// A page kept out of search results carries no canonical, link preview or JSON-LD, as in the client head (RouteMetadata).
		const head = headFor(page.path, language.id)
		const preview = page.indexable ? previewHead(page, head, language) : ''
		const tags = `<meta name="robots" content="${indexable && page.indexable ? 'index,follow' : 'noindex,nofollow'}" />${preview}`
		// The body is French (the client renders it in French too, unless the link or the visitor chose a language).
		const html = headText(
			(page.path === '/' ? template : withoutBootScreen(template)).replace(htmlLanguagePattern, '<html lang="fr">'),
			head
		)
			.replace('</head>', `${tags}</head>`)
			.replace(
				'<div id="app"></div>',
				`${firstPaintScripts[page.path] ? `<script>${firstPaintScripts[page.path]}</script>` : ''}<div id="app" data-prerendered="true" data-route="${escapeHtml(page.path)}">${renderPage(page.path)}</div>`
			)
		const folder = resolve(directory, language.folder, `.${page.path}`)
		await mkdir(folder, { recursive: true })
		await writeFile(resolve(folder, 'index.html'), html)
	}
	await Promise.all(publicMetadata.flatMap(page => languages.map(language => writePage(page, language))))
	const urls = publicMetadata
		.filter(page => page.indexable)
		.map(
			page =>
				`<url><loc>${escapeHtml(new URL(page.path, origin).href)}</loc>${page.updated ? `<lastmod>${page.updated}</lastmod>` : ''}</url>`
		)
		.join('\n')
	await writeFile(
		resolve(directory, 'sitemap.xml'),
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexable ? urls : ''}</urlset>\n`
	)
	await writeFile(
		resolve(directory, 'robots.txt'),
		indexable
			? `User-agent: *\nAllow: /\nDisallow: /gallery\nDisallow: /account\nDisallow: /admin\nDisallow: /viewer\nDisallow: /share/\nDisallow: /public/\nDisallow: /moderation\nDisallow: /login\nDisallow: /register\nSitemap: ${new URL('/sitemap.xml', origin).href}\n`
			: 'User-agent: *\nDisallow: /\n'
	)
	// The private shell answers every private route, but only /share and /public links get pasted where a preview is
	// drawn: it carries their neutral card (no canonical or og:url, since one file serves many URLs), in every head language.
	await Promise.all(
		languages.map(async language => {
			const head = headFor(sharedLinkPath, language.id)
			// It keeps the loading screen: the viewers open behind it.
			const shell = headText(template.replace(htmlLanguagePattern, '<html lang="fr">'), head).replace(
				'</head>',
				`<meta name="robots" content="noindex,nofollow" /><meta property="og:type" content="website" />${previewText(head, language)}${socialTags}</head>`
			)
			await mkdir(resolve(directory, language.folder), { recursive: true })
			await writeFile(resolve(directory, language.folder, 'app.html'), shell)
		})
	)
	await writeFile(
		resolve(directory, '404.html'),
		withoutBootScreen(template)
			.replace('</head>', '<meta name="robots" content="noindex,follow" /></head>')
			.replace(
				'<div id="app"></div>',
				`<div id="app" data-prerendered="true" data-route="/404">${renderPage('/404')}</div>`
			)
	)
	return publicMetadata.map(page => page.path)
}
