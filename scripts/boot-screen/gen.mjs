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
	bootPace,
	bootRandom,
	bootRoute,
	bootScreen,
	bootTarget,
	dissolvePlan,
	inFront,
	mapDepth,
	mapLevels,
	mapPlan,
	mapSides,
	mapSize,
	mapSpeck,
	paintMap,
	popTile,
} from './chunk-screen.mjs'
import { bootConfig, DIRT, dirtTile, SEED } from './look.mjs'

export { bootConfig, DIRT, dirtTile, MAP_COLORS } from './look.mjs'

export const target = fileURLToPath(new URL('../../apps/web/index.html', import.meta.url))

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

/**
 * The spaces next to an operator or a bracket, outside string and template literals, dropped: `a = b + c` becomes `a=b+c`. A space between two `+`
 * or two `-` (`a + +b`) or that would start or end a comment stays. Line breaks stay too (the code relies on them, never on indentation).
 */
export function squeeze(code) {
	let out = ''
	let quote = ''
	for (let i = 0; i < code.length; i++) {
		const ch = code[i]
		const pair = `${out.at(-1)}${code[i + 1]}`
		if (quote && ch === '\\') {
			out += ch + code[i + 1]
			i++
			continue
		}
		if (quote && ch === quote) quote = ''
		else if (!quote && `'"\``.includes(ch)) quote = ch
		else if (!quote && ch === ' ' && SQUEEZABLE.test(pair) && !KEEP.includes(pair)) continue
		out += ch
	}
	return out
}
const SQUEEZABLE = /[=+\-*/%<>!&|?:,;{}()[\]]/
const KEEP = ['++', '--', '//', '/*', '*/']

/** The runtime functions as one inline script: indentation and whole-line comments removed (the code relies on line breaks, never on indentation), then squeezed. */
export function inlineRuntime(config) {
	// in dependency order; each one is a plain function declaration, so the inline copies call each other by name
	const functions = [
		bootRandom,
		mapPlan,
		mapSize,
		mapSides,
		inFront,
		mapDepth,
		mapSpeck,
		mapLevels,
		paintMap,
		bootTarget,
		bootPace,
		dissolvePlan,
		popTile,
		bootFade,
		bootDissolve,
		bootRoute,
		bootScreen,
	]
	const source = functions.map(fn => fn.toString()).join('\n')
	const compact = squeeze(source.replace(/^\t+/gm, '').replace(/^\/\/.*\n/gm, ''))
	return `<script>!function(){${compact}\nbootScreen(document,window,${JSON.stringify(config)})}()</script>`
}

/**
 * The scale var(--c) is one map cell and one dirt texel (3 px up to 900 px of height, then 4, then 5), like the game's interface scale: the tile is
 * 16 of them. #boot itself is plain dirt colour from the first paint (the page under it never flashes); the texture (::before) and the map fade in over
 * 200 ms. The game font is drawn in whole pixels only at multiples of 8 px (128 units per texel, 1024 per em): 8 px at the 720p scale, like the capture's
 * "100%", then 16 px.
 */
export function bootBlocks() {
	const config = bootConfig()
	const { n } = config
	const tile = tilePng(dirtTile(SEED), DIRT)
	const style = [
		"@font-face{font-family:'MM Boot';font-display:block;src:url(/hero/assets/mc/fonts/mm-minecraft-regular.woff2) format('woff2')}",
		'#boot{position:fixed;inset:0 auto 0 0;width:100vw;z-index:2147483000;display:grid;place-items:center;overflow:hidden;--c:3px;--f:8px;background:#1f1610;image-rendering:pixelated;animation:b-max .3s ease-in 20s forwards}',
		'@media (min-height:900px){#boot{--c:4px;--f:16px}}@media (min-height:1300px){#boot{--c:5px}}',
		`#boot::before{content:'';position:absolute;inset:0;background:url(${tile}) 0 0/calc(16 * var(--c));animation:b-in .2s ease-out backwards}`,
		'#boot.is-done{animation:none;opacity:0;transition:opacity .25s ease-out;pointer-events:none}',
		'#boot.is-out{background:none;pointer-events:none}#boot.is-out::before{display:none}',
		'#boot .boot-t{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
		'html[lang^=fr] #boot .boot-en,html:not([lang^=fr]) #boot .boot-fr{display:none}',
		'#boot .boot-map{position:relative;z-index:1;animation:b-in .2s ease-out backwards}',
		`#boot .boot-map canvas{display:block;box-sizing:content-box;width:calc(${n} * var(--c));height:calc(${n} * var(--c));border:2px solid #000;background:#000}`,
		"#boot .boot-pc{position:absolute;left:0;right:0;bottom:100%;margin:0 0 calc(6 * var(--c));font:var(--f)/1 'MM Boot',monospace;color:#fff;text-align:center;text-shadow:calc(var(--f) / 8) calc(var(--f) / 8) 0 #3f3f3f;white-space:nowrap}",
		'#boot .boot-cv{position:absolute;inset:0;width:100%;height:100%}',
		'#boot.is-out .boot-map{opacity:0;transform:scale(1.3);transition:transform .5s cubic-bezier(.5,0,.75,.2),opacity .35s ease-in .15s}',
		'#boot.is-out .boot-pc{opacity:0;transition:opacity .12s ease-in}',
		'@keyframes b-in{from{opacity:0}}@keyframes b-max{to{opacity:0;visibility:hidden}}',
		'@media (prefers-reduced-motion:reduce){#boot *{transition:none!important}}',
	].join('')
	const markup = [
		'<div id="boot" role="status">',
		'<span class="boot-t boot-en">Loading Minemories…</span><span class="boot-t boot-fr">Chargement de Minemories…</span>',
		`<div class="boot-map" aria-hidden="true"><p class="boot-pc">0%</p><canvas width="${3 * n}" height="${3 * n}"></canvas></div>`,
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
