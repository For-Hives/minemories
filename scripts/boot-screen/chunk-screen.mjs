// Runtime of the landing's loading screen (a world-loading screen: a dirt background, a chunk map that fills, then a block-by-block reveal of the film).
// gen.mjs inlines these functions into apps/web/index.html with Function.prototype.toString(): each one must stay self-contained (no import, no module-level
// value; they may only call each other by name), use no multi-line template literal, and avoid the word "filter" (boot-screen.test.ts bans it from index.html).

/** Seeded PRNG (mulberry32): the same seed draws the same map noise and the same reveal order on every visit. */
export function bootRandom(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * The chunk map's plan, computed once (seeded). Each front (0 the loaded core, 1 the grey) grows side by side, one ring at a time like the game's:
 * for each front, side and step, when that side's step lands (a ring of the front's size, give or take 0.35, so the four sides move one after the
 * other) and from which end its new strip of cells fills in. `at` is where the view recentres (fraction of the fill).
 */
export function mapPlan(n, seed, at) {
	const rand = bootRandom(seed)
	return { n, seed, at, steps: Array.from({ length: 8 * n }, () => [rand() * 0.7 - 0.35, rand() < 0.5]) }
}

/**
 * The loaded core's half-size, in rings, at p (0..1) of the fill, as measured on the reference video: nothing for a moment (the grey alone), then a
 * blue dot that grows into a green ring around a white dot (about 3 rings) before the recentring at `at`, then an area that grows slowly at first
 * and then at a steady rate (so the side slows down) to its full size just before 100 %. A side's whole rings lag its size by half a ring on average.
 */
export function mapSize(p, at) {
	if (p < 0.025) return 0
	if (p < at) return Math.min(3.25, 1 + (p - 0.025) * 30)
	const u = Math.min(1, (p - at) / (0.97 - at))
	return Math.sqrt(u < 0.19 ? 10.56 + u * 14.4 : 13.3 + (u - 0.19) * 175)
}

/**
 * A front's four sides (left, right, top, bottom) at size v: each one's whole rings, how much of its next strip is filled (0..1, over the last 0.3
 * ring before its step lands) and from which end. `cap` rings at most. No strip on a side of 2 rings or less, and two strips at most at once (the two
 * that started first): more would read as a cross on a small front.
 */
export function mapSides(plan, front, v, cap) {
	const sides = [0, 1, 2, 3].map(side => {
		const steps = plan.steps.slice((front * 4 + side) * plan.n)
		let k = 0
		while (k < cap && v >= k + 1 + steps[k + 1][0]) k++
		const fill = k > 1 && k < cap ? (v - k - 1 - steps[k + 1][0]) / 0.3 + 1 : 0
		return [k, Math.min(1, Math.max(0, fill)), steps[k + 1]?.[1]]
	})
	const third = sides.map(side => side[1]).sort((a, b) => b - a)[2]
	for (const side of sides) if (side[1] <= third) side[1] = 0
	return sides
}

/**
 * Whether the cell (x, y) (from the centre) is inside the front: in the rectangle of its sides, or in the strip a side is filling. A strip cell's place
 * along it is counted on the step's nominal length (2k), so a cell, once in, stays in.
 */
export function inFront(sides, x, y) {
	const [l, r, t, b] = sides
	const across = (a, lo, hi) => a >= -lo[0] && a < hi[0]
	if (across(x, l, r) && across(y, t, b)) return true
	const strip = (side, a, lo, hi) => {
		const k = side[0] + 1
		return side[1] * k >= 1 && across(a, lo, hi) && (side[2] ? k - 1 - a : a + k) < side[1] * 2 * k
	}
	return (
		(x === r[0] && strip(r, y, t, b)) ||
		(x === -l[0] - 1 && strip(l, y, t, b)) ||
		(y === b[0] && strip(b, x, l, r)) ||
		(y === -t[0] - 1 && strip(t, x, l, r))
	)
}

