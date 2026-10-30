import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

// Chargement : le mineur en SVG vit dans index.html (il s'affiche avant tout JavaScript) ; ces garde-fous évitent qu'il bloque la page ou pèse plus que prévu.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

test('the loading screen is self-contained, labelled and cannot trap the visitor', () => {
	expect(html).toContain('<div id="boot" role="status">')
	expect(html).toContain('Chargement')
	expect(html).not.toMatch(/(?:src|href)="https?:/) // no external resource
	expect(html).toContain('<div id="app"></div>') // the prerender replaces this exact string
	expect(html.indexOf('id="boot"')).toBeLessThan(html.indexOf('<div id="app"></div>')) // outside #app: hydration is untouched
	expect(html).toMatch(/b-max \.3s ease-in 20s forwards/) // hard stop: hidden after 20 s whatever happens
	expect(html).toContain('setTimeout(h,20000)')
	expect(html).toContain("addEventListener('load',function(){l=1;g()})") // gone once the page has loaded AND the app says it is on screen
	expect(html).toContain("addEventListener('mm:ready'")
	expect(html.length).toBeLessThan(45_000)
})

test('the loading screen only appears if the page is slow, and respects reduced motion', () => {
	expect(html).toMatch(/animation:b-in \.2s ease-out \.25s forwards/) // invisible during the first 250 ms
	const reduced = html.slice(html.indexOf('@media (prefers-reduced-motion:reduce)'))
	expect(reduced).toContain('#boot *{animation:none!important}')
	expect(html).not.toMatch(/\b(brightness|filter)\b/) // no flashing
})
