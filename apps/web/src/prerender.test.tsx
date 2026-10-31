import { expect, test } from 'vitest'
import { publicMetadata, renderPage } from './prerender'
import { metadataFor } from './route-metadata'

test('the landing is the only public route: it renders readable content and the code and releases links without browser APIs', () => {
	expect(publicMetadata.map(page => page.path)).toEqual(['/'])
	const html = renderPage('/')
	expect(html).toContain('<h1')
	expect(html).toContain('href="https://github.com/For-Hives/minemories/releases"')
	expect(html).not.toContain('<!--$!-->')
})
test('the 404 page is readable, points back home and holds no film', () => {
	const html = renderPage('/404')
	expect(html).toContain('<h1')
	expect(html).toContain('href="/"')
	expect(html).not.toContain('id="mm-scene"')
})
test('archived routes are not indexable and are not prerendered', () => {
	for (const path of ['/gallery', '/viewer', '/share/token', '/installation', '/faq', '/blog/', '/login']) {
		expect(metadataFor(path).indexable).toBe(false)
		expect(publicMetadata.some(page => page.path === path)).toBe(false)
	}
})