/** How deep the cell i is inside the marked cells (0 on their edge, 1 next, 2 beyond), over the 5 x 5 cells around it. */
export function mapDepth(inside, n, i) {
	let depth = 2
	for (let k = 0; k < 25; k++) {
		const [dx, dy] = [(k % 5) - 2, Math.floor(k / 5) - 2]
		if (!inside[i + dy * n + dx]) depth = Math.min(depth, Math.max(Math.abs(dx), Math.abs(dy)) - 1)
	}
	return depth
}

/**
 * A loaded cell inside the green ring: light grey (4, finishing) or white (5). Specks show within two rings of the core's last whole edge (`done`, the
 * sides one ring back), a few one ring deeper; more as the fill goes on (q), fading over the hold (q from 1 to 2). `chance` is a draw in 0..1.
 */
export function mapSpeck(done, x, y, q, chance) {
	const deep = k => x >= k - done[0][0] && x < done[1][0] - k && y >= k - done[2][0] && y < done[3][0] - k
	return chance < [0.4, 0.08, 0][deep(2) + deep(3)] * Math.min(q, 2 - q) ? 4 : 5
}

/**
 * The chunk map at q, one level per cell (row by row): 5 loaded (white), 4 finishing (light grey), 3 green ring, 2 blue ring, 1 started (grey), 0 black.
 * q is the fill (0..1): the grey square appears around the player at once, about 7 rings, a blue dot then a green ring around a white dot grow in it,
 * and from the recentring both fronts grow side by side, the grey 7 rings ahead of the core. The rings follow the core's edge; the cells it reached
 * last are still finishing (light grey, with a few re-drawn every `tick`). At q = 1 every front snaps to an exact square (white 20 cells, a green and
 * a blue ring, 7 rings of grey to the border); from 1 to 2 (the hold) the last light-grey cells fade, and the map is clean at 2.
 */
export function mapLevels(q, plan, tick) {
	const { n, at } = plan
	const c = n / 2
	const levels = new Uint8Array(n * n)
	if (q <= 0) return levels
	const v = q < 1 ? mapSize(q, at) : 99
	const core = mapSides(plan, 0, v, c - 7)
	const grey = mapSides(plan, 1, q < at ? 7.5 + (2.6 * q) / at : v + 7, c)
	const done = mapSides(plan, 0, v - 1, c - 7)
	const inside = Uint8Array.from(levels, (_, i) => inFront(core, (i % n) - c, Math.floor(i / n) - c))
	const rand = bootRandom(plan.seed + tick)
	for (let i = 0; i < levels.length; i++) {
		const [x, y] = [(i % n) - c, Math.floor(i / n) - c]
		const depth = inside[i] ? mapDepth(inside, n, i) : -1
		if (depth < 0) levels[i] = inFront(grey, x, y) ? 1 : 0
		else if (depth < 2) levels[i] = 2 + depth
		else levels[i] = mapSpeck(done, x, y, q, rand())
	}
	return levels
}

/**
 * Writes the levels' colours into an ImageData of the map at three pixels per cell (3n x 3n), the player at the centre. The blue ring is two pixels
 * wide, its inner third green, as the game's map reads at this size.
 */
export function paintMap(image, levels, colors) {
	const data = image.data
	const n = Math.round(Math.sqrt(levels.length))
	const level = (x, y) => (x >= 0 && x < n && y >= 0 && y < n ? levels[y * n + x] : 0)
	for (let i = 0; i < 9 * n * n; i++) {
		const [u, w] = [i % (3 * n), Math.floor(i / (3 * n))]
		const [x, y] = [Math.floor(u / 3), Math.floor(w / 3)]
		const [dx, dy] = [(u % 3) - 1, (w % 3) - 1]
		let k = level(x, y)
		if (k === 2 && [level(x + dx, y), level(x, y + dy), level(x + dx, y + dy)].includes(3)) k = 3
		data.set(colors[k], i * 4)
		data[i * 4 + 3] = 255
	}
	return image
}

