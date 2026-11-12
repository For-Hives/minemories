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
/** The private routes: the app shell, never indexed (kept in step with deploy/nginx.web.conf by smoke-web.test.mjs). */
const privateRoutes = ['gallery', 'account', 'admin', 'viewer', 'share/', 'public/', 'moderation', 'login', 'register']
const robotsFor = origin =>
	`User-agent: *\nAllow: /\nDisallow: /gallery\nDisallow: /account\nDisallow: /admin\nDisallow: /viewer\nDisallow: /share/\nDisallow: /public/\nDisallow: /moderation\nDisallow: /login\nDisallow: /register\n${privateRoutes.map(route => `Disallow: /*/${route}\n`).join('')}Sitemap: ${new URL('/sitemap.xml', origin).href}\n`
/**
 * Every public page in every language: English unprefixed (the default, what a pasted link previews), each other
 * language under its prefix (/fr/concept). Each one is a page of its own: <html lang>, title, description, Open Graph,
 * canonical, hreflang alternates (x-default = English) and JSON-LD in its language, and a body rendered in it.
 */
export async function prerenderWeb(directory, entry) {
	const template = (await readFile(resolve(directory, 'index.html'), 'utf8')).replace(/<meta name="robots"[^>]*>/g, '')
	const {
		publicMetadata,
		metadataFor,
		renderPage,
		siteOrigin,
		structuredDataFor,
		firstPaintScripts = {},
		socialImage,
		headFor,
		sharedLinkPath,
		languages,
		loadLanguages,
		pagePath,
	} = entry
	const origin = new URL(siteOrigin)
	if (!['https:', 'http:'].includes(origin.protocol) || origin.pathname !== '/' || origin.search || origin.hash)
		throw new Error('VITE_SITE_URL must be an HTTP(S) origin.')
	await loadLanguages()
	const indexable = process.env.VITE_INDEXABLE === 'true'
	const url = (path, language) => new URL(pagePath(path, language.id), origin).href
	// The link preview image is the same on every page, with an absolute URL from the site's origin.
	const socialTags = socialImage
		? `<meta property="og:image" content="${escapeHtml(new URL(socialImage.path, origin).href)}" /><meta property="og:image:width" content="${socialImage.width}" /><meta property="og:image:height" content="${socialImage.height}" /><meta property="og:image:alt" content="${escapeHtml(socialImage.alt)}" /><meta name="twitter:card" content="summary_large_image" /><meta name="twitter:image" content="${escapeHtml(new URL(socialImage.path, origin).href)}" />`
		: ''
	/** <html lang>, <title> and description in one language. */
	const headText = (html, head, language) =>
		html
			.replace(htmlLanguagePattern, `<html lang="${language.tag}">`)
			.replace(titlePattern, `<title>${escapeHtml(head.title)}</title>`)
			.replace(descriptionPattern, `<meta name="description" content="${escapeHtml(head.description)}" />`)
	const previewText = (head, language) =>
		`<meta property="og:site_name" content="Minemories" /><meta property="og:title" content="${escapeHtml(head.title)}" /><meta property="og:description" content="${escapeHtml(head.description)}" /><meta property="og:locale" content="${language.ogLocale}" />${languages
			.filter(other => other.id !== language.id)
			.map(other => `<meta property="og:locale:alternate" content="${other.ogLocale}" />`)
			.join('')}`
	const alternates = path =>
		`${languages.map(language => `<link rel="alternate" hreflang="${language.tag}" href="${escapeHtml(url(path, language))}" />`).join('')}<link rel="alternate" hreflang="x-default" href="${escapeHtml(url(path, languages[0]))}" />`
	/** A public page's canonical URL (its own language), alternates, link preview and JSON-LD. */
	const previewHead = (page, language) =>
		`<link rel="canonical" href="${escapeHtml(url(page.path, language))}" />${alternates(page.path)}${previewText(page, language)}<meta property="og:url" content="${escapeHtml(url(page.path, language))}" /><meta property="og:type" content="${page.articleDate ? 'article' : 'website'}" />${socialTags}<script type="application/ld+json" data-page-schema>${JSON.stringify(structuredDataFor(page)).replaceAll('<', '\\u003c')}</script>`
	// Every indexable page names its own last change (route-metadata `updated`): the sitemap's lastmod.
	const undated = publicMetadata.filter(page => page.indexable && !page.updated).map(page => page.path)
	if (undated.length) throw new Error(`Indexable pages without an updated date: ${undated.join(', ')}`)
	const writePage = async (path, language) => {
		const page = metadataFor(path, language.id)
		const route = pagePath(path, language.id)
		// A page kept out of search results carries no canonical, alternates, link preview or JSON-LD, as in the client head.
		const preview = page.indexable ? previewHead(page, language) : ''
		const tags = `<meta name="robots" content="${indexable && page.indexable ? 'index,follow' : 'noindex,nofollow'}" />${preview}`
		const html = headText(path === '/' ? template : withoutBootScreen(template), page, language)
			.replace('</head>', `${tags}</head>`)
			.replace(
				'<div id="app"></div>',
				`${firstPaintScripts[path] ? `<script>${firstPaintScripts[path]}</script>` : ''}<div id="app" data-prerendered="true" data-route="${escapeHtml(route)}">${renderPage(path, language.id)}</div>`
			)
		const folder = resolve(directory, `.${route}`)
		await mkdir(folder, { recursive: true })
		await writeFile(resolve(folder, 'index.html'), html)
	}
	await Promise.all(publicMetadata.flatMap(page => languages.map(language => writePage(page.path, language))))
	// One entry per page and language, each naming all its alternates (Google reads hreflang from the sitemap too).
	const urls = publicMetadata
		.filter(page => page.indexable)
		.flatMap(page =>
			languages.map(
				language =>
					`<url><loc>${escapeHtml(url(page.path, language))}</loc>${page.updated ? `<lastmod>${page.updated}</lastmod>` : ''}${languages
						.map(
							other =>
								`<xhtml:link rel="alternate" hreflang="${other.tag}" href="${escapeHtml(url(page.path, other))}" />`
						)
						.join(
							''
						)}<xhtml:link rel="alternate" hreflang="x-default" href="${escapeHtml(url(page.path, languages[0]))}" /></url>`
			)
		)
		.join('\n')
	await writeFile(
		resolve(directory, 'sitemap.xml'),
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${indexable ? urls : ''}</urlset>\n`
	)
	await writeFile(resolve(directory, 'robots.txt'), indexable ? robotsFor(origin) : 'User-agent: *\nDisallow: /\n')
	// The private shell answers every private route, one per language (/fr/share/… is the French one), but only /share
	// and /public links get pasted where a preview is drawn: it carries their neutral card (no canonical or og:url, since
	// one file serves many URLs). It keeps the loading screen: the viewers open behind it.
	await Promise.all(
		languages.map(async language => {
			const head = headFor(sharedLinkPath, language.id)
			const shell = headText(template, head, language).replace(
				'</head>',
				`<meta name="robots" content="noindex,nofollow" /><meta property="og:type" content="website" />${previewText(head, language)}${socialTags}</head>`
			)
			const folder = resolve(directory, `.${language.prefix || '/'}`)
			await mkdir(folder, { recursive: true })
			await writeFile(resolve(folder, 'app.html'), shell)
		})
	)
	await writeFile(
		resolve(directory, '404.html'),
		withoutBootScreen(template)
			.replace('</head>', '<meta name="robots" content="noindex,follow" /></head>')
			.replace(
				'<div id="app"></div>',
				`<div id="app" data-prerendered="true" data-route="/404">${renderPage('/404', 'en')}</div>`
			)
	)
	return publicMetadata.flatMap(page => languages.map(language => pagePath(page.path, language.id)))
}
