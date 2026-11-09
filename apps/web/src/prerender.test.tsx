import { expect, test } from 'vitest'
import { publicMetadata, renderPage } from './prerender'
import { metadataFor } from './route-metadata'

test('all public routes render readable content and navigation without browser APIs or JavaScript', () => {
	for (const page of publicMetadata) {
		const html = renderPage(page.path)
		expect(html).toContain('<h1')
		expect(html).toContain('href="/installation"')
		expect(html).not.toContain('<!--$!-->')
		// The language suggestion depends on the visitor's browser: it never enters the static HTML crawlers read.
		expect(html).not.toContain('data-nosnippet')
		expect(html).not.toContain('Read Minemories in')
	}
	for (const retired of ['/discover', '/nostalgia', '/open-source', '/ranking', '/changelog', '/blog'])
		expect(
			publicMetadata.some(page => page.path === retired),
			retired
		).toBe(false)
})
test('the 404 page is readable, points back home and holds no film', () => {
	const html = renderPage('/404')
	expect(html).toContain('<h1')
	expect(html).toContain('href="/"')
	expect(html).not.toContain('<!--$!-->')
	expect(html).not.toContain('id="mm-scene"')
})
test('the manual tutorial includes a complete no-JavaScript path, not only its first interactive step', () => {
	const html = renderPage('/installation')
	expect(html).toContain('<noscript>')
	expect(html).toContain('/minemories export 16')
	expect(html).toContain('Install client')
	expect(html).toContain('capture.glb')
})
test('release history renders its heading and a direct API index link without JavaScript, and no retired /changelog link', () => {
	const html = renderPage('/versions')
	expect(html).toContain('Ce qui change dans Minemories')
	expect(html).toContain('href="/installation"')
	expect(html).not.toContain('href="/changelog')
	expect(html).toContain('/downloads/index.json')
	expect(html).toContain('<noscript>')
	expect(html).not.toContain('Minemories 0.2.')
})
test('the download table and the guide welcome render without JavaScript, with the two ways in', () => {
	const table = renderPage('/downloads')
	expect(table).toContain('<h1')
	expect(table).toContain('Télécharger Minemories')
	expect(table).toContain('<table')
	expect(table).toContain('scope="col"')
	expect(table).toContain('scope="row"')
	expect(table).toContain('<noscript>')
	expect(table).toContain('/downloads/neoforge-mc1.21.1/latest')
	expect(table).toContain('/downloads/index.json')
	expect(table).toContain('href="/versions"')
	const welcome = renderPage('/installation')
	expect(welcome).toContain('Installation guidée')
	expect(welcome).toContain('href="/downloads"')
	expect(welcome).toContain('href="#aide"')
	expect(welcome).not.toContain('<progress')
	expect(publicMetadata.some(page => page.path === '/downloads' && page.indexable)).toBe(true)
})
test('private data, shared links and account routes are excluded from indexing and static rendering', () => {
	for (const path of [
		'/gallery',
		'/account',
		'/viewer',
		'/viewer?memory=private-id',
		'/share/private-token',
		'/public/publication-id',
		'/moderation',
		'/admin',
		'/admin/diagnostics',
		'/admin/users',
		'/admin/moderation',
		'/login',
		'/register',
	]) {
		expect(metadataFor(path).indexable).toBe(false)
		expect(publicMetadata.some(page => page.path === path)).toBe(false)
	}
	expect(metadataFor('/faq/')).toEqual(metadataFor('/faq'))
})

test('the public gallery prerenders the real catalogue shell and keeps demo opt-in', () => {
	const html = renderPage('/explore')
	expect(html).toContain('Des lieux à visiter')
	expect(html).toContain('/explore?demo=1')
	expect(html).not.toContain('/ranking')
})