/**
 * Where the percentage heads before the app is ready (0..0.95). `floor` is the last milestone reported by the app (`mm:boot-progress`), reached `since` ms
 * ago: the bar creeps towards the next quarter from there. Without any report, a slow estimate from the time spent (`elapsed` ms) keeps it moving.
 * It never reaches 100 % on its own: only the app's `mm:ready` does.
 */
export function bootTarget(elapsed, floor, since) {
	const creep = floor + (Math.min(0.95, floor + 0.25) - floor) * (1 - Math.exp(-since / 2500))
	const guess = 0.9 * (1 - Math.exp(-elapsed / 6000))
	return Math.min(0.95, Math.max(creep, guess))
}

/**
 * When each background tile starts to go during the reveal, as a fraction of the reveal (0..span): square fronts around the chunk map at (cx, cy) (in
 * tiles), like chunks loading around the player, with a little seeded randomness so the front is not a perfect square.
 */
export function dissolvePlan(cols, rows, cx, cy, seed, span) {
	const rand = bootRandom(seed)
	const far = Math.max(cx, cols - cx, cy, rows - cy)
	const plan = new Float32Array(cols * rows)
	for (let i = 0; i < plan.length; i++) {
		const d = Math.max(Math.abs((i % cols) + 0.5 - cx), Math.abs(Math.floor(i / cols) + 0.5 - cy)) / far
		plan[i] = Math.min(1, d * 0.82 + rand() * 0.18) * span
	}
	return plan
}

/**
 * One tile of the reveal at its own progress u (0..1): it shrinks towards its centre in four steps (a quarter of the tile each, so whole texels at every
 * scale) and darkens a little, then it is gone (returns true). Few, large steps read as blocks breaking rather than as dark specks over the film.
 */
export function popTile(g, tile, x, y, w, h, u) {
	g.clearRect(x, y, w, h)
	if (u >= 1) return true
	const k = Math.ceil((1 - u) * 4) / 4
	const sw = Math.round(w * k)
	const sh = Math.round(h * k)
	const sx = x + Math.round((w - sw) / 2)
	const sy = y + Math.round((h - sh) / 2)
	g.drawImage(tile, sx, sy, sw, sh)
	g.fillStyle = `rgba(0,0,0,${(u * 0.12).toFixed(2)})`
	g.fillRect(sx, sy, sw, sh)
	return false
}

/**
 * The reveal: the dirt background is copied into one canvas (the CSS background goes away in the same frame), then its tiles pop one by one from the
 * chunk map outwards while the map itself scales and fades (CSS, class is-out). Calls `done` once every tile has gone, or after a safety delay if the
 * page stops animating (a background tab).
 */
