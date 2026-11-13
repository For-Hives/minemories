import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { prerenderWeb } from './prerender-web.mjs'

const invalidOriginPattern = /origin/
const template =
	'<html lang="en"><head><title>Old</title><meta name="description" content="Old" /></head><body><div id="app"></div><script src="/client.js"></script></body></html>'
const pages = {
	'/': { title: 'Home & memories', description: 'A <memory>', indexable: true, updated: '2026-11-10' },
	'/blog/story': {
		title: 'Story',
		description: 'Read the story',
		articleDate: '2026-10-14',
		indexable: true,
		updated: '2026-10-20',
	},
	'/explore': { title: 'Gallery', description: 'Public memories', indexable: false },
	'/share/link': { title: 'A place & you', description: 'Turn <around>', indexable: false },
}
const languages = [
	{ id: 'en', tag: 'en-US', ogLocale: 'en_US', prefix: '' },
	{ id: 'fr', tag: 'fr-FR', ogLocale: 'fr_FR', prefix: '/fr' },
]
/** The route-metadata entry: English as written, French as "fr: <English>". */
const metadataFor = (path, locale) => {
	const page = { path, ...pages[path], language: locale }
	return locale === 'en'
		? page
		: { ...page, title: `${locale}: ${page.title}`, description: `${locale}: ${page.description}` }
}
const entry = {
	siteOrigin: 'https://example.org',
	publicMetadata: ['/', '/blog/story', '/explore'].map(path => metadataFor(path, 'en')),
	metadataFor,
	renderPage: (path, locale) => `<h1>${locale}${path}</h1>`,
	headFor: (path, locale) => {
		const { title, description } = metadataFor(path, locale)
		return { title, description }
	},
	sharedLinkPath: '/share/link',
	languages,
	loadLanguages: async () => undefined,
	pagePath: (path, locale) => {
		const prefix = languages.find(language => language.id === locale).prefix
		return path === '/' && prefix ? prefix : `${prefix}${path}`
	},
	structuredDataFor: page => ({
		'@context': 'https://schema.org',
		'@graph': [
			{ '@type': page.articleDate ? 'Article' : 'WebPage', name: '</script>', path: page.path, title: page.title },
		],
	}),
}
test('writes real route HTML, canonical URLs, article schema, sitemap and private-route exclusions', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'minemories-prerender-'))
	t.after(() => rm(directory, { recursive: true, force: true }))
	const prior = process.env.VITE_INDEXABLE
	process.env.VITE_INDEXABLE = 'true'
	t.after(() => {
		if (prior === undefined) delete process.env.VITE_INDEXABLE
		else process.env.VITE_INDEXABLE = prior
	})
	await writeFile(join(directory, 'index.html'), template)
	assert.deepEqual(await prerenderWeb(directory, entry), [
		'/',
		'/fr',
		'/blog/story',
		'/fr/blog/story',
		'/explore',
		'/fr/explore',
	])
	const homepage = await readFile(join(directory, 'index.html'), 'utf8')
	assert.ok(homepage.includes('<h1>en/</h1>'))
	assert.ok(homepage.includes('Home &amp; memories'))
	assert.ok(homepage.includes('A &lt;memory&gt;'))
	assert.ok(homepage.includes('data-prerendered="true"'))
	const article = await readFile(join(directory, 'blog/story/index.html'), 'utf8')
	assert.ok(article.includes('https://example.org/blog/story'))
	assert.ok(article.includes('"@type":"Article"'))
	assert.ok(homepage.includes('<meta property="og:site_name" content="Minemories" />'))
	// The JSON-LD comes from the entry (route-metadata's one source), with "<" escaped so it cannot close the script.
	assert.ok(homepage.includes('"name":"\\u003c/script>","path":"/","title":"Home & memories"'))
	const sitemap = await readFile(join(directory, 'sitemap.xml'), 'utf8')
	assert.ok(sitemap.includes('<url><loc>https://example.org/blog/story</loc><lastmod>2026-10-20</lastmod>'))
	assert.ok(sitemap.includes('<url><loc>https://example.org/fr/blog/story</loc><lastmod>2026-10-20</lastmod>'))
	assert.ok(sitemap.includes('<url><loc>https://example.org/</loc><lastmod>2026-11-10</lastmod>'))
	// every entry names all its languages, English as x-default
	assert.ok(
		sitemap.includes(
			'<xhtml:link rel="alternate" hreflang="fr-FR" href="https://example.org/fr" /><xhtml:link rel="alternate" hreflang="x-default" href="https://example.org/" /></url>'
		)
	)
	assert.equal(sitemap.match(/<url>/g)?.length, 4)
	// A public page kept out of search results is still written, readable, but noindex and without canonical, preview or schema.
	assert.ok(!sitemap.includes('/explore'))
	const gallery = await readFile(join(directory, 'explore/index.html'), 'utf8')
	assert.ok(gallery.includes('<h1>en/explore</h1>'))
	assert.ok(gallery.includes('<meta name="robots" content="noindex,nofollow" />'))
	assert.ok(!gallery.includes('canonical'))
	assert.ok(!gallery.includes('og:'))
	assert.ok(!gallery.includes('ld+json'))
	assert.ok(!sitemap.includes('/gallery'))
	const robots = await readFile(join(directory, 'robots.txt'), 'utf8')
	assert.ok(robots.includes('Disallow: /share/'))
	assert.ok(robots.includes('Disallow: /public/'))
	assert.ok(robots.includes('Disallow: /moderation'))
	assert.ok(robots.includes('Sitemap: https://example.org/sitemap.xml'))
	// the private routes under every language prefix too
	assert.ok(robots.includes('Disallow: /*/gallery\n'))
	assert.ok(robots.includes('Disallow: /*/share/\n'))
	const shell = await readFile(join(directory, 'app.html'), 'utf8')
	assert.ok(shell.includes('noindex,nofollow'))
	// The private shell carries the neutral card that link previews of /share and /public read, escaped, in English.
	assert.ok(shell.includes('<html lang="en-US">'))
	assert.ok(shell.includes('<title>A place &amp; you</title>'))
	assert.ok(shell.includes('<meta name="description" content="Turn &lt;around&gt;" />'))
	assert.ok(shell.includes('<meta property="og:title" content="A place &amp; you" />'))
	assert.ok(shell.includes('<meta property="og:description" content="Turn &lt;around&gt;" />'))
	assert.ok(shell.includes('<meta property="og:site_name" content="Minemories" />'))
	// One file serves every private URL: no canonical, no og:url, no page schema.
	assert.ok(!shell.includes('canonical'))
	assert.ok(!shell.includes('og:url'))
	assert.ok(!shell.includes('ld+json'))
	assert.ok(shell.includes('<div id="app"></div>'))
})
test('indexing is blocked by default without disabling readable HTML', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'minemories-private-preview-'))
	t.after(() => rm(directory, { recursive: true, force: true }))
	await writeFile(
		join(directory, 'index.html'),
		template.replace('</head>', '<meta name="robots" content="noindex,nofollow" /></head>')
	)
	const prior = process.env.VITE_INDEXABLE
	delete process.env.VITE_INDEXABLE
	t.after(() => {
		if (prior === undefined) delete process.env.VITE_INDEXABLE
		else process.env.VITE_INDEXABLE = prior
	})
	await prerenderWeb(directory, entry)
	const html = await readFile(join(directory, 'index.html'), 'utf8')
	assert.ok(html.includes('noindex,nofollow'))
	assert.ok(html.includes('<h1>en/</h1>'))
	assert.equal(html.match(/name="robots"/g)?.length, 1)
	assert.ok(!html.includes('content="index,follow"'))
	assert.equal(await readFile(join(directory, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n')
	assert.ok(!(await readFile(join(directory, 'sitemap.xml'), 'utf8')).includes('<url>'))
	await assert.rejects(prerenderWeb(directory, { ...entry, siteOrigin: 'file:///tmp' }), invalidOriginPattern)
})
test('a route can ask for an inline first-paint script, written before the app markup and only on that route', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'minemories-first-paint-'))
	t.after(() => rm(directory, { recursive: true, force: true }))
	await writeFile(join(directory, 'index.html'), template)
	await prerenderWeb(directory, { ...entry, firstPaintScripts: { '/': 'document.documentElement.dataset.film = "1"' } })
	const homepage = await readFile(join(directory, 'index.html'), 'utf8')
	const script = '<script>document.documentElement.dataset.film = "1"</script>'
	assert.ok(homepage.includes(script))
	assert.ok(homepage.indexOf(script) < homepage.indexOf('<div id="app"'))
	const article = await readFile(join(directory, 'blog/story/index.html'), 'utf8')
	assert.ok(!article.includes('dataset.film'))
	assert.ok(!(await readFile(join(directory, '404.html'), 'utf8')).includes('dataset.film'))
})
test('every public page carries the link preview image as an absolute URL from the site origin', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'minemories-social-image-'))
	t.after(() => rm(directory, { recursive: true, force: true }))
	await writeFile(join(directory, 'index.html'), template)
	const socialImage = { path: '/brand/og-image.png', width: 1200, height: 630, alt: 'Minemories & co' }
	await prerenderWeb(directory, { ...entry, socialImage })
	const pages = await Promise.all(
		['index.html', 'blog/story/index.html'].map(file => readFile(join(directory, file), 'utf8'))
	)
	for (const html of pages) {
		assert.ok(html.includes('<meta property="og:image" content="https://example.org/brand/og-image.png" />'))
		assert.ok(html.includes('<meta property="og:image:width" content="1200" />'))
		assert.ok(html.includes('<meta property="og:image:height" content="630" />'))
		assert.ok(html.includes('<meta property="og:image:alt" content="Minemories &amp; co" />'))
		assert.ok(html.includes('<meta property="og:locale" content="en_US" />'), 'link previews are in English')
		assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image" />'))
		assert.ok(html.includes('<meta name="twitter:image" content="https://example.org/brand/og-image.png" />'))
	}
	// Without an image (the entry's field is optional), no preview tags. The template is written again: prerendering replaced it.
	await writeFile(join(directory, 'index.html'), template)
	await prerenderWeb(directory, entry)
	assert.ok(!(await readFile(join(directory, 'index.html'), 'utf8')).includes('og:image'))
})
test('every page exists in every language, each with its own head, alternates and body', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'minemories-prerender-'))
	t.after(() => rm(directory, { recursive: true, force: true }))
	await writeFile(join(directory, 'index.html'), template)
	let loaded = false
	await prerenderWeb(directory, {
		...entry,
		loadLanguages: async () => {
			loaded = true
		},
	})
	assert.ok(loaded, 'catalogues are loaded before any page is written')
	const english = await readFile(join(directory, 'blog/story/index.html'), 'utf8')
	assert.ok(english.includes('<html lang="en-US">'))
	assert.ok(english.includes('<title>Story</title>'))
	assert.ok(english.includes('<meta property="og:title" content="Story" />'))
	assert.ok(english.includes('<meta property="og:locale" content="en_US" />'))
	assert.ok(english.includes('<meta property="og:locale:alternate" content="fr_FR" />'))
	assert.ok(english.includes('<link rel="canonical" href="https://example.org/blog/story" />'))
	assert.ok(english.includes('<meta property="og:url" content="https://example.org/blog/story" />'))
	const alternates =
		'<link rel="alternate" hreflang="en-US" href="https://example.org/blog/story" /><link rel="alternate" hreflang="fr-FR" href="https://example.org/fr/blog/story" /><link rel="alternate" hreflang="x-default" href="https://example.org/blog/story" />'
	assert.ok(english.includes(alternates))
	assert.ok(english.includes('data-route="/blog/story"><h1>en/blog/story</h1>'))
	const french = await readFile(join(directory, 'fr/blog/story/index.html'), 'utf8')
	assert.ok(french.includes('<html lang="fr-FR">'))
	assert.ok(french.includes('<title>fr: Story</title>'))
	assert.ok(french.includes('<meta name="description" content="fr: Read the story" />'))
	assert.ok(french.includes('<meta property="og:title" content="fr: Story" />'))
	assert.ok(french.includes('<meta property="og:locale" content="fr_FR" />'))
	assert.ok(french.includes('<meta property="og:locale:alternate" content="en_US" />'))
	assert.ok(french.includes('<link rel="canonical" href="https://example.org/fr/blog/story" />'))
	assert.ok(french.includes('<meta property="og:url" content="https://example.org/fr/blog/story" />'))
	assert.ok(french.includes(alternates))
	assert.ok(french.includes('"title":"fr: Story"'))
	assert.ok(french.includes('data-route="/fr/blog/story"><h1>fr/blog/story</h1>'))
	const frenchHome = await readFile(join(directory, 'fr/index.html'), 'utf8')
	assert.ok(frenchHome.includes('data-route="/fr"><h1>fr/</h1>'))
	const frenchShell = await readFile(join(directory, 'fr/app.html'), 'utf8')
	assert.ok(frenchShell.includes('<html lang="fr-FR">'))
	assert.ok(frenchShell.includes('<title>fr: A place &amp; you</title>'))
	assert.ok(frenchShell.includes('<meta property="og:description" content="fr: Turn &lt;around&gt;" />'))
	assert.ok(frenchShell.includes('<meta property="og:locale" content="fr_FR" />'))
	assert.ok(!frenchShell.includes('og:url'))
	assert.ok(!frenchShell.includes('canonical'))
})

