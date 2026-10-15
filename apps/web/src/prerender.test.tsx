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
test('the manual tutorial includes a complete no-JavaScript path, not only its first interactive step', () => {
	const html = renderPage('/installation')
	expect(html).toContain('<noscript>')
	expect(html).toContain('/minemories export 16')
	expect(html).toContain('Install client')
	expect(html).toContain('capture.glb')
})
test('release history and changelog render headings, navigation and a direct GitHub fallback without JavaScript', () => {
	for (const path of ['/versions', '/changelog']) {
		const html = renderPage(path)
		expect(html).toContain('href="/versions"')
		expect(html).toContain('href="/changelog"')
		expect(html).toContain('https://github.com/For-Hives/minemories/releases')
		expect(html).toContain('<noscript>')
		expect(html).not.toContain('Minemories 0.2.')
	}
	expect(renderPage('/versions')).toContain('Versions du mod')
	expect(renderPage('/changelog')).toContain('Les nouveautés')
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
		'/login',
		'/register',
	]) {
		expect(metadataFor(path).indexable).toBe(false)
		expect(publicMetadata.some(page => page.path === path)).toBe(false)
	}
	expect(metadataFor('/blog/')).toEqual(metadataFor('/blog'))
})

test('public ranking prerenders the real catalogue shell and keeps demo opt-in', () => {
	const html = renderPage('/classement')
	expect(html).toContain('Les coups de cœur')
	expect(html).toContain('/classement?demo=1')
	expect(html).not.toContain('Les coups de cœur, pour essayer')
})
