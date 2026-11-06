import { expect, test } from 'vitest'
import { publicMetadata, renderPage } from './prerender'
import { metadataFor } from './route-metadata'

test('all public routes render readable content and navigation without browser APIs or JavaScript', () => {
	for (const page of publicMetadata) {
		const html = renderPage(page.path)
		expect(html).toContain('<h1')
		expect(html).toContain('href="/installation"')
		expect(html).not.toContain('<!--$!-->')
	}
	expect(renderPage('/blog/premier-souvenir')).toContain('Un premier souvenir')
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
test('release history and changelog render headings, navigation and a direct API index link without JavaScript', () => {
	for (const path of ['/versions', '/changelog']) {
		const html = renderPage(path)
		expect(html).toContain('href="/versions"')
		expect(html).toContain('href="/changelog"')
		expect(html).toContain('/downloads/index.json')
		expect(html).toContain('<noscript>')
		expect(html).not.toContain('Minemories 0.2.')
	}
	expect(renderPage('/versions')).toContain('Versions du mod')
	expect(renderPage('/changelog')).toContain('Les nouveautés')
})
test('the download table and the guide welcome render without JavaScript, with the two ways in', () => {
	const table = renderPage('/downloads')
	expect(table).toContain('<h1')
	expect(table).toContain('Tous les téléchargements')
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
	expect(metadataFor('/blog/')).toEqual(metadataFor('/blog'))
})

test('public ranking prerenders the real catalogue shell and keeps demo opt-in', () => {
	const html = renderPage('/ranking')
	expect(html).toContain('Les coups de cœur')
	expect(html).toContain('/ranking?demo=1')
	expect(html).not.toContain('Les coups de cœur, pour essayer')
})
