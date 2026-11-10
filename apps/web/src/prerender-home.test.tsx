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
	expect(html).toMatch(/<h1[^>]*>Garde tes constructions Minecraft en 3D<\/h1>/)
	// the facts of the landing: every published Minecraft version (never a range), the guarantees, the M menu button and the three questions
	expect(html).toContain('Minecraft Java 1.18.2, 1.19.2, 1.20.1, 1.21.1, 1.21.11')
	expect(html).toContain('26.3 expérimentale')
	expect(html).toContain('Fabric, Forge, NeoForge · solo et serveurs · bêta')
	expect(html).toContain('Rien ne part avant que tu connectes le jeu')
	expect(html).toContain('Appuie sur M → Prendre un souvenir.')
	// the pictures of the share and server-closing sections, in French, with their real frames
	expect(html).toContain('Souvenir gardé et envoyé\u00a0!')
	expect(html).toContain('[Server] Le serveur ferme le 1er décembre.')
	for (const image of ['/hero/illus/share-link.webp', '/hero/illus/postcard.webp', '/hero/illus/closing.webp'])
		expect(html).toContain(image)
	expect(html).toContain('Il faut un compte ?')
	expect(html).toContain('href="/faq"')
	for (const blocked of ['validé', 'en test', '→ 1.21', 'gratuit', 'open source', 'la plus utilisée'])
		expect(html, blocked).not.toContain(blocked)
	expect(html).not.toContain('1.21.1 · NeoForge')
	// the full trademark notice in the footer, and the connection path through the M menu
	expect(html).toContain(
		'Minemories n’est pas un produit officiel Minecraft. Ni approuvé par Mojang ou Microsoft, ni associé à eux.'
	)
	expect(html).not.toContain('/minemories pair')
	for (const id of ['id="steps"', 'id="share"', 'id="faq"', 'id="words"']) expect(html, id).toContain(id)
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
		'/sharing',
		'/server-closing',
		'/safety',
		'/guides/minecraft-blender',
		'/login',
	])
		expect(html, route).toContain(`href="${route}"`)
	expect(html).not.toMatch(/href="[^"]*\.html"/)
	// One language picker, closed (the phones' panel draws its own only while open); every menu of the bar is in the page, closed.
	expect(html).not.toContain('<select')
	expect(html.match(/role="listbox"/g)).toHaveLength(1)
	expect(html.match(/aria-expanded="true"/g)).toBeNull()
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

test('the landing’s facts, guarantees and cards follow a language change made by the film’s translation bridge', () => {
	document.body.innerHTML = renderPage('/')
	createHeroI18n('en', document).apply()
	const lines = [...document.querySelectorAll('.mc-hero__compat')].map(line => line.textContent)
	expect(lines).toEqual([
		'Minecraft Java 1.18.2, 1.19.2, 1.20.1, 1.21.1, 1.21.11 · 26.3 experimental · Fabric, Forge, NeoForge · single player and servers · beta',
		'Does not change your world · Nothing leaves before you connect the game · Private gallery',
	])
	const text = document.body.textContent ?? ''
	expect(text).toContain('The mod keeps the area around you in 3D.')
	expect(text).toContain('Press M → Take a memory. Otherwise, the mod takes one on its own when you stay AFK.')
	expect(text).toContain('Show it to the group')
	document.body.innerHTML = ''
})
