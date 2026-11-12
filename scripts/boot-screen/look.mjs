// What the loading screen looks like and how it is timed, shared by the generator (gen.mjs, which writes index.html) and the viewer's stage loader
// (apps/web/src/components/ChunkLoader.tsx): no Node API here, so the browser can import it.
import { SITE_HASHES } from '../../apps/web/src/hero/phase.js'
import { bootRandom } from './chunk-screen.mjs'

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
export const SHARES = [26, 52, 77, 64, 37]
/** Chunk map: not started, started, the blue and green rings, finishing (the reference's light-grey speckles, about #ddd), loaded. */
export const MAP_COLORS = [
	[0, 0, 0],
	[153, 153, 153],
	[49, 47, 124],
	[47, 174, 28],
	[221, 221, 221],
	[255, 255, 255],
]
export const SEED = 0x6d6d6c73

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

/**
 * What the inline script receives: the map size and seed, the colours, the anchors that open on the site (phase.js), the timings (ms: `quick` is
 * the fill on such a link and on a viewer, `viewerStop` the viewers' safety stop) and the recentring (the player starts `from` cells off the
 * centre, down and left as in the reference, and the view recentres from `at` of the fill). The tile is read back from the CSS (it is in the page once).
 */
export function bootConfig() {
	const timings = {
		lead: 350,
		fill: 4000,
		quick: 1200,
		catchup: 2000,
		hold: 400,
		out: 1100,
		pop: 200,
		stop: 20000,
		viewerStop: 180000,
	}
	return { n: 38, seed: SEED, colors: MAP_COLORS, at: 0.13, sections: SITE_HASHES, ...timings }
}