export function bootDissolve(boot, win, C, tile, done) {
	const ratio = win.devicePixelRatio || 1
	// the screen's own box (a classic scrollbar is outside it)
	const w = boot.clientWidth || win.innerWidth
	const h = boot.clientHeight || win.innerHeight
	// one tile is 16 texels of the CSS scale var(--c), which the map canvas shows as one cell (n cells wide): the same size as the CSS background
	const map = boot.querySelector('.boot-map')
	const size = (16 * map.querySelector('canvas').clientWidth) / C.n || 48
	const cols = Math.ceil(w / size)
	const rows = Math.ceil(h / size)
	const canvas = boot.ownerDocument.createElement('canvas')
	canvas.width = Math.round(w * ratio)
	canvas.height = Math.round(h * ratio)
	const g = canvas.getContext('2d')
	if (!g) return bootFade(boot, win, done)
	const box = map.getBoundingClientRect()
	const cx = (box.left + box.width / 2) / size
	const cy = (box.top + box.height / 2) / size
	const plan = dissolvePlan(cols, rows, cx, cy, C.seed, 1 - C.pop / C.out)
	const edge = c => Math.round(c * size * ratio)
	const rect = i => {
		const [col, row] = [i % cols, Math.floor(i / cols)]
		return [edge(col), edge(row), edge(col + 1) - edge(col), edge(row + 1) - edge(row)]
	}
	g.imageSmoothingEnabled = false
	for (let i = 0; i < plan.length; i++) {
		const [x, y, tw, th] = rect(i)
		g.drawImage(tile, x, y, tw, th)
	}
	canvas.className = 'boot-cv'
	boot.prepend(canvas)
	boot.classList.add('is-out')
	const gone = new Uint8Array(plan.length)
	const start = win.performance.now()
	let left = plan.length
	let over = false
	const end = () => {
		if (over) return
		over = true
		done()
	}
	const pop = (i, at) => {
		const [x, y, tw, th] = rect(i)
		if (!popTile(g, tile, x, y, tw, th, ((at - plan[i]) * C.out) / C.pop)) return
		gone[i] = 1
		left--
	}
	const step = () => {
		if (over) return
		const at = (win.performance.now() - start) / C.out
		for (let i = 0; i < plan.length; i++) if (!gone[i] && at > plan[i]) pop(i, at)
		if (left > 0) win.requestAnimationFrame(step)
		else end()
	}
	win.requestAnimationFrame(step)
	win.setTimeout(end, C.out + 400)
}

/** The short fade (reduced motion, no canvas, or the safety stop): the CSS class is-done, then the screen leaves the page. */
export function bootFade(boot, win, done) {
	boot.classList.add('is-done')
	win.setTimeout(done, 300)
}

/**
 * Where the percentage may be after `t` ms of the screen's own clock: nothing for `C.lead` ms (the black map), then a straight line to 100 % over
 * `C.fill` ms. Every visit plays the whole fill, even when the page is cached and ready at once; a slow app only holds it lower. The clock only moves
 * 50 ms per frame at most, so while the app's start blocks the main thread the fill pauses and then resumes where it was, rather than skipping ahead.
 */
export function bootPace(t, C) {
	return Math.min(1, Math.max(0, (t - C.lead) / C.fill))
}

/**
 * Drives #boot. The screen only plays on the landing ("/"), and always plays in full: the map fills from 0 to 100 % in at least `C.fill` ms (bootPace),
 * holds `C.hold` ms, then the film is revealed block by block. Its percentage follows the app's milestones (`mm:boot-progress`) and an estimate, never
 * faster than bootPace, and reaches 100 % only once the page has loaded and the app says it is on screen (`mm:ready`: the film's first image is drawn).
 * The map grows from the centre from its first frame (reduced motion fades instead of the reveal). The film waits for the screen: when the
 * percentage reads 100 % (or the screen goes away without reaching it), <html> gets `data-mm-boot-full` and `mm:boot-full` is sent, and only then
 * does hero.js start the film's clock, so the reveal uncovers its first second rather than its fifth. If anything stalls, the screen fades away
 * after `C.stop` ms anyway (the CSS does the same without JavaScript). Once gone, it leaves nothing behind: listeners removed, the reveal canvas freed.
 */
