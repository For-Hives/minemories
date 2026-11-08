import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { inflateSync } from 'node:zlib'
import { bootScreen, bootTarget, dissolvePlan, mapLevels, mapNoise, paintMap, popTile } from './chunk-screen.mjs'
import {
	bootBlocks,
	bootBlocksSize,
	bootConfig,
	DIRT,
	dirtTile,
	MAP_COLORS,
	target,
	tilePng,
	writeBlocks,
} from './gen.mjs'

const N = 37
const noise = mapNoise(N, 7)
const levelAt = (levels, x, y) => levels[y * N + x]

test('index.html holds exactly what the generator writes, and writing twice changes nothing', () => {
	const html = readFileSync(target, 'utf8')
	assert.equal(writeBlocks(html), html, 'apps/web/index.html is stale: run `node scripts/boot-screen/gen.mjs`')
	assert.equal(writeBlocks(writeBlocks(html)), html)
	assert.ok(bootBlocksSize(html) < 12_000, `inline boot screen too large: ${bootBlocksSize(html)} bytes`)
	assert.throws(() => writeBlocks('<html></html>'), /exactly three boot blocks, found 0/)
})

test('the generated blocks: style first, markup, then the script that runs the screen', () => {
	const { style, markup, script } = bootBlocks()
	assert.match(style, /^<style>@font-face\{font-family:'MM Boot'/)
	assert.match(markup, /^<div id="boot" role="status">/)
	assert.match(script, /^<script>!function\(\)\{function bootRandom/)
	assert.match(script, /bootScreen\(document,window,\{"n":37,/)
	assert.doesNotMatch(script, /^\t/m) // indentation removed
	assert.doesNotMatch(`${style}${script}`, /\bfilter\b/)
})

test('the dirt tile is our own, seeded and dark like the reference menu background', () => {
	const tile = dirtTile(42)
	assert.deepEqual(tile, dirtTile(42))
	assert.notDeepEqual(tile, dirtTile(43))
	assert.equal(tile.length, 256)
	assert.ok(tile.every(index => index < DIRT.length))
	assert.equal(new Set(tile).size, DIRT.length) // every shade is used
	const mean = [0, 1, 2].map(c => tile.reduce((sum, index) => sum + DIRT[index][c], 0) / 256)
	const spread = [0, 1, 2].map(c =>
		Math.sqrt(tile.reduce((sum, index) => sum + (DIRT[index][c] - mean[c]) ** 2, 0) / 256)
	)
	// mean colour and spread of the 720p capture of the game's dirt background (build/ref/f3.png): (31.5, 22.5, 16.4), 5.0 on every channel
	const reference = [31.5, 22.5, 16.4]
	for (const c of [0, 1, 2]) {
		assert.ok(Math.abs(mean[c] - reference[c]) < 1.5, `channel ${c}: mean ${mean[c]}`)
		assert.ok(Math.abs(spread[c] - 5) < 1, `channel ${c}: spread ${spread[c]}`)
	}
})

test('the dirt gathers in clumps: neighbouring texels are closer in shade than random ones', () => {
	const tile = dirtTile(0x6d6d6c73)
	let near = 0
	let any = 0
	for (let i = 0; i < 256; i++) {
		near += Math.abs(tile[i] - tile[(i & 240) | ((i + 1) & 15)]) + Math.abs(tile[i] - tile[(i + 16) & 255]) // right and down, wrapped
		for (let j = 0; j < 256; j++) any += Math.abs(tile[i] - tile[j])
	}
	assert.ok(near / 512 < (any / 65536) * 0.95, `neighbours ${near / 512} vs any two texels ${any / 65536}`)
})

test('the tile PNG is a valid 16 x 16 indexed image of exactly that tile', () => {
	const tile = dirtTile(1)
	const png = Buffer.from(tilePng(tile, DIRT).split(',')[1], 'base64')
	assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
	assert.equal(png.readUInt32BE(16), 16)
	assert.equal(png.readUInt32BE(20), 16)
	const idat = png.indexOf('IDAT')
	const rows = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)))
	for (let y = 0; y < 16; y++)
		assert.deepEqual([...rows.subarray(y * 17 + 1, y * 17 + 17)], [...tile.subarray(y * 16, y * 16 + 16)])
})

test('the chunk map is black at 0 %, an exact square of rings at 100 %, and only ever moves forward', () => {
	assert.ok(mapLevels(0, N, noise).every(level => level === 0))
	const full = mapLevels(1, N, noise)
	assert.equal(levelAt(full, 18, 18), 4)
	assert.equal(levelAt(full, 28, 18), 4) // the white core reaches 10 cells from the centre
	assert.equal(levelAt(full, 29, 18), 3) // then one green ring
	assert.equal(levelAt(full, 18, 30), 2) // one blue ring
	assert.equal(levelAt(full, 0, 0), 1) // and grey to the border
	assert.equal(levelAt(full, 31, 5), 1)
	let previous = mapLevels(0, N, noise)
	for (let p = 0.01; p <= 1.0001; p += 0.01) {
		const levels = mapLevels(p, N, noise)
		for (let i = 0; i < levels.length; i++) assert.ok(levels[i] >= previous[i], `cell ${i} went back at ${p}`)
		previous = levels
	}
	assert.deepEqual(mapLevels(2, N, noise), full)
})

test('while loading, the map edges are jagged and the grey area fills the map before the core does', () => {
	const levels = mapLevels(0.4, N, noise)
	assert.ok(levels.some(level => level === 4))
	const widths = new Set([...Array(N).keys()].map(y => whiteInRow(levels, y)))
	assert.ok(widths.size > 3, `the white core should not be a clean square at 40 %: ${[...widths]}`)
	const started = levels.reduce((sum, level) => sum + (level > 0 ? 1 : 0), 0)
	assert.ok(started > N * N * 0.8, `grey should cover most of the map at 40 %: ${started}`)
	assert.ok(levels.some(level => level === 1))
})

function whiteInRow(levels, y) {
	let white = 0
	for (let x = 0; x < N; x++) if (levelAt(levels, x, y) === 4) white++
	return white
}

test('paintMap writes one opaque pixel per cell in the level colours', () => {
	const image = { data: new Uint8ClampedArray(3 * 4) }
	paintMap(image, Uint8Array.from([0, 2, 4]), MAP_COLORS)
	assert.deepEqual([...image.data], [0, 0, 0, 255, 49, 47, 124, 255, 255, 255, 255, 255])
})

test('the estimate moves without the app, follows its milestones, and never reaches 100 % alone', () => {
	assert.equal(bootTarget(0, 0, 0), 0)
	assert.ok(bootTarget(3000, 0, 3000) > 0.3)
	assert.ok(bootTarget(600_000, 0, 600_000) <= 0.95)
	assert.ok(bootTarget(600_000, 0.8, 600_000) <= 0.95)
	assert.ok(bootTarget(100, 0.5, 0) >= 0.5) // a milestone is a floor
	assert.ok(bootTarget(100, 0.5, 2000) > bootTarget(100, 0.5, 500)) // and the bar creeps on from it
})

test('the reveal starts at the chunk map and spreads outwards, inside its time span', () => {
	const cols = 20
	const rows = 12
	const plan = dissolvePlan(cols, rows, 10, 6, 3, 0.8)
	assert.deepEqual(plan, dissolvePlan(cols, rows, 10, 6, 3, 0.8))
	assert.ok(plan.every(start => start >= 0 && start <= 0.8))
	const ring = r => {
		const starts = []
		for (let i = 0; i < plan.length; i++) {
			const d = Math.max(Math.abs((i % cols) + 0.5 - 10), Math.abs(Math.floor(i / cols) + 0.5 - 6))
			if (Math.ceil(d) === r) starts.push(plan[i])
		}
		return starts.reduce((a, b) => a + b, 0) / starts.length
	}
	for (let r = 2; r <= 10; r++) assert.ok(ring(r) > ring(r - 1), `ring ${r} should go after ring ${r - 1}`)
})

test('a tile shrinks towards its centre in pixel steps, darkens, then is gone', () => {
	const calls = []
	const g = {
		clearRect: (...a) => calls.push(['clear', ...a]),
		drawImage: (_image, ...a) => calls.push(['draw', ...a]),
		fillRect: (...a) => calls.push(['fill', ...a]),
		fillStyle: '',
	}
	assert.equal(popTile(g, {}, 0, 0, 48, 48, 0.1), false)
	assert.deepEqual(calls[1], ['draw', 0, 0, 48, 48]) // whole for the first quarter
	calls.length = 0
	assert.equal(popTile(g, {}, 0, 0, 48, 48, 0.6), false)
	assert.deepEqual(calls[1], ['draw', 12, 12, 24, 24]) // then in quarters of the tile: whole texels at 3 px
	assert.equal(g.fillStyle, 'rgba(0,0,0,0.07)') // barely darker, never a black square
	calls.length = 0
	assert.equal(popTile(g, {}, 64, 0, 64, 64, 1), true)
	assert.deepEqual(calls, [['clear', 64, 0, 64, 64]])
})

test('outside the landing the screen is dropped before it can show', () => {
	const h = bootHarness({ pathname: '/faq' })
	assert.equal(h.boot.removed, true)
	assert.equal(h.frames(), 0)
})

test('a fast load never shows the dirt or the map: the plain cover fades out at once, without a reveal', () => {
	const h = bootHarness()
	h.run(120)
	h.emit('load')
	h.emit('mm:ready')
	assert.deepEqual([...h.boot.classes], ['is-done'])
	assert.equal(h.frames(), 8) // no more frames: the map is never painted again
	h.run(320)
	assert.equal(h.boot.removed, true)
	assert.equal(h.listeners(), 0)
})

test('a page already loaded and on screen when the script runs drops the screen the same way', () => {
	const h = bootHarness({ readyState: 'complete', ready: true })
	assert.deepEqual([...h.boot.classes], ['is-done'])
	assert.equal(h.frames(), 0)
	h.run(320)
	assert.equal(h.boot.removed, true)
})

test('a slow load fills to 100 % only once ready, holds, then reveals the film block by block', () => {
	const h = bootHarness()
	h.run(400)
	h.emit('mm:boot-progress', 0.5)
	h.run(2000)
	const before = Number.parseInt(h.label.textContent, 10)
	assert.ok(before >= 50 && before < 96, `before ready: ${h.label.textContent}`)
	h.emit('load')
	h.emit('mm:ready')
	h.run(380)
	assert.equal(h.label.textContent, '100%')
	assert.equal(h.boot.classes.has('is-out'), false) // the hold at 100 %
	h.run(200)
	assert.equal(h.boot.classes.has('is-out'), true)
	assert.equal(h.boot.prepended.length, 1) // the reveal canvas
	assert.equal(h.tile().length, 1) // the dirt tile, read once from the CSS background
	assert.match(h.tile()[0], /^data:image\/png;base64,/)
	const canvas = h.boot.prepended[0]
	assert.equal(canvas.width, 1280) // the whole screen, in device pixels
	h.run(600)
	assert.equal(h.boot.removed, false) // mid-reveal
	assert.ok(h.reveal.cleared() > 0)
	h.run(800)
	assert.equal(h.boot.removed, true)
	assert.equal(h.listeners(), 0) // nothing keeps the screen alive: no listener left
	assert.equal(canvas.width, 0) // and its canvas is freed (no width, no pixels)
})

test('the reveal works in tiles of 16 map cells, the size of the CSS background', () => {
	const h = bootHarness({ cell: 4 })
	h.run(400)
	h.emit('load')
	h.emit('mm:ready')
	h.run(600)
	assert.ok(h.boot.classes.has('is-out'))
	h.run(500) // the first tiles have gone: each one cleared over its 64 x 64 px box
	assert.ok(h.reveal.boxes().every(([x, y, w, ht]) => x % 64 === 0 && y % 64 === 0 && w === 64 && ht === 64))
})

test('back from the back/forward cache in the middle of the reveal: every tile goes at once and the screen leaves', () => {
	const h = bootHarness()
	h.run(400)
	h.emit('load')
	h.emit('mm:ready')
	h.run(900)
	assert.ok(h.boot.classes.has('is-out'))
	assert.equal(h.boot.removed, false)
	h.jump(60_000) // the page was frozen for a minute
	h.run(32)
	assert.equal(h.boot.removed, true)
})

test('a page that is ready just before the safety stop fades instead of starting a reveal the CSS stop would cut', () => {
	const h = bootHarness()
	h.run(18_600)
	h.emit('load')
	h.emit('mm:ready')
	h.run(900)
	assert.ok(h.boot.classes.has('is-done'))
	assert.equal(h.boot.classes.has('is-out'), false)
	assert.equal(h.boot.removed, true)
})

test('without the tile in the CSS there is nothing to dissolve: a plain fade', () => {
	const h = bootHarness({ background: 'none' })
	h.run(400)
	h.emit('load')
	h.emit('mm:ready')
	h.run(1500)
	assert.ok(h.boot.classes.has('is-done'))
	assert.equal(h.boot.classes.has('is-out'), false)
})

test('a quick ready after the screen appeared still keeps it on screen long enough to read', () => {
	const h = bootHarness()
	h.run(300)
	h.emit('load')
	h.emit('mm:ready')
	h.run(500)
	assert.equal(h.boot.classes.has('is-out'), false) // 250 ms invisible + 700 ms visible at least
	h.run(300)
	assert.equal(h.boot.classes.has('is-out'), true)
})

test('reduced motion: no reveal, a short fade', () => {
	const h = bootHarness({ reduced: true })
	h.run(400)
	h.emit('load')
	h.emit('mm:ready')
	h.run(1500)
	assert.equal(h.boot.classes.has('is-done'), true)
	assert.equal(h.boot.classes.has('is-out'), false)
	assert.equal(h.boot.removed, true)
})

test("the site's own reduced-motion option also turns the reveal into a fade", () => {
	const h = bootHarness({ motion: 'reduced' })
	h.run(400)
	h.emit('load')
	h.emit('mm:ready')
	h.run(1500)
	assert.equal(h.boot.classes.has('is-done'), true)
	assert.equal(h.boot.classes.has('is-out'), false)
})

test('if the app never says it is ready, the screen fades away after 20 s', () => {
	const h = bootHarness()
	h.run(19_900)
	assert.equal(h.boot.removed, false)
	assert.notEqual(h.label.textContent, '100%')
	h.run(400)
	assert.equal(h.boot.classes.has('is-done'), true)
	assert.equal(h.boot.removed, true)
})

/** A minimal page around #boot: a manual clock (16 ms frames), timers, events, and canvases that record what they are asked to draw. */
function bootHarness(options = {}) {
	const { pathname = '/', reduced = false, motion, readyState = 'interactive', ready = false, cell = 3 } = options
	const background = options.background ?? `url("${tilePng(dirtTile(1), DIRT)}")`
	let time = 0
	let frames = []
	let frameCount = 0
	const timers = []
	const listeners = {}
	const cleared = []
	const pngs = []
	const context = () => ({
		createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
		putImageData: () => undefined,
		drawImage: () => undefined,
		clearRect: (...rect) => cleared.push(rect),
		fillRect: () => undefined,
		fillStyle: '',
		imageSmoothingEnabled: true,
	})
	const label = { textContent: '0%' }
	const mapCanvas = { getContext: context, clientWidth: N * cell }
	const side = N * cell + 4
	const parts = {
		canvas: mapCanvas,
		'.boot-pc': label,
		'.boot-map': {
			getBoundingClientRect: () => ({
				left: (1280 - side) / 2,
				top: (720 - side) / 2 + 13 * cell,
				width: side,
				height: side,
			}),
			querySelector: () => mapCanvas,
		},
	}
	const boot = {
		removed: false,
		classes: new Set(),
		prepended: [],
		clientWidth: 1280,
		clientHeight: 720,
		ownerDocument: { createElement: () => ({ getContext: context }) },
		querySelector: selector => (selector === '.boot-cv' ? boot.prepended[0] : parts[selector]),
		remove() {
			this.removed = true
		},
		prepend(element) {
			this.prepended.push(element)
		},
	}
	boot.classList = { add: name => boot.classes.add(name) }
	const doc = {
		getElementById: id => (id === 'boot' ? boot : null),
		readyState,
		documentElement: { dataset: { ...(motion ? { mcMotion: motion } : {}), ...(ready ? { mmReady: '1' } : {}) } },
	}
	const win = {
		location: { pathname },
		performance: { now: () => time },
		requestAnimationFrame: callback => frames.push(callback),
		setTimeout: (callback, ms) => timers.push({ at: time + ms, callback }),
		addEventListener: (type, callback, { signal } = {}) => {
			listeners[type] ??= []
			listeners[type].push(callback)
			signal?.addEventListener('abort', () => listeners[type].splice(listeners[type].indexOf(callback), 1))
		},
		getComputedStyle: (element, pseudo) => ({
			backgroundImage: element === boot && pseudo === '::before' ? background : 'none',
		}),
		matchMedia: () => ({ matches: reduced }),
		Image: class {
			complete = true
			naturalWidth = 0
			set src(value) {
				pngs.push(value)
				this.naturalWidth = value.startsWith('data:image/png;base64,') ? 16 : 0
			}
		},
		innerWidth: 1280,
		innerHeight: 720,
		devicePixelRatio: 1,
	}
	bootScreen(doc, win, bootConfig())
	const tick = () => {
		time += 16
		for (const timer of timers.splice(0)) {
			if (timer.at <= time) timer.callback()
			else timers.push(timer)
		}
		const due = frames
		frames = []
		frameCount += due.length
		for (const callback of due) callback()
	}
	return {
		boot,
		label,
		reveal: { cleared: () => cleared.length, boxes: () => cleared },
		frames: () => frameCount,
		listeners: () => Object.values(listeners).reduce((total, list) => total + list.length, 0),
		tile: () => pngs,
		run(ms) {
			for (let t = 0; t < ms; t += 16) tick()
		},
		jump(ms) {
			time += ms
		},
		emit(type, detail) {
			for (const callback of listeners[type] ?? []) callback({ detail })
		},
	}
}
