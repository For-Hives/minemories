// Garde-fous de la charte graphique (docs/features/design-system.md) : l'échelle, les cibles et le mouvement ne dérivent pas.
import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8')
const charter = read('./charter.css')
const film = read('./film.css')
const tokens = read('./tokens.css')

const token = name => [...tokens.matchAll(new RegExp(`${name}:\\s*(\\d+)px`, 'g'))].map(m => Number(m[1]))

test('the type scale only uses the pixel font\'s multiples of 8 px, and nothing above 40 px', () => {
	const sizes = [...tokens.matchAll(/--ds-fs-[a-z0-9]+:\s*(\d+)px/g)].map(m => Number(m[1]))
	expect(sizes.length).toBe(8) // xs, md, lead, h3, h2, h1 (+ the h1 and lead desktop steps)
	for (const size of sizes) {
		expect(size % 8, `${size}px`).toBe(0)
		expect(size).toBeLessThanOrEqual(40)
	}
	expect(Math.min(...token('--ds-fs-md'))).toBe(16)
})

test('the reading voice (sans-serif) has its own small scale, 16 to 20 px, set apart from the pixel scale', () => {
	const sizes = [...tokens.matchAll(/--ds-rd-fs(?:-[a-z]+)?:\s*(\d+)px/g)].map(m => Number(m[1]))
	expect(sizes.length).toBeGreaterThanOrEqual(5)
	for (const size of sizes) expect(size).toBeLessThanOrEqual(20)
	expect(Math.min(...token('--ds-rd-fs-sm'))).toBe(16)
	expect(tokens).toContain('--ds-f-text: var(--f-legible)')
	// the Unifont pages keep the pixel font for running text
	expect(charter).toContain(':not(.mm-cjk):not([data-mc-font=\'read\'])')
})

test('line heights stay on the 8 px grid and above 1.2', () => {
	const pairs = [...tokens.matchAll(/--ds-fs-([a-z0-9]+):\s*(\d+)px;[^\n]*\n\s*--ds-lh-\1:\s*(\d+)px/g)]
	expect(pairs.length).toBeGreaterThanOrEqual(5)
	for (const [, name, fs, lh] of pairs) {
		expect(Number(lh) % 8, name).toBe(0)
		expect(Number(lh) / Number(fs), name).toBeGreaterThanOrEqual(1.2)
	}
})

test('touch targets are 44 px and the motion tokens are the three durations and two curves', () => {
	expect(token('--ds-hit')).toEqual([44])
	expect(token('--ds-dur-1')).toEqual([]) // durations are written in ms, not px
	expect([...tokens.matchAll(/--ds-dur-\d:\s*(\d+)ms/g)].map(m => Number(m[1]))).toEqual([120, 200, 360])
	expect([...tokens.matchAll(/--ds-ease[a-z-]*:/g)]).toHaveLength(2)
})

test('the shared components read tokens: no hard-coded font size, duration or easing in charter.css, except the Unifont steps', () => {
	const css = charter.replace(/\/\*[\s\S]*?\*\//g, '')
	const hardSizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map(m => m[1])
	expect(new Set(hardSizes)).toEqual(new Set(['32', '16'])) // coréen et japonais (Unifont), seules tailles nettes
	expect(css).not.toMatch(/\d+ms\b/)
	expect(css).not.toMatch(/cubic-bezier/)
	expect(css).toContain('--ds-reveal-y')
})

test('the retired desktop rules (24 px running text, 48 px section titles) are gone from the kit', () => {
	expect(film).not.toMatch(/^\t?\.site \.mc-section__title \{\s*font-size: 48px/m)
	expect(film).not.toMatch(/\.mc-section \{\s*padding-block: 64px/)
	expect(film).not.toContain('v11b (item 5): on a desktop (>= 1280 px) the running text')
})

test('reduced motion switches the entries, the transitions and the displacement off, and content is visible without the data-reveal switch', () => {
	expect(charter).toContain('prefers-reduced-motion: reduce')
	expect(charter).toContain("html[data-mc-motion='reduced']")
	expect(charter).toMatch(/#site\[data-reveal='on'\] \.ds-reveal:not\(\.is-in\) \{\s*opacity: 0;/)
	// the hiding rule exists only behind the attribute that reveal.ts sets: nothing else hides .ds-reveal
	expect(charter.replace(/#site\[data-reveal='on'\][^{]*\{[^}]*\}/g, '')).not.toMatch(/opacity:\s*0\b/)
})
