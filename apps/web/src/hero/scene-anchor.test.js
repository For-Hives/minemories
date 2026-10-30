// The vendored film (scene.js) is touched in exactly three places for the optimised delivery of the captures
// (docs/features/film-assets-pipeline.md). If a re-import of the prototype drops one, the film silently goes back to
// downloading the full GLB files: this test makes that loud.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const source = readFileSync(new URL('./scene.js', import.meta.url), 'utf8')
const hero = readFileSync(new URL('./hero.js', import.meta.url), 'utf8')
const count = (text, needle) => text.split(needle).length - 1

test('scene.js routes every capture download through the host-supplied fetcher', () => {
	expect(source).toContain('let glbFetcher = null')
	// first statement of the one download function the captures go through
	expect(source).toMatch(/async function fetchGlb\(base, name\) \{\n\tif \(glbFetcher\) return glbFetcher\(base, name\)\n/)
	expect(count(source, 'fetch(url)')).toBe(1) // the plain download inside fetchGlb, the only one
})

test('the fetcher option is set when the film mounts and cleared when it is disposed', () => {
	expect(source).toContain('fetchGlb: null, // (base URL, name)')
	expect(source).toContain('glbFetcher = o.fetchGlb ?? null // hero-assets anchor')
	expect(source).toContain('glbFetcher = null // hero-assets anchor')
})

test('every capture is downloaded by fetchGlb and nowhere else', () => {
	const downloads = source.match(/\bfetchGlb\(/g) ?? []
	// the declaration, loadGlb (S0, personnages) and the S1..S4 loop
	expect(downloads.length).toBe(3)
	expect(source).toContain('await fetchGlb(base, name)')
	expect(source).toContain('settle(fetchGlb(CAPTURES, name))')
})

test('hero.js hands the host fetcher to the scene', () => {
	expect(hero).toContain('fetchGlb: host.fetchGlb ?? null')
})
