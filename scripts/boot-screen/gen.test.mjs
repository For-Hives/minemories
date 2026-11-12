import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { inflateSync } from 'node:zlib'
import {
	bootPace,
	bootScreen,
	bootTarget,
	dissolvePlan,
	mapLevels,
	mapPlan,
	mapSides,
	mapSize,
	paintMap,
	popTile,
} from './chunk-screen.mjs'
import {
	bootBlocks,
	bootBlocksSize,
	bootConfig,
	DIRT,
	dirtTile,
	MAP_COLORS,
	squeeze,
	target,
	tilePng,
	writeBlocks,
} from './gen.mjs'

const C = bootConfig()
const N = C.n
// the map has an even number of cells: its centre is between cells 18 and 19
const HALF = (N - 1) / 2
const plan = mapPlan(N, C.seed, C.at)
const levelAt = (levels, x, y) => levels[y * N + x]
const ringOf = i => Math.max(Math.abs((i % N) - HALF), Math.abs(Math.floor(i / N) - HALF)) - 0.5
/** The levels with the light-grey specks counted as loaded (white): the shapes alone. */
const shape = levels => levels.map(level => (level === 4 ? 5 : level))
/** The cells at `min` or above, in an n x n grid: their bounding box and how many they are. */
function region(levels, min, n = N) {
	const box = { left: n, right: -1, top: n, bottom: -1, count: 0 }
	for (let i = 0; i < levels.length; i++) {
		if (levels[i] < min) continue
		const [x, y] = [i % n, Math.floor(i / n)]
		Object.assign(box, {
			left: Math.min(box.left, x),
			right: Math.max(box.right, x),
			top: Math.min(box.top, y),
			bottom: Math.max(box.bottom, y),
			count: box.count + 1,
		})
	}
	return box
}

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
	assert.match(script, /bootScreen\(document,window,\{"n":38,/)
	assert.doesNotMatch(script, /^\t/m) // indentation removed
	assert.doesNotMatch(script, /<!--|-->|<\/script>./) // nothing the HTML parser would read inside the script
	assert.doesNotMatch(`${style}${script}`, /\bfilter\b/)
	assert.doesNotThrow(() => new Function(script.slice('<script>'.length, -'</script>'.length)))
})