test('the landing and the app fallback (the viewers) keep the loading screen: every other page and the 404 drop its three blocks', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'minemories-boot-screen-'))
	t.after(() => rm(directory, { recursive: true, force: true }))
	const boot = [
		'<!-- boot:begin --><style>#boot{}</style><!-- boot:end -->',
		'<!-- boot:begin --><div id="boot" role="status"></div><!-- boot:end -->',
		'<!-- boot:begin --><script>bootScreen()</script><!-- boot:end -->',
	]
	const withBoot = template
		.replace('</head>', `${boot[0]}</head>`)
		.replace('<div id="app"></div>', `${boot[1]}<div id="app"></div>${boot[2]}`)
	await writeFile(join(directory, 'index.html'), withBoot)
	await prerenderWeb(directory, entry)
	const homepage = await readFile(join(directory, 'index.html'), 'utf8')
	for (const block of boot) assert.ok(homepage.includes(block))
	const fallback = await readFile(join(directory, 'app.html'), 'utf8')
	for (const block of boot) assert.ok(fallback.includes(block), 'app.html lost the loading screen of the viewers')
	const others = ['blog/story/index.html', '404.html']
	const pages = await Promise.all(others.map(file => readFile(join(directory, file), 'utf8')))
	for (const [k, html] of pages.entries()) {
		assert.ok(!html.includes('boot'), `${others[k]} still holds the loading screen`)
		assert.ok(html.includes('<script src="/client.js"></script>'), `${others[k]} lost the rest of the page`)
	}
})
test('an indexable page without an updated date stops the build: the sitemap would lose its lastmod', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'minemories-undated-'))
	t.after(() => rm(directory, { recursive: true, force: true }))
	await writeFile(join(directory, 'index.html'), template)
	const undated = {
		...entry,
		publicMetadata: [{ path: '/faq', title: 'FAQ', description: 'Answers', indexable: true }],
	}
	await assert.rejects(prerenderWeb(directory, undated), /without an updated date: \/faq/)
})
