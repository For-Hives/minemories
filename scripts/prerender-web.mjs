import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const escapeHtml = text =>
	String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const htmlLanguagePattern = /<html lang="[^"]*">/
const titlePattern = /<title>[^<]*<\/title>/
const descriptionPattern = /<meta name="description"[^>]*>/
/** The landing's loading screen (scripts/boot-screen/gen.mjs): its style, markup and script, each between <!-- boot:begin --> and <!-- boot:end -->. */
const bootPattern = /<!-- boot:begin -->.*?<!-- boot:end -->/gs
/** Only the landing keeps it: anywhere else its opaque cover would hide the page until the inline script drops it, or for 20 s without JavaScript. */
const withoutBootScreen = html => html.replace(bootPattern, '')
export async function prerenderWeb(directory, entry) {
	const template = (await readFile(resolve(directory, 'index.html'), 'utf8')).replace(/<meta name="robots"[^>]*>/g, '')
	const {
		publicMetadata,
		renderPage,
		siteOrigin,
		structuredDataFor,
		firstPaintScripts = {},
		socialImage,
		appShell,
	} = entry
	const origin = new URL(siteOrigin)
	if (!['https:', 'http:'].includes(origin.protocol) || origin.pathname !== '/' || origin.search || origin.hash)
		throw new Error('VITE_SITE_URL must be an HTTP(S) origin.')
	const indexable = process.env.VITE_INDEXABLE === 'true'
	// The link preview (og:image, twitter:image) is the same image on every page, with an absolute URL from the site's origin.
	const socialTags = socialImage
		? `<meta property="og:image" content="${escapeHtml(new URL(socialImage.path, origin).href)}" /><meta property="og:image:width" content="${socialImage.width}" /><meta property="og:image:height" content="${socialImage.height}" /><meta property="og:image:alt" content="${escapeHtml(socialImage.alt)}" /><meta name="twitter:card" content="summary_large_image" /><meta name="twitter:image" content="${escapeHtml(new URL(socialImage.path, origin).href)}" />`
		: ''
	// Every indexable page names its own last change (route-metadata `updated`): the sitemap's lastmod.
	const undated = publicMetadata.filter(page => page.indexable && !page.updated).map(page => page.path)
	if (undated.length) throw new Error(`Indexable pages without an updated date: ${undated.join(', ')}`)
	// Public pages are written in French (the client renders them in French too, unless the visitor chose a language).
	await Promise.all(
		publicMetadata.map(async page => {
			const canonical = new URL(page.path, origin).href
			// A page kept out of search results carries no canonical, link preview or JSON-LD, as in the client head (RouteMetadata).
			const head = page.indexable
				? `<link rel="canonical" href="${escapeHtml(canonical)}" /><meta property="og:site_name" content="Minemories" /><meta property="og:title" content="${escapeHtml(page.title)}" /><meta property="og:description" content="${escapeHtml(page.description)}" /><meta property="og:url" content="${escapeHtml(canonical)}" /><meta property="og:type" content="${page.articleDate ? 'article' : 'website'}" /><meta property="og:locale" content="fr_FR" />${socialTags}<script type="application/ld+json" data-page-schema>${JSON.stringify(structuredDataFor(page)).replaceAll('<', '\\u003c')}</script>`
				: ''
			const tags = `<meta name="robots" content="${indexable && page.indexable ? 'index,follow' : 'noindex,nofollow'}" />${head}`
			const html = (page.path === '/' ? template : withoutBootScreen(template))
				.replace(htmlLanguagePattern, '<html lang="fr">')
				.replace(titlePattern, `<title>${escapeHtml(page.title)}</title>`)
				.replace(descriptionPattern, `<meta name="description" content="${escapeHtml(page.description)}" />`)
				.replace('</head>', `${tags}</head>`)
				.replace(
					'<div id="app"></div>',
					`${firstPaintScripts[page.path] ? `<script>${firstPaintScripts[page.path]}</script>` : ''}<div id="app" data-prerendered="true" data-route="${escapeHtml(page.path)}">${renderPage(page.path)}</div>`
				)
			const folder = page.path === '/' ? directory : resolve(directory, `.${page.path}`)
			await mkdir(folder, { recursive: true })
			await writeFile(resolve(folder, 'index.html'), html)
		})
	)
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
	// drawn: it carries their neutral card (no canonical or og:url, since one file serves many URLs).
	const shellHead = `<meta name="robots" content="noindex,nofollow" /><meta property="og:site_name" content="Minemories" /><meta property="og:type" content="website" /><meta property="og:title" content="${escapeHtml(appShell.title)}" /><meta property="og:description" content="${escapeHtml(appShell.description)}" /><meta property="og:locale" content="fr_FR" />${socialTags}`
	const fallback = withoutBootScreen(template)
		.replace(htmlLanguagePattern, '<html lang="fr">')
		.replace(titlePattern, `<title>${escapeHtml(appShell.title)}</title>`)
		.replace(descriptionPattern, `<meta name="description" content="${escapeHtml(appShell.description)}" />`)
		.replace('</head>', `${shellHead}</head>`)
	await writeFile(resolve(directory, 'app.html'), fallback)
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
