// Minemories · the site after the film (decisions-v9 sections 11.3 to 11.6, reshaped by decisions-v10 sections 4 to 6): the 3D panel ("dock") that holds the living model, its gestures,
// the section views. Two parts:
//  1. PURE (no DOM, importable under Node: tests H3 to H5, P7, P10, P11): the grid of the page per format (text column and panel with three equal margins), the footer overlap, the drag, key and tap
//     mappings, the section views, the band state, a recording stub of the scene's site methods (`makeViewStub`, used by the tests and when WebGL is missing).
//  2. DOM (`createSite`): lays the dock out, frames the model in it (`frameSubject`, or `setSiteBlend` while the scroll drives the hand-over), turns the model under the visitor's hand
//     (drag 1:1, no inertia), keeps the model's view in step with the section on screen, shrinks the portrait band when the site hero scrolls away, lifts the panel with the page when the
//     footer arrives.
// v10: the panel has NO buttons (no arrows, no zoom, no starting view, no pause). The model turns slowly and lives; a tap or click that does not drag, or Space / Enter on the focused panel,
// stops or restarts that motion (WCAG 2.2.2), and the arrow keys turn it by 15 degrees. The wheel is NEVER captured here: the wheel and touch listeners of the page are passive and nothing calls
// preventDefault on them; the page scrolls by itself.

// ---------------------------------------------------------------------------------------------------------------
// Pure geometry
// ---------------------------------------------------------------------------------------------------------------

/** The kit's three scales (mcui.css): phone < 640 px wide, wide >= 1280 x 800, tablet in between. Titles, chat and hotbar follow them. */
export function formatOf(W, H) {
	if (W < 640) return 'phone'
	return W >= 1280 && H >= 800 ? 'wide' : 'tablet'
}

/** Height of the fixed site header (the kit's `.mc-sitebar`: 56 px, 64 px from 1000 px wide). */
export const headerHeight = (W) => (W >= 1000 ? 64 : 56)

const clamp = (x, a, b) => Math.min(b, Math.max(a, x))

/** Air (CSS px) kept between the model's silhouette and the panel at every angle of the turn (the contract asks 12; the extra 4 px absorb the antialiasing, the halo of the rim and the fireflies). */
export const MODEL_MARGIN = 16

/** Tallest text column (px), and the longest line of a paragraph (characters): 45 to 75 is comfortable, 68 is the target. */
export const TEXT_MAX = 760
/** v11b (item 5): the column may grow on a very wide screen so that the 24 px running text keeps a measure of 56 to 64 characters: half of the width, between 760 and 1000 px. */
export const textMaxOf = (W) => clamp(0.5 * W, TEXT_MAX, 1000)
export const LINE_CH = 68

/** Height of the portrait strip while the site hero is on screen: 34 % of the height, 38 % from 844 px up (smooth in between): the model gets about 12 % more height on a tall phone, and nothing
 *  changes on a short one, whose hero text already runs to the fold (v9c, Andy: the model a bit larger in the hero). Keep in step with the first-paint script of hero.html. */
export const largeBandOf = (H, W = 0) => {
	const phone = 0.34 + 0.04 * clamp((H - 700) / 144, 0, 1)
	// v9d (Andy: the model larger on a portrait tablet): from 700 px of width and 900 px of height the strip grows to 46 % of the height (820 x 1180: 543 px instead of 380, which was 32 %), blending in
	// between so that nothing jumps (768 x 1024: 44 %). A phone (under 700 px wide) is untouched. Keep in step with the first-paint script of hero.html.
	const tablet = clamp((W - 600) / 100, 0, 1) * clamp((H - 900) / 180, 0, 1) // v10 (P2-6): 0 at 600 px, 1 at 700 px: the strip no longer jumps by 126 px between 699 and 700
	const share = phone + tablet * (0.46 - phone)
	return Math.round(clamp(share * H, 200, 380 + tablet * 220))
}