test('the inline script is squeezed: no space next to an operator, but strings, templates and ++ / -- are kept', () => {
	assert.equal(squeeze('const a = b + c * (d - 1)'), 'const a=b+c*(d-1)')
	assert.equal(squeeze(`x = 'a = b' + \`c \${d + e}\` + "f \\" g"`), `x='a = b'+\`c \${d + e}\`+"f \\" g"`)
	assert.equal(squeeze('a + +b - -c'), 'a+ +b- -c')
	assert.equal(squeeze('return x\nlet y = 2'), 'return x\nlet y=2')
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

test('the chunk map is black at 0 %, exact squares at 100 % and only ever moves forward', () => {
	assert.deepEqual(mapPlan(N, C.seed, C.at), plan)
	assert.notDeepEqual(mapPlan(N, 8, C.at).steps, plan.steps)
	assert.ok(mapLevels(0, plan, 0).every(level => level === 0))
	// as the reference's last frame: a white square of 20 cells, one green ring, one blue ring, 7 rings of grey to the border
	const expected = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 3, 2, 1, 1, 1, 1, 1, 1, 1]
	const clean = mapLevels(2, plan, 0)
	for (let i = 0; i < clean.length; i++) assert.equal(clean[i], expected[ringOf(i)], `cell ${i}`)
	// at 100 % the shapes are already exact; only a few light-grey specks are left, and they fade over the hold
	assert.deepEqual(shape(mapLevels(1, plan, 0)), clean)
	const specks = q =>
		[...Array(10).keys()].reduce((sum, t) => sum + mapLevels(q, plan, t).filter(level => level === 4).length, 0)
	assert.ok(specks(1) > 10 && specks(1.75) < specks(1) / 2, `specks ${specks(1)} then ${specks(1.75)}`)
	let previous = shape(mapLevels(0, plan, 0))
	for (let p = 0.0025; p <= 1.0001; p += 0.0025) {
		const levels = shape(mapLevels(p, plan, Math.round(p * 100)))
		for (let i = 0; i < levels.length; i++) assert.ok(levels[i] >= previous[i], `cell ${i} went back at ${p}`)
		previous = levels
	}
})

test('the map starts like the game: grey alone, then a blue dot, then a green ring around a white dot', () => {
	const first = mapLevels(0.0025, plan, 0)
	assert.ok(first.every(level => level <= 1))
	const grey = region(first, 1)
	assert.ok(
		grey.right - grey.left >= 12 && grey.right - grey.left <= 16,
		`grey appears ~14 cells wide: ${JSON.stringify(grey)}`
	)
	assert.ok(mapLevels(0.02, plan, 0).every(level => level <= 1)) // still the grey alone, 80 ms later
	const dot = region(mapLevels(0.04, plan, 0), 2)
	assert.ok(dot.count >= 1 && dot.right - dot.left <= 2, `a blue dot of 1 to 3 cells: ${JSON.stringify(dot)}`)
	assert.ok(mapLevels(0.04, plan, 0).every(level => level <= 2))
	const ring = mapLevels(0.08, plan, 0)
	assert.ok(ring.includes(3) && !ring.includes(5), 'a green ring inside the blue, no white yet')
	const core = mapLevels(C.at - 0.001, plan, 0)
	const white = region(core, 5)
	assert.ok(white.count >= 1 && white.count <= 4, `a white dot before the recentring: ${JSON.stringify(white)}`)
	assert.equal(levelAt(core, white.left - 1, white.top), 3)
	assert.equal(levelAt(core, white.left - 2, white.top), 2)
})

/** Checks the cells at `min` or above form a centred square with notches only: true if it is notched (not a full box). */
function assertSquareFront(levels, min, p) {
	const box = region(levels, min)
	const [w, h] = [box.right - box.left + 1, box.bottom - box.top + 1]
	assert.ok(
		Math.abs(box.left + box.right - 2 * HALF) <= 2 && Math.abs(box.top + box.bottom - 2 * HALF) <= 2,
		`centred at ${p}`
	)
	assert.ok(Math.abs(w - h) <= 2, `square at ${p}: ${w} x ${h}`)
	// a disc would fill pi / 4 (0.79) of its box (two strips on a small front may leave less: checked from 10 cells)
	assert.ok(w < 10 || box.count / (w * h) > 0.88, `filled like a square at ${p}: ${box.count / (w * h)}`)
	const inside = (x, y) => (levelAt(levels, x, y) >= min ? 1 : 0)
	for (let i = 0; i < levels.length; i++) {
		const [x, y] = [i % N, Math.floor(i / N)]
		const near = inside(x - 1, y) + inside(x + 1, y) + inside(x, y - 1) + inside(x, y + 1)
		assert.ok(!inside(x, y) || near >= 2, `cell ${x},${y} sticks out at ${p} (level ${min})`)
	}
	// inside the edge rows and columns (where the strips are), every row and column is one solid run: no pit, no hole
	for (let k = 1; k < Math.min(w, h) - 1; k++) {
		const row = [...Array(N).keys()].map(x => (inside(x, box.top + k) ? 'x' : ' ')).join('')
		const column = [...Array(N).keys()].map(y => (inside(box.left + k, y) ? 'x' : ' ')).join('')
		assert.match(row, /^ *x+ *$/, `row ${box.top + k} has a hole at ${p} (level ${min})`)
		assert.match(column, /^ *x+ *$/, `column ${box.left + k} has a hole at ${p} (level ${min})`)
	}
	return box.count < w * h
}

test('while loading, every front is a square with a few strips: never a circle, a spike, a pit or a hole', () => {
	let notched = 0
	for (let p = 0.15; p < 0.95; p += 0.02) {
		const levels = shape(mapLevels(p, plan, 0))
		// grey and beyond, the blue ring and inside (the rings and the white inside follow the blue's edge)
		for (const min of [1, 2]) if (region(levels, min).count >= 25 && assertSquareFront(levels, min, p)) notched++
	}
	assert.ok(notched > 20, `the fronts should show strips while loading: ${notched}`)
})

test('each side moves on its own, two strips at most per front, none on a small front: no cross, no star', () => {
	let uneven = 0
	let frames = 0
	for (let p = C.at; p < 0.95; p += 0.0025) {
		const v = mapSize(p, C.at)
		for (const [front, size, cap] of [
			[0, v, HALF - 6.5],
			[1, v + 7, HALF + 0.5],
		]) {
			const sides = mapSides(plan, front, size, cap)
			assert.ok(sides.filter(side => side[1] > 0 && side[1] < 1).length <= 2, `strips at ${p}`)
			assert.ok(
				sides.every(side => side[0] > 1 || side[1] === 0),
				`a strip on a small front at ${p}`
			)
		}
		const box = region(mapLevels(p, plan, 0), 2)
		frames++
		if (box.right - box.left !== box.bottom - box.top) uneven++
	}
	// the reference: about a third of its frames are one cell off square
	assert.ok(uneven / frames > 0.15 && uneven / frames < 0.5, `one cell off square in ${uneven} of ${frames} frames`)
	for (let p = 0.0025; p < C.at; p += 0.0025)
		for (const side of mapSides(plan, 0, mapSize(p, C.at), HALF - 6.5)) assert.ok(side[0] > 1 || side[1] === 0)
})

test('the fronts grow at the pace of the reference video', () => {
	// the blue ring's outer side (cells) against u, the fraction of the time from the recentring to the full size, measured on the reference
	const reference = [
		[0.08, 6.7],
		[0.19, 7.3],
		[0.24, 9],
		[0.34, 12],
		[0.44, 15],
		[0.54, 17.3],
		[0.64, 18.7],
		[0.75, 20.7],
		[0.85, 22.7],
		[0.95, 23.7],
	]
	for (const [u, side] of reference) {
		const box = region(mapLevels(C.at + u * (0.97 - C.at), plan, 0), 2)
		const ours = (box.right - box.left + box.bottom - box.top) / 2 + 1
		assert.ok(Math.abs(ours - side) <= 1.5, `blue ring at u ${u}: ${ours} cells, the reference ${side}`)
	}
	// the grey stays about 7 rings ahead of the core and reaches the border with it, at the end
	for (const p of [0.3, 0.5, 0.7]) {
		const levels = mapLevels(p, plan, 0)
		const margin =
			(region(levels, 2).left - region(levels, 1).left + region(levels, 1).right - region(levels, 2).right) / 2
		assert.ok(margin >= 6 && margin <= 8, `grey margin at ${p}: ${margin}`)
	}
	assert.ok(region(mapLevels(0.85, plan, 0), 1).count < N * N) // black left in the corners late in the fill
	assert.equal(region(mapLevels(0.96, plan, 0), 1).count, N * N)
})

test('light-grey speckles show inside the core near its edge while it loads, re-drawn every tick, and are gone after the hold', () => {
	let specks = 0
	for (const p of [0.4, 0.6, 0.8, 0.9]) {
		const levels = mapLevels(p, plan, 3)
		const core = region(levels, 4)
		const edge = (core.right - core.left + 1) / 2
		for (let i = 0; i < levels.length; i++) {
			if (levels[i] !== 4) continue
			specks++
			assert.ok(ringOf(i) >= edge - 5, `speck ${i} too deep inside the core at ${p}`)
		}
	}
	assert.ok(specks > 40, `speckles: ${specks}`)
	assert.notDeepEqual(mapLevels(0.7, plan, 1), mapLevels(0.7, plan, 2))
	assert.deepEqual(shape(mapLevels(0.7, plan, 1)), shape(mapLevels(0.7, plan, 2)))
	const count = p => [0, 1, 2, 3].reduce((sum, t) => sum + mapLevels(p, plan, t).filter(level => level === 4).length, 0)
	assert.ok(count(0.85) > count(0.35), 'denser as the fill goes on')
	assert.ok(!mapLevels(2, plan, 5).includes(4))
})

test('paintMap: three pixels per cell, the blue ring two pixels wide with its inner third green', () => {
	// a 3 x 3 map: a blue ring around one green cell
	const levels = Uint8Array.from([2, 2, 2, 2, 3, 2, 2, 2, 2])
	const image = { data: new Uint8ClampedArray(9 * 9 * 4) }
	paintMap(image, levels, MAP_COLORS)
	const pixel = (u, w) => [...image.data.subarray((w * 9 + u) * 4, (w * 9 + u) * 4 + 4)]
	const [blue, green] = [
		[...MAP_COLORS[2], 255],
		[...MAP_COLORS[3], 255],
	]
	// the top cell's column: two blue pixels, then the green third next to the green cell
	assert.deepEqual([pixel(4, 0), pixel(4, 1), pixel(4, 2)], [blue, blue, green])
	assert.deepEqual(pixel(4, 4), green)
	assert.deepEqual(pixel(0, 0), blue) // the corner, away from the green
})

test('the pace: nothing during the lead, then a straight line to 100 % over the fill', () => {
	const C = bootConfig()
	assert.equal(bootPace(0, C), 0)
	assert.equal(bootPace(C.lead, C), 0)
	assert.equal(bootPace(C.lead + C.fill / 2, C), 0.5)
	assert.equal(bootPace(C.lead + C.fill, C), 1)
	assert.equal(bootPace(60_000, C), 1)
	assert.ok(C.fill >= 4000)
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

/** When the label first reads 100 %, and when the reveal (is-out) or the fade (is-done) starts, in ms of the harness clock (16 ms frames). */
function timeline(h, until, stop = () => false) {
	const marks = {}
	for (let t = 0; t < until && !h.boot.removed && !stop(marks); t += 16) {
		h.run(16)
		if (h.label.textContent === '100%') marks.full ??= h.now()
		if (h.boot.classes.has('is-out')) marks.out ??= h.now()
		if (h.boot.classes.has('is-done')) marks.done ??= h.now()
	}
	return marks
}

/** The centre of the rings and the core (blue and inside) in the last image painted, in cells: where the map shows the player. */
function shownCentre(h) {
	const data = h.painted()
	// the middle pixel of each cell (3 x 3 pixels) always shows the cell's own level
	const level = i => {
		const at = ((3 * Math.floor(i / N) + 1) * 3 * N + 3 * (i % N) + 1) * 4
		return MAP_COLORS.findIndex(c => c.every((v, k) => v === data[at + k]))
	}
	const box = region(
		Uint8Array.from({ length: N * N }, (_, i) => level(i)),
		2
	)
	return [(box.left + box.right) / 2, (box.top + box.bottom) / 2]
}
/** Whether the map shows the player within a cell of (x, y). */
const shownAt = (h, x, y) => {
	const [cx, cy] = shownCentre(h)
	return Math.abs(cx - x) <= 1 && Math.abs(cy - y) <= 1
}

test('every visit plays the whole animation: a page already loaded and on screen still fills over 4 s, holds, then reveals', () => {
	const C = bootConfig()
	const h = bootHarness({ readyState: 'complete', ready: true })
	assert.equal(h.boot.classes.size, 0) // no fast path any more
	h.run(C.lead + C.fill / 2)
	const half = Number.parseInt(h.label.textContent, 10)
	assert.ok(half >= 48 && half <= 52, `halfway through the fill: ${h.label.textContent}`)
	const marks = timeline(h, 8000)
	assert.ok(marks.full >= C.lead + C.fill && marks.full < C.lead + C.fill + 50, `100 % at ${marks.full} ms`)
	assert.ok(marks.out >= marks.full + C.hold && marks.out < marks.full + C.hold + 50, `reveal at ${marks.out} ms`)
	assert.equal(marks.done, undefined) // a reveal, not a fade
	assert.equal(h.boot.removed, true)
	assert.equal(h.listeners(), 0)
})

test('a fast load (ready 120 ms in) plays exactly the same full animation', () => {
	const C = bootConfig()
	const h = bootHarness()
	h.run(120)
	h.emit('load')
	h.emit('mm:ready')
	assert.equal(h.boot.classes.size, 0)
	const marks = timeline(h, 8000)
	assert.ok(marks.full >= C.lead + C.fill, `100 % at ${marks.full} ms`)
	assert.ok(marks.out >= C.lead + C.fill + C.hold, `reveal at ${marks.out} ms`)
	assert.equal(marks.done, undefined)
})

test('a slow load rides the pace up to 95 % and waits there until ready, then fills, holds and reveals the film block by block', () => {
	const C = bootConfig()
	const h = bootHarness()
	h.run(400)
	h.emit('mm:boot-progress', 0.5)
	h.run(C.lead + C.fill / 4 - 400)
	assert.equal(h.label.textContent, '25%') // the app's 50 % is ahead of the pace: the pace wins
	h.run(7600)
	assert.equal(h.label.textContent, '95%')
	h.emit('load')
	h.emit('mm:ready')
	const ready = h.now()
	h.run(16)
	assert.ok(Number.parseInt(h.label.textContent, 10) <= 96, `just after ready: ${h.label.textContent}`) // no jump
	// a catch-up at twice the fill pace: 1 % per 20 ms
	const marks = timeline(h, 3000, m => m.out)
	assert.ok(marks.full <= ready + 5 * 20 + 32, `100 % at ${marks.full - ready} ms after ready`)
	assert.ok(marks.out >= marks.full + C.hold) // the hold at 100 %
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

test('a busy main thread pauses the fill instead of skipping part of it', () => {
	const C = bootConfig()
	const h = bootHarness({ readyState: 'complete', ready: true })
	h.run(C.lead + 200)
	const before = Number.parseInt(h.label.textContent, 10)
	h.jump(1500) // the app's start blocks the page for 1.5 s: no frame
	h.run(16)
	const after = Number.parseInt(h.label.textContent, 10)
	assert.ok(after - before <= 2, `${before} % then ${after} %`)
	assert.ok(shownAt(h, HALF, HALF)) // still the centre
	const marks = timeline(h, 9000)
	assert.ok(marks.full >= C.lead + C.fill + 1500 - 50, `100 % at ${marks.full} ms`) // later by the stall, but for the one 50 ms step
})

test('the map grows from the centre from its first frame: no off-centre start, no recentring (Andy, 10/11/2026)', () => {
	const h = bootHarness({ readyState: 'complete', ready: true })
	for (const at of [C.lead + 100, C.lead + 300, C.lead + C.at * C.fill, C.lead + C.fill / 2]) {
		h.run(at - h.now())
		assert.ok(shownAt(h, HALF, HALF), `centred at ${h.now()} ms: ${shownCentre(h)}`)
	}
})

test('the film is let go once, when the percentage reads 100 %, before the hold and the reveal', () => {
	const C = bootConfig()
	const h = bootHarness({ readyState: 'complete', ready: true })
	const marks = timeline(h, 8000, m => m.out)
	assert.equal(h.sent().length, 1)
	assert.equal(h.sent()[0].type, 'mm:boot-full')
	assert.ok(
		h.sent()[0].at >= marks.full - 16 && h.sent()[0].at <= marks.full,
		`sent at ${h.sent()[0].at}, 100 % at ${marks.full}`
	)
	assert.ok(h.sent()[0].at < marks.out - C.hold + 32)
	assert.equal(h.doc.documentElement.dataset.mmBootFull, '1')
	h.run(2000)
	assert.equal(h.sent().length, 1) // once, the screen's removal does not send it again
})

test('a link to a section of the site fills the map quickly: there is no film to wait for', () => {
	const C = bootConfig()
	assert.ok(C.quick < C.fill / 2)
	assert.ok(C.sections.includes('steps') && C.sections.includes('server-closing'))
	const link = timeline(bootHarness({ readyState: 'complete', ready: true, hash: '#steps' }), 8000, m => m.out)
	assert.ok(link.full <= C.lead + C.quick + 50, `100 % at ${link.full} ms`)
	const film = timeline(bootHarness({ readyState: 'complete', ready: true, hash: '#chapter-2' }), 8000, m => m.out)
	assert.ok(film.full >= C.lead + C.fill - 50, `100 % at ${film.full} ms`)
})

test('a screen that never reaches 100 % still lets the film go when it leaves', () => {
	const h = bootHarness()
	h.run(19_900)
	assert.equal(h.sent().length, 0)
	h.run(400)
	assert.equal(h.sent().length, 1)
	assert.equal(h.doc.documentElement.dataset.mmBootFull, '1')
})

test('reduced motion: the map fills centred from the start, then a short fade instead of the reveal', () => {
	const C = bootConfig()
	const h = bootHarness({ reduced: true })
	h.run(C.lead + 300)
	assert.ok(shownAt(h, HALF, HALF), `centred from the start: ${shownCentre(h)}`)
	h.emit('load')
	h.emit('mm:ready')
	const marks = timeline(h, 8000)
	assert.ok(marks.full >= C.lead + C.fill)
	assert.ok(marks.done >= marks.full + C.hold)
	assert.equal(marks.out, undefined)
	assert.equal(h.boot.removed, true)
})

test("the site's own reduced-motion option, even set after the start, fades at the end instead of the reveal", () => {
	const h = bootHarness({ readyState: 'complete', ready: true })
	h.run(C.lead + 300)
	h.doc.documentElement.dataset.mcMotion = 'reduced'
	const marks = timeline(h, 8000)
	assert.ok(marks.done)
	assert.equal(marks.out, undefined)
})

test('the reveal works in tiles of 16 map cells, the size of the CSS background', () => {
	const h = bootHarness({ cell: 4, readyState: 'complete', ready: true })
	h.run(4800)
	assert.ok(h.boot.classes.has('is-out'))
	h.run(500) // the first tiles have gone: each one cleared over its 64 x 64 px box
	assert.ok(h.reveal.boxes().length > 0)
	assert.ok(h.reveal.boxes().every(([x, y, w, ht]) => x % 64 === 0 && y % 64 === 0 && w === 64 && ht === 64))
})

test('back from the back/forward cache in the middle of the reveal: every tile goes at once and the screen leaves', () => {
	const h = bootHarness({ readyState: 'complete', ready: true })
	h.run(5100)
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
	h.run(1100) // still before the 20 s stop: the fade is the script's choice
	assert.ok(h.boot.classes.has('is-done'))
	assert.equal(h.boot.classes.has('is-out'), false)
	assert.equal(h.boot.removed, true)
})

test('without the tile in the CSS there is nothing to dissolve: a plain fade', () => {
	const h = bootHarness({ background: 'none', readyState: 'complete', ready: true })
	const marks = timeline(h, 8000)
	assert.ok(marks.done)
	assert.equal(marks.out, undefined)
})

test('if the app never says it is ready, the screen fades away after 20 s', () => {
	const h = bootHarness()
	h.run(19_900)
	assert.equal(h.boot.removed, false)
	assert.ok(Number.parseInt(h.label.textContent, 10) <= 95, h.label.textContent)
	h.run(400)
	assert.equal(h.boot.classes.has('is-done'), true)
	assert.equal(h.boot.removed, true)
})

test('the inline script as written into index.html runs the same screen', () => {
	const C = bootConfig()
	const code = bootBlocks()
		.script.replace(/^<script>/, '')
		.replace(/<\/script>$/, '')
	const h = bootHarness({
		readyState: 'complete',
		ready: true,
		start: (doc, win) => runInNewContext(code, { document: doc, window: win, AbortController }),
	})
	h.run(C.lead + 300)
	assert.ok(shownAt(h, HALF, HALF), `centred first: ${shownCentre(h)}`)
	assert.equal(h.sent().length, 0)
	const marks = timeline(h, 8000)
	assert.ok(marks.full >= C.lead + C.fill)
	assert.ok(marks.out >= marks.full + C.hold)
	assert.equal(h.boot.removed, true)
	assert.equal(h.listeners(), 0)
})

/** A minimal page around #boot: a manual clock (16 ms frames), timers, events, and canvases that record what they are asked to draw. */
function bootHarness(options = {}) {
	const {
		pathname = '/',
		hash = '',
		reduced = false,
		motion,
		readyState = 'interactive',
		ready = false,
		cell = 3,
		start = bootScreen,
	} = options
	const background = options.background ?? `url("${tilePng(dirtTile(1), DIRT)}")`
	let time = 0
	let frames = []
	let frameCount = 0
	const timers = []
	const listeners = {}
	const cleared = []
	const pngs = []
	const sent = []
	let painted = new Uint8ClampedArray(9 * N * N * 4)
	const context = () => ({
		createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
		putImageData: image => {
			painted = Uint8ClampedArray.from(image.data)
		},
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
		location: { pathname, hash },
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
		Event: class {
			constructor(type) {
				this.type = type
			}
		},
		dispatchEvent: event => sent.push({ type: event.type, at: time }),
	}
	if (start === bootScreen) bootScreen(doc, win, bootConfig())
	else start(doc, win)
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
		doc,
		label,
		now: () => time,
		painted: () => painted,
		reveal: { cleared: () => cleared.length, boxes: () => cleared },
		frames: () => frameCount,
		listeners: () => Object.values(listeners).reduce((total, list) => total + list.length, 0),
		tile: () => pngs,
		sent: () => sent,
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
