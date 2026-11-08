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

/** How far each map cell lags behind the loading front, in [0, 1): clumps of 3 x 3 cells plus a little grain, so the edges are jagged like the game's. */
export function mapNoise(n, seed) {
	const rand = bootRandom(seed)
	const blocks = Math.ceil(n / 3)
	const coarse = []
	for (let i = 0; i < blocks * blocks; i++) coarse.push(rand())
	const noise = new Float32Array(n * n)
	for (let i = 0; i < n * n; i++) {
		const clump = coarse[Math.floor(Math.floor(i / n) / 3) * blocks + Math.floor((i % n) / 3)]
		noise[i] = clump * 0.75 + rand() * 0.25
	}
	return noise
}

/** One cell: 4 loaded (white), 3 green ring, 2 blue ring, 1 started (grey), 0 not started (black). */
export function cellLevel(ring, area, white, grey) {
	if (ring < white) return 4
	if (ring < white + 1) return 3
	if (ring < white + 2) return 2
	return area < grey ? 1 : 0
}

/**
 * The chunk map at progress p (0..1), one level per cell (row by row). Square rings around the centre: the grey area spreads first and fills the map by
 * about 35 %, the white core grows to its final size with a green then a blue ring around it. While loading, `noise` pushes every cell back by up to a few
 * cells (jagged edges); at 1 the shape is exact: a white square, one green ring, one blue ring, grey to the border.
 */
export function mapLevels(p, n, noise) {
	const q = Math.min(1, Math.max(0, p))
	const levels = new Uint8Array(n * n)
	if (q === 0) return levels
	const half = (n - 1) / 2
	const grey = (half + 0.5) * Math.min(1, 0.3 + 2 * q)
	const white = (Math.round(half * 0.56) + 0.5) * q ** 0.6
	const rough = 1 - q
	for (let i = 0; i < n * n; i++) {
		const d = Math.max(Math.abs((i % n) - half), Math.abs(Math.floor(i / n) - half))
		levels[i] = cellLevel(d + noise[i] * 2.5 * rough, d + noise[n * n - 1 - i] * 4 * rough, white, grey)
	}
	return levels
}

/** Writes the levels' colours into an ImageData of the map (n x n pixels, one per cell). */
export function paintMap(image, levels, colors) {
	const data = image.data
	for (let i = 0; i < levels.length; i++) {
		const color = colors[levels[i]]
		data[i * 4] = color[0]
		data[i * 4 + 1] = color[1]
		data[i * 4 + 2] = color[2]
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

/** The short fade (a fast load, reduced motion, no canvas, or the safety stop): the CSS class is-done, then the screen leaves the page. */
export function bootFade(boot, win, done) {
	boot.classList.add('is-done')
	win.setTimeout(done, 300)
}

/**
 * Drives #boot. The screen only plays on the landing ("/"): it covers the page in plain dirt colour from the first paint, and its texture and map only
 * fade in after `C.show` ms (CSS), so a fast load only sees a short dark fade into the film. Its percentage follows the app's milestones
 * (`mm:boot-progress`) and an estimate; it reaches 100 % once the page has loaded and the app says it is on screen (`mm:ready`: the film's first image is
 * drawn), holds `C.hold` ms (and at least `C.least` ms of being visible), then reveals the film. If anything stalls, the screen fades away after `C.stop`
 * ms anyway (the CSS does the same without JavaScript). Once gone, it leaves nothing behind: listeners removed, the reveal canvas freed.
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
	const image = ctx?.createImageData(C.n, C.n)
	const label = boot.querySelector('.boot-pc')
	const noise = mapNoise(C.n, C.seed)
	// the dirt tile is the CSS background of #boot::before (index.html holds it once): read now, before is-out drops it, so it has decoded by the reveal
	const tile = new win.Image()
	// url("data:image/png;base64,…"): no quote inside
	const css = win.getComputedStyle(boot, '::before').backgroundImage
	if (css.startsWith('url(')) tile.src = css.slice(4, -1).replaceAll('"', '')
	const listen = new AbortController()
	const s = { floor: 0, floorAt: t0, readyAt: 0, from: 0, shown: 0, fullAt: 0, pct: -1, last: t0, over: false }
	s.loaded = doc.readyState === 'complete'
	s.ready = doc.documentElement.dataset.mmReady === '1'
	const remove = () => {
		listen.abort()
		const reveal = boot.querySelector('.boot-cv')
		// a full-screen canvas in device pixels: no width, no pixels; freed now, not with the page
		if (reveal) reveal.width = 0
		boot.remove()
	}
	const show = p => {
		const pct = Math.floor(p * 100)
		if (pct === s.pct) return
		s.pct = pct
		label.textContent = `${pct}%`
		if (ctx) ctx.putImageData(paintMap(image, mapLevels(p, C.n, noise), C.colors), 0, 0)
	}
	const leave = () => {
		s.over = true
		// the system setting, or the site's own motion option (html[data-mc-motion=reduced], as the film reads it)
		const reduced =
			win.matchMedia?.('(prefers-reduced-motion: reduce)').matches || doc.documentElement.dataset.mcMotion === 'reduced'
		// too close to the safety stop (the CSS one may already be fading the screen): no reveal that would bring it back
		const late = now() - t0 >= C.stop - C.out
		if (reduced || late || !tile.complete || !tile.naturalWidth) bootFade(boot, win, remove)
		else bootDissolve(boot, win, C, tile, remove)
	}
	const check = () => {
		if (s.readyAt || !s.loaded || !s.ready) return
		s.readyAt = now()
		s.from = s.shown
		if (s.readyAt - t0 >= C.show) return
		s.over = true
		bootFade(boot, win, remove)
	}
	const advance = (t, dt) => {
		if (s.readyAt) return Math.min(1, s.shown + (dt * Math.max(0.2, 1 - s.from)) / C.fill)
		return s.shown + (bootTarget(t - t0, s.floor, t - s.floorAt) - s.shown) * (1 - Math.exp(-dt / 400))
	}
	const frame = () => {
		if (s.over) return
		const t = now()
		s.shown = advance(t, Math.min(100, t - s.last))
		s.last = t
		show(s.shown)
		if (s.shown >= 1 && !s.fullAt) s.fullAt = t
		if (s.fullAt && t >= Math.max(s.fullAt + C.hold, t0 + C.show + C.least)) leave()
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
		check()
	}
	const onReady = () => {
		s.ready = true
		check()
	}
	win.addEventListener('mm:boot-progress', onProgress, { signal: listen.signal })
	win.addEventListener('load', onLoad, { signal: listen.signal })
	win.addEventListener('mm:ready', onReady, { signal: listen.signal })
	win.setTimeout(() => {
		if (s.over) return
		s.over = true
		bootFade(boot, win, remove)
	}, C.stop)
	check()
	if (!s.over) win.requestAnimationFrame(frame)
}
