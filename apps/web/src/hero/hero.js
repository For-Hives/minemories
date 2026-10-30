// Minemories · hero v9 (24/10/2026): "the story goes through the game's own interface", then a real site. Mounts the chalet scene through its host API (scene.js,
// HOST-API.md sections 16, 17, 21 and 23) in TIME mode and composes the page around it. Documents: ../hero/decisions-v9.md (rules), PAGE-API.md (this page's contract).
//
// One page, two phases (html[data-phase], event `mm:phase` on document with { phase, cause, t }):
//   FILM  the scene plays on its own (guided playback with host stops), the game's chat, typing bubble, held menu, /title lines and hotbar are HTML over the canvas
//         (hud.js). Nothing the visitor does while it plays is blocked: the page scrolls natively, always.
//   SITE  the same fixed canvas is framed in a panel beside (landscape) or above (portrait) the content; the model lives and turns under the visitor's hand (site.js).
// What leaves the film (phase.js, pure): its end (film time 55.5 s), "Skip the film", Escape, scrolling more than 32 px once the first frame is rendered, keyboard
// focus inside the site content (never on the film's own controls), the last reduced-motion station. An anchor in the URL (#hero, #steps, #share, #limits, #faq), or
// no WebGL, starts on the site. "Watch the film again" is the way back (and the only write to the scroll position the page ever makes, besides the reset at load).
// Every string comes from i18n.js (catalogue keys = English text; the player is "Efe"); no text is drawn in the canvas.
// Reduced motion: no autoplay; twelve stations, advanced by the visitor ("Previous" / "Next", left / right arrows), each showing exactly hudAt(t).
// Without WebGL 2 (or ?nowebgl=1): the scene is never loaded; the site is the page, the still image of the model is the panel, the story is in words.
// URL: ?lang= ?autoplay=0 ?q= ?captures= ?nowebgl=1 ?reduced=1 ?hold=0 ?modchat=0 ?fill=<n> ?butterflies=1, scene variants (=0 or =1), ?dogWarm=<n>.
//
// v9c (26/10/2026): the hand-over waits for ONE rendered frame (scene.nextFrame), the 360 px header gets its install button and a menu, the film bar is one row at the top, the arrival line of the
// return ("{name} joined the game", hud.js), the model is larger (site.js, fit 'tight'). Details: CHANGELOG-v9.md (v9c), PAGE-API.md section 12.
//
// v10 (26/10/2026, decisions-v10): the SCROLL DRIVES THE FILM. The film time belongs to the page (scrub.js, pure): wheel, finger and keys give it deltas (1 px = 1/280 s, at most 3x, nothing
// queued), it starts again by itself after 1.6 s of rest, and the hand-over to the site is a position `g` (0 to 1) that the scroll drives both ways: html[data-phase] is film | glide | site.
// The scene runs in `external` mode (scene.setTime / setSiteBlend / setFrameShift). Every listener on the wheel and the touch is passive, nothing calls preventDefault on them; during the film
// the document is locked (site.css, `overflow: hidden`) and the page reads the inputs itself. `?scrub=0` brings back the v9d behaviour (film played in time, native scroll hands over to the site).
//
// Test hooks kept: window.__mm (t, probe, scene, mods, debug, seek) and window.__hero (goto, play, audit, layout, guided, chapters, anchors, variant, chaptersAt, hudAt,
// plan, holds, holding, holdLeft, on, placed, hud, fallback) plus the v9 ones (phase, phaseLog, site, i18n).
import * as HUD from './hud.js'
import { bindTooltips, createHotbar, relabel as relabelHotbar } from './mcui/hotbar.js'
import { createPhaseMachine, DEFAULT_SITE_START, startPhase } from './phase.js'
import { createFilmScrub, keyToPx, normalizeWheel } from './scrub.js'
import { createSite, formatOf } from './site.js'

const $ = (sel, el = document) => el.querySelector(sel)
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)]
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
// The page's own scroll writes are instant (the document may glide to header anchors: a glide through 32 px must not read as the visitor's scroll).
/**
 * Mounts the film on the markup rendered by HeroFilm.tsx and returns the function that takes everything back (listeners, frame loop, scene, <html> state).
 * `host.i18n` is the app bridge ({ locale, t, apply, onChange, setLocale }); `host.root` is the element that holds the film markup.
 */
