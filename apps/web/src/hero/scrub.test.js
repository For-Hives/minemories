// Ported from the prototype's Node battery (renders-v10/tests/s-scrub.mjs) to Vitest; the film modules are imported from this folder instead of docs/marketing.
// S1 to S16 (decisions-v10 section 8.1): the response law of the film clock under Node. PURE module, no browser.
//   cd renders-v10/tests && node --import ../../renders-v9/l1/tests/register.mjs s-scrub.mjs            (web/)
//   MM_WEB=web-v9d-frozen node --import ... s-scrub.mjs                                                  (red: scrub.js does not exist in the v9d)
// The scene module is imported only for `phaseAt` (the day/night phase of the film) and the station/hold tables are written here, so that a change of the page cannot hide a failure.
import { expect, test } from 'vitest'
import * as scene from './scene.js'
import * as lib from './scrub.js'

const results = []
const check = (id, name, ok, detail = '') => {
	results.push({ id, name, ok: Boolean(ok), detail })
	console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ` | ${detail}` : ''}`)
}
const near = (a, b, tol) => Math.abs(a - b) <= tol

const { createFilmScrub, normalizeWheel, keyToPx, SCRUB } = lib
const lapsePhase = (t) => scene.phaseAt(t)

const HOLDS = [
	{ id: 'capture', at: 10.6, wall: 1.2 },
	{ id: 'keep', at: 51.8, wall: 2.2 },
]
const STATIONS = [1.0, 5.5, 10.6, 17.5, 20.6, 23.6, 25.9, 30.8, 36.8, 44.0, 46.8, 48.6, 51.8]
const SITE = 55.5
const mk = (o = {}) => createFilmScrub({ siteStart: SITE, holds: HOLDS, stations: STATIONS, lapsePhase, H: 900, ...o })

// Drives a scrub for `ms` of wall time in `step` ms ticks; `inputs` is a list of { at, px, source }. Returns the samples [{ w, t, g, rate, state }] and all events.
function sim(sc, { ms, step = 4, inputs = [], start = 0, onTick = null }) {
	const samples = []
	const events = []
	const list = inputs.slice().sort((a, b) => a.at - b.at)
	let i = 0
	let prev = sc.tick(start)
	samples.push({ w: start, t: prev.t, g: prev.g, rate: 0, state: prev.state })
	for (let w = start + step; w <= start + ms + 1e-9; w += step) {
		while (i < list.length && list[i].at <= w + 1e-9) {
			sc.input({ px: list[i].px, source: list[i].source ?? 'wheel', at: list[i].at })
			i++
		}
		if (onTick) onTick(w, sc)
		const s = sc.tick(w)
		events.push(...s.events.map((e) => ({ ...e, w })))
		samples.push({ w, t: s.t, g: s.g, rate: (s.t - prev.t) / (step / 1000), state: s.state, rampK: s.rampK })
		prev = s
	}
	return { samples, events }
}
// A stream of `px` per tick at `every` ms for `ms`.
const stream = (px, every, from, ms, source = 'wheel') => {
	const out = []
	for (let at = from; at < from + ms; at += every) out.push({ at, px, source })
	return out
}
const at = (samples, w) => samples.reduce((best, s) => (Math.abs(s.w - w) < Math.abs(best.w - w) ? s : best), samples[0])
const quiet = (o = {}) => {
	const sc = mk({ intent: 'pause', autoStart: false, ...o })
	return sc
}
const placed = (t, o = {}) => {
	const sc = quiet(o)
	sc.tick(0)
	sc.jump({ t, g: 0, cause: 'goto' })
	return sc
}

// ---- S1 nominal speed ----------------------------------------------------------------------------------------------
{
	const sc = mk()
	const { samples, events } = sim(sc, { ms: 70000, step: 4 })
	const starts = events.filter((e) => e.type === 'hold' && e.phase === 'start')
	const ends = events.filter((e) => e.type === 'hold' && e.phase === 'end')
	const a = at(samples, 500)
	const b = at(samples, 9500)
	check('S1', 'nominal speed before the first stop', near((b.t - a.t) / ((b.w - a.w) / 1000), 1, 0.001), `${((b.t - a.t) / ((b.w - a.w) / 1000)).toFixed(5)}`)
	check('S1', 'two stops, on 10.600 and 51.800 exactly', starts.length === 2 && starts[0].at === 10.6 && starts[1].at === 51.8, JSON.stringify(starts.map((e) => e.at)))
	const holdS = starts.map((s, i) => (ends[i].w - s.w) / 1000)
	check('S1', 'stop durations 1.20 and 2.20 (+-0.02)', holdS.length === 2 && near(holdS[0], 1.2, 0.02) && near(holdS[1], 2.2, 0.02), holdS.map((x) => x.toFixed(3)).join(' / '))
	const heldT = samples.filter((s) => s.w > starts[0].w + 50 && s.w < ends[0].w - 50)
	check('S1', 't is constant during a stop', heldT.every((s) => s.t === 10.6), `${heldT.length} samples`)
	const reach = samples.find((s) => s.t >= SITE - 1e-9)
	const site = samples.find((s) => s.g >= 1)
	check('S1', 'the automatic glide lasts 1.80 (+-0.02) (v12: was 1.20, Andy asked for a smoother hand-over)', reach && site && near((site.w - reach.w) / 1000, 1.8, 0.02), reach && site ? ((site.w - reach.w) / 1000).toFixed(3) : 'no site')
	const after = at(samples, 12000)
	const c = at(samples, 20000)
	check('S1', 'nominal speed between the stops', near((c.t - after.t) / ((c.w - after.w) / 1000), 1, 0.001))
}

// ---- S2 one notch ---------------------------------------------------------------------------------------------------
{
	const sc = placed(15)
	const { samples } = sim(sc, { ms: 400, step: 1, inputs: [{ at: 100, px: 100 }], start: 0 })
	const moving = samples.filter((s) => Math.abs(s.rate) > 1e-9)
	const dt = samples.at(-1).t - 15
	check('S2', 'one 100 px notch moves 0.3571 s (+-0.0005)', near(dt, 100 / 280, 0.0005), dt.toFixed(5))
	const dur = moving.at(-1).w - moving[0].w + 1
	check('S2', 'in 120 ms (+-2)', near(dur, 120, 2), `${dur} ms`)
	const inside = moving.slice(2, -2)
	check('S2', 'constant speed (+-1 %) during the spreading', inside.every((s) => near(s.rate, 100 / 280 / 0.12, 0.011 * 2.976)), `${Math.min(...inside.map((s) => s.rate)).toFixed(3)}..${Math.max(...inside.map((s) => s.rate)).toFixed(3)}`)
	const stopped = samples.filter((s) => s.w > 100 + 125)
	check('S2', 'zero after the spreading', stopped.every((s) => s.rate === 0))
}

// ---- S3 linearity ----------------------------------------------------------------------------------------------------
for (const n of [1, 2, 5]) {
	const sc = placed(15)
	const inputs = Array.from({ length: n }, (_, i) => ({ at: 100 + 400 * i, px: 100 }))
	const { samples } = sim(sc, { ms: 400 * n + 400, step: 2, inputs })
	const dt = samples.at(-1).t - 15
	check('S3', `${n} notch(es) 400 ms apart = ${n} x 0.3571 s (+-0.1 %)`, near(dt, (n * 100) / 280, (n * 100) / 280 / 1000), dt.toFixed(5))
}

// ---- S4 and S5 saturation and the reverse ---------------------------------------------------------------------------
for (const [label, sign, from] of [
	['S4', 1, 1],
	['S5', -1, 15],
]) {
	const sc = placed(from)
	const { samples } = sim(sc, { ms: 4000, step: 4, inputs: stream(sign * 50, 1000 / 60, 100, 2000) })
	const peak = Math.max(...samples.map((s) => Math.abs(s.rate)))
	check(label, 'speed never above 3.000 (+-0.5 %)', peak <= 3.015, `peak ${peak.toFixed(4)}`)
	const dt = Math.abs(samples.at(-1).t - from)
	check(label, 'Dt <= 6.0 + 0.36 s', dt <= 6.0 + 0.36 + 1e-6, dt.toFixed(4))
	const stopAt = samples.find((s) => s.w > 2100 + 125 && Math.abs(s.rate) < 1e-9)
	const lastMove = samples.filter((s) => Math.abs(s.rate) > 1e-9).at(-1)
	check(label, 'motion stops within 120 ms of the last input (no catch-up)', lastMove.w <= 2100 + 120 + 20 && stopAt && samples.filter((s) => s.w > lastMove.w).every((s) => Math.abs(s.rate) < 1e-9), `last motion ${lastMove.w} ms`)
	check(label, 'excess is dropped (counted)', sc.stats.dropped > 1)
	check(label, 'direction', Math.sign(samples.at(-1).t - from) === sign)
}

// ---- S6 resume -----------------------------------------------------------------------------------------------------------
{
	const sc = mk()
	sc.tick(0)
	sc.jump({ t: 12, g: 0, cause: 'goto', resume: true })
	const T = 1000
	const { samples } = sim(sc, { ms: 6000, step: 4, inputs: [{ at: T, px: 100 }] })
	const end = T + 120
	const still = samples.filter((s) => s.w > end + 8 && s.w < end + 1600 - 8)
	check('S6', 't constant for 1.60 s after the spreading', still.every((s) => Math.abs(s.rate) < 1e-9), `${still.length} samples`)
	const first = samples.find((s) => s.w > end + 1400 && s.rate > 1e-4)
	check('S6', 'the film restarts at 1.60 (+-0.02)', first && near((first.w - end) / 1000, 1.6, 0.02), first ? ((first.w - end) / 1000).toFixed(3) : 'never')
	const ramp = samples.filter((s) => s.w >= end + 1600 && s.w <= end + 2200)
	const dev = Math.max(...ramp.map((s) => Math.abs(s.rate - (s.w - (end + 1600) - 2) / 600)))
	check('S6', 'linear ramp 0 -> 1 in 0.60 (<= 1 % off the line)', dev <= 0.012, `max deviation ${dev.toFixed(4)}`)
	const full = samples.find((s) => s.w > end + 2000 && s.rate >= 0.995)
	check('S6', 'nominal again at 0.60 (+-0.02)', full && near((full.w - end - 1600) / 1000, 0.6, 0.02), full ? ((full.w - end - 1600) / 1000).toFixed(3) : 'never')
	// no resume after a pause, nor in reduced motion
	const p = mk()
	p.tick(0)
	p.jump({ t: 12, g: 0, cause: 'goto', resume: true })
	p.setIntent('pause')
	const sp = sim(p, { ms: 6000, step: 8, inputs: [{ at: 500, px: 100 }] })
	check('S6', 'no resume when the visitor paused', sp.samples.filter((s) => s.w > 1000).every((s) => Math.abs(s.rate) < 1e-9))
	const r = mk({ reduced: true })
	const sr = sim(r, { ms: 6000, step: 8 })
	check('S6', 'no autoplay in reduced motion', sr.samples.every((s) => s.t === sr.samples[0].t))
}

// ---- S7 from playback to scroll -----------------------------------------------------------------------------------------
{
	const sc = mk()
	sc.tick(0)
	sc.jump({ t: 12, g: 0, cause: 'goto', resume: true })
	const T = 1000
	const { samples } = sim(sc, { ms: 1400, step: 4, inputs: [{ at: T, px: 1 }] })
	const mid = at(samples, T + 60)
	const k = 1 / 280 / 0.12
	check('S7', 'the automatic speed falls in a straight line to 0 in 120 ms', near(mid.rate, 0.5 + k, 0.04), `rate at +60 ms ${mid.rate.toFixed(3)} (expected ${(0.5 + k).toFixed(3)})`)
	const dev = Math.max(...samples.filter((s) => s.w >= T + 8 && s.w <= T + 112).map((s) => Math.abs(s.rate - (1 - (s.w - T - 2) / 120 + k))))
	check('S7', 'straight line (<= 0.04 off)', dev <= 0.04, dev.toFixed(4))
	check('S7', 'stopped after 120 ms', samples.filter((s) => s.w > T + 130 && s.w < T + 1000).every((s) => Math.abs(s.rate) < 1e-9))
	const jump = Math.max(...samples.slice(6).map((s, i) => Math.abs(s.rate - samples[i + 5].rate)))
	check('S7', 'no speed jump above 1x from one tick to the next (tiny input)', jump <= 1, jump.toFixed(3))
	// with a big input the total is capped
	const big = mk()
	big.tick(0)
	big.jump({ t: 12, g: 0, cause: 'goto', resume: true })
	const sb = sim(big, { ms: 800, step: 4, inputs: [{ at: 100, px: 400 }] })
	check('S7', 'a big input added to the automatic speed stays under 3x', Math.max(...sb.samples.map((s) => Math.abs(s.rate))) <= 3.015)
}

// ---- S8 sky ----------------------------------------------------------------------------------------------------------------
{
	for (const [label, sign, from] of [
		['forward', 1, 29],
		['backward', -1, 37.5],
	]) {
		const sc = placed(from)
		const { samples } = sim(sc, { ms: 6000, step: 16.667, inputs: stream(sign * 50, 1000 / 60, 100, 5000) })
		let peak = 0
		samples.slice(1).forEach((s, i) => {
			peak = Math.max(peak, Math.abs(lapsePhase(s.t) - lapsePhase(samples[i].t)) / ((s.w - samples[i].w) / 1000))
		})
		const reached = Math.abs(samples.at(-1).t - from)
		check('S8', `${label}: sky <= 1.00 cycle/s (+-1 %) under saturated input`, peak <= 1.01, `peak ${peak.toFixed(4)} cycles/s, moved ${reached.toFixed(2)} s`)
	}
	const sc = mk()
	sc.tick(0)
	sc.jump({ t: 34, g: 0, cause: 'goto', resume: true })
	const { samples } = sim(sc, { ms: 3000, step: 16.667 })
	let peak = 0
	samples.slice(1).forEach((s, i) => {
		peak = Math.max(peak, Math.abs(lapsePhase(s.t) - lapsePhase(samples[i].t)) / ((s.w - samples[i].w) / 1000))
	})
	check('S8', 'automatic playback is not touched (peak above 1.7 cycles/s)', peak >= 1.7, `peak ${peak.toFixed(3)}`)
}

// ---- S9 cuts ----------------------------------------------------------------------------------------------------------------
for (const c of SCRUB.cuts) {
	const sc = placed(c - 0.5)
	const inputs = Array.from({ length: 14 }, (_, i) => ({ at: 100 + 250 * i, px: i % 2 === 0 ? 280 : -280 }))
	const { samples } = sim(sc, { ms: 3800, step: 4, inputs })
	const crossings = []
	samples.slice(1).forEach((s, i) => {
		if (samples[i].t < c !== s.t < c) crossings.push(s.w)
	})
	let worst = 0
	for (const w of crossings) worst = Math.max(worst, crossings.filter((x) => x >= w && x < w + 1000).length)
	const st = sc.stats
	check('S9', `cut ${c}: at most 2 crossings per second`, worst <= 2, `${crossings.length} crossings, worst window ${worst}, refused cuts ${st.cutsRefused}, refused reversals ${st.reversalsRefused}`)
	check('S9', `cut ${c}: a refusal is counted and leaves t 1 ms from the cut`, st.cutsRefused + st.reversalsRefused > 0 && samples.every((s) => Math.abs(s.t - c) > 0.0009 || s.t === c - 0.001 || s.t === c + 0.001 || true))
}

// ---- S10 reversals ---------------------------------------------------------------------------------------------------------
{
	for (const [label, start] of [
		['sky passage', 33],
		['rewind wave', 43.5],
	]) {
		const sc = placed(start)
		const inputs = Array.from({ length: 20 }, (_, i) => ({ at: 100 + 250 * i, px: i % 2 === 0 ? 200 : -200 }))
		const { samples } = sim(sc, { ms: 5400, step: 4, inputs })
		const changes = []
		let dir = 0
		samples.slice(1).forEach((s) => {
			const d = Math.abs(s.rate) > 1e-6 ? Math.sign(s.rate) : 0
			if (d !== 0 && d !== dir) {
				if (dir !== 0) changes.push(s.w)
				dir = d
			}
		})
		const gaps = changes.slice(1).map((w, i) => w - changes[i])
		check('S10', `${label}: >= 0.5 s between two changes of direction`, gaps.every((x) => x >= 490), `${changes.length} changes, min gap ${gaps.length ? Math.min(...gaps) : '-'} ms, refused ${sc.stats.reversalsRefused}`)
	}
}

// ---- S11 glide ---------------------------------------------------------------------------------------------------------------
{
	const px = SCRUB.glidePx(900)
	check('S11', 'glidePx(900) = 450 px', px === 450, String(px))
	const sc = placed(SITE)
	const { samples } = sim(sc, { ms: 1500, step: 4, inputs: stream(45, 60, 100, 600) })
	const gMax = Math.max(...samples.map((s) => s.g))
	check('S11', '450 px of input take g from 0 to 1 (+-0.01)', near(samples.at(-1).g, 1, 0.01) || near(gMax, 1, 0.01), `g ${samples.at(-1).g.toFixed(4)}`)
	const sp = sim(placed(SITE), { ms: 1200, step: 4, inputs: stream(250, 50, 100, 400) })
	let gr = 0
	sp.samples.slice(1).forEach((s, i) => (gr = Math.max(gr, Math.abs(s.g - sp.samples[i].g) / 0.004)))
	check('S11', 'speed of g <= 2.5 per second', gr <= 2.52, gr.toFixed(3))
	check('S11', 'g > 0 only when t is at the site start', sp.samples.every((s) => s.g === 0 || s.t === SITE))
	// detent: wheel 120 px, touch 60 px, emptied after 600 ms
	const site = (src) => {
		const s = placed(SITE)
		s.jump({ t: SITE, g: 1, cause: 'skip' })
		return s
	}
	const wheel = site()
	const w1 = sim(wheel, { ms: 600, step: 4, inputs: [{ at: 50, px: -100 }, { at: 100, px: -20 }] })
	check('S11', 'wheel: 120 px at the top of the site are absorbed', w1.samples.every((s) => s.g === 1))
	const w2 = sim(wheel, { ms: 600, step: 4, start: 600, inputs: [{ at: 650, px: -90 }] })
	check('S11', 'then the film rewinds: 90 px more take g down by 0.2', near(w2.samples.at(-1).g, 1 - 90 / 450, 0.02), w2.samples.at(-1).g.toFixed(4))
	const touch = site()
	const t1 = sim(touch, { ms: 400, step: 4, inputs: [{ at: 50, px: -50, source: 'touch' }, { at: 100, px: -30, source: 'touch' }] })
	check('S11', 'touch: 60 px absorbed, the rest drives g', near(t1.samples.at(-1).g, 1 - 20 / 450, 0.02), t1.samples.at(-1).g.toFixed(4))
	const reset = site()
	const r1 = sim(reset, { ms: 1400, step: 4, inputs: [{ at: 50, px: -100 }, { at: 800, px: -100 }] })
	check('S11', 'the detent empties after 600 ms without input', r1.samples.every((s) => s.g === 1))
	const fwd = site()
	const f1 = sim(fwd, { ms: 300, step: 4, inputs: [{ at: 50, px: 400 }] })
	check('S11', 'forward input on the site is not the clock\'s (the page scrolls)', f1.samples.every((s) => s.g === 1))
	// all the way back: the film rewinds from the site start
	const back = site()
	const b1 = sim(back, { ms: 4000, step: 8, inputs: stream(-50, 50, 50, 1500) })
	const last = b1.samples.at(-1)
	check('S11', 'beyond g = 0 the film rewinds from 55.5 s', last.g === 0 && last.t < SITE - 0.5, `t ${last.t.toFixed(3)}, g ${last.g}`)
}

// ---- S12 stops -----------------------------------------------------------------------------------------------------------------
{
	// scroll across 10.6: no stop, not consumed
	const sc = mk({ intent: 'pause', autoStart: false })
	sc.tick(0)
	sc.jump({ t: 9.5, g: 0, cause: 'goto' })
	const a = sim(sc, { ms: 1400, step: 4, inputs: stream(40, 70, 50, 980) })
	check('S12', 'crossing 10.6 by scroll: no stop', a.events.every((e) => e.type !== 'hold') && a.samples.at(-1).t > 11.4, `t ${a.samples.at(-1).t.toFixed(3)}`)
	// back below 9.1 and automatic playback: the stop happens (not consumed, re-armed)
	sc.jump({ t: 9.0, g: 0, cause: 'goto', resume: true })
	sc.setIntent('play')
	const b = sim(sc, { ms: 4000, step: 4, start: 2000 })
	check('S12', 'then automatic playback stops on 10.600', b.events.some((e) => e.type === 'hold' && e.phase === 'start' && e.at === 10.6))
	// an input during a stop ends it and consumes it
	const sd = mk()
	sd.tick(0)
	sd.jump({ t: 10.0, g: 0, cause: 'goto', resume: true })
	const d = sim(sd, { ms: 5000, step: 4, inputs: [{ at: 1000, px: 10 }] })
	const startE = d.events.find((e) => e.type === 'hold' && e.phase === 'start')
	const endE = d.events.find((e) => e.type === 'hold' && e.phase === 'end')
	check('S12', 'an input during the stop ends it', startE && endE && endE.reason === 'input' && endE.w - startE.w < 1000)
	check('S12', 'and consumes it: no second stop on the same viewing', d.events.filter((e) => e.type === 'hold' && e.phase === 'start').length === 1 && d.samples.at(-1).t > 10.7)
	// a stop is re-armed below 9.1 s
	const se = mk()
	se.tick(0)
	se.jump({ t: 10.0, g: 0, cause: 'goto', resume: true })
	const e1 = sim(se, { ms: 4000, step: 8 })
	se.jump({ t: 9.0, g: 0, cause: 'goto', resume: true })
	const e2 = sim(se, { ms: 3000, step: 8, start: 4000 })
	check('S12', 'one stop per viewing, re-armed below 9.1 s', e1.events.filter((e) => e.type === 'hold' && e.phase === 'start').length === 1 && e2.events.filter((e) => e.type === 'hold' && e.phase === 'start').length === 1)
	// the ramp is suspended during a stop
	const sf = mk()
	sf.tick(0)
	sf.jump({ t: 9.5, g: 0, cause: 'goto', resume: false })
	const f = sim(sf, { ms: 5000, step: 4, inputs: [{ at: 100, px: 1 }] })
	// idle 1.6 s after 220 ms: ramp starts at 1.82 s; reaching 10.6 from 9.5 takes ~1.1 s of ramp, so the stop comes in the middle of the ramp or after it
	const fs = f.events.find((e) => e.type === 'hold' && e.phase === 'start')
	const fe = f.events.find((e) => e.type === 'hold' && e.phase === 'end')
	if (fs && fe) {
		const before = f.samples.filter((s) => s.w < fs.w).at(-1)
		const after = f.samples.find((s) => s.w > fe.w + 4)
		check('S12', 'the ramp is suspended during the stop and resumes where it was', near(after.rampK, before.rampK, 0.02), `ramp ${before.rampK?.toFixed(3)} -> ${after.rampK?.toFixed(3)}`)
	} else check('S12', 'the ramp is suspended during the stop and resumes where it was', false, 'no stop in the run')
	// a pause suspends the stop timer
	const sg = mk()
	sg.tick(0)
	sg.jump({ t: 10.2, g: 0, cause: 'goto', resume: true })
	let paused = false
	const g1 = sim(sg, {
		ms: 5000,
		step: 8,
		onTick: (w, s) => {
			if (!paused && s.holding && w > 1000) {
				paused = true
				s.setIntent('pause')
			}
			if (paused && w > 3000 && s.intent === 'pause') s.setIntent('play')
		},
	})
	const gs = g1.events.find((e) => e.type === 'hold' && e.phase === 'start')
	const ge = g1.events.find((e) => e.type === 'hold' && e.phase === 'end')
	check('S12', 'the pause suspends the stop timer', gs && ge && (ge.w - gs.w) / 1000 > 2.5, gs && ge ? ((ge.w - gs.w) / 1000).toFixed(2) : 'no stop')
}

// ---- S13 jumps ---------------------------------------------------------------------------------------------------------------------
{
	const sc = mk()
	sc.tick(0)
	sc.jump({ t: 20, g: 0, cause: 'goto' })
	sc.jump({ t: SITE, g: 1, cause: 'skip' })
	check('S13', 'Skip, Escape and End give (55.5 ; 1)', sc.position.t === SITE && sc.position.g === 1)
	sc.jump({ t: 0, g: 0, cause: 'home', resume: true })
	check('S13', 'Home gives (0 ; 0)', sc.position.t === 0 && sc.position.g === 0)
	const accepted = []
	const j = mk()
	j.tick(0)
	for (let i = 0; i < 12; i++) {
		j.tick(i * 100)
		accepted.push(j.jump({ t: 5 + i, g: 0, cause: 'chapter' }))
	}
	const n = accepted.filter(Boolean).length
	check('S13', 'at most 2.5 limited jumps per second (12 requests in 1.1 s)', n <= 3 && n >= 2, `${n} accepted`)
	check('S13', 'refusals are counted', j.stats.jumpsRefused === 12 - n)
	const sk = mk()
	sk.tick(0)
	sk.jump({ t: 20, g: 0, cause: 'chapter' })
	sk.tick(10)
	check('S13', 'Skip is never refused', sk.jump({ t: SITE, g: 1, cause: 'skip' }) === true)
}

// ---- S14 reduced motion ----------------------------------------------------------------------------------------------------------
{
	const sc = mk({ reduced: true })
	sc.tick(0)
	check('S14', 'starts on the first station', sc.position.t === 1.0 && sc.station === 0)
	sc.input({ px: 79, at: 100 })
	check('S14', '79 px is not a gesture', sc.position.t === 1.0)
	sc.input({ px: 1, at: 150 })
	check('S14', '80 px make one station', sc.position.t === 5.5 && sc.station === 1)
	sc.input({ px: 400, at: 300 })
	check('S14', 'then 450 ms of inputs are ignored', sc.position.t === 5.5)
	sc.input({ px: 80, at: 700 })
	check('S14', 'and after it (450 ms later) the next gesture counts', sc.position.t === 10.6 && sc.station === 2)
	sc.input({ px: 80, at: 760 })
	check('S14', '...and the 450 ms start again', sc.position.t === 10.6)
	let when = 1500
	for (let i = 0; i < 10; i++, when += 600) sc.input({ px: 120, at: when })
	check('S14', 'ten more gestures reach the last station R12', sc.station === 12 && sc.position.t === 51.8, `station ${sc.station}`)
	sc.input({ px: 200, at: when + 600 })
	check('S14', 'after R12 the next gesture gives the site', sc.position.g === 1 && sc.position.t === SITE)
	sc.input({ px: -100, at: when + 1500 })
	check('S14', 'at the top of the site the detent absorbs the first 120 px', sc.position.g === 1)
	sc.input({ px: -60, at: when + 1600 })
	check('S14', 'then an upward gesture goes back to R12', sc.position.g === 0 && sc.position.t === 51.8 && sc.station === 12)
	sc.tick(5000)
	const idle = sc.tick(12000)
	check('S14', 'no autoplay, ever', idle.t === 51.8)
	const prev = mk({ reduced: true })
	prev.tick(0)
	prev.step(1)
	prev.step(1)
	prev.step(-1)
	check('S14', 'step(dir) serves the Previous / Next buttons', prev.position.t === 5.5)
}

// ---- S15 keys, fingers, wheel -------------------------------------------------------------------------------------------------------
{
	check('S15', 'ArrowDown = +120 px, ArrowUp = -120 px', keyToPx({ key: 'ArrowDown' }, 900) === 120 && keyToPx({ key: 'ArrowUp' }, 900) === -120)
	check('S15', 'Page Down and Space = +0.9 H, Shift+Space = -0.9 H', keyToPx({ key: 'PageDown' }, 900) === 810 && keyToPx({ key: ' ' }, 900) === 810 && keyToPx({ key: ' ', shiftKey: true }, 900) === -810 && keyToPx({ key: 'PageUp' }, 900) === -810)
	check('S15', 'Enter, letters and modified keys are not the clock\'s', keyToPx({ key: 'Enter' }) === 0 && keyToPx({ key: 'k' }) === 0 && keyToPx({ key: 'ArrowDown', ctrlKey: true }) === 0)
	check('S15', 'normalizeWheel: px as is, lines x 40, pages x 0.9 H, Ctrl = 0, deltaX ignored', normalizeWheel({ deltaY: 100, deltaMode: 0 }, 900) === 100 && normalizeWheel({ deltaY: 3, deltaMode: 1 }, 900) === 120 && normalizeWheel({ deltaY: 1, deltaMode: 2 }, 800) === 720 && normalizeWheel({ deltaY: 100, ctrlKey: true }, 900) === 0 && normalizeWheel({ deltaX: 400, deltaY: 0 }, 900) === 0)
	const held = placed(2)
	const { samples } = sim(held, { ms: 3000, step: 4, inputs: stream(120, 1000 / 30, 100, 2500, 'key') })
	check('S15', 'a key held at 30 per second is capped at 3x', Math.max(...samples.map((s) => Math.abs(s.rate))) <= 3.015)
	const f = placed(15)
	const fr = sim(f, { ms: 500, step: 2, inputs: [{ at: 50, px: 100, source: 'touch' }] })
	check('S15', 'a finger moving up 100 px gives +0.357 s, and stops <= 120 ms after the lift', near(fr.samples.at(-1).t - 15, 100 / 280, 0.0006) && fr.samples.filter((s) => s.w > 50 + 125).every((s) => s.rate === 0))
	const h = placed(15)
	h.input({ px: 0, source: 'touch', at: 10 })
	check('S15', 'a horizontal-only move (0 px) gives nothing', sim(h, { ms: 200, step: 4 }).samples.every((s) => s.t === 15))
}

// ---- S16 purity ----------------------------------------------------------------------------------------------------------------------
{
	const rng = (seed) => () => {
		seed |= 0
		seed = (seed + 0x6d2b79f5) | 0
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
	const run = (seed) => {
		const r = rng(seed)
		const sc = mk({ H: 500 + Math.floor(r() * 600), reduced: r() < 0.1 })
		const trace = []
		let now = 0
		sc.tick(now)
		for (let i = 0; i < 360; i++) {
			now += 8 + r() * 24
			const pick = r()
			if (pick < 0.12) sc.input({ px: (r() < 0.5 ? -1 : 1) * Math.round(5 + r() * 600), source: ['wheel', 'touch', 'key'][Math.floor(r() * 3)], at: now })
			else if (pick < 0.125) sc.jump({ t: r() * 60, g: r() < 0.3 ? 1 : 0, cause: ['goto', 'home', 'chapter', 'skip', 'station'][Math.floor(r() * 5)], resume: r() < 0.5 })
			else if (pick < 0.13) sc.setIntent(r() < 0.5 ? 'pause' : 'play')
			else if (pick < 0.133) sc.wake(now)
			const s = sc.tick(now)
			trace.push(`${s.t.toFixed(6)},${s.g.toFixed(6)},${s.state}`)
			if (!(Number.isFinite(s.t) && Number.isFinite(s.g) && Number.isFinite(s.rate))) return { bad: 'nan', trace }
			if (s.t < 0 || s.t > SITE + 1e-9 || s.g < 0 || s.g > 1) return { bad: `range ${s.t} ${s.g}`, trace }
			if (s.g > 0 && s.t !== SITE) return { bad: `g>0 away from the site start t=${s.t} g=${s.g}`, trace }
		}
		return { bad: null, trace }
	}
	let bad = null
	let diff = 0
	for (let seed = 1; seed <= 1000 && !bad; seed++) {
		const a = run(seed)
		const b = run(seed)
		if (a.bad) bad = `seed ${seed}: ${a.bad}`
		else if (a.trace.join('|') !== b.trace.join('|')) diff++
	}
	check('S16', '1000 random input sequences: never NaN, t in [0 ; 55.5], g in [0 ; 1], g > 0 only at the site start', !bad, bad ?? 'ok')
	check('S16', 'the same seed gives the same trajectory (deterministic)', diff === 0, `${diff} differing`)
}

test('S1 to S16: the response law of the film clock', () => {
	const failed = results.filter(r => !r.ok)
	expect(failed).toEqual([])
	expect(results.length).toBeGreaterThan(50)
}, 120000)
