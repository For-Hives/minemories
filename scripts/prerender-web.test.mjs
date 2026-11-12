import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { prerenderWeb } from './prerender-web.mjs'

const invalidOriginPattern = /origin/
const template =
	'<html lang="en"><head><title>Old</title><meta name="description" content="Old" /></head><body><div id="app"></div><script src="/client.js"></script></body></html>'
const entry = {
	siteOrigin: 'https://example.org',
	publicMetadata: [
		{ path: '/', title: 'Home & memories', description: 'A <memory>', indexable: true, updated: '2026-11-10' },
		{
			path: '/blog/story',
			title: 'Story',
			description: 'Read the story',
			articleDate: '2026-10-14',
			indexable: true,
			updated: '2026-10-20',
		},
		{ path: '/explore', title: 'Gallery', description: 'Public memories', indexable: false },
	],
	renderPage: path => `<h1>${path}</h1>`,
	appShell: { title: 'A place & you', description: 'Turn <around>' },
	structuredDataFor: page => ({
		'@context': 'https://schema.org',
		'@graph': [{ '@type': page.articleDate ? 'Article' : 'WebPage', name: '</script>', path: page.path }],
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
	assert.deepEqual(await prerenderWeb(directory, entry), ['/', '/blog/story', '/explore'])
	const homepage = await readFile(join(directory, 'index.html'), 'utf8')
	assert.ok(homepage.includes('<h1>/</h1>'))
	assert.ok(homepage.includes('Home &amp; memories'))
	assert.ok(homepage.includes('A &lt;memory&gt;'))
	assert.ok(homepage.includes('data-prerendered="true"'))
	const article = await readFile(join(directory, 'blog/story/index.html'), 'utf8')
	assert.ok(article.includes('https://example.org/blog/story'))
	assert.ok(article.includes('"@type":"Article"'))
	assert.ok(homepage.includes('<meta property="og:site_name" content="Minemories" />'))
	// The JSON-LD comes from the entry (route-metadata's one source), with "<" escaped so it cannot close the script.
	assert.ok(homepage.includes('"name":"\\u003c/script>","path":"/"'))
	const sitemap = await readFile(join(directory, 'sitemap.xml'), 'utf8')
	assert.ok(sitemap.includes('<url><loc>https://example.org/blog/story</loc><lastmod>2026-10-20</lastmod></url>'))
	assert.ok(sitemap.includes('<url><loc>https://example.org/</loc><lastmod>2026-11-10</lastmod></url>'))
	// A public page kept out of search results is still written, readable, but noindex and without canonical, preview or schema.
	assert.ok(!sitemap.includes('/explore'))
	const gallery = await readFile(join(directory, 'explore/index.html'), 'utf8')
	assert.ok(gallery.includes('<h1>/explore</h1>'))
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
	const shell = await readFile(join(directory, 'app.html'), 'utf8')
	assert.ok(shell.includes('noindex,nofollow'))
	// The private shell carries the neutral card that link previews of /share and /public read, escaped, in French.
	assert.ok(shell.includes('<html lang="fr">'))
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
	assert.ok(html.includes('<h1>/</h1>'))
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
test('link previews are in English while the page and its title stay French', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'minemories-prerender-'))
	t.after(() => rm(directory, { recursive: true, force: true }))
	await writeFile(join(directory, 'index.html'), template)
	await prerenderWeb(directory, {
		...entry,
		publicMetadata: [
			{
				path: '/faq',
				title: 'Questions fréquentes',
				description: 'Réponses',
				ogTitle: 'Frequently asked questions',
				ogDescription: 'Answers',
				indexable: true,
				updated: '2026-11-12',
			},
		],
		appShell: { title: 'Un lieu', description: 'Ouvre-le', ogTitle: 'A place', ogDescription: 'Open it' },
	})
	const faq = await readFile(join(directory, 'faq/index.html'), 'utf8')
	assert.ok(faq.includes('<html lang="fr">'))
	assert.ok(faq.includes('<title>Questions fréquentes</title>'))
	assert.ok(faq.includes('<meta name="description" content="Réponses" />'))
	assert.ok(faq.includes('<meta property="og:title" content="Frequently asked questions" />'))
	assert.ok(faq.includes('<meta property="og:description" content="Answers" />'))
	assert.ok(faq.includes('<meta property="og:locale" content="en_US" />'))
	const shell = await readFile(join(directory, 'app.html'), 'utf8')
	assert.ok(shell.includes('<title>Un lieu</title>'))
	assert.ok(shell.includes('<meta property="og:title" content="A place" />'))
	assert.ok(shell.includes('<meta property="og:description" content="Open it" />'))
	assert.ok(shell.includes('<meta property="og:locale" content="en_US" />'))
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
