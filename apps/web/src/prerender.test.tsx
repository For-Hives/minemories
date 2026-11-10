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
test('the installation guide is visible HTML from top to bottom, with no noscript and no pause-menu button', () => {
	const html = renderPage('/installation')
	expect(html).not.toContain('<noscript>')
	expect(html).toContain('Le plus simple : l’app CurseForge')
	expect(html).toContain('Tu joues sans mods ?')
	expect(html).toContain('<table')
	expect(html).toContain('href="/downloads"')
	expect(html).toContain('href="/gallery"')
	expect(html).toContain('M → Mes souvenirs → Envoyer ce souvenir.')
	expect(html).not.toMatch(/menu pause|<progress|\/minemories export/)
})
test('/versions prerenders the curated notes of the latest release and the earlier ones, no API needed', () => {
	const html = renderPage('/versions')
	expect(html).toContain('Les nouveautés de Minemories')
	expect(html).toContain('Minemories 0.37.0-beta.1')
	expect(html).toContain('Ce qui change pour toi')
	expect(html).toContain('id="v0.36.1-beta.1"')
	expect(html).toContain('href="/downloads"')
	expect(html).not.toContain('href="/changelog')
	expect(html).not.toContain('<noscript>')
})
test('the download table renders without JavaScript: Java column and a link per published JAR', () => {
	const table = renderPage('/downloads')
	expect(table).toContain('<h1')
	expect(table).toContain('Télécharger Minemories')
	expect(table).toContain('<table')
	expect(table).toContain('scope="col">Java</th>')
	expect(table).toContain('scope="row"')
	expect(table).not.toContain('<noscript>')
	expect(table).toContain('/downloads/neoforge-mc1.21.1/latest')
	expect(table).toContain('/downloads/fabric-mc26.3/latest')
	expect(table).toContain('href="/versions"')
	expect(table).toContain('href="/installation"')
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
