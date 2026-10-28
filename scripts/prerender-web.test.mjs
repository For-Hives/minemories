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
		{ path: '/', title: 'Home & memories', description: 'A <memory>', indexable: true },
		{ path: '/blog/story', title: 'Story', description: 'Read the story', articleDate: '2026-10-14', indexable: true },
	],
	renderPage: path => `<h1>${path}</h1>`,
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
	assert.deepEqual(await prerenderWeb(directory, entry), ['/', '/blog/story'])
	const homepage = await readFile(join(directory, 'index.html'), 'utf8')
	assert.ok(homepage.includes('<h1>/</h1>'))
	assert.ok(homepage.includes('Home &amp; memories'))
	assert.ok(homepage.includes('A &lt;memory&gt;'))
	assert.ok(homepage.includes('data-prerendered="true"'))
	const article = await readFile(join(directory, 'blog/story/index.html'), 'utf8')
	assert.ok(article.includes('https://example.org/blog/story'))
	assert.ok(article.includes('"@type":"Article"'))
	assert.ok(article.includes('2026-10-14'))
	const sitemap = await readFile(join(directory, 'sitemap.xml'), 'utf8')
	assert.ok(sitemap.includes('/blog/story'))
	assert.ok(!sitemap.includes('/gallery'))
	const robots = await readFile(join(directory, 'robots.txt'), 'utf8')
	assert.ok(robots.includes('Disallow: /share/'))
	assert.ok(robots.includes('Disallow: /public/'))
	assert.ok(robots.includes('Disallow: /moderation'))
	assert.ok(robots.includes('Sitemap: https://example.org/sitemap.xml'))
	assert.ok((await readFile(join(directory, 'app.html'), 'utf8')).includes('noindex,nofollow'))
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
