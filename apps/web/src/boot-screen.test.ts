import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

// Loading screen: the chunk-loading screen lives in index.html (it shows before any JavaScript), written by scripts/boot-screen/gen.mjs (whose own tests,
// scripts/boot-screen/gen.test.mjs, cover its behaviour); these guards keep it from blocking the page, leaking a game file or weighing more than planned.
// The script is squeezed (no space next to an operator or a bracket), hence the code below written without those spaces.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const blocks = html.match(/<!-- boot:begin -->.*?<!-- boot:end -->/gs) ?? []

test('the loading screen is self-contained, labelled and cannot trap the visitor', () => {
	expect(blocks).toHaveLength(3)
	expect(html).toContain('<div id="boot" role="status">')
	expect(html).toContain('Loading Minemories')
	expect(html).toContain('Chargement de Minemories')
	expect(html).toContain('<div class="boot-map" aria-hidden="true">') // the percentage and the map are decoration: the status text is what is announced
	expect(html).not.toMatch(/(?:src|href)="https?:/) // no external resource
	expect(html).toContain('<div id="app"></div>') // the prerender replaces this exact string
	expect(html.indexOf('id="boot"')).toBeLessThan(html.indexOf('<div id="app"></div>')) // outside #app: hydration is untouched
	expect(html).toMatch(/b-max \.3s ease-in 20s forwards/) // hard stop without JavaScript: hidden after 20 s whatever happens
	expect(html).toContain('"stop":20000') // and the same stop in the script
	expect(html).toContain("win.addEventListener('load',onLoad,{signal:listen.signal})") // gone once the page has loaded AND the app says it is on screen
	expect(html).toContain("win.addEventListener('mm:ready',onReady,{signal:listen.signal})")
	expect(html).toContain("win.addEventListener('mm:boot-progress',onProgress,{signal:listen.signal})") // the app's milestones (lib/boot-progress.ts)
	expect(html).toContain('listen.abort()') // and once gone, no listener keeps it in memory
	expect(html).toContain("if(win.location.pathname!=='/'){\nboot.remove()") // the landing's only (the prerender also drops it from every other page)
	expect(html).toContain('#boot.is-out{background:none;pointer-events:none}') // the reveal never catches a click
})

test('the loading screen stays small and uses no game texture', () => {
	const bytes = blocks.reduce((total, block) => total + Buffer.byteLength(block), 0)
	expect(bytes).toBeLessThan(12_000)
	const images = blocks.join('').match(/data:image\/png;base64,[A-Za-z0-9+/=]+/g) ?? []
	expect(images).toHaveLength(1) // our own 16 x 16 dirt tile, once (the script reads it back from the CSS), nothing more
	expect(images[0]?.length).toBeLessThan(600)
	expect(html).not.toMatch(/<image\b/) // no embedded sprite sheet
})

test('the loading screen covers the page from the first paint, always plays its full fill, and respects reduced motion', () => {
	expect(html).toMatch(/#boot\{position:fixed;inset:0 auto 0 0;width:100vw;[^}]*background:#1f1610;/) // plain dirt colour at once: the landing never flashes before it
	expect(html).toMatch(/#boot::before\{[^}]*animation:b-in \.2s ease-out backwards\}/) // the texture and the map fade in at once
	expect(html).toMatch(/#boot \.boot-map\{[^}]*animation:b-in \.2s ease-out backwards\}/)
	expect(html).toContain('"fill":4000') // every visit sees the map fill over 4 s at least, then the reveal (no fast-load skip)
	expect(html).not.toContain('"show":')
	expect(html).not.toContain('animation-play-state:paused')
	const reduced = html.slice(html.indexOf('@media (prefers-reduced-motion:reduce)'))
	expect(reduced).toContain('#boot *{transition:none!important}') // no scaling map (the script picks a fade over the block reveal)
	expect(html).toContain("matchMedia?.('(prefers-reduced-motion: reduce)')") // no recentring, no block reveal: a short fade instead
	expect(html).not.toMatch(/\b(brightness|filter)\b/) // no flashing
})
