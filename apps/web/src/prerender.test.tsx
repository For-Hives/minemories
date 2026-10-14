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
test('private data, shared links and account routes are excluded from indexing and static rendering', () => {
	for (const path of [
		'/gallery',
		'/viewer',
		'/viewer?memory=private-id',
		'/share/private-token',
		'/login',
		'/register',
	]) {
		expect(metadataFor(path).indexable).toBe(false)
		expect(publicMetadata.some(page => page.path === path)).toBe(false)
	}
	expect(metadataFor('/blog/')).toEqual(metadataFor('/blog'))
})
