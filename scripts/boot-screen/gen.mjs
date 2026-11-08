#!/usr/bin/env node
// Generates the landing's loading screen and writes it into apps/web/index.html, between the three <!-- boot:begin --> / <!-- boot:end --> pairs
// (the <style> at the end of <head>, the #boot markup before <div id="app"></div>, the script before the main.tsx module).
//
// A world-loading screen in the spirit of the game's: a dark dirt background, a chunk map that fills from the centre with its percentage above it,
// then the background leaves block by block from the map outwards and reveals the film (docs/features/landing-film.md, "Loading screen").
// Everything is our own: the 16 x 16 dirt tile is drawn here from a seeded PRNG and a palette sampled from a menu screenshot (no game file is read),
// the map is a canvas the inline script paints. The only shared asset is the site's game font, already preloaded by index.html.
//
// Usage (from the repo root, with Node, not Bun): node scripts/boot-screen/gen.mjs (or bun run boot:screen)   writes apps/web/index.html
//                             node scripts/boot-screen/gen.mjs --check    fails if apps/web/index.html is not what this script writes
// Deterministic: the same script always writes the same bytes. The archived Steve loader lives in scripts/boot-screen/legacy/.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import {
	bootDissolve,
	bootFade,
	bootRandom,
	bootScreen,
	bootTarget,
	cellLevel,
	dissolvePlan,
	mapLevels,
	mapNoise,
	paintMap,
	popTile,
} from './chunk-screen.mjs'

export const target = fileURLToPath(new URL('../../apps/web/index.html', import.meta.url))

/**
 * Menu-darkened dirt, from the darkest to a rare light pebble: the brightness quantiles of a 720p capture of the game's world-loading screen (mean about
 * #1f1610), in equal steps on the three channels (the capture's spread is the same on red, green and blue, so the shades never drift redder).
 */
export const DIRT = [
	[23, 14, 8],
	[27, 18, 12],
	[31, 22, 16],
	[35, 26, 20],
	[39, 30, 24],
	[45, 36, 30],
]
/** How many of the tile's 256 texels take each shade but the pebble (darkest first): the capture's brightness histogram. */
const SHARES = [26, 52, 77, 64, 37]
/** Chunk map: not started, started, the two rings, loaded. */
export const MAP_COLORS = [
	[0, 0, 0],
	[153, 153, 153],
	[49, 47, 124],
	[47, 174, 28],
	[255, 255, 255],
]
const SEED = 0x6d6d6c73

/**
 * Our own 16 x 16 dirt tile (palette indices, row by row): a smooth 8 x 8 noise (bilinear, wrapped so the tile repeats seamlessly) mixed half and half
 * with per-texel grain, so the shades gather in small clumps like soil rather than salt and pepper (more of the smooth noise shows the tile's repeat). The texels are ranked and given the shades in the capture's
 * proportions (SHARES), then a few pebbles with a shadow one texel down and right.
 */
export function dirtTile(seed) {
	const rand = bootRandom(seed)
	const coarse = Array.from({ length: 64 }, () => rand())
	const at = (x, y) => coarse[(y & 7) * 8 + (x & 7)]
	const values = []
	for (let i = 0; i < 256; i++) {
		const x = (i & 15) / 2
		const y = (i >> 4) / 2
		const fx = x - Math.floor(x)
		const fy = y - Math.floor(y)
		const [x0, y0] = [Math.floor(x), Math.floor(y)]
		const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx
		const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx
		values.push((top * (1 - fy) + bottom * fy) * 0.5 + rand() * 0.5)
	}
	const order = [...values.keys()].sort((a, b) => values[a] - values[b] || a - b)
	const tile = new Uint8Array(256)
	let rank = 0
	for (let shade = 0; shade < SHARES.length; shade++)
		for (let k = 0; k < SHARES[shade]; k++) tile[order[rank++]] = shade
	for (let k = 0; k < 4; k++) {
		const i = Math.floor(rand() * 256)
		tile[i] = 5
		tile[(i + 17) & 255] = 0 // its shadow, one texel down and right
	}
	return tile
}

