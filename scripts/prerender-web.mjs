import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const escapeHtml = text =>
	String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const htmlLanguagePattern = /<html lang="[^"]*">/
const titlePattern = /<title>[^<]*<\/title>/
const descriptionPattern = /<meta name="description"[^>]*>/
export async function prerenderWeb(directory, entry) {
	const template = await readFile(resolve(directory, 'index.html'), 'utf8')
	const { publicMetadata, renderPage, siteOrigin } = entry
	const origin = new URL(siteOrigin)
	if (!['https:', 'http:'].includes(origin.protocol) || origin.pathname !== '/' || origin.search || origin.hash)
		throw new Error('VITE_SITE_URL must be an HTTP(S) origin.')
	const indexable = process.env.VITE_INDEXABLE !== 'false'
	await Promise.all(
		publicMetadata.map(async page => {
			const canonical = new URL(page.path, origin).href
			const schema = page.articleDate
				? {
						'@context': 'https://schema.org',
						'@type': 'Article',
						headline: page.title,
						description: page.description,
						datePublished: page.articleDate,
						mainEntityOfPage: canonical,
					}
				: {
						'@context': 'https://schema.org',
						'@type': 'WebPage',
						name: page.title,
						description: page.description,
						url: canonical,
					}
			const tags = `<meta name="robots" content="${indexable ? 'index,follow' : 'noindex,nofollow'}" /><link rel="canonical" href="${escapeHtml(canonical)}" /><meta property="og:title" content="${escapeHtml(page.title)}" /><meta property="og:description" content="${escapeHtml(page.description)}" /><meta property="og:url" content="${escapeHtml(canonical)}" /><meta property="og:type" content="${page.articleDate ? 'article' : 'website'}" /><script type="application/ld+json" data-page-schema>${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>`
			const html = template
				.replace(htmlLanguagePattern, '<html lang="fr">')
				.replace(titlePattern, `<title>${escapeHtml(page.title)}</title>`)
				.replace(descriptionPattern, `<meta name="description" content="${escapeHtml(page.description)}" />`)
				.replace('</head>', `${tags}</head>`)
				.replace(
					'<div id="app"></div>',
					`<div id="app" data-prerendered="true" data-route="${escapeHtml(page.path)}">${renderPage(page.path)}</div>`
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
				`<url><loc>${escapeHtml(new URL(page.path, origin).href)}</loc>${page.articleDate ? `<lastmod>${page.articleDate}</lastmod>` : ''}</url>`
		)
		.join('\n')
	await writeFile(
		resolve(directory, 'sitemap.xml'),
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexable ? urls : ''}</urlset>\n`
	)
	await writeFile(
		resolve(directory, 'robots.txt'),
		indexable
			? `User-agent: *\nAllow: /\nDisallow: /gallery\nDisallow: /viewer\nDisallow: /share/\nDisallow: /login\nDisallow: /register\nSitemap: ${new URL('/sitemap.xml', origin).href}\n`
			: 'User-agent: *\nDisallow: /\n'
	)
	const fallback = template
		.replace(titlePattern, '<title>Minemories — Espace personnel</title>')
		.replace('</head>', '<meta name="robots" content="noindex,nofollow" /></head>')
	await writeFile(resolve(directory, 'app.html'), fallback)
	await writeFile(
		resolve(directory, '404.html'),
		template
			.replace('</head>', '<meta name="robots" content="noindex,follow" /></head>')
			.replace(
				'<div id="app"></div>',
				`<div id="app" data-prerendered="true" data-route="/404">${renderPage('/404')}</div>`
			)
	)
	return publicMetadata.map(page => page.path)
}