/** v10: the strip once the site hero has left the screen: 20 % of the height (140 to 220 px). It was 24 % (160 to 260): the text gains 4 % of the screen while the site is read. */
export const smallBandOf = (H) => Math.round(clamp(0.2 * H, 140, 220))

/**
 * The grid of a landscape page (width / height >= 1.15), decisions-v10 section 6.1: three equal margins, | e | text | e | panel | e |.
 *   pad = clamp(3.5 vw, 16, 64);  Dw = clamp(38 % of L, 300, 680);  Tw = min(clamp(L / 2, 760, 1000), L - Dw - 3 pad);  e = max(pad, (L - Tw - Dw) / 3)
 * The panel is therefore centred between the right edge of the text and the right edge of the screen, whatever the width of the screen.
 */
export function gridOf(W) {
	const pad = clamp(0.035 * W, 16, 64)
	const Dw = clamp(0.38 * W, 300, 680)
	const Tw = Math.min(textMaxOf(W), W - Dw - 3 * pad)
	const e = Math.max(pad, (W - Tw - Dw) / 3)
	return { pad, Dw, Tw, e, textL: e, textR: e + Tw, panelL: 2 * e + Tw, panelR: W - e }
}

/**
 * The panel that holds the model.
 *  - landscape (width / height >= 1.15): a column from the header to the bottom, `gridOf` wide and centred between the text and the right edge (16 px of air above and below);
 *  - portrait: a strip under the header, `largeBandOf` tall (34 to 38 % of the height, 200 to 380 px; v9d: up to 46 %, 600 px, on a portrait tablet), then `smallBandOf` once the site hero has left the screen (`small`).
 * Returns { layout: 'side' | 'band', rect: { l, t, r, b }, header, text } in CSS px of the viewport; `text` is the column of the content ({ l, w }).
 */
export function dockOf(W, H, { small = false } = {}) {
	const header = headerHeight(W)
	if (W / H >= 1.15) {
		const g = gridOf(W)
		return { layout: 'side', header, rect: { l: Math.round(g.panelL), t: header + 16, r: Math.round(g.panelR), b: H - 16 }, text: { l: Math.round(g.textL), w: Math.round(g.Tw) } }
	}
	const height = small ? smallBandOf(H) : largeBandOf(H, W)
	return { layout: 'band', header, rect: { l: 0, t: header, r: W, b: header + height }, text: { l: 0, w: Math.min(720, W) } }
}

/** The text column of the page (landscape: the grid's; portrait: centred, at most 720 px). */
export function textColumnOf(W, H) {
	return dockOf(W, H).text
}

/**
 * v10 (decisions-v10 section 6.4): the footer arrives from the bottom; when the top of the dirt band comes above the bottom of the panel (plus 16 px of air) the panel and the model rise together by the
 * difference, so that the model never goes under the footer. 0 in portrait (the strip is at the top) and while the band is still below the panel.
 */
export const footerOverlap = (dockRect, bandTop) => Math.max(0, dockRect.b - bandTop + 16)

/** The area the model is framed in. v10: the whole panel (the buttons are gone). Kept for the tests. */
export const modelRectOf = (rect, controlsH = 0) => ({ l: rect.l, t: rect.t, r: rect.r, b: rect.b - controlsH })

/** The band is large while the site hero is on screen, small once it has scrolled away. */
export const bandSizeFor = ({ heroVisible }) => (heroVisible ? 'large' : 'small')

// ---------------------------------------------------------------------------------------------------------------
// Gestures
// ---------------------------------------------------------------------------------------------------------------

/** A drag of (dx, dy) CSS px turns the model 1:1: 0.3 degree of yaw and 0.2 degree of pitch per px. At release everything stops (no inertia). */
export const dragOrbit = (dx, dy) => ({ yaw: dx * 0.3, pitch: dy * 0.2 })

export const TURN_STEP = 15 // degrees per press of the left / right arrows