const CRC = Array.from({ length: 256 }, (_, n) => {
	let c = n
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
	return c >>> 0
})
function crc32(bytes) {
	let c = 0xffffffff
	for (const byte of bytes) c = CRC[(c ^ byte) & 255] ^ (c >>> 8)
	return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
	const out = Buffer.alloc(12 + data.length)
	out.writeUInt32BE(data.length, 0)
	out.write(type, 4, 'latin1')
	data.copy(out, 8)
	out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
	return out
}

/** A 16 x 16 indexed PNG of the tile, as a data: URI. */
export function tilePng(tile, palette) {
	const header = Buffer.alloc(13)
	header.writeUInt32BE(16, 0)
	header.writeUInt32BE(16, 4)
	header.set([8, 3, 0, 0, 0], 8) // 8 bits per index, palette colour, no interlace
	const rows = Buffer.alloc(16 * 17)
	for (let y = 0; y < 16; y++) rows.set(tile.subarray(y * 16, y * 16 + 16), y * 17 + 1) // filter byte 0 at the start of each row
	const png = Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', header),
		chunk('PLTE', Buffer.from(palette.flat())),
		chunk('IDAT', deflateSync(rows, { level: 0 })), // stored, not compressed: the same bytes from every zlib (Node, Bun, any CPU), so --check is stable
		chunk('IEND', Buffer.alloc(0)),
	])
	return `data:image/png;base64,${png.toString('base64')}`
}

/** The runtime functions as one inline script: indentation and whole-line comments removed (the code relies on line breaks, never on indentation). */
export function inlineRuntime(config) {
	// in dependency order; each one is a plain function declaration, so the inline copies call each other by name
	const functions = [
		bootRandom,
		mapNoise,
		cellLevel,
		mapLevels,
		paintMap,
		bootTarget,
		dissolvePlan,
		popTile,
		bootFade,
		bootDissolve,
		bootScreen,
	]
	const source = functions.map(fn => fn.toString()).join('\n')
	const compact = source.replace(/^\t+/gm, '').replace(/^\/\/.*\n/gm, '')
	return `<script>!function(){${compact}\nbootScreen(document,window,${JSON.stringify(config)})}()</script>`
}

/** What the inline script receives: the map size and seed, the colours and the timings (ms). The tile is read back from the CSS (it is in the page once). */
export function bootConfig() {
	const timings = { show: 250, least: 700, fill: 300, hold: 150, out: 1100, pop: 200, stop: 20000 }
	return { n: 37, seed: SEED, colors: MAP_COLORS, ...timings }
}

/**
 * The scale var(--c) is one map cell and one dirt texel (3 px up to 900 px of height, then 4, then 5), like the game's interface scale: the tile is
 * 16 of them. #boot itself is plain dirt colour from the first paint (the page under it never flashes); the texture (::before) and the map fade in after
 * 250 ms. The game font is drawn in whole pixels only at multiples of 8 px (128 units per texel, 1024 per em): 8 px at the 720p scale, like the capture's
 * "100%", then 16 px.
 */