export function bootScreen(doc, win, C) {
	const boot = doc.getElementById('boot')
	if (!boot) return
	if (win.location.pathname !== '/') {
		boot.remove()
		return
	}
	const now = () => win.performance.now()
	const t0 = now()
	const map = boot.querySelector('canvas')
	const ctx = map.getContext('2d')
	const image = ctx?.createImageData(3 * C.n, 3 * C.n)
	const label = boot.querySelector('.boot-pc')
	const plan = mapPlan(C.n, C.seed, C.at)
	// the system setting, or the site's own motion option (html[data-mc-motion=reduced], as the film reads it)
	const reduced = () =>
		win.matchMedia?.('(prefers-reduced-motion: reduce)').matches || doc.documentElement.dataset.mcMotion === 'reduced'
	// the dirt tile is the CSS background of #boot::before (index.html holds it once): read now, before is-out drops it, so it has decoded by the reveal
	const tile = new win.Image()
	// url("data:image/png;base64,…"): no quote inside
	const css = win.getComputedStyle(boot, '::before').backgroundImage
	if (css.startsWith('url(')) tile.src = css.slice(4, -1).replaceAll('"', '')
	const listen = new AbortController()
	// clock: the screen's own time, in frames of 50 ms at most, so a busy main thread pauses the animation instead of skipping part of it
	const s = { floor: 0, floorAt: t0, shown: 0, fullAt: 0, key: '', last: t0, clock: 0, over: false }
	s.loaded = doc.readyState === 'complete'
	s.ready = doc.documentElement.dataset.mmReady === '1'
	// the film may start: once, at 100 % or when the screen leaves without it
	const release = () => {
		const root = doc.documentElement
		if (root.dataset.mmBootFull === '1') return
		root.dataset.mmBootFull = '1'
		win.dispatchEvent(new win.Event('mm:boot-full'))
	}
	const remove = () => {
		release()
		listen.abort()
		const reveal = boot.querySelector('.boot-cv')
		// a full-screen canvas in device pixels: no width, no pixels; freed now, not with the page
		if (reveal) reveal.width = 0
		boot.remove()
	}
	// the map at q: the fill, then 1 to 2 over the hold (the last light-grey cells fade); its speckles are re-drawn every 150 ms
	const show = (p, at) => {
		const pct = Math.floor(p * 100)
		const q = s.fullAt ? 1 + (at - s.fullAt) / C.hold : p
		const tick = Math.floor(at / 150)
		const key = `${pct} ${tick} ${q >= 2}`
		if (key === s.key) return
		s.key = key
		label.textContent = `${pct}%`
		if (ctx) ctx.putImageData(paintMap(image, mapLevels(q, plan, tick), C.colors), 0, 0)
	}
	const leave = () => {
		s.over = true
		// too close to the safety stop (the CSS one may already be fading the screen): no reveal that would bring it back
		const late = now() - t0 >= C.stop - C.out
		if (reduced() || late || !tile.complete || !tile.naturalWidth) bootFade(boot, win, remove)
		else bootDissolve(boot, win, C, tile, remove)
	}
	// before ready: the app's progress or the pace, whichever is further, never past the pace nor 95 %; once ready, up to the pace (or catching up)
	const advance = (t, dt) => {
		const pace = bootPace(s.clock, C)
		const next =
			s.loaded && s.ready
				? s.shown + dt / C.catchup
				: Math.min(0.95, Math.max(bootTarget(t - t0, s.floor, t - s.floorAt), pace))
		return Math.max(s.shown, Math.min(next, pace))
	}
	const frame = () => {
		if (s.over) return
		const t = now()
		const dt = Math.min(50, t - s.last)
		s.last = t
		s.clock += dt
		s.shown = advance(t, dt)
		if (s.shown >= 1 && !s.fullAt) {
			s.fullAt = s.clock
			release()
		}
		show(s.shown, s.clock)
		if (s.fullAt && s.clock >= s.fullAt + C.hold) leave()
		else win.requestAnimationFrame(frame)
	}
	const onProgress = event => {
		const value = Math.min(1, Number(event.detail) || 0)
		if (value <= s.floor) return
		s.floor = value
		s.floorAt = now()
	}
	const onLoad = () => {
		s.loaded = true
	}
	const onReady = () => {
		s.ready = true
	}
	win.addEventListener('mm:boot-progress', onProgress, { signal: listen.signal })
	win.addEventListener('load', onLoad, { signal: listen.signal })
	win.addEventListener('mm:ready', onReady, { signal: listen.signal })
	win.setTimeout(() => {
		if (s.over) return
		s.over = true
		release()
		bootFade(boot, win, remove)
	}, C.stop)
	win.requestAnimationFrame(frame)
}