/** A press or a click that stays within this distance and ends within this time, with the main button or a finger, is a tap: it stops or restarts the model's motion. */
export const TAP = Object.freeze({ maxMovePx: 6, maxMs: 500 })

/** Is this pointer gesture a tap? (pure; the DOM part feeds it the distance moved and the duration.) */
export const isTap = ({ movedPx, ms, button = 0 }) => button === 0 && movedPx < TAP.maxMovePx && ms < TAP.maxMs

/**
 * Keyboard on the focused panel: left and right turn it by 15 degrees; Space and Enter stop or restart its motion (WCAG 2.2.2). Anything else (Tab included, and the up and down arrows,
 * which scroll the page) is left alone: no focus trap. The zoom keys and the reset key of v9 are gone with the buttons.
 */
export function keyAction(key) {
	switch (key) {
		case 'ArrowLeft':
			return { orbit: [-TURN_STEP, 0] }
		case 'ArrowRight':
			return { orbit: [TURN_STEP, 0] }
		case ' ':
		case 'Spacebar':
		case 'Enter':
			return { toggle: true }
		default:
			return null
	}
}

/** Contract with the browser (decisions-v10 section 2.6, replaces the v9 "no wheel listener"): the wheel and touch listeners are passive, none calls preventDefault, the wheel never zooms. Tests check the page against it. */
export const WHEEL_POLICY = Object.freeze({ passive: true, zoom: false, preventDefault: false })

/** The section on screen decides the view of the model. */
export const SECTION_VIEWS = Object.freeze({ hero: 'hero', steps: 'steps', share: 'share', limits: 'limits', faq: 'faq' })
export const viewForSection = (id) => SECTION_VIEWS[id] ?? null

// ---------------------------------------------------------------------------------------------------------------
// Stub of the scene's site API (tests, and the page when the real scene is not there)
// ---------------------------------------------------------------------------------------------------------------

export function makeViewStub() {
	const calls = []
	const view = { yaw: 0, pitch: 28, zoom: 1, view: 'hero', autoRotate: false, rect: null, panel: null, site: false, maxFps: null, blend: 0, shift: { x: 0, y: 0 } }
	const log = (name, args) => calls.push([name, ...args])
	return {
		calls,
		frameSubject(rect, opts = {}) {
			log('frameSubject', [rect, opts])
			view.panel = rect
			view.rect = rect
			return Promise.resolve({ x: 0, y: 0, scale: 1 })
		},
		setSitePhase(on, opts) {
			log('setSitePhase', [on, opts])
			view.site = Boolean(on)
		},
		setSiteBlend(g, opts = {}) {
			log('setSiteBlend', [g, opts])
			view.blend = g
			view.site = g > 0
			if (opts.rect) view.panel = opts.rect
		},
		setFrameShift(dx, dy) {
			log('setFrameShift', [dx, dy])
			view.shift = { x: dx, y: dy }
		},
		setTime(t) {
			log('setTime', [t])
		},
		setAutoRotate(on) {
			log('setAutoRotate', [on])
			view.autoRotate = Boolean(on)
		},
		setAmbient(on) {
			log('setAmbient', [on])
		},
		orbitBy(dYaw, dPitch) {
			log('orbitBy', [dYaw, dPitch])
			view.yaw += dYaw
			view.pitch = clamp(view.pitch + dPitch, 10, 55)
		},
		setView(name, opts) {
			log('setView', [name, opts])
			if (!SECTION_VIEWS[name]) return false
			view.view = name
			return true
		},
		getView() {
			return { ...view }
		},
		setMaxFps(n) {
			log('setMaxFps', [n])
			view.maxFps = n
		},
	}
}

// ---------------------------------------------------------------------------------------------------------------
// DOM: the dock
// ---------------------------------------------------------------------------------------------------------------