export function bootBlocks() {
	const config = bootConfig()
	const { n } = config
	const tile = tilePng(dirtTile(SEED), DIRT)
	const style = [
		"@font-face{font-family:'MM Boot';font-display:block;src:url(/hero/assets/mc/fonts/mm-minecraft-regular.woff2) format('woff2')}",
		'#boot{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;overflow:hidden;--c:3px;--f:8px;background:#1f1610;image-rendering:pixelated;animation:b-max .3s ease-in 20s forwards}',
		'@media (min-height:900px){#boot{--c:4px;--f:16px}}@media (min-height:1300px){#boot{--c:5px}}',
		`#boot::before{content:'';position:absolute;inset:0;background:url(${tile}) 0 0/calc(16 * var(--c));animation:b-in .2s ease-out .25s backwards}`,
		'#boot.is-done{animation:none;opacity:0;transition:opacity .25s ease-out;pointer-events:none}',
		'#boot.is-out{background:none;pointer-events:none}#boot.is-out::before{display:none}',
		'#boot .boot-t{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
		'html[lang^=fr] #boot .boot-en,html:not([lang^=fr]) #boot .boot-fr{display:none}',
		'#boot .boot-map{position:relative;z-index:1;top:calc(13 * var(--c));animation:b-in .2s ease-out .25s backwards}',
		`#boot .boot-map canvas{display:block;box-sizing:content-box;width:calc(${n} * var(--c));height:calc(${n} * var(--c));border:2px solid #000;background:#000}`,
		"#boot .boot-pc{position:absolute;left:0;right:0;bottom:100%;margin:0 0 calc(6 * var(--c));font:var(--f)/1 'MM Boot',monospace;color:#fff;text-align:center;text-shadow:calc(var(--f) / 8) calc(var(--f) / 8) 0 #3f3f3f;white-space:nowrap}",
		'#boot .boot-cv{position:absolute;inset:0;width:100%;height:100%}',
		'#boot.is-out .boot-map{opacity:0;transform:scale(1.3);transition:transform .5s cubic-bezier(.5,0,.75,.2),opacity .35s ease-in .15s}',
		'#boot.is-out .boot-pc{opacity:0;transition:opacity .12s ease-in}',
		// a fast load fades the cover before the dirt and the map appear: freeze their fade-in (still at 0 during its delay; no effect once it is done)
		'#boot.is-done::before,#boot.is-done .boot-map{animation-play-state:paused}',
		'@keyframes b-in{from{opacity:0}}@keyframes b-max{to{opacity:0;visibility:hidden}}',
		'@media (prefers-reduced-motion:reduce){#boot *{transition:none!important}}',
	].join('')
	const markup = [
		'<div id="boot" role="status">',
		'<span class="boot-t boot-en">Loading Minemories…</span><span class="boot-t boot-fr">Chargement de Minemories…</span>',
		`<div class="boot-map" aria-hidden="true"><p class="boot-pc">0%</p><canvas width="${n}" height="${n}"></canvas></div>`,
		'</div>',
	].join('')
	return { style: `<style>${style}</style>`, markup, script: inlineRuntime(config) }
}

const BLOCK = /<!-- boot:begin -->.*?<!-- boot:end -->/gs

/** index.html with its three boot blocks replaced in place (style, markup, script, in document order). */
export function writeBlocks(html, blocks = bootBlocks()) {
	const parts = [blocks.style, blocks.markup, blocks.script]
	const found = html.match(BLOCK)?.length ?? 0
	if (found !== 3) throw new Error(`index.html must hold exactly three boot blocks, found ${found}`)
	let k = 0
	return html.replace(BLOCK, () => `<!-- boot:begin -->${parts[k++]}<!-- boot:end -->`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	if (process.versions.bun) {
		// Bun hands Function.prototype.toString() its transpiled source, not the file's text: the output would differ from Node's and --check would flap.
		console.error('Run this generator with Node: node scripts/boot-screen/gen.mjs')
		process.exit(1)
	}
	const html = readFileSync(target, 'utf8')
	const next = writeBlocks(html)
	if (process.argv.includes('--check')) {
		if (next !== html) {
			console.error('apps/web/index.html is stale: run `node scripts/boot-screen/gen.mjs`')
			process.exit(1)
		}
		console.log('boot screen up to date')
	} else {
		writeFileSync(target, next)
		const size = bootBlocksSize(next)
		console.log(`boot screen written: ${size} bytes inline`)
	}
}

/** Bytes of the three boot blocks inside a page. */
export function bootBlocksSize(html) {
	return (html.match(BLOCK) ?? []).reduce((total, block) => total + Buffer.byteLength(block), 0)
}