export function mountHero(host) {
	const ac = new AbortController()
	const { signal } = ac
	const on = (target, type, listener, options) =>
		target.addEventListener(type, listener, {
			...(typeof options === 'boolean' ? { capture: options } : options),
			signal,
		})
	let disposed = false
	let unbindTips = null
	const scrollTop0 = () => {
		scrollTo({ top: 0, left: 0, behavior: 'instant' })
		site?.rebaseScroll?.() // v9d: the page's own scroll is never the visitor's (it would take the "Drag to turn" hint away)
	}
	const store = (key, value) => {
		try {
			if (value === undefined) return localStorage.getItem(key)
			localStorage.setItem(key, value)
		} catch {
			return null
		}
		return null
	}

	const params = new URLSearchParams(location.search)
	const root = document.documentElement
	const stage = $('#stage')
	const canvas = $('#mm-scene')
	const anchorLayer = $('#anchors')
	const header = $('.mc-sitebar')
	const dock = $('#dock')
	const hudRoot = $('.hud8') // the film HUD: chat, bubble, held screen, /title lines, hotbar
	const sigSay = $('.sig-say') // the only voice during the film (role=status, aria-live=polite)
	const veil = $('.veil-page')
	const filmSnap = $('#film-snap') // v9b: the last film frame, held over the cut of a jump hand-over while the site is prepared underneath
	const playBtn = $('#film-play')
	const playLabel = $('.ctl-label')
	const skipBtn = $('#film-skip')
	const stepsBar = $('.film-steps')
	const stepCount = $('.film-steps__count')
	const filmBar = $('.film-bar')
	const stepButtons = $$('[data-step]')
	const ticks = $$('.tick')
	const rail = $('#film-rail') // v12 (Andy): the timeline on the right edge: where the film is, and a way back up
	const railTrack = $('[data-rail-track]')
	const railThumb = $('.film-rail__thumb')
	const posterImg = $('.poster img')

	const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)')
	const reduced = () => params.get('reduced') === '1' || root.dataset.mcMotion === 'reduced' || reducedQuery.matches
	const SCRUB_ON = params.get('scrub') !== '0' // v10: the scroll drives the film (false: the v9d behaviour)
	const HOLD_ON = params.get('hold') !== '0'
	const MODCHAT = params.get('modchat') !== '0' // ?modchat=0: the mod line is removed (the film reads without the product)
	// Scale of the model in its panel. 1 keeps the whole turn inside the panel with 12 px (the contract); above 1 the model is larger and its corners may leave the panel.
	// The hand-over glide (final pass; decisions-v9 section 11.3 asked for 0.8 s on the standard curve, which put 78 % of the path in the first half: it read as a jump).
	// 1.2 s on the symmetric curve, so that the start and the arrival are both seen. CSS (site.css) uses the same numbers.
	const GLIDE = Object.freeze({ duration: 1.8, ease: 'glide' })
	const FILL =
		Number.isFinite(Number(params.get('fill'))) && Number(params.get('fill')) > 0 ? Number(params.get('fill')) : 1

	let M = null // scene.js module (loaded only when WebGL 2 is there)
	let scene = null
	let i18n = null
	let hud = null
	let hotbar = null
	let site = null
	let live = false // the scene is ready
	let guided = false // the film is playing (guided playback)
	let paused = false // the visitor paused it
	let plan = HUD.PLAN
	let siteStart = DEFAULT_SITE_START
	let layout = { W: 0, H: 0, format: 'phone', base: { x: 0, y: 0, scale: 1 }, top: 64 }
	let lastT = Number.NaN
	let lastAnchors = null // last anchors received from the scene
	let lastAnchorsT = Number.NaN // film time of those anchors
	let lastFrame = 0
	let prevT = Number.NaN
	let holding = null // host stop in progress: { id, left, native }
	let scrub = null // v10: the film clock driven by the visitor (scrub.js)
	let blendOn = false // v10: the scene shows the hand-over (setSiteBlend with g > 0)
	let lastG = -1
	let lastClockSig = ''
	let lastStationShown = -1
	let touchGesture = null
	const heldDone = new Set() // stops already played in this viewing
	let stationIndex = 0
	let siteToken = 0 // invalidates a hand-over in progress when the visitor goes elsewhere
	let appliedSize = { W: 0, H: 0 } // viewport size at the last resize the page acted on
	let visitorInput = false // a real wheel, touch or key before the first frame: a scroll made then is the visitor's, not a restoration
	const phaseLog = []
	let HOLDS = HUD.holdList().map(([at, wall], i) => ({ id: ['capture', 'keep'][i], at, wall }))
	const webglOk = params.get('nowebgl') !== '1' && hasWebGL2()
	const phases = createPhaseMachine({ phase: startPhase({ hash: location.hash, webgl: webglOk }) })
	let curPhase = phases.phase // v10: 'film' | 'glide' | 'site', from the position (t, g)
	const phase = () => (SCRUB_ON ? curPhase : phases.phase)
	const hudPhase = () => (phase() === 'film' ? 'film' : 'site') // the film's HUD is off as soon as the glide begins

	// ---------------------------------------------------------------------------------------------------------------
	// Test hooks
	// ---------------------------------------------------------------------------------------------------------------

	window.__mm = {
		get t() {
			return scene?.time
		},
		get probe() {
			return scene?.probe ?? { ready: false }
		},
		get scene() {
			return scene
		},
		get mods() {
			return scene?.debug?.mods
		},
		get debug() {
			return scene?.debug
		},
		seek: t => goto(t),
	}
	window.__hero = {
		goto: t => goto(t),
		// Test: starts (or resumes) the film from the current time, like the play button.
		play: () => startFilm(),
		audit: () => audit(),
		get layout() {
			return layout
		},
		get guided() {
			return SCRUB_ON ? isPlaying() : guided
		},
		get phase() {
			return phase()
		},
		// v10: the clock seen from outside ({ state, intent, t, g, rate, idleLeft, rampK, stats }), a synthetic input (px > 0 goes forward), the position.
		get scrub() {
			if (!scrub) return null
			const now = scrub.tick(performance.now())
			return {
				state: now.state,
				intent: now.intent,
				t: now.t,
				g: now.g,
				rate: now.rate,
				idleLeft: now.idleLeft,
				rampK: now.rampK,
				station: now.station,
				stats: scrub.stats,
			}
		},
		input: (px, source = 'wheel') => {
			if (!scrub) return false
			return scrub.input({ px: Number(px) || 0, source, at: performance.now() })
		},
		get position() {
			return scrub ? { ...scrub.position } : { t: scene?.time ?? 0, g: phase() === 'site' ? 1 : 0 }
		},
		get phaseLog() {
			return phaseLog.map(p => ({ ...p }))
		},
		get site() {
			return site
				? {
						small: site.small,
						section: site.section,
						still: site.still,
						entered: site.entered,
						modelRect: site.modelRect,
					}
				: null
		},
		get i18n() {
			return i18n
		},
		get chapters() {
			return [...HUD.chaptersAt(scene?.time ?? 0, { plan, modchat: MODCHAT, site: phase() === 'site' })]
		},
		// Last anchors received from the scene (fractions of the canvas) and the film time they belong to.
		get anchors() {
			return lastAnchors ? { t: lastAnchorsT, ...JSON.parse(JSON.stringify(lastAnchors)) } : null
		},
		get variant() {
			return scene?.variant ?? null
		},
		// Texts lit at film time t: pure, no render.
		chaptersAt: t => [...HUD.chaptersAt(Number(t), { plan, modchat: MODCHAT })],
		// HUD state at film time t (pure, no DOM): { site, chat, chatAbove, typing, menu, title, hotbar }.
		hudAt: (t, o = {}) => HUD.hudAt(Number(t), { plan, modchat: MODCHAT, site: Boolean(o.site) }),
		get plan() {
			return plan
		},
		get holds() {
			return HOLD_ON && !reduced() ? HOLDS.map(h => [h.at, h.wall]) : []
		},
		get holding() {
			return holding?.id ?? null
		},
		get holdLeft() {
			if (!holding) return null
			if (SCRUB_ON) return scrub?.holding ? +Math.max(0, scrub.holding.left).toFixed(2) : null
			return holding.native
				? +Math.max(0, holding.left - (scene?.probe?.hold?.at ?? 0)).toFixed(2)
				: +holding.left.toFixed(2)
		},
		// The HUD lit (ids of the [data-hud].is-on elements) and the elements placed (bubble, held screen, titles).
		get on() {
			return hud ? hud.on : []
		},
		get placed() {
			return hud ? hud.placed : []
		},
		// The HUD seen from outside (tests: hud-away). On the site, `on` must be empty from the first frame.
		get hud() {
			return {
				phase: phase(),
				on: hud ? hud.on : [],
				holding: holding?.id ?? null,
				say: sigSay.textContent,
				frames: scene?.probe?.frames ?? 0,
			}
		},
		fallback: null,
	}

	posterImg?.addEventListener('error', () => {
		posterImg.closest('picture').hidden = true
	})

	// ---------------------------------------------------------------------------------------------------------------
	// Start
	// ---------------------------------------------------------------------------------------------------------------

	function hasWebGL2() {
		try {
			const probe = document.createElement('canvas')
			const gl = probe.getContext('webgl2')
			if (!gl) return false
			gl.getExtension('WEBGL_lose_context')?.loseContext()
			return true
		} catch {
			return false
		}
	}

	async function boot() {
		// The scene module starts loading at once; the catalogues load beside it.
		const sceneModule = webglOk ? import('./scene.js').catch(error => ({ error })) : null
		i18n = host.i18n
		i18n.apply()
		alignToHash()
		wireLanguage()
		buildHotbar()
		wirePage()
		computeLayout()
		// A reload or a restored position must not skip the film: the film starts from the top.
		if (phase() === 'film' && scrollY > 0) scrollTop0()
		site = createSite({
			document,
			dock,
			scene: () => scene,
			reduced,
			phase,
			fill: FILL,
			scrub: SCRUB_ON,
		})
		root.classList.toggle('is-reduced', reduced())
		header.classList.toggle('is-solid', phase() === 'site')
		if (phase() === 'site') root.classList.add('is-direct')
		describeWords(webglOk)
		if (!webglOk) return fallback('webgl')
		root.classList.add('scene-on', 'scene-loading')
		const loaded = await sceneModule
		if (loaded.error) return fallback('import', loaded.error)
		M = loaded
		setupPlan()
		const options = {
			mode: SCRUB_ON ? 'external' : 'time',
			autoplay: false,
			background: '#14110e',
			capturesUrl: host.capturesUrl,
			fetchGlb: host.fetchGlb ?? null, // how the captures are downloaded (lib/capture-delta.ts); null = plain files
			captures: 'v2light', // the meshopt-compressed captures served from /hero/captures/
			anchorsTarget: anchorLayer,
			subjectOffset: layout.base,
			// Density ceiling re-read at each resize (1.25 above 768 px, as on the prize-winning WebGL sites).
			maxPixelRatio: w => (w > 768 ? 1.25 : 2),
			reducedMotion: params.get('reduced') === '1' || root.dataset.mcMotion === 'reduced' ? true : 'auto',
		}
		// Story variants (decisions for Andy and Breval): defaults in VARIANT_DEFAULTS (scene.js); the page reads =0 and =1.
		for (const key of M.VARIANT_KEYS ?? []) {
			const v = params.get(key)
			if (v === '0' || v === '1') options[key] = v === '1'
		}
		const dogWarm = params.get('dogWarm') === null ? Number.NaN : Number(params.get('dogWarm'))
		if (Number.isFinite(dogWarm) && dogWarm >= 0) options.tune = { scene: { dogWarm } }
		if (params.get('butterflies') === '1') options.decor = { butterflies: true }
		if (['high', 'low', 'auto'].includes(params.get('q'))) options.quality = params.get('q')
		if (['v0', 'v1', 'v2', 'v2light'].includes(params.get('captures'))) options.captures = params.get('captures')
		scene = M.mount(canvas, options)
		wireScene()
		try {
			await scene.ready
		} catch (error) {
			return fallback(error.code ?? 'init', error)
		}
		onReady()
	}

	// HUD plan: the cue table and the scene dates (scene v9: STORY.cues, TIMELINE.signals, BEATS); else the local copy of the same table (hud.js LOCAL_CUES / LOCAL_REF).
	function setupPlan() {
		const beat = {}
		for (const b of M.BEATS) beat[b.name] ??= [b.start, b.end]
		const sg = M.TIMELINE.signals ?? {}
		const v9 = Array.isArray(M.STORY?.cues)
		siteStart = M.STORY?.site?.start ?? DEFAULT_SITE_START
		const ref = {
			...HUD.LOCAL_REF,
			duration: M.TIMELINE.duration,
			diorama: beat.diorama?.[0] ?? HUD.LOCAL_REF.diorama,
			siteStart,
			holdAt: sg.holdAt ?? HUD.LOCAL_REF.holdAt,
			holdWall: sg.holdWall ?? HUD.LOCAL_REF.holdWall,
		}
		if (!v9) console.info('[hero] scene without STORY.cues: local HUD table (decisions-v9 section 10.1)')
		plan = HUD.makePlan(v9 ? M.STORY.cues : HUD.LOCAL_CUES, ref)
		HUD.setPlan(plan)
		HOLDS = HUD.holdList(plan).map(([at, wall], i) => ({ id: ['capture', 'keep'][i], at, wall }))
	}

	function fallback(code, error) {
		// no WebGL 2 is an expected state, not a fault: the site is the page
		;(code === 'webgl' ? console.info : console.warn)(`[hero] static fallback (${code})`, error ?? '')
		window.__hero.fallback = code
		scene?.dispose()
		scene = null
		live = false
		root.classList.remove('scene-on', 'scene-loading', 'is-live')
		root.classList.add('scene-off')
		describeWords(false)
		if (phases.phase !== 'site') {
			phases.event({ type: 'skip' })
			curPhase = 'site'
			applyPhase('fallback')
		}
		// A browser with no WebGL 2 starts the machine on the site, so the transition above never runs: write the phase anyway, or the first-paint script's
		// 'film' stays on <html> and the whole site stays at opacity 0 (technical control D1: a blank page).
		curPhase = 'site'
		root.dataset.phase = 'site'
		root.style.setProperty('--g', '1')
		header.classList.add('is-solid')
		site?.place()
	}

	// With the scene, "The film, in words" is only the description of the canvas (visually hidden): its summary leaves the tab order (an invisible focus stop,
	// WCAG 2.4.7) and the region is named by the summary rather than by the "no 3D scene" note. Without it, the story is the page again.
	function describeWords(sceneOn) {
		const summary = $('#words-summary')
		if (sceneOn) summary?.setAttribute('tabindex', '-1')
		else summary?.removeAttribute('tabindex')
		$('#words')?.setAttribute('aria-labelledby', sceneOn ? 'words-summary' : 'words-note')
	}

	function onReady() {
		describeWords(true)
		live = true
		root.classList.remove('scene-loading')
		root.classList.add('is-live')
		hud = HUD.createHud({
			root: hudRoot,
			frameOf,
			anchors: () => (anchorsFresh() ? lastAnchors : null),
			reduced,
			announce: say,
			modchat: MODCHAT,
			t: i18n.t,
			hotbar,
			phase: hudPhase,
			signal,
		})
		if (SCRUB_ON) makeScrub()
		relabelChapters()
		updatePlayUI()
		updateStepsUI()
		lastFrame = performance.now()
		requestAnimationFrame(loop)
		if (phase() === 'site') {
			// An anchor started the page on the site: the model is placed at once, nothing is played.
			void placeModelOnSite({ cause: 'start' })
			return
		}
		filmBegin()
	}

	function filmBegin() {
		if (reduced()) showStation(0, { immediate: true })
		else if (SCRUB_ON) {
			// The clock was created playing (or paused with ?autoplay=0); the first frame arms the page (loopScrub).
			scene.setTime(0)
		} else if (params.get('autoplay') !== '0') startFilm()
		updatePlayUI()
	}

	function wireScene() {
		scene.on('anchors', anchors => {
			lastAnchors = anchors
			lastAnchorsT = scene.probe.renderedT // the film time this frame belongs to (probe.renderedT is set just before the frame's events)
		})
		scene.on('theme', ({ sky }) => {
			root.dataset.sky = sky
		})
		scene.on('hold', e => {
			if (e.phase !== 'end' || SCRUB_ON) return // v10: the clock (scrub.js) owns the stop; the scene's own timer is only the glow's breath
			holding = null
			delete root.dataset.hold
		})
		scene.on('play', updatePlayUI)
		scene.on('pause', updatePlayUI)
		scene.on('end', () => {
			if (SCRUB_ON) return
			guided = false
			if (phase() === 'film') handOver(phases.event({ type: 'time', t: Infinity, playing: true }))
		})
		scene.on('error', event => {
			if (event.fatal) fallback(event.code, event)
		})
		scene.on('warning', ({ message }) => console.info(`[hero] scene: ${message}`))
	}

	// ---------------------------------------------------------------------------------------------------------------
	// Languages
	// ---------------------------------------------------------------------------------------------------------------

	function wireLanguage() {
		i18n.onChange(() => {
			i18n.apply()
			onLanguage()
		})
	}

	// The language changed: every text the page writes itself is rewritten, every placement forgotten (a translation is longer or shorter).
	function onLanguage() {
		if (hotbar) relabelHotbar(hotbar, i18n.t)
		hud?.relabel()
		relabelChapters()
		updatePlayUI()
		updateStepsUI()
		lastT = Number.NaN
		if (live && phase() === 'film') updateHud(scene.time)
		requestAnimationFrame(() => site?.layout({ duration: 0 }))
	}

	function buildHotbar() {
		hotbar = createHotbar({ t: i18n.t, selected: 4 })
		hudRoot.append(hotbar)
		unbindTips = bindTooltips(hotbar)
	}

	function relabelChapters() {
		HUD.chapterList().forEach((c, i) => {
			ticks[i]?.setAttribute('aria-label', i18n.t('Chapter {n}: {title}', { n: i + 1, title: i18n.t(c.title) }))
		})
	}

	// ---------------------------------------------------------------------------------------------------------------
	// Page wiring: scroll, keys, focus, buttons, options, resize
	// ---------------------------------------------------------------------------------------------------------------

	function wirePage() {
		wireMenu()
		// Scrolling is the browser's, always: passive listener, no preventDefault, no wheel listener, no scroll written (except "Watch the film again" and the reset at load).
		on(
			window,
			'scroll',
			() => {
				if (SCRUB_ON) onForeignScroll()
				else handOver(phases.event({ type: 'scroll', y: scrollY }), 'scroll')
			},
			{ passive: true }
		)
		// Keyboard focus INSIDE the site content hands over to the site; the film's own controls (skip, pause, chapters, steps) never do.
		on(window, 'focusin', event => {
			const el = event.target
			const inContent = el instanceof Element && Boolean(el.closest('#site'))
			if (SCRUB_ON) {
				if (inContent && phase() !== 'site') void jumpToSite('focus')
				return
			}
			handOver(phases.event({ type: 'focus', content: inContent }), 'focus')
		})
		on(window, 'keydown', onKey)
		for (const type of ['wheel', 'touchstart', 'keydown'])
			on(window, type, noteVisitorInput, { passive: true, capture: true })
		if (SCRUB_ON) wireInputs()

		skipBtn.addEventListener('click', () => {
			if (SCRUB_ON) void jumpToSite('skip')
			else handOver(phases.event({ type: 'skip' }), 'skip')
		})
		// In the film the brand is "back to the top": there is nowhere else to go.
		$('.mc-sitebar__brand')?.addEventListener('click', event => {
			if (phase() !== 'site') {
				event.preventDefault()
				if (!SCRUB_ON) scrollTop0()
			}
		})
		// The header's section links glide (the browser's own smooth scrolling, only when motion is welcome); every other jump or focus move is instant.
		for (const link of $$('.mc-sitebar__nav a, .mc-sitebar__brand, .site-menu__links a')) {
			link.addEventListener('click', event => {
				const target = phase() === 'site' ? document.querySelector(link.getAttribute('href') ?? '') : null
				if (!target || reduced()) return
				event.preventDefault()
				target.scrollIntoView({ behavior: 'smooth', block: 'start' })
				history.replaceState(null, '', link.getAttribute('href'))
			})
		}
		for (const button of $$('[data-action="replay"]')) button.addEventListener('click', replay)
		playBtn.addEventListener('click', () => {
			if (!scene || !live) return
			if (SCRUB_ON) togglePlay()
			else if (guided) pauseFilm()
			else startFilm()
		})
		for (const tick of ticks)
			tick.addEventListener('click', () => jumpTo(HUD.chapterList()[Number(tick.dataset.chapterIndex)]?.t ?? 0))
		for (const button of stepButtons) button.addEventListener('click', () => step(Number(button.dataset.step)))
		wireRail()

		// Accessibility options (same keys as the kit): the font is applied at once, motion reloads the page.
		const optFont = $('#opt-font')
		const optMotion = $('#opt-motion')
		if (optFont) {
			optFont.checked = root.dataset.mcFont === 'read'
			optFont.addEventListener('change', () => {
				store('mcui-font', optFont.checked ? '1' : '0')
				if (optFont.checked) root.dataset.mcFont = 'read'
				else delete root.dataset.mcFont
				requestAnimationFrame(() => {
					computeLayout()
					hud?.reset()
					site?.layout({ duration: 0 })
				})
			})
		}
		if (optMotion) {
			optMotion.checked = root.dataset.mcMotion === 'reduced'
			optMotion.addEventListener('change', () => {
				store('mcui-motion', optMotion.checked ? '1' : '0')
				location.reload()
			})
		}

		let resizeFrame = 0
		on(window, 'resize', () => {
			cancelAnimationFrame(resizeFrame)
			resizeFrame = requestAnimationFrame(onResize)
		})
		// Pixel fonts change the height of titles and of the held screen: measure again when they are there.
		document.fonts?.ready.then(() => {
			alignToHash()
			computeLayout()
			hud?.reset()
			site?.layout({ duration: 0 })
		})
	}

	// A page opened on a section link (#steps, #share, #faq...) is scrolled by the browser as soon as the anchor exists, BEFORE the catalogue and the fonts change the height of
	// what lies above it (a longer French sentence, a pixel font): the title then ends under the header or the strip (v9b, point 2). In the first seconds, and only if the visitor has
	// not moved the page since, the section is put back under the header and the strip: an instant scroll to the target (the only other position write besides "Watch again"
	// and the reset at load; tests/t2-deeplink.cjs).
	function alignToHash() {
		if (visitorInput || performance.now() > 5000 || phase() !== 'site' || !/^#[\w-]+$/.test(location.hash)) return
		const el = document.getElementById(location.hash.slice(1))
		if (!el) return
		const cs = getComputedStyle(el)
		const want = (parseFloat(getComputedStyle(root).scrollPaddingTop) || 0) + (parseFloat(cs.scrollMarginTop) || 0)
		const top = el.getBoundingClientRect().top
		if (Math.abs(top - want) > 1 && (top > want || scrollY > 0)) {
			scrollTo({ top: Math.max(0, scrollY + top - want), left: 0, behavior: 'instant' })
			site?.rebaseScroll?.()
		}
	}

	// The menu of the small screens (a disclosure under the header: links to the sections, and the language under 700 px). Escape closes it FIRST and goes no further (during
	// the film it would otherwise leave the film), a click or the focus going elsewhere closes it, a link closes it and the page glides to its section. No wheel or touch listener.
	function wireMenu() {
		const button = $('#site-menu-btn')
		const menu = $('#site-menu')
		if (!button || !menu) return
		const setOpen = (open, { focus = false } = {}) => {
			menu.hidden = !open
			button.setAttribute('aria-expanded', open ? 'true' : 'false')
			root.classList.toggle('is-menu-open', open)
			if (!open && focus) button.focus({ preventScroll: true })
		}
		button.addEventListener('click', () => setOpen(menu.hidden))
		on(
			document,
			'keydown',
			event => {
				if (event.key !== 'Escape' || menu.hidden) return
				event.preventDefault()
				event.stopPropagation()
				setOpen(false, { focus: true })
			},
			true
		)
		on(
			document,
			'pointerdown',
			event => {
				if (!menu.hidden && event.target instanceof Element && !event.target.closest('#site-menu, #site-menu-btn'))
					setOpen(false)
			},
			{ passive: true }
		)
		const leaves = event => {
			const next = event.relatedTarget
			if (!menu.hidden && !(next instanceof Node && (menu.contains(next) || button.contains(next)))) setOpen(false)
		}
		menu.addEventListener('focusout', leaves)
		button.addEventListener('focusout', event => {
			if (event.relatedTarget instanceof Node && menu.contains(event.relatedTarget)) return
			// Shift+Tab from the button or a click elsewhere: closed; Tab from the button goes into the panel (next in the DOM) and stays open.
			if (!menu.hidden && !menu.contains(event.relatedTarget)) setOpen(false)
		})
		for (const link of $$('.site-menu__links a')) link.addEventListener('click', () => setOpen(false))
		on(matchMedia('(min-width: 1100px)'), 'change', event => {
			if (event.matches) setOpen(false)
		})
		// The film hides the button from 700 px up (site.css): an open menu goes with it.
		on(document, 'mm:phase', () => {
			if (!button.getClientRects().length) setOpen(false)
		})
	}

	function noteVisitorInput() {
		visitorInput = true
	}

	function onResize() {
		// A phone's address bar showing or hiding changes only the height, by tens of px, many times while the visitor scrolls. The strip is sized in svh (stable),
		// so the model keeps its framing: nothing to do (UX control P0-1: every reframe was a chance to lose the model).
		const W = Math.round(root.getBoundingClientRect().width) || root.clientWidth || innerWidth
		const H = root.clientHeight || innerHeight
		if (
			live &&
			phase() === 'site' &&
			root.dataset.dock === 'band' &&
			W === appliedSize.W &&
			Math.abs(H - appliedSize.H) < 120
		)
			return
		computeLayout()
		scrub?.setViewportHeight(H)
		if (!live) {
			site?.place()
			return
		}
		if (SCRUB_ON && phase() !== 'film') {
			// v10: the hand-over is a function of g and of the panel: the panel is measured again and the model framed in it at the same g (nothing moves in t or g).
			site.layout({ duration: 0 })
			return
		}
		if (phase() === 'film') {
			hud?.reset() // the bubble and the held screen are placed again from the anchors of the new size
			lastT = Number.NaN
			scene.setSubjectOffset(layout.base)
			updateHud(scene.time)
		} else site?.layout({ duration: 0 })
	}

	function onKey(event) {
		if (SCRUB_ON) return onKeyScrub(event)
		if (event.altKey || event.ctrlKey || event.metaKey) return
		const target = event.target instanceof Element ? event.target : document.body
		if (target.closest('input, select, textarea, [contenteditable="true"]')) return
		if (phase() === 'site') return
		if (event.key === 'Escape') {
			handOver(phases.event({ type: 'key', key: 'Escape' }), 'key')
			return
		}
		if (!live) return
		const onControl = Boolean(target.closest('button, a, summary'))
		if (reduced()) {
			if (event.key === 'ArrowRight') step(1)
			else if (event.key === 'ArrowLeft') step(-1)
		}
		if (/^[1-5]$/.test(event.key)) {
			jumpTo(HUD.chapterList()[Number(event.key) - 1].t)
			return
		}
		// Space and K pause or play. Space on a button is that button's own click; elsewhere it must not scroll the page (a scroll would skip the film).
		if ((event.key === ' ' || event.key === 'k' || event.key === 'K') && !reduced()) {
			if (event.key === ' ' && onControl) return
			event.preventDefault()
			if (guided) pauseFilm()
			else startFilm()
		}
	}

	// ---------------------------------------------------------------------------------------------------------------
	// Phases: hand-over to the site, back to the film
	// ---------------------------------------------------------------------------------------------------------------

	// Applies a transition the machine reported.
	function handOver(result, cause) {
		if (!result.changed || result.phase !== 'site') return
		void enterSite(result.cause ?? cause)
	}

	function applyPhase(cause) {
		const next = phases.phase
		root.dataset.phase = next
		if (next !== 'film') hud?.reset() // v12: same rule as changePhase (the HUD is lit only in the film phase)
		header.classList.toggle('is-solid', next === 'site')
		const detail = { phase: next, cause, t: scene?.time ?? null, wall: Math.round(performance.now()) }
		phaseLog.push(detail)
		document.dispatchEvent(new CustomEvent('mm:phase', { detail }))
	}

	// A jump hand-over (skip, Escape, scroll, focus, last station) used to be covered by a veil of the page colour: 0.2 s of flat dark, and up to 3.5 s when the scene was slow
	// to produce its frames (v9b, point 5). It is now covered by the film's own last frame (a 2D copy of the canvas, taken in the same task as a render), held while the site is
	// prepared underneath, then cross-faded away: the picture on screen is never a blank one. Without a copy (no frame within 1.2 s) the old veil is the fallback.
	async function coverWithFilmFrame() {
		if (!scene || !live || !filmSnap) return false
		const ok = await scene.snapshot(filmSnap, { timeout: 1200 })
		if (!ok) return false
		filmSnap.classList.remove('is-out')
		filmSnap.classList.add('is-on')
		root.classList.add('is-crossfade')
		return true
	}

	async function releaseFilmFrame() {
		if (!filmSnap || !filmSnap.classList.contains('is-on')) return
		filmSnap.classList.add('is-out')
		// Released when the fade has really ended (the copy is transparent), read from the computed opacity at each frame, not after a fixed delay: a busy main thread starts the
		// transition late, and a fixed 380 ms removed the copy while it was still 24 to 57 % opaque (technical control P2-1). The cap is only a safety net.
		const t0 = performance.now()
		const cap = reduced() ? 500 : 1000
		await new Promise(resolve => {
			const check = () => {
				if (
					!filmSnap.classList.contains('is-on') ||
					Number.parseFloat(getComputedStyle(filmSnap).opacity) <= 0.02 ||
					performance.now() - t0 > cap
				)
					resolve()
				else requestAnimationFrame(check)
			}
			requestAnimationFrame(check)
		})
		dropFilmFrame()
	}

	function dropFilmFrame() {
		filmSnap?.classList.remove('is-on', 'is-out')
		root.classList.remove('is-crossfade')
	}

	// The visitor leaves the film. The HUD is emptied SYNCHRONOUSLY (no film element may be lit from the first frame of the site), then the model glides into its panel.
	async function enterSite(cause) {
		const token = ++siteToken
		guided = false
		abandonHold()
		hud?.reset()
		sigSay.textContent = ''
		// The natural end glides: the entering class goes on BEFORE the phase changes, so that the CSS transitions of the hand-over start with their long durations (set
		// after the phase, the portrait cut would first run its short resting transition: a jump, artistic control correction 14).
		const natural = cause === 'end' && !reduced()
		if (natural) root.classList.add('is-entering')
		// A jump: the film's frame is copied BEFORE the phase flips (the copy resolves in the same task as a render, so the flip and the cover are painted together).
		const covered = !natural && (await coverWithFilmFrame())
		if (token !== siteToken) {
			dropFilmFrame()
			return
		}
		// A scroll that triggered the hand-over is carried by the hero (site.css `--hand-y`): it arrives where it would at the top of the page.
		root.style.setProperty('--hand-y', `${Math.round(clamp(scrollY, 0, 96))}px`)
		applyPhase(cause)
		// The film controls leave with the film: a focus left on one of them (the pause button at the natural end) would fall back to <body>.
		if (document.activeElement instanceof Element && document.activeElement.closest('.film-bar'))
			$('#hero-title')?.focus({ preventScroll: true })
		if (!scene || !live) return
		const quick = reduced()
		if (natural) {
			// The natural end: the film is at its handover instant; the glide and the fade of the content start together.
			scene.setSitePhase(true, { duration: GLIDE.duration, ease: GLIDE.ease })
			await site.enter({ duration: GLIDE.duration, ease: GLIDE.ease })
			await sleep(50)
			if (token === siteToken) land()
			return
		}
		// The film is carried to the handover instant, the model is framed with no glide; the cover (the film's last frame, or the page colour when no frame could be copied)
		// goes when the site's first frames are drawn, and the content comes in with it.
		root.classList.remove('is-entering')
		if (!covered) {
			veil.classList.add('is-on')
			await sleep(quick ? 150 : 220)
			if (token !== siteToken) return
		}
		await placeModelOnSite({ cause, veil: !covered })
		if (token !== siteToken) return
		if (covered) await releaseFilmFrame()
		if (cause === 'skip' && token === siteToken) $('#hero-title')?.focus({ preventScroll: true })
	}

	// The glide is over: the strip's canvas goes above the content and is cut to the strip in the same frame (no transition for that change, site.css `is-landing`).
	function land() {
		root.classList.add('is-landing')
		root.classList.remove('is-entering')
		requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('is-landing')))
	}

	// Brings the model to the site state at once: the film at the handover instant, the site phase on, the model framed in the panel.
	// ONE rendered frame is awaited (`scene.nextFrame()`), not "two more frames": the scene draws only when something changed, so a paused film or a reduced-motion page
	// produces exactly one frame after a seek and a wait for two ran to its time-out, twice (v9b technical control P1-3: 2 s of frozen picture over a site that was ready
	// after 0.2 s). The three calls below are made in one task, so that the first frame drawn is already the site's.
	async function placeModelOnSite({ cause, veil: covered = false }) {
		if (SCRUB_ON) return placeModelOnSiteScrub(cause)
		const token = siteToken
		// A paused film (or a held one) stops the model's own life: wake it first, so that the site's model lives from its first frame.
		scene.setAmbient(true)
		scene.seek(siteStart) // a seek leaves the site phase: always BEFORE setSitePhase
		scene.setSitePhase(true, { duration: 0 })
		await site.enter({ duration: 0 })
		await scene.nextFrame()
		if (token !== siteToken) return
		if (covered) veil.classList.remove('is-on')
		if (cause === 'start') root.classList.add('is-direct')
	}

	// "Watch the film again": back to the film, at the top, playing. The only write to the scroll position besides the reset at load.
	function replay() {
		if (!scene || !live) return
		if (SCRUB_ON) return replayScrub()
		const result = phases.event({ type: 'replay' })
		if (!result.changed) return
		siteToken++
		scrollTop0()
		leaveSite()
		applyPhase('replay')
		hud.reset()
		heldDone.clear()
		abandonHold()
		lastT = Number.NaN
		if (reduced()) showStation(0, { immediate: true })
		else {
			scene.seek(0)
			startFilm()
			playBtn.focus({ preventScroll: true })
		}
	}

	// Test and chapter travel while the site is shown: back to the film phase without playing.
	function leaveSite() {
		site.leave()
		root.classList.remove('is-entering', 'is-direct', 'is-landing')
		root.style.removeProperty('--hand-y')
		dropFilmFrame()
		veil.classList.remove('is-on')
		scene.setSitePhase(false)
		scene.setSubjectOffset(layout.base)
	}

	// ---------------------------------------------------------------------------------------------------------------
	// The film: play, pause, jump, stops
	// ---------------------------------------------------------------------------------------------------------------

	function startFilm() {
		if (!scene || !live) return
		if (SCRUB_ON) return startFilmScrub()
		if (phase() === 'site') {
			const result = phases.event({ type: 'replay' })
			if (result.changed) {
				scrollTop0()
				leaveSite()
				applyPhase('replay')
			}
		}
		const D = M.TIMELINE.duration
		if (scene.time >= D - 0.05 || scene.time >= siteStart) {
			heldDone.clear()
			abandonHold()
			hud.reset()
			scene.seek(0)
		}
		guided = true
		paused = false
		scene.setAmbient(true)
		// A stop interrupted by the pause resumes where it was: controller.hold's timer is suspended by pause() and restarted by play().
		scene.play()
		prevT = scene.time
		updatePlayUI()
	}

	// Pause (WCAG 2.2.2): the film stops where it is (an ongoing host stop keeps its remaining time) and the ambient life stops with it.
	function pauseFilm() {
		if (SCRUB_ON) {
			scrub?.setIntent('pause')
			updatePlayUI()
			return
		}
		if (!guided) return
		guided = false
		paused = true
		scene.pause()
		updatePlayUI()
	}

	// v10: "playing" is the visitor's intent (the pause button, K); the clock itself may be waiting (scrolling, resting) without the intent changing.
	function isPlaying() {
		return Boolean(scrub && scrub.intent === 'play' && !reduced())
	}

	function updatePlayUI() {
		if (!playBtn) return
		const playingNow = SCRUB_ON ? isPlaying() : guided
		const state = reduced() ? 'idle' : playingNow ? 'playing' : 'paused'
		playBtn.dataset.state = state
		playBtn.hidden = !live || reduced()
		playLabel.textContent = i18n.t(state === 'playing' ? 'Pause the film' : 'Play the film')
		root.dataset.playing = playingNow ? '1' : '0'
	}

	function jumpTo(t) {
		if (SCRUB_ON) return jumpToScrub(t, 'chapter')
		if (!scene || !live || phase() !== 'film') return
		hud.reset()
		abandonHold()
		for (const h of HOLDS)
			if (t > h.at + 0.5) heldDone.add(h.id)
			else heldDone.delete(h.id)
		scene.seek(t)
		lastT = Number.NaN
		if (reduced()) stationIndex = nearestStation(t)
		updateHud(scene.time)
	}

	// Travel at a given film time (tests, tools): the film pauses there.
	function goto(t) {
		if (!scene) return
		if (SCRUB_ON) return gotoScrub(t)
		if (phase() === 'site') {
			phases.event({ type: 'goto', t })
			siteToken++
			leaveSite()
			applyPhase('goto')
		}
		guided = false
		scene.pause()
		abandonHold()
		hud?.reset()
		for (const h of HOLDS)
			if (t > h.at + 0.5) heldDone.add(h.id)
			else heldDone.delete(h.id)
		scene.seek(clamp(Number(t) || 0, 0, M.TIMELINE.duration - 1e-3))
		lastT = Number.NaN
		stationIndex = nearestStation(Number(t) || 0)
		updatePlayUI()
	}

	// Host stops (HOLDS): the scene is held at `at` for `wall` seconds, once per viewing, going forward, in guided playback.
	function tickHold(dt, t) {
		if (holding) {
			const h = HOLDS.find(x => x.id === holding.id)
			if (!guided && Math.abs(t - h.at) > 0.5) abandonHold()
			else if (holding.native)
				return // the scene keeps the timer
			else if (guided) {
				// A slow frame does not eat the stop: at most 0.25 s per frame.
				holding.left -= Math.min(dt, 0.25)
				if (holding.left <= 0) endHold()
			}
			return
		}
		if (!HOLD_ON || reduced() || !guided || !scene.playing) return
		for (const h of HOLDS) {
			if (heldDone.has(h.id)) continue
			if ((prevT < h.at && t >= h.at && t - h.at < 0.35) || (h.at < 0.01 && t < 0.35)) {
				heldDone.add(h.id)
				// The stop sits on its exact instant (the first frame past it is up to a frame late: 10.616 s instead of 10.6): the held image is then the gel's, to the pixel
				// (technical control D6). The scene is playing, the seek only moves the time back by that frame.
				if (t !== h.at) scene.seek(h.at)
				// controller.hold: constant t, playing stays true, the fire's glow breathes; it keeps its own timer. Fallback: pause() / play() and the page's timer.
				const native = typeof scene.hold === 'function' && scene.hold(h.wall)
				holding = { id: h.id, left: h.wall, native }
				root.dataset.hold = h.id
				if (!native) scene.pause()
				break
			}
			if (t < h.at - 1.5) heldDone.delete(h.id)
		}
	}

	function abandonHold() {
		if (holding?.native) scene?.cancelHold?.()
		holding = null
		delete root.dataset.hold
	}

	function endHold() {
		holding = null
		delete root.dataset.hold
		if (guided) scene.play()
	}

	// ---------------------------------------------------------------------------------------------------------------
	// Reduced motion: still stations, advanced by the visitor
	// ---------------------------------------------------------------------------------------------------------------

	const stations = () => HUD.stationList()

	function nearestStation(t) {
		let best = 0
		stations().forEach((s, i) => {
			if (Math.abs(s.t - t) < Math.abs(stations()[best].t - t)) best = i
		})
		return best
	}

	function showStation(index, { immediate = false } = {}) {
		if (!scene || !live) return
		const list = stations()
		stationIndex = clamp(index, 0, list.length - 1)
		const t = list[stationIndex].t
		const apply = () => {
			hud.reset()
			if (SCRUB_ON) scene.setTime(t)
			else scene.seek(t)
			lastT = Number.NaN
			updateHud(t)
			updateStepsUI()
		}
		if (immediate) apply()
		else {
			stage.classList.add('is-switching')
			setTimeout(() => {
				apply()
				requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove('is-switching')))
			}, 170)
		}
		updateStepsUI()
	}

	function step(dir) {
		if (!reduced() || phase() !== 'film') return
		if (SCRUB_ON) {
			scrub?.step(dir) // the clock owns the station; the frame loop shows it (loopScrub)
			return
		}
		const count = stations().length
		if (dir > 0 && stationIndex >= count - 1) {
			handOver(phases.event({ type: 'step', index: stationIndex, count, dir }), 'end')
			return
		}
		showStation(stationIndex + dir)
	}

	function updateStepsUI() {
		const on = reduced() && live && phase() === 'film'
		stepsBar.hidden = !on
		if (!on) return
		const count = stations().length
		stepCount.setAttribute('data-i18n-values', JSON.stringify({ n: stationIndex + 1, total: count }))
		stepCount.textContent = i18n.t('Film step {n} of {total}', { n: stationIndex + 1, total: count })
		stepCount.dataset.short = `${stationIndex + 1}/${count}` // the phone shows only this (hero.css); the full sentence stays for screen readers
		const [prev] = stepButtons
		if (prev) prev.disabled = stationIndex === 0
	}

	// ---------------------------------------------------------------------------------------------------------------
	// Frame loop
	// ---------------------------------------------------------------------------------------------------------------

	on(document, 'visibilitychange', () => {
		lastFrame = performance.now()
	})

	function loop(now) {
		if (disposed) return
		requestAnimationFrame(loop)
		// Wall time, capped at 5 s (under a software renderer frames are rare: a tighter cap would slow the page's timers, which are reading durations).
		const dt = Math.min(5, Math.max(0, (now - lastFrame) / 1000))
		lastFrame = now
		if (SCRUB_ON) {
			if (live && scene && scrub) loopScrub(now)
			return
		}
		if (!live || !scene || phase() !== 'film') return
		const t = scene.time
		// The first rendered frame arms the scroll threshold; a scroll restored before it is put back to the top.
		if (!phases.armed && (scene.probe.frames ?? 0) > 0) {
			phases.event({ type: 'frame' })
			// The input listeners only serve until the first frame: afterwards the page listens to nothing but scroll (no wheel listener on the site, ever).
			for (const type of ['wheel', 'touchstart', 'keydown'])
				removeEventListener(type, noteVisitorInput, { capture: true })
			// A visitor who scrolled while the scene was loading is taken to the site (the old behaviour put them back at the top: a "jump" that read as a stuck page,
			// UX control P0-2). A position nobody asked for (a restored scroll, a script) is still reset: the film starts from the top.
			if (scrollY > 0) {
				if (visitorInput) handOver(phases.event({ type: 'scroll', y: scrollY }), 'scroll')
				else scrollTop0()
			}
		}
		tickHold(dt, t)
		prevT = t
		hud.tick(t, {})
		if (t !== lastT) {
			lastT = t
			updateHud(t)
		}
		// The end of the film: the machine hands over at the site start while it plays (the stop at 51.8 s and everything before it have been played by then).
		handOver(phases.event({ type: 'time', t, playing: guided && scene.playing }), 'end')
	}

	// ---- v12 (Andy): the rail. A vertical timeline on the right edge: the fill and the thumb follow the film time (the site is 100 %), the five chapters are marked, and a click or a drag goes back
	// (or forward) in the film. A drag only moves the thumb; the film jumps ONCE, on release, through the limited chapter jump (2.5 per second): the flash guards of the scrub model hold, and
	// a visitor who scrubs across the hard cuts and the day / night passage does not strobe the page. From the site, a jump replays the film and goes to that instant.
	function railFraction(event) {
		const box = railTrack.getBoundingClientRect()
		return box.height > 0 ? clamp((event.clientY - box.top) / box.height, 0, 1) : 0
	}
	function setRail(f) {
		rail.style.setProperty('--rail-p', f.toFixed(4))
		railThumb.setAttribute('aria-valuenow', String(Math.round(f * 100)))
	}
	function updateRail(t, chapterIndex) {
		if (!rail || rail.dataset.drag) return
		setRail(clamp(t / siteStart, 0, 1))
		rail.dataset.chapter = String(chapterIndex)
	}
	function railSeek(t) {
		if (!scene || !live) return
		const chapters = HUD.chapterList()
		const to = clamp(t, 0, siteStart - 0.1)
		const near = chapters.find(c => Math.abs(c.t - to) < 1.2) // close to a chapter: its start, which is the instant the story is written for
		const target = near ? near.t : to
		if (phase() === 'site') {
			if (SCRUB_ON) replayScrub()
			else replay()
		}
		if (target > 0.05) jumpTo(target)
	}
	function wireRail() {
		if (!rail || !railTrack || !railThumb) return
		const chapters = HUD.chapterList()
		rail.querySelectorAll('[data-rail-chapter]').forEach(node => {
			const c = chapters[Number(node.dataset.railChapter)]
			node.style.setProperty('--n', String(clamp((c?.t ?? 0) / siteStart, 0, 1)))
			node.addEventListener('click', () => railSeek(c?.t ?? 0))
		})
		let pointerId = null
		railTrack.addEventListener('pointerdown', event => {
			if ((event.button ?? 0) !== 0 || event.target.closest('[data-rail-chapter]')) return
			event.preventDefault()
			pointerId = event.pointerId
			railTrack.setPointerCapture?.(pointerId)
			rail.dataset.drag = '1'
			setRail(railFraction(event))
		})
		railTrack.addEventListener('pointermove', event => {
			if (pointerId === event.pointerId && rail.dataset.drag) setRail(railFraction(event))
		})
		const end = (event, commit) => {
			if (pointerId !== event.pointerId) return
			pointerId = null
			const f = railFraction(event)
			delete rail.dataset.drag
			if (commit) railSeek(f * siteStart)
			else if (Number.isFinite(lastT)) setRail(clamp(lastT / siteStart, 0, 1))
		}
		railTrack.addEventListener('pointerup', event => end(event, true))
		railTrack.addEventListener('pointercancel', event => end(event, false))
		// The thumb is a slider: up and down go to the previous and next chapter, Home to the start, End to the site. The page's own keys (film scroll) stay out of it.
		railThumb.addEventListener('keydown', event => {
			const key = event.key
			if (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(key)) return
			event.preventDefault()
			event.stopPropagation()
			const list = HUD.chapterList()
			const now = phase() === 'site' ? list.length : Number(rail.dataset.chapter ?? 0)
			if (key === 'Home') railSeek(0)
			else if (key === 'End') void jumpToSite('key')
			else if (key === 'ArrowUp' || key === 'PageUp') railSeek(list[Math.max(0, now - 1)].t)
			else if (now + 1 < list.length) railSeek(list[now + 1].t)
			else void jumpToSite('key')
		})
	}

	// Chapters of the film (the ticks follow the film time) and the HUD.
	function updateHud(t, o = {}) {
		if (!hud || phase() !== 'film') return
		hud.update(t, o)
		const chapters = HUD.chapterList()
		let current = 0
		chapters.forEach((c, i) => {
			if (t >= c.t - 1e-3) current = i
		})
		ticks.forEach((tick, i) => {
			if (i === current) tick.setAttribute('aria-current', 'step')
			else tick.removeAttribute('aria-current')
		})
		updateRail(t, current)
	}

	// Region for screen readers (the only one): emptied first, then written on the next frame (otherwise the old text stays and is read again).
	function say(text) {
		sigSay.textContent = ''
		requestAnimationFrame(() => {
			if (phase() === 'film') sigSay.textContent = text
		})
	}

	// ---------------------------------------------------------------------------------------------------------------
	// Layout
	// ---------------------------------------------------------------------------------------------------------------

	// Film framing of the subject: wide windows keep the capture centred; portrait windows lower it (the portrait framing of the scene aims at the dog).
	function computeLayout() {
		const W = Math.round(root.getBoundingClientRect().width) || root.clientWidth || innerWidth
		const H = root.clientHeight || innerHeight
		const wide = W / H >= 1.1
		const phone = W < 640
		layout = {
			W,
			H,
			ratio: W / H,
			format: formatOf(W, H),
			base: wide ? { x: 0, y: 0, scale: 1 } : { x: 0, y: phone ? 0.05 : 0.06, scale: 1 },
			top: Math.round((header?.getBoundingClientRect().bottom ?? 64) + 8),
		}
		appliedSize = { W, H }
		root.dataset.format = layout.format
		root.classList.toggle('is-reduced', reduced())
	}

	// The scene's frame in the film layer's pixels (the canvas fills the window; the HUD layer is the same size).
	function frameOf() {
		const r = canvas.getBoundingClientRect()
		const sr = hudRoot.getBoundingClientRect()
		return {
			ox: r.left - sr.left,
			oy: r.top - sr.top,
			w: r.width,
			h: r.height,
			W: sr.width,
			H: sr.height,
			sy: sr.top,
			top: Math.max(layout.top, controlsBottom()),
		}
	}

	// Where the film controls end, when they sit at the top of the screen (under 1 280 px wide: skip, pause, the reduced-motion steps). /title blocks and the held screen are
	// never placed above it (v9c, points 1 and 2: T4 under "Skip the film" at 360 px; the stations' rows over T4 and the menu). 0 when the bar is at the bottom.
	function controlsBottom() {
		let bottom = 0
		for (const el of filmBar.children) {
			if (el.hidden || el.classList.contains('ticks')) continue
			const r = el.getBoundingClientRect()
			if (r.height > 0 && r.top < innerHeight / 2) bottom = Math.max(bottom, r.bottom)
		}
		return bottom
	}

	// Do the anchors belong to the current frame? (after a seek, the scene renders on the next frame)
	function anchorsFresh() {
		// Anchors have their own frame's date (`lastAnchorsT`), not the last rendered frame's: the scene sets `probe.renderedT` BEFORE emitting `beat` (hence before `anchors`).
		// Tolerance 0.3 s: time stops only for an instant, and the ember moves about 30 px in 2 s.
		return !!lastAnchors && Number.isFinite(lastAnchorsT) && Math.abs(lastAnchorsT - scene.time) < 0.3
	}

	// ---------------------------------------------------------------------------------------------------------------
	// v10: the scroll drives the film (scrub.js). The clock is pure; this section feeds it the visitor's inputs and shows its position.
	// ---------------------------------------------------------------------------------------------------------------

	let armedScrub = false // the first frame of the film is on screen: the clock may run
	let cutBusy = false // a jump to the site is being covered by the film's last frame: the position is not applied meanwhile
	let pendingCause = null // the cause of the next phase change (the clock's `jump` events name it)
	let glideCause = 'end'

	function makeScrub() {
		// Trial parameters, kept for the people who tune the feel: both are clamped so that a stray link can never make the film unreachable or the law unsafe
		// (the 3x cap and the flash guards live in scrub.js and do not depend on them). Never stored.
		const idle = Number(params.get('idle')) // ?idle=<ms>: a rest delay, 400 to 10000
		const gain = Number(params.get('k')) // ?k=<px per film second>, 100 to 1000 (the shipped law is 280)
		const config = {
			...(Number.isFinite(idle) && idle > 0 ? { idleMs: Math.min(10000, Math.max(400, idle)) } : {}),
			...(Number.isFinite(gain) && gain > 0 ? { pxToFilm: 1 / Math.min(1000, Math.max(100, gain)) } : {}),
		}
		scrub = createFilmScrub({ ...scrubOptions(phase() === 'site'), ...(Object.keys(config).length ? { config } : {}) })
		scrub.tick(performance.now())
	}

	function scrubOptions(onSite) {
		return {
			siteStart,
			holds: HOLD_ON && !reduced() ? HOLDS.map(h => ({ id: h.id, at: h.at, wall: h.wall })) : [],
			stations: HUD.stationList().map(s => s.t),
			lapsePhase: t => M.phaseAt(t),
			reduced: reduced(),
			H: root.clientHeight || innerHeight,
			intent: params.get('autoplay') === '0' ? 'pause' : 'play',
			t0: onSite ? siteStart : 0,
			g0: onSite ? 1 : 0,
		}
	}

	// One animation frame of the clock.
	function loopScrub(now) {
		if (!armedScrub) {
			if (phase() === 'site') armedScrub = true
			else if ((scene.probe.frames ?? 0) > 0) {
				armedScrub = true
				phases.event({ type: 'frame' })
				for (const type of ['wheel', 'touchstart', 'keydown'])
					removeEventListener(type, noteVisitorInput, { capture: true })
				scrub.rebase(now) // the film starts counting from the first rendered frame
				// A position nobody asked for (a restored scroll, a script) is still reset; a visitor who scrolled while the scene was loading goes to the site.
				if (scrollY > 0) {
					if (visitorInput) void jumpToSite('scroll')
					else scrollTop0()
				}
			} else return
		}
		if (document.hidden) {
			scrub.wake(now)
			return
		}
		syncNow(now)
	}

	// Moves the clock to `now`, handles what it reports and shows the position.
	function syncNow(now = performance.now()) {
		const r = scrub.tick(now)
		for (const e of r.events) onScrubEvent(e)
		applyPosition(r)
		const sig = `${r.state}|${r.intent}`
		if (sig !== lastClockSig) {
			lastClockSig = sig
			document.dispatchEvent(
				new CustomEvent('mm:film', { detail: { state: r.state, intent: r.intent, t: r.t, g: r.g, rate: r.rate } })
			)
			updatePlayUI()
		}
		return r
	}

	function onScrubEvent(e) {
		switch (e.type) {
			case 'hold':
				if (e.phase === 'start') {
					// The glow breathes during the stop (the scene's own timer); the clock decides when it ends.
					const native = typeof scene.hold === 'function' && scene.hold(e.wall)
					holding = { id: e.id, left: e.wall, native }
					root.dataset.hold = e.id
				} else {
					if (holding?.native) scene.cancelHold?.()
					holding = null
					delete root.dataset.hold
				}
				break
			case 'jump':
				pendingCause = e.cause
				if (['home', 'chapter', 'goto', 'replay'].includes(e.cause)) {
					hud?.reset()
					lastT = Number.NaN
				}
				if (e.cause === 'station' && e.to.g === 0 && reduced()) showStation(scrub.station)
				break
			default:
				break
		}
	}

	const causeOf = (next, prev, r) => {
		const c = pendingCause
		pendingCause = null
		if (c) return c
		if (next === 'glide') return prev === 'site' ? 'rewind' : r.state === 'scrub' ? 'scroll' : 'end'
		if (next === 'site') return glideCause
		return 'rewind'
	}

	function applyPosition(r) {
		if (cutBusy) return
		const next = r.g >= 1 ? 'site' : r.g > 0 ? 'glide' : 'film'
		if (next !== curPhase) {
			if (curPhase === 'film' && next === 'site') {
				// A jump to the site (Skip, Escape, End, a foreign scroll, the last station): the film's last frame covers the cut.
				void cutToSite(causeOf('site', 'film', r))
				return
			}
			changePhase(next, causeOf(next, curPhase, r), r)
		}
		applyScene(r)
	}

	// What the scene and the page show for the position (t, g).
	function applyScene({ t, g, rate }) {
		if (g <= 0) {
			if (blendOn) {
				scene.setSiteBlend(0)
				blendOn = false
			}
			if (!reduced()) scene.setTime(t)
		} else {
			if (!blendOn && scene.time !== siteStart) scene.setTime(siteStart)
			site.blend(g)
			blendOn = true
		}
		if (g !== lastG) {
			lastG = g
			root.style.setProperty('--g', g.toFixed(4))
			root.classList.toggle('is-live-pointer', g >= 0.8)
		}
		if (g <= 0 && curPhase === 'film' && !reduced()) {
			hud.tick(t, { rate: Math.abs(rate ?? 0) })
			if (t !== lastT) {
				lastT = t
				updateHud(t, { rate: Math.abs(rate ?? 0) })
			}
		}
	}

	// The phase changed: film <-> glide <-> site. The clock decided; this only dresses the page (classes, the dock, the header, the HUD, the announcement).
	function changePhase(next, cause, r) {
		const prev = curPhase
		curPhase = next
		root.dataset.phase = next
		// v12 (checkup v11b P2 n° 4): leaving the film for anything else (glide, or the site straight from a skip) clears the HUD: the ending title kept `.is-on` over the whole site (nothing painted, but PAGE-API 14.6 says the HUD is lit only in the film phase).
		if (prev === 'film' && next !== 'film') hud?.reset()
		if (next === 'glide') {
			if (prev === 'film') {
				glideCause = cause
				hud?.reset()
				sigSay.textContent = ''
				abandonHold()
				root.classList.add('is-entering')
				root.classList.remove('is-direct')
				site.place()
			} else {
				// Back from the site: the canvas goes behind the content again, uncut, with no transition (the model is in the strip: nothing moves on screen).
				site.leave()
				root.classList.remove('is-landing')
				root.classList.add('is-entering')
			}
		} else if (next === 'site') {
			// Arrived: the canvas goes above the content and is cut to the strip in the same frame (no transition for that change).
			if (prev === 'glide') land()
			else root.classList.remove('is-entering')
			site.enter({ blend: true })
			sigSay.textContent = ''
		} else {
			root.classList.remove('is-entering', 'is-direct', 'is-landing')
			if (prev !== 'film') site.leave()
			hud?.reset()
			lastT = Number.NaN
			dropFilmFrame()
			veil.classList.remove('is-on')
		}
		header.classList.toggle('is-solid', next === 'site')
		const detail = {
			phase: next,
			cause,
			t: r?.t ?? scrub?.position.t ?? null,
			g: r?.g ?? scrub?.position.g ?? 0,
			wall: Math.round(performance.now()),
		}
		phaseLog.push(detail)
		document.dispatchEvent(new CustomEvent('mm:phase', { detail }))
	}

	// A jump to the site is covered by the film's own last frame (a 2D copy of the canvas) while the site is prepared underneath, then faded away.
	async function cutToSite(cause) {
		const token = ++siteToken
		cutBusy = true
		const covered = await coverWithFilmFrame()
		if (token !== siteToken) {
			dropFilmFrame()
			return
		}
		if (!covered) {
			veil.classList.add('is-on')
			await sleep(reduced() ? 150 : 220)
			if (token !== siteToken) return
		}
		const r = scrub.tick(performance.now())
		changePhase('site', cause, r)
		cutBusy = false
		applyScene(r)
		await scene.nextFrame()
		if (token !== siteToken) return
		if (!covered) veil.classList.remove('is-on')
		else await releaseFilmFrame()
		if (cause === 'skip' && token === siteToken) $('#hero-title')?.focus({ preventScroll: true })
	}

	function jumpToSite(cause) {
		if (!scrub || !live || phase() === 'site') return
		scrub.jump({ t: siteStart, g: 1, cause })
		syncNow()
	}

	// An anchor started the page on the site: the model is placed at once, nothing is played.
	async function placeModelOnSiteScrub(cause) {
		scene.setTime(siteStart)
		site.blend(1) // first: it creates the site view, which `enter` then sets turning (the other order left the model still on a direct link)
		site.enter({ blend: true })
		blendOn = true
		lastG = 1
		root.style.setProperty('--g', '1')
		await scene.nextFrame()
		if (cause === 'start') root.classList.add('is-direct')
	}

	// "Watch the film again": back to the film, at the top, playing.
	function replayScrub() {
		if (!scrub || !live) return
		siteToken++
		cutBusy = false
		scrollTop0()
		const from = reduced() ? HUD.stationList()[0].t : 0
		scrub.jump({ t: from, g: 0, cause: 'replay', resume: true })
		if (!reduced()) scrub.setIntent('play')
		stationIndex = 0
		syncNow()
		if (reduced()) showStation(0, { immediate: true })
		else playBtn.focus({ preventScroll: true })
		updatePlayUI()
	}

	// The play button, the K key and the test hook.
	function startFilmScrub() {
		if (!scrub || !live) return
		if (phase() === 'site' || scrub.position.t >= siteStart) {
			replayScrub()
			return
		}
		scrub.setIntent('play')
		updatePlayUI()
	}

	function togglePlay() {
		if (!scrub || reduced()) return
		scrub.setIntent(scrub.intent === 'play' ? 'pause' : 'play')
		updatePlayUI()
	}

	// Chapters (1 to 5) and Home.
	function jumpToScrub(t, cause) {
		if (!scrub || !live || phase() === 'site') return
		if (!scrub.jump({ t, g: 0, cause, resume: true })) return
		stationIndex = nearestStation(t)
		syncNow()
		if (reduced()) {
			scene.setTime(t)
			hud.reset()
			lastT = Number.NaN
			updateHud(t)
		}
	}

	// Travel at a given film time (tests, tools): the film pauses there, and nothing starts it again by itself.
	function gotoScrub(t) {
		if (!scrub || !live) return
		siteToken++
		cutBusy = false
		const to = clamp(Number(t) || 0, 0, siteStart)
		scrub.jump({ t: to, g: 0, cause: 'goto' })
		scrub.setIntent('pause')
		abandonHold()
		hud?.reset()
		lastT = Number.NaN
		syncNow()
		if (reduced()) {
			scene.setTime(to)
			updateHud(to)
		}
		stationIndex = nearestStation(to)
		updatePlayUI()
	}

	// A scroll the page did not ask for while the document is locked (find in page, a hash link, a script): the site is where it goes.
	function onForeignScroll() {
		if (!scrub || !live || !armedScrub || phase() === 'site' || cutBusy) return
		if (scrollY > 0) jumpToSite('scroll')
	}

	// ---- inputs: wheel, finger, keys. Every listener on the wheel and the touch is passive; nothing here calls preventDefault on them.
	function wireInputs() {
		on(window, 'wheel', onWheel, { passive: true })
		on(window, 'touchstart', onTouchStart, { passive: true })
		on(window, 'touchmove', onTouchMove, { passive: true })
		on(window, 'touchend', onTouchEnd, { passive: true })
		on(window, 'touchcancel', onTouchEnd, { passive: true })
		on(document, 'visibilitychange', () => {
			if (!document.hidden) scrub?.wake(performance.now())
		})
		on(window, 'pageshow', event => {
			if (event.persisted) scrub?.wake(performance.now())
		})
	}

	const viewportH = () => root.clientHeight || innerHeight
	const insideMenu = target => target instanceof Element && Boolean(target.closest('.site-menu'))

	function onWheel(event) {
		if (!scrub || !live || event.ctrlKey || insideMenu(event.target)) return
		const px = normalizeWheel(event, viewportH())
		if (px === 0) return
		// On the site the page scrolls itself; only an overshoot at its very top (upward, scroll position 0) is the clock's.
		if (phase() === 'site' && (scrollY >= 1 || px > 0)) return
		scrub.input({ px, source: 'wheel', at: event.timeStamp })
	}

	function onTouchStart(event) {
		if (!scrub || !live || event.touches.length !== 1 || insideMenu(event.target)) {
			touchGesture = null
			return
		}
		const t = event.touches[0]
		touchGesture = { id: t.identifier, x: t.clientX, y: t.clientY, lastY: t.clientY, axis: null }
	}

	function onTouchMove(event) {
		const g = touchGesture
		if (!g || !scrub || event.touches.length !== 1) {
			touchGesture = null
			return
		}
		const t = event.touches[0]
		if (t.identifier !== g.id) return
		if (!g.axis) {
			const dx = t.clientX - g.x
			const dy = t.clientY - g.y
			if (Math.hypot(dx, dy) < 8) return
			g.axis = Math.abs(dy) >= Math.abs(dx) ? 'v' : 'h'
			g.lastY = g.y
		}
		if (g.axis !== 'v') return
		const px = g.lastY - t.clientY // a finger moving up goes forward, 1:1
		g.lastY = t.clientY
		if (px === 0) return
		if (phase() === 'site' && (scrollY >= 1 || px > 0)) return
		scrub.input({ px, source: 'touch', at: event.timeStamp })
	}

	function onTouchEnd() {
		touchGesture = null
	}

	function onKeyScrub(event) {
		if (event.altKey || event.ctrlKey || event.metaKey) return
		const target = event.target instanceof Element ? event.target : document.body
		if (target.closest('input, select, textarea, [contenteditable="true"]')) return
		const key = event.key
		if (phase() === 'site') {
			// At the top of the site an upward key is the clock's (the detent, then the rewind); everywhere else the keys are the page's.
			if (!scrub || !live || scrollY >= 1 || target.closest('#dock')) return
			const up = keyToPx(event, viewportH())
			if (up < 0) scrub.input({ px: up, source: 'key', at: event.timeStamp })
			return
		}
		if (key === 'Escape') {
			jumpToSite('key')
			return
		}
		if (!live || !scrub) return
		const onControl = Boolean(target.closest('button, a, summary'))
		if (reduced() && (key === 'ArrowRight' || key === 'ArrowLeft')) {
			step(key === 'ArrowRight' ? 1 : -1)
			return
		}
		if (/^[1-5]$/.test(key)) {
			jumpToScrub(HUD.chapterList()[Number(key) - 1].t, 'chapter')
			return
		}
		if (key === 'k' || key === 'K') {
			if (reduced()) return
			event.preventDefault()
			togglePlay()
			return
		}
		if (key === 'Home') {
			event.preventDefault()
			jumpToScrub(reduced() ? HUD.stationList()[0].t : 0, 'home')
			return
		}
		if (key === 'End') {
			event.preventDefault()
			jumpToSite('key')
			return
		}
		// Arrows, Page Up / Down, Space: the clock's own scroll. Space on a button is that button's click.
		const px = keyToPx(event, viewportH())
		if (px === 0 || (key === ' ' && onControl)) return
		event.preventDefault()
		scrub.input({ px, source: 'key', at: event.timeStamp })
	}

	// ---------------------------------------------------------------------------------------------------------------
	// Audit (tests: readability, zones): one instant, one verdict
	// ---------------------------------------------------------------------------------------------------------------

	function textRects(el) {
		const rects = []
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
		const range = document.createRange()
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			if (!node.textContent.trim()) continue
			range.selectNodeContents(node)
			for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) rects.push(r)
		}
		return rects
	}

	function overlaps(rects, boxes) {
		const hits = []
		for (const r of rects) {
			for (const b of boxes) {
				const w = Math.min(r.right, b.r) - Math.max(r.left, b.l)
				const h = Math.min(r.bottom, b.b) - Math.max(r.top, b.t)
				if (w > 0 && h > 0) hits.push({ box: b.name, area: Math.round(w * h) })
			}
		}
		return hits
	}

	// Protected boxes in window pixels, with 8 px of margin: the heads, the ember, the fire during the relighting (ember and fire boxes as in hud.js).
	function protectedBoxes(anchors) {
		if (!anchors) return []
		const r = canvas.getBoundingClientRect()
		const out = []
		const head = (h, name, m = 8) =>
			h?.visible &&
			h.r > h.l &&
			out.push({
				name,
				l: r.left + h.l * r.width - m,
				r: r.left + h.r * r.width + m,
				t: r.top + h.t * r.height - m,
				b: r.top + h.b * r.height + m,
			})
		head(anchors.player?.head, 'player')
		head(anchors.dog?.head, 'dog')
		const e = anchors.ember
		if (e?.visible && (e.strength ?? 1) > 0.02) {
			const rad =
				(Number.isFinite(e.size) && e.size > 0 ? Math.max(e.size, 22) : Math.max(0.03 * r.width, 22)) * 0.75 + 8
			out.push({
				name: 'ember',
				l: r.left + e.x * r.width - rad,
				t: r.top + e.y * r.height - rad,
				r: r.left + e.x * r.width + rad,
				b: r.top + e.y * r.height + rad,
			})
		}
		return out
	}

	// One instant, one verdict: (1) at most one story block lit (chat and hotbar sit at the edge); (2) the bubble, the held screen and the titles cover no face, no head or
	// box of the dog, no ember, no fire; (3) nothing but the chat and the hotbar within 8 % of a corner.
	function audit() {
		if (!scene) return { fallback: window.__hero.fallback }
		const t = scene.time
		const anchors = scene.getAnchors()
		const boxes = protectedBoxes(anchors)
		const sr = hudRoot.getBoundingClientRect()
		const cx = 0.08 * sr.width
		const cy = 0.08 * sr.height
		const items = []
		for (const el of $$('[data-hud].is-on', hudRoot)) {
			if (Number(getComputedStyle(el).opacity) < 0.5) continue
			items.push({ id: el.dataset.chapter || el.dataset.hud, kind: el.dataset.hud, el })
		}
		const periphery = kind => kind === 'chat' || kind === 'hotbar'
		const corners = []
		for (const { id, kind, el } of items) {
			if (periphery(kind)) continue
			for (const r of textRects(el)) {
				const mx = (r.left + r.right) / 2 - sr.left
				const my = (r.top + r.bottom) / 2 - sr.top
				if ((mx < cx || mx > sr.width - cx) && (my < cy || my > sr.height - cy))
					corners.push({ text: id, x: Math.round(mx), y: Math.round(my) })
			}
		}
		const found = items.flatMap(({ id, kind, el }) =>
			(kind === 'hotbar' ? [] : overlaps(textRects(el), boxes)).map(o => ({ text: id, ...o }))
		)
		// A block is the highest chapter in the DOM (the leaving line is nested in the promise: one story block).
		// The arrival line of the return ('rejoin') is the game's system message, not a story block (hud.js makePlan): it may stand while T4 is lit.
		const blocks = new Set(
			items
				.filter(x => !['hotbar', 'gui'].includes(x.kind) && x.id !== 'rejoin')
				.map(x => x.el.parentElement?.closest('[data-chapter]')?.dataset.chapter ?? x.id)
		)
		return {
			t: +t.toFixed(3),
			format: layout.format,
			beats: scene.beatsAt(),
			chapters: window.__hero.chapters,
			visible: items.map(x => x.id),
			oneBlock: blocks.size <= 1,
			holding: holding?.id ?? null,
			boxes: boxes.map(b => ({ ...b, l: Math.round(b.l), t: Math.round(b.t), r: Math.round(b.r), b: Math.round(b.b) })),
			overlaps: found,
			corners,
			ok: found.length === 0 && corners.length === 0 && blocks.size <= 1,
			variant: scene.variant,
		}
	}

	boot()

	return function dispose() {
		if (disposed) return
		disposed = true
		ac.abort()
		siteToken++
		unbindTips?.()
		site?.destroy()
		scene?.dispose()
		scene = null
		live = false
		delete window.__mm
		delete window.__hero
	}
}
