// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { createHeroI18n } from './lib/hero-i18n'
import { firstPaintScripts, renderPage } from './prerender'

test('the prerendered home page holds the whole site and the film markup, with no browser API and no WebGL', () => {
	const html = renderPage('/')
	expect(html).not.toContain('<!--$!-->')
	// the site, in French (the prerender language), readable without JavaScript
	expect(html).toContain('<h1')
	expect(html).toContain('Il y a des soirs qu’on aimerait garder.')
	// the facts of the landing: every published Minecraft version, the M menu button and what leaves after linking
	expect(html).toContain('Java 1.18.2, 1.19.2, 1.20.1, 1.21.1, 1.21.11')
	expect(html).toContain('26.3 en test')
	expect(html).toContain('quand tu cliques sur « Prendre un souvenir » dans le menu M')
	expect(html).toContain('Rien ne part tant que tu n’as pas connecté le jeu à ton compte.')
	expect(html).toContain('Réglages → Confidentialité')
	expect(html).not.toContain('1.21.1 · NeoForge')
	for (const id of ['id="steps"', 'id="share"', 'id="more"', 'id="faq"', 'id="words"']) expect(html, id).toContain(id)
	// the story in words, which is also the description of the canvas for screen readers
	expect(html).toContain('id="w1"')
	// the film's markup and its stylesheet are there for the first paint; the canvas is empty until the film mounts
	expect(html).toContain('id="mm-scene"')
	expect(html).toContain('<style>')
	// real routes, no file next to the page, one language selector, the app's navigation in the footer
	for (const route of [
		'/installation',
		'/privacy',
		'/terms',
		'/legal',
		'/concept',
		'/how-it-works',
		'/faq',
		'/blog',
		'/login',
	])
		expect(html, route).toContain(`href="${route}"`)
	expect(html).not.toMatch(/href="[^"]*\.html"/)
	expect(html.match(/<select/g)).toHaveLength(2) // the header one and the one of the menu of the small screens, which is hidden above 560 px
	// no app header over the film's own one
	expect(html).not.toContain('class="mm-header"')
	// the first-paint script is injected by the prerender, not rendered by React
	expect(html).not.toContain('<script')
	// nothing preloads the still of the model (it only serves when WebGL is absent): React preloads only the bar's logo
	expect([...html.matchAll(/<link rel="preload"[^>]*href="([^"]+)"/g)].map(match => match[1])).toEqual([
		'/brand/minemories-logo.svg',
	])
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

test('the landing’s version line, step and FAQ follow a language change made by the film’s translation bridge', () => {
	document.body.innerHTML = renderPage('/')
	createHeroI18n('en', document).apply()
	const compat = document.querySelector('.mc-hero__compat')?.textContent
	expect(compat).toBe('Java 1.18.2, 1.19.2, 1.20.1, 1.21.1, 1.21.11 · 26.3 in testing')
	const text = document.body.textContent ?? ''
	expect(text).toContain('For Minecraft Java 1.18.2, 1.19.2, 1.20.1, 1.21.1, 1.21.11, with NeoForge, Fabric or Forge')
	expect(text).toContain('26.3 is available for testing, not yet validated in game.')
	expect(text).toContain('or click “Take a memory” in the M menu')
	expect(text).toContain('Nothing leaves your computer until you link the game to your account.')
	document.body.innerHTML = ''
})