/**
 * ctx: { document, dock (the panel element), scene() -> controller or stub, reduced(), phase() -> 'film' | 'glide' | 'site', fill (number), scrub (bool: the scroll drives the hand-over) }.
 * The page calls `enter({ duration })` (or `enter({ blend: true })` when the scroll drove the hand-over) when the site phase begins, `blend(g)` at every frame of the hand-over, `leave()` when the film is
 * replayed or rewound, `layout({ duration })` after anything that moves the panel (resize, orientation change, the band changing size, the fonts arriving).
 */
export function createSite(ctx) {
	const doc = ctx.document
	const root = doc.documentElement
	const dock = ctx.dock
	const scene = () => ctx.scene()
	const fill = ctx.fill ?? 1
	let small = false
	let entered = false
	let still = false
	let dragging = null
	let section = 'hero'
	let lastSectionAt = -1e9
	let lastDragAt = -1e9
	let lastRect = null
	let capTimer = 0
	let viewTimer = 0
	let appliedView = null
	let blendG = 0 // the last g given to the scene by blend()
	let shift = 0 // px the panel and the model are lifted by (the footer arriving)
	let hintBase = 0 // v9d: the page's scroll when the hint was armed (or when the page last scrolled itself): the visitor's own scrolling is measured from there
	let enteredAt = 0 // v10 (CT v9d P2-1): when the site was entered (performance.now()); the momentum of the gesture that left the film is not the visitor's scrolling

	// The 30 fps ceiling of the resting model is lifted while anything moves on its own (the glide, a section view, a key step) and put back afterwards:
	// the most visible motion of the page must not be the least smooth (UX control P1-2).
	function liftCap(ms) {
		scene()?.setMaxFps?.(null)
		clearTimeout(capTimer)
		capTimer = setTimeout(() => {
			if (!dragging && entered && blendG >= 1) scene()?.setMaxFps?.(30)
		}, ms)
	}

	// W is the LAYOUT width: with a reserved scrollbar gutter `clientWidth` can still report the whole window (headless Chromium: 1440 for a 1425 px layout).
	const sizeNow = () => ({ W: Math.round(root.getBoundingClientRect().width) || root.clientWidth || innerWidth, H: root.clientHeight || innerHeight })
	const measure = () => {
		const { W, H } = sizeNow()
		return dockOf(W, H, { small })
	}

	// Places the panel (CSS custom properties read by site.css) and returns its geometry. The model's rectangle is the panel itself.
	function place() {
		const d = measure()
		const { rect } = d
		const set = (k, v) => root.style.setProperty(k, v)
		set('--dock-l', `${rect.l}px`)
		set('--dock-t', `${rect.t}px`)
		set('--dock-w', `${rect.r - rect.l}px`)
		set('--dock-h', `${rect.b - rect.t}px`)
		set('--header-h', `${d.header}px`)
		set('--text-l', `${d.text.l}px`)
		set('--text-w', `${d.text.w}px`)
		// The portrait content starts under the LARGE strip (it must not move when the strip shrinks); anchors stop under the SMALL one.
		const { W, H } = sizeNow()
		set('--dock-h-large', `${dockOf(W, H).rect.b - dockOf(W, H).rect.t}px`)
		set('--dock-h-small', `${dockOf(W, H, { small: true }).rect.b - dockOf(W, H, { small: true }).rect.t}px`)
		// The sections' views are capped in the strip (`bandSafe`): when the layout changes between strip and column, the current one is applied again.
		if (root.dataset.dock && root.dataset.dock !== d.layout) {
			appliedView = null
			clearTimeout(viewTimer)
			viewTimer = setTimeout(applySectionView, 0)
		}
		root.dataset.dock = d.layout
		root.dataset.band = small ? 'small' : 'large'
		lastRect = d.rect
		return d
	}

	function frame({ duration = 0.8, ease = 'standard' } = {}) {
		const s = scene()
		if (!s) return Promise.resolve(null)
		lastRect = place().rect
		return s.frameSubject(lastRect, { duration: ctx.reduced() ? 0 : duration, margin: MODEL_MARGIN, fit: 'tight', fill, ease, centre: 'live' })
	}

	// v10: the hand-over is a position g set by the page at every frame; the scene blends the camera and the framing as a pure function of it.
	function blend(g) {
		const s = scene()
		if (!s) return null
		blendG = g
		if (!lastRect) place()
		s.setSiteBlend?.(g, { rect: lastRect, margin: MODEL_MARGIN, fit: 'tight', fill, centre: 'live' })
		if (g >= 1) updateShift()
		return lastRect
	}

	// -- gestures: drag turns the model 1:1; the arrows turn it by 15 degrees; a tap or Space / Enter stops and restarts its motion. The wheel is the page's.
	function orbit(dYaw, dPitch) {
		scene()?.orbitBy(dYaw, dPitch)
		noteTouch()
	}
	function noteTouch() {
		lastDragAt = performance.now()
		markTurned()
	}
	// The first gesture on the model (drag, key, tap) takes the "Drag to turn" hint away (CSS: html.has-turned). v9d (Andy): so does the first scroll of the page by the visitor
	// (wheel, finger, keys, scrollbar), seen from the scroll event itself. The page's own scrolls (the hand-over, "Watch the film again", a link to a section) re-base it
	// (`rebaseScroll`) so that they never count as the visitor's.
	function markTurned() {
		if (!root.classList.contains('has-turned')) root.classList.add('has-turned')
	}
	const HINT_SCROLL_PX = 24
	// v10 (CT v9d P2-1, adapted to the clock model): the gesture that leaves the film (a trackpad, a wheel, a finger) is still moving when the site appears, and a trackpad goes on sending
	// wheel events for a second or more, which the page scrolls by: that must not take the hint away before it was seen. For this long after the entry a scroll only moves the base.
	const HINT_GRACE_MS = 2400
	function noteScroll() {
		if (!entered || root.classList.contains('has-turned')) return
		if (performance.now() - enteredAt < HINT_GRACE_MS) {
			hintBase = scrollY
			return
		}
		if (Math.abs(scrollY - hintBase) > HINT_SCROLL_PX) markTurned()
	}
	function rebaseScroll() {
		hintBase = scrollY
	}
	function onPointerDown(event) {
		if (ctx.phase() !== 'site' || (event.button ?? 0) !== 0) return
		if (event.target instanceof Element && event.target.closest('button, a, input, select')) return
		markTurned()
		dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, x0: event.clientX, y0: event.clientY, t0: performance.now(), movedPx: 0 }
		try {
			dock.setPointerCapture(event.pointerId)
		} catch {
			// A pointer that vanished: nothing to capture.
		}
		root.classList.add('is-dragging')
		scene()?.setMaxFps?.(null)
	}
	function onPointerMove(event) {
		if (!dragging || event.pointerId !== dragging.id) return
		// A mouse that is no longer pressed (the capture was lost without a pointerup: context menu, hidden element) ends the drag instead of turning on hover.
		if (event.pointerType === 'mouse' && event.buttons === 0) {
			endDrag(event)
			return
		}
		const dx = event.clientX - dragging.x
		const dy = event.clientY - dragging.y
		dragging.x = event.clientX
		dragging.y = event.clientY
		dragging.movedPx = Math.max(dragging.movedPx, Math.hypot(event.clientX - dragging.x0, event.clientY - dragging.y0))
		if (dx === 0 && dy === 0) return
		// A touch drag that goes mostly up or down is the page's scroll (touch-action: pan-y): the browser cancels the pointer, nothing to do here.
		const o = dragOrbit(dx, event.pointerType === 'touch' ? 0 : dy)
		orbit(o.yaw, o.pitch)
	}
	function endDrag(event) {
		if (!dragging || (event && event.pointerId !== dragging.id)) return
		const tap = event?.type === 'pointerup' && isTap({ movedPx: dragging.movedPx, ms: performance.now() - dragging.t0, button: event.button ?? 0 })
		dragging = null
		root.classList.remove('is-dragging')
		noteTouch()
		scene()?.setMaxFps?.(blendG >= 1 || !ctx.scrub ? 30 : null)
		// A tap that did not drag stops the model's motion, or restarts it (WCAG 2.2.2: the visible button of v9 is gone, this is its replacement).
		if (tap) setStill(!still)
	}
	function onKey(event) {
		if (event.altKey || event.ctrlKey || event.metaKey) return
		const a = keyAction(event.key)
		if (!a) return
		event.preventDefault() // the keys of the focused panel only: the page does not scroll from here
		if (event.repeat) return
		act(a)
	}
	function act(a) {
		const s = scene()
		if (!s) return
		markTurned()
		if (a.toggle) {
			setStill(!still)
			return
		}
		liftCap(450)
		if (a.orbit) orbit(a.orbit[0], a.orbit[1])
	}

	// Stops or restarts the slow turn and the ambient life of the model (WCAG 2.2.2). Not offered in reduced motion (already still).
	function setStill(on) {
		if (ctx.reduced()) return
		still = on
		const s = scene()
		s?.setAutoRotate?.(!on)
		s?.setAmbient?.(!on)
		dock.dataset.motion = on ? 'stopped' : 'moving'
		root.classList.toggle('is-still', on)
	}

	// -- sections choose the view; the portrait band shrinks when the site hero leaves the screen. Both are read from the scroll position, on a "reading line":
	// the section that has started above the line is the one on screen (a short section such as sharing never fills half a screen, and a section reached by the
	// header link sits at the top, under the strip). The line is 20 % down the content area (under the header, or under the small strip in portrait).
	function readingLine() {
		const { W, H } = sizeNow()
		const d = dockOf(W, H, { small: true })
		const top = d.layout === 'band' ? d.rect.b : d.header
		// 20 % (30 % before): a short section such as sharing, brought to the top by the header link, must be the one on the line.
		return top + (H - top) * 0.2
	}
	let syncFrame = 0
	function syncSections() {
		syncFrame = 0
		if (ctx.phase() !== 'site') return
		const line = readingLine()
		let current = null
		for (const id of Object.keys(SECTION_VIEWS)) {
			const el = doc.getElementById(id)
			if (el && el.getBoundingClientRect().top <= line) current = id
		}
		if (current && current !== section) chooseSection(current)
		noteScroll()
		const hero = doc.getElementById('hero')
		if (hero && root.dataset.dock === 'band') {
			const { W, H } = sizeNow()
			const heroVisible = hero.getBoundingClientRect().bottom > dockOf(W, H).rect.b
			const next = bandSizeFor({ heroVisible }) === 'small'
			if (next !== small) {
				small = next
				layout({ duration: 0.3 })
			}
		}
		updateShift()
	}
	const scheduleSync = () => {
		if (!syncFrame) syncFrame = requestAnimationFrame(syncSections)
	}
	function watchSections() {
		addEventListener('scroll', scheduleSync, { passive: true })
		addEventListener('resize', scheduleSync)
	}

	// v10: the panel and the model rise together when the footer arrives (landscape only). A translation of the panel and of the model, nothing recomputed.
	function updateShift() {
		const s = scene()
		let next = 0
		if (entered && root.dataset.dock === 'side' && ctx.phase() === 'site') {
			const band = doc.querySelector('.site > .mc-band')
			const rect = lastRect ?? place().rect
			if (band) next = footerOverlap(rect, band.getBoundingClientRect().top)
		}
		if (Math.abs(next - shift) < 0.01) return
		shift = next
		dock.style.transform = shift > 0 ? `translateY(${-shift}px)` : ''
		s?.setFrameShift?.(0, -shift)
	}

	function chooseSection(id) {
		section = id
		for (const a of doc.querySelectorAll('.mc-sitebar__nav a, .site-menu__links a')) {
			if (a.getAttribute('href') === `#${id}`) a.setAttribute('aria-current', 'true')
			else a.removeAttribute('aria-current')
		}
		applySectionView()
	}
	// The view of the section on screen. During a drag and for 4 s after (the visitor is turning the model) it waits, then catches up with the section that is
	// on screen by then (UX control P2: it used to be dropped for good); at once in reduced motion.
	function applySectionView() {
		clearTimeout(viewTimer)
		const name = viewForSection(section)
		if (!name || !entered) return
		const wait = 4000 - (performance.now() - lastDragAt)
		if (dragging || wait > 0) {
			viewTimer = setTimeout(applySectionView, dragging ? 500 : wait + 20)
			return
		}
		if (name === appliedView) return
		appliedView = name
		lastSectionAt = performance.now()
		liftCap(1100)
		scene()?.setView?.(name, { duration: ctx.reduced() ? 0 : 0.9, bandSafe: root.dataset.dock === 'band', maxZoom: 1 })
	}

	function layout(o = {}) {
		if (ctx.scrub && blendG > 0 && blendG < 1) {
			// The scroll is in the middle of the hand-over: the panel is measured again and the model framed in it at the same g.
			place()
			blend(blendG)
			return Promise.resolve(null)
		}
		if (!entered) {
			place()
			return Promise.resolve(null)
		}
		if (o.duration > 0) liftCap(o.duration * 1000 + 250)
		return frame(o).then((r) => {
			updateShift()
			return r
		})
	}

	function enter({ duration = 0.8, ease = 'standard', blend: driven = false } = {}) {
		entered = true
		still = false
		dock.dataset.motion = 'moving'
		enteredAt = performance.now()
		hintBase = scrollY
		const s = scene()
		if (!ctx.reduced()) s?.setAutoRotate?.(true)
		scheduleSync()
		if (driven) {
			// The scroll drove the hand-over (blend): the model is framed already, only the life of the site starts.
			blendG = 1
			liftCap(450)
			return Promise.resolve(null)
		}
		liftCap(duration * 1000 + 250)
		const p = frame({ duration, ease })
		return p
	}
	function leave() {
		entered = false
		appliedView = null
		clearTimeout(viewTimer)
		if (dragging) endDrag()
		setStill(false)
		scene()?.setAutoRotate?.(false)
		scene()?.setMaxFps?.(null)
		clearTimeout(capTimer)
		if (shift) {
			shift = 0
			dock.style.transform = ''
			scene()?.setFrameShift?.(0, 0)
		}
		root.classList.remove('is-still')
	}

	// All listeners are passive: none of them cancels anything (a pointer capture is not a cancellation).
	const passive = { passive: true }
	dock.addEventListener('pointerdown', onPointerDown, passive)
	dock.addEventListener('pointermove', onPointerMove, passive)
	dock.addEventListener('pointerup', endDrag, passive)
	dock.addEventListener('pointercancel', endDrag, passive)
	dock.addEventListener('lostpointercapture', endDrag, passive)
	dock.addEventListener('keydown', onKey)
	watchSections()
	place()

	return {
		enter,
		leave,
		layout,
		place,
		frame,
		blend,
		setStill,
		rebaseScroll,
		get small() {
			return small
		},
		get section() {
			return section
		},
		get still() {
			return still
		},
		get entered() {
			return entered
		},
		get lastSectionAt() {
			return lastSectionAt
		},
		get modelRect() {
			return lastRect
		},
		get shift() {
			return shift
		},
		get dragging() {
			return Boolean(dragging)
		},
		destroy() {
			removeEventListener('scroll', scheduleSync)
			removeEventListener('resize', scheduleSync)
			cancelAnimationFrame(syncFrame)
			dock.removeEventListener('pointerdown', onPointerDown)
			dock.removeEventListener('pointermove', onPointerMove)
			dock.removeEventListener('pointerup', endDrag)
			dock.removeEventListener('pointercancel', endDrag)
			dock.removeEventListener('lostpointercapture', endDrag)
			dock.removeEventListener('keydown', onKey)
		},
	}
}
