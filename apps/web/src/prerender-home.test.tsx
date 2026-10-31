// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { firstPaintScripts, renderPage } from './prerender'

test('the prerendered home page holds the whole site and the film markup, with no browser API and no WebGL', () => {
	const html = renderPage('/')
	expect(html).not.toContain('<!--$!-->')
	// the site, in French (the prerender language), readable without JavaScript
	expect(html).toContain('<h1')
	expect(html).toContain('Il y a des soirs qu’on aimerait garder.')
	for (const id of ['id="steps"', 'id="share"', 'id="more"', 'id="faq"', 'id="words"']) expect(html, id).toContain(id)
	// the story in words, which is also the description of the canvas for screen readers
	expect(html).toContain('id="w1"')
	// the film's markup and its stylesheet are there for the first paint; the canvas is empty until the film mounts
	expect(html).toContain('id="mm-scene"')
	expect(html).toContain('<style>')
	// the other pages are archived: the landing links out to the releases and the code, never to a route that no longer exists
	for (const route of [
		'/installation',
		'/privacy',
		'/terms',
		'/legal',
		'/concept',
		'/faq',
		'/blog',
		'/pricing',
		'/login',
		'/register',
		'/explorer',
	])
		expect(html, route).not.toContain(`href="${route}"`)
	expect(html).toContain('href="https://github.com/For-Hives/minemories/releases"')
	expect(html).not.toMatch(/href="[^"]*\.html"/)
	expect(html.match(/<select/g)).toHaveLength(2) // the header one and the one of the menu of the small screens, which is hidden above 560 px
	// no app header over the film's own one
	expect(html).not.toContain('class="mm-header"')
	// the first-paint script is injected by the prerender, not rendered by React
	expect(html).not.toContain('<script')
	// nothing preloads the still of the model (it only serves when WebGL is absent)
	expect(html).not.toContain('rel="preload"')
})

test('the first-paint script of the home page puts the film on <html> before the page is drawn', () => {
	const script = firstPaintScripts['/']
	expect(script).toBeTruthy()
	expect(Object.keys(firstPaintScripts)).toEqual(['/'])
	document.documentElement.className = ''
	new Function(String(script))()
	expect(document.documentElement.dataset.phase).toBe('film')
	expect(document.documentElement.classList.contains('is-scrub')).toBe(true)
	expect(document.documentElement.classList.contains('scene-on')).toBe(true)
	expect(document.body.classList.contains('mc-root')).toBe(true)
})
