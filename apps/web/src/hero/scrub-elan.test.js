// v13 (05/11/2026): the page's law of the film clock, `law: 'elan'` (impulses with momentum), the arrival flick and the return to the kept position (scrub.js header).
// S17 to S24, under Node like S1 to S16 (scrub.test.js, which keeps testing the v10 law, `?law=slew`). The flash guards (S8, S9, S10) and the purity battery (S16) run again
// here under the new law: the coast is driven motion and must obey them.
import { expect, test } from 'vitest'
import * as scene from './scene.js'
import { createFilmScrub, SCRUB } from './scrub.js'

const results = []
const check = (id, name, ok, detail = '') => {
	results.push({ id, name, ok: Boolean(ok), detail })
	console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ` | ${detail}` : ''}`)
}
const near = (a, b, tol) => Math.abs(a - b) <= tol
const lapsePhase = t => scene.phaseAt(t)

const HOLDS = [
	{ id: 'capture', at: 10.6, wall: 1.2 },
	{ id: 'keep', at: 51.8, wall: 2.2 },
]
const STATIONS = [1.0, 5.5, 10.6, 17.5, 20.6, 23.6, 25.9, 30.8, 36.8, 44.0, 46.8, 48.6, 51.8]
const SITE = 55.5
const k = SCRUB.pxToFilm
const mk = (o = {}) =>
	createFilmScrub({ siteStart: SITE, holds: HOLDS, stations: STATIONS, lapsePhase, H: 900, law: 'elan', ...o })

function sim(sc, { ms, step = 4, inputs = [], start = 0, onTick = null }) {
	const samples = []
	const events = []
	const list = inputs.slice().sort((a, b) => a.at - b.at)
	let i = 0
	let prev = sc.tick(start)
	events.push(...prev.events.map(e => ({ ...e, w: start })))
	samples.push({ w: start, t: prev.t, g: prev.g, rate: 0, state: prev.state, mode: prev.mode })
	for (let w = start + step; w <= start + ms + 1e-9; w += step) {
		while (i < list.length && list[i].at <= w + 1e-9) {
			const it = list[i]
			if (it.fling) sc.fling({ pxPerSec: it.fling, at: it.at })
			else sc.input({ px: it.px, source: it.source ?? 'wheel', at: it.at })
			i++
		}
		if (onTick) onTick(w, sc)
		const s = sc.tick(w)
		events.push(...s.events.map(e => ({ ...e, w })))
		samples.push({ w, t: s.t, g: s.g, rate: (s.t - prev.t) / (step / 1000), state: s.state, mode: s.mode, intent: s.intent })
		prev = s
	}
	return { samples, events }
}
const stream = (px, every, from, ms, source = 'wheel') => {
	const out = []
	for (let at = from; at < from + ms; at += every) out.push({ at, px, source })
	return out
}
const placed = (t, o = {}) => {
	const sc = mk({ intent: 'pause', autoStart: false, ...o })
	sc.tick(0)
	sc.jump({ t, g: 0, cause: 'goto' })
	return sc
}
const lastMoving = samples => samples.reduce((w, s) => (Math.abs(s.rate) > 1e-9 ? s.w : w), -1)

// ---- S17 one notch: same distance as the v10 law, a short rise, a coast, a dead stop ---------------------------------------------
{
	const sc = placed(15)
	const { samples } = sim(sc, { ms: 2000, step: 4, inputs: [{ at: 100, px: 100 }] })
	const dt = samples.at(-1).t - 15
	check('S17', 'one 100 px notch still moves 0.357 s (+-0.002)', near(dt, 100 * k, 0.002), dt.toFixed(5))
	const peak = samples.reduce((a, s) => (s.rate > a.rate ? s : a), samples[0])
	check('S17', 'the speed rises: its peak comes 20 to 120 ms after the notch', peak.w - 100 >= 20 && peak.w - 100 <= 120, `peak ${peak.rate.toFixed(3)}x at +${peak.w - 100} ms`)
	check('S17', 'the peak stays under 3x', peak.rate <= 3.001, peak.rate.toFixed(3))
	const after = samples.filter(s => s.w > peak.w && s.rate > 0)
	check('S17', 'then it decelerates without a bump', after.every((s, i) => i === 0 || s.rate <= after[i - 1].rate + 1e-6))
	const stop = lastMoving(samples)
	check('S17', 'and stops dead within 1.1 s of the notch', stop > 0 && stop - 100 <= 1100, `last motion at +${stop - 100} ms`)
	check('S17', 'still afterwards (exactly 0)', samples.filter(s => s.w > stop).every(s => s.rate === 0))
}

// ---- S18 notches in a row accelerate; fine trackpad deltas stay close to the hand ---------------------------------------------------
{
	const one = placed(15)
	const a = sim(one, { ms: 1500, inputs: [{ at: 100, px: 100 }] })
	const five = placed(15)
	const b = sim(five, { ms: 2500, inputs: Array.from({ length: 5 }, (_, i) => ({ at: 100 + 70 * i, px: 100 })) })
	const peakA = Math.max(...a.samples.map(s => s.rate))
	const peakB = Math.max(...b.samples.map(s => s.rate))
	check('S18', 'five quick notches build speed beyond one notch', peakB > peakA * 1.5, `${peakA.toFixed(2)}x -> ${peakB.toFixed(2)}x`)
	const moved5 = b.samples.at(-1).t - 15
	check('S18', 'five quick notches go further than five slow ones (the boost of a wheel spun fast), at most 4x', moved5 > 500 * k * 1.2 && moved5 <= 500 * k * 4 + 1e-6, `${moved5.toFixed(3)} s (5 slow notches: ${(500 * k).toFixed(3)})`)
	const slow5 = placed(15)
	const c5 = sim(slow5, { ms: 4000, inputs: Array.from({ length: 5 }, (_, i) => ({ at: 100 + 400 * i, px: 100 })) })
	check('S18', 'slow notches keep the 1 px = 1/280 s gain (+-1 %)', near(c5.samples.at(-1).t - 15, 500 * k, 0.01 * 500 * k), (c5.samples.at(-1).t - 15).toFixed(4))
	const pad = placed(15)
	const c = sim(pad, { ms: 1500, inputs: stream(4, 16, 100, 300) })
	const stopC = lastMoving(c.samples)
	check('S18', 'trackpad deltas (4 px at 60 Hz): the film stops within 0.45 s of the last delta (the system adds its own momentum)', stopC - 400 <= 450, `+${stopC - 400} ms`)
	check('S18', 'trackpad deltas keep their distance (+-3 %)', near(c.samples.at(-1).t - 15, 4 * 19 * k, 0.03 * 76 * k), (c.samples.at(-1).t - 15).toFixed(4))
}

// ---- S19 nothing is banked over 3x ------------------------------------------------------------------------------------------------------
{
	const sc = placed(12)
	const { samples } = sim(sc, { ms: 3000, step: 4, inputs: stream(400, 16, 100, 600) })
	const cap = SCRUB.elan.maxRate
	check('S19', `a saturated wheel never goes over ${cap}x`, Math.max(...samples.map(s => Math.abs(s.rate))) <= cap + 0.001)
	const end = 700
	const atEnd = samples.find(s => s.w >= end)
	const coast = samples.at(-1).t - atEnd.t
	const coastMax = cap * (SCRUB.elan.coastMaxMs / 1000 / 3 + SCRUB.elan.attackMs / 1000) + 0.05
	check('S19', `after the stream the coast stays under what the cap allows (${coastMax.toFixed(2)} film s): the excess was dropped, not kept`, coast < coastMax, `${coast.toFixed(3)} s after the last input`)
	check('S19', 'it stops within 1.2 s of the last input', lastMoving(samples) - end <= 1200, `+${lastMoving(samples) - end} ms`)
	check('S19', 'drops are counted', sc.stats.drops > 0)
	const back = placed(20)
	const r = sim(back, { ms: 1500, inputs: [...stream(150, 30, 100, 300), { at: 420, px: -150 }] })
	const rev = r.samples.find(s => s.w > 420 && s.rate < 0)
	check('S19', 'an input against the motion brakes it and reverses within 200 ms', rev && rev.w - 420 <= 200, rev ? `+${rev.w - 420} ms` : 'never')
}

// ---- S20 the flash guards hold under the new law ---------------------------------------------------------------------------------------
{
	for (const [label, sign, from] of [
		['forward', 1, 29],
		['backward', -1, 37.5],
	]) {
		const sc = placed(from)
		const { samples } = sim(sc, { ms: 6000, step: 16.667, inputs: stream(sign * 120, 1000 / 60, 100, 5000) })
		let peak = 0
		samples.slice(1).forEach((s, i) => {
			peak = Math.max(peak, Math.abs(lapsePhase(s.t) - lapsePhase(samples[i].t)) / ((s.w - samples[i].w) / 1000))
		})
		check('S20', `sky ${label}: <= 1.00 cycle/s (+-1 %) under saturated input`, peak <= 1.01, `peak ${peak.toFixed(4)}`)
	}
	for (const c of SCRUB.cuts) {
		const sc = placed(c - 0.5)
		const inputs = Array.from({ length: 14 }, (_, i) => ({ at: 100 + 250 * i, px: i % 2 === 0 ? 280 : -280 }))
		const { samples } = sim(sc, { ms: 4200, step: 4, inputs })
		const crossings = []
		samples.slice(1).forEach((s, i) => {
			if (samples[i].t < c !== s.t < c) crossings.push(s.w)
		})
		let worst = 0
		for (const w of crossings) worst = Math.max(worst, crossings.filter(x => x >= w && x < w + 1000).length)
		check('S20', `cut ${c}: at most 2 crossings per second`, worst <= 2, `${crossings.length} crossings, worst ${worst}`)
	}
	for (const [label, start] of [
		['sky passage', 33],
		['rewind wave', 43.5],
	]) {
		const sc = placed(start)
		const inputs = Array.from({ length: 20 }, (_, i) => ({ at: 100 + 250 * i, px: i % 2 === 0 ? 200 : -200 }))
		const { samples } = sim(sc, { ms: 6000, step: 4, inputs })
		const changes = []
		let dir = 0
		for (const s of samples.slice(1)) {
			const d = Math.abs(s.rate) > 1e-6 ? Math.sign(s.rate) : 0
			if (d !== 0 && d !== dir) {
				if (dir !== 0) changes.push(s.w)
				dir = d
			}
		}
		const gaps = changes.slice(1).map((w, i) => w - changes[i])
		check('S20', `${label}: >= 0.5 s between two changes of direction`, gaps.every(x => x >= 490), `${changes.length} changes, min ${gaps.length ? Math.min(...gaps) : '-'} ms`)
	}
}

// ---- S21 the arrival flick --------------------------------------------------------------------------------------------------------------
{
	const sc = mk({ flick: true })
	const tiny = sim(sc, { ms: 3000, step: 4, inputs: [{ at: 2000, px: 10 }] })
	check('S21', 'a stray 10 px tick does not fire it (and is not applied)', tiny.samples.every(s => s.mode === null) && sc.armed)
	const r = sim(sc, { ms: 4000, step: 4, start: 3000, inputs: [{ at: 3400, px: 100 }, ...stream(60, 16, 3420, 900)] })
	const fire = r.events.find(e => e.type === 'flick' && e.phase === 'burst')
	check('S21', 'a first forward notch fires the flick and keeps the position', fire && sc.memory === null ? false : Boolean(fire), fire ? `from ${fire.from.toFixed(3)}` : 'no flick')
	const burst = r.samples.filter(s => s.mode === 'burst')
	const peak = Math.max(...burst.map(s => s.rate))
	check('S21', 'the rush accelerates up to 8x at most', peak > 3 && peak <= 8.01, peak.toFixed(2))
	check('S21', 'the rush lasts 0.34 s (+-8 ms)', near(burst.length * 4, 340, 8), `${burst.length * 4} ms`)
	const cover = r.samples.find(s => s.mode === 'cover')
	check('S21', 'then the clock waits for the page (cover)', Boolean(cover) && r.samples.filter(s => s.mode === 'cover').every(s => s.t === cover.t))
	check('S21', 'the momentum of the gesture is not a new input while it runs', r.samples.every(s => s.mode !== 'cover' || s.g === 0))
	const kept = sc.memory
	check('S21', 'the kept position is where the visitor was', kept && near(kept.t, fire.from, 1e-9) && kept.intent === 'play', JSON.stringify(kept))
	sc.release(7000)
	const arrive = sim(sc, { ms: 3200, step: 4, start: 7000 })
	check('S21', 'release: the film lands at 52.3 s, after the last freeze and the last cut', arrive.samples[0].t === SCRUB.flick.landAt)
	const end = arrive.samples.filter(s => s.mode === 'arrive' && s.g === 0 && s.t < SITE)
	check('S21', 'its end (the crane up to the model) plays at 2x, through no sensitive passage', end.every(s => s.t < SITE + 1e-9 && !SCRUB.cuts.some(c => Math.abs(s.t - c) <= SCRUB.cutGuard)) && end.slice(2).every(s => near(s.rate, 2, 0.01)))
	const reach = arrive.samples.find(s => s.t === SITE)
	const site = arrive.samples.find(s => s.g === 1)
	check('S21', 'the end takes 1.6 s, then the glide reaches the site in 1.0 s (+-0.02)', reach && site && near((reach.w - 7000) / 1000, 1.6, 0.02) && near((site.w - reach.w) / 1000, 1.0, 0.02), reach && site ? `${(reach.w - 7000) / 1000} + ${(site.w - reach.w) / 1000}` : 'never')
	check('S21', 'phases film -> glide -> site are reported', ['glide', 'site'].every(p => arrive.events.some(e => e.type === 'phase' && e.to === p)))
	check('S21', 'the jump is reported with cause flick', arrive.events.some(e => e.type === 'jump' && e.cause === 'flick'))

	// The rush never enters a sensitive passage nor comes near a cut.
	for (const from of [3, 20, 25.4, 27.5, 30, 40, 46, 49.9, 52]) {
		const f = mk({ flick: true, t0: from, autoStart: false, intent: 'pause' })
		const run = sim(f, { ms: 600, step: 2, inputs: [{ at: 50, px: 120 }] })
		const moved = run.samples.filter(s => s.mode === 'burst' || s.mode === 'cover')
		const inside = moved.some(
			s =>
				s.t > from + 1e-9 &&
				(SCRUB.sensitive.some(([a, b]) => s.t >= a && s.t <= b) || SCRUB.cuts.some(c => Math.abs(s.t - c) <= SCRUB.cutGuard))
		)
		const crossed = SCRUB.cuts.some(c => from < c && moved.some(s => s.t >= c))
		check('S21', `rush from ${from}: no sensitive passage entered, no cut crossed`, !inside && !crossed, `to ${moved.at(-1)?.t.toFixed(3)}`)
	}

	const up = mk({ flick: true })
	const u = sim(up, { ms: 1500, step: 4, inputs: [{ at: 400, px: -100 }, { at: 900, px: 100 }] })
	check('S21', 'a first input upward disarms it: the wheel scrubs both ways', !up.armed && u.samples.every(s => s.mode === null) && u.events.every(e => e.type !== 'flick'))
	const key = mk({ flick: true })
	sim(key, { ms: 800, step: 4, inputs: [{ at: 400, px: 120, source: 'key' }] })
	check('S21', 'keys never fire it (they scrub)', !key.armed && key.mode === null)
	const paused = mk({ flick: true })
	paused.tick(0)
	paused.setIntent('pause')
	check('S21', 'a visitor who used the controls has disarmed it', !paused.armed)
	const red = mk({ flick: true, reduced: true })
	check('S21', 'never in reduced motion', !red.armed)
	const off = mk()
	check('S21', 'off unless the page asks for it', !off.armed)
}

// ---- S22 the return to the kept position -------------------------------------------------------------------------------------------------
{
	const sc = mk({ flick: true })
	sim(sc, { ms: 6000, step: 4, inputs: [{ at: 5000, px: 100 }] })
	const keptT = sc.memory.t
	sc.release(6000)
	sim(sc, { ms: 3000, step: 4, start: 6000 })
	check('S22', 'on the site with a kept position', sc.position.g === 1 && sc.memory !== null)
	const a = sim(sc, { ms: 400, step: 4, start: 9500, inputs: [{ at: 9600, px: -100 }] })
	check('S22', 'the detent still absorbs the first 120 px (the momentum that arrives at the top)', a.samples.every(s => s.g === 1 && s.mode === null))
	const b = sim(sc, { ms: 1200, step: 4, start: 9900, inputs: [{ at: 10000, px: -100 }] })
	const ret = b.events.find(e => e.type === 'return' && e.phase === 'glide')
	check('S22', 'past it, the way up returns (glide played back on its own)', Boolean(ret) && near(ret.to, keptT, 1e-9))
	const down = b.samples.filter(s => s.mode === 'return')
	check('S22', 'the glide back lasts 0.9 s (+-0.02) and g only goes down', near(down.length * 4, 900, 20) && down.every((s, i) => i === 0 || s.g <= down[i - 1].g), `${down.length * 4} ms`)
	check('S22', 'then the clock waits for the page (cover)', sc.mode === 'cover' && sc.position.g === 0 && sc.position.t === SITE)
	sc.release(11200)
	check('S22', 'release: the film is back exactly where the visitor left it, with its intent', sc.position.t === keptT && sc.position.g === 0 && sc.intent === 'play' && sc.memory === null)
	const c = sim(sc, { ms: 2600, step: 4, start: 11200 })
	const moved = c.samples.find(s => s.rate > 0)
	check('S22', 'it holds 1.6 s, then plays on', moved && near((moved.w - 11200) / 1000, 1.6, 0.05), moved ? `${(moved.w - 11200) / 1000}` : 'never')

	const esc = mk({ flick: true, t0: 20, autoStart: false, intent: 'pause' })
	esc.tick(0)
	esc.jump({ t: SITE, g: 1, cause: 'key' })
	check('S22', 'Escape, Skip, End keep the position too', esc.memory?.t === 20 && esc.memory.intent === 'pause')
	esc.jump({ t: 0, g: 0, cause: 'replay', resume: true })
	check('S22', '"Watch the film again" forgets it', esc.memory === null)
	const direct = mk({ t0: SITE, g0: 1 })
	const d = sim(direct, { ms: 2500, step: 4, inputs: [{ at: 100, px: -100 }, ...stream(-120, 40, 200, 600)] })
	check('S22', 'a direct link to the site keeps the v10 rewind from 55.5 s (nothing was left)', d.samples.at(-1).t < SITE && d.samples.every(s => s.mode === null))
	const end = mk({ t0: 50 })
	sim(end, { ms: 12000, step: 8 })
	check('S22', 'the film played to its end keeps nothing (the visitor saw it)', end.position.g === 1 && end.memory === null)
}

// ---- S25 the review's edge cases ---------------------------------------------------------------------------------------------------------------
{
	// The rest of the upward gesture after a return does not rewind the film away from the kept position.
	const sc = mk({ flick: true })
	sim(sc, { ms: 6000, step: 4, inputs: [{ at: 5000, px: 100 }] })
	const keptT = sc.memory.t
	sc.release(6000)
	sim(sc, { ms: 3000, step: 4, start: 6000 })
	const r = sim(sc, {
		ms: 3400,
		step: 4,
		start: 9000,
		inputs: stream(-80, 40, 9100, 3000),
		onTick: (w, s) => s.mode === 'cover' && s.release(w),
	})
	const back = r.samples.find(s => s.mode === null && s.g === 0 && s.w > 9200)
	const after = back ? r.samples.filter(s => s.w >= back.w) : []
	check(
		'S25',
		'a long upward gesture returns once, and its momentum does not rewind the film',
		back && after.every(s => s.t >= keptT - 1e-9),
		back ? `min t ${Math.min(...after.map(s => s.t)).toFixed(3)} (kept ${keptT.toFixed(3)})` : 'no return'
	)
	const later = sim(sc, { ms: 400, step: 4, start: 12400, inputs: [{ at: 12500, px: -100 }] })
	const before = later.samples.find(s => s.w >= 12496)
	const minAfter = Math.min(...later.samples.filter(s => s.w > 12500).map(s => s.t))
	check('S25', 'a new gesture after a pause scrubs again', minAfter < before.t - 0.1, `${before.t.toFixed(3)} -> ${minAfter.toFixed(3)}`)

	const f = mk({ flick: true })
	f.tick(0)
	f.tick(500)
	check('S25', 'a forward finger thrown from the arrival state is the flick', f.fling({ pxPerSec: 900, at: 500 }) === true && f.mode === 'burst' && !f.armed)
	const fb = mk({ flick: true })
	fb.tick(0)
	fb.fling({ pxPerSec: -900, at: 10 })
	check('S25', 'a backward throw takes the film in hand', !fb.armed && fb.mode === null)

	const end = mk({ flick: true, t0: 54 })
	sim(end, { ms: 4000, step: 8 })
	check('S25', 'once the end of the film is reached, the flick is off', !end.armed)
	const nearEnd = mk({ flick: true, t0: 55.2, autoStart: false, intent: 'pause' })
	sim(nearEnd, { ms: 500, step: 4, inputs: [{ at: 100, px: 100 }] })
	check('S25', 'near the site start a forward wheel scrubs (nothing worth keeping)', !nearEnd.armed && nearEnd.mode === null && nearEnd.memory === null)

	const red = mk({ flick: true })
	sim(red, { ms: 600, step: 4, inputs: [{ at: 100, px: 100 }] })
	red.setReduced(true)
	check('S25', 'reduced motion turned on during a flick ends it on the site', red.mode === null && red.position.g === 1 && red.memory === null)
}

// ---- S26 an angry wheel: far and fast, the day/night passage leapt ------------------------------------------------------------------------------------
{
	// A mouse wheel spun fast backward (100 px notches every 40 ms) from the end of the film.
	const sc = placed(54.5)
	const leaps = []
	const r = sim(sc, {
		ms: 12000,
		step: 4,
		inputs: stream(-100, 40, 100, 11000),
		onTick: (w, s) => {
			if (s.mode === 'cover') {
				leaps.push(w)
				s.release(w + 16)
			}
		},
	})
	const zero = r.samples.find(s => s.t === 0)
	check('S26', 'spun fast, the wheel rewinds the whole film in under 8 s', zero && zero.w - 100 < 8000, zero ? `${((zero.w - 100) / 1000).toFixed(2)} s` : `stuck at ${r.samples.at(-1).t.toFixed(2)}`)
	check('S26', 'the day/night passage is leapt (covered), not strobed through', leaps.length >= 1 && r.events.some(e => e.type === 'jump' && e.cause === 'leap'), `${leaps.length} leap(s)`)
	let peak = 0
	r.samples.slice(1).forEach((s, i) => {
		const prev = r.samples[i]
		const cut = SCRUB.cuts.some(c => prev.t < c !== s.t < c)
		if (!cut && s.mode === null && prev.mode === null && !r.events.some(e => e.w === s.w && e.type === 'jump')) {
			peak = Math.max(peak, Math.abs(lapsePhase(s.t) - lapsePhase(prev.t)) / ((s.w - prev.w) / 1000))
		}
	})
	check('S26', 'outside the leaps and the cuts (counted below), the sky still moves <= 1 cycle per wall second (+-1 %)', peak <= 1.01, `peak ${peak.toFixed(3)}`)
	const cuts = []
	r.samples.slice(1).forEach((s, i) => {
		for (const c of SCRUB.cuts) if (r.samples[i].t < c !== s.t < c) cuts.push(s.w)
	})
	const changes = [...cuts, ...leaps].sort((a, b) => a - b)
	let worst = 0
	for (const w of changes) worst = Math.max(worst, changes.filter(x => x >= w && x < w + 1000).length)
	check('S26', 'cuts and leaps together: at most 2 per second', worst <= 2, `${changes.length} changes, worst window ${worst}`)
	let ratePeak = 0
	r.samples.slice(1).forEach((s, i) => {
		const prev = r.samples[i]
		const cut = SCRUB.cuts.some(c => prev.t < c !== s.t < c)
		if (!cut && s.mode === null && prev.mode === null && !r.events.some(e => e.w === s.w && e.type === 'jump')) ratePeak = Math.max(ratePeak, Math.abs(s.rate))
	})
	check('S26', 'never over the cap (leap and cut samples excluded)', ratePeak <= SCRUB.elan.maxRate + 0.001, `peak ${ratePeak.toFixed(3)}x`)

	// A leap, then a fast hand the other way at once: no second leap within 0.5 s (day -> night -> day in a blink), and no slide into the passage either.
	const back = mk({ intent: 'pause', autoStart: false, t0: 27.5 })
	const leapsB = []
	const rb = sim(back, {
		ms: 4000,
		step: 4,
		start: 2000,
		inputs: stream(100, 40, 2100, 1200),
		onTick: (w, s) => {
			if (s.mode === 'cover') {
				leapsB.push(w)
				s.release(w)
				if (leapsB.length === 1) s.fling({ pxPerSec: -2500, at: w })
			}
		},
	})
	const gapB = leapsB.length > 1 ? leapsB[1] - leapsB[0] : Infinity
	check('S26', 'a leap back right after a leap waits 0.5 s', gapB >= 490, `${leapsB.length} leaps, gap ${gapB} ms`)
	const slid = rb.samples.filter(s => s.t > SCRUB.lapse[0] && s.t < SCRUB.lapse[1])
	check('S26', 'meanwhile the film waits at the edge instead of sliding into the passage', slid.length === 0, `${slid.length} samples inside`)

	// A finger lifted during a leap's cover keeps its throw.
	const fl = mk({ intent: 'pause', autoStart: false, t0: 25 })
	let thrown = null
	sim(fl, {
		ms: 3000,
		step: 4,
		start: 2000,
		inputs: stream(100, 40, 2100, 900),
		onTick: (w, s) => {
			if (s.mode === 'cover' && thrown === null) {
				thrown = s.fling({ pxPerSec: 1500, at: w })
				s.release(w + 16)
			}
		},
	})
	check('S26', 'a finger lifted during a leap keeps its throw', thrown === true)

	// Slowly into the passage: no leap, the v10 guard holds the sky.
	const slow = placed(27)
	const sr = sim(slow, { ms: 6000, step: 4, inputs: stream(100, 400, 100, 5000), onTick: (w, s) => s.mode === 'cover' && s.release(w) })
	check('S26', 'a calm wheel enters the passage without leaping', sr.events.every(e => e.type !== 'leap') && sr.samples.at(-1).t > 28.8)
	// From inside the passage nothing leaps either (the guard applies).
	const inside = placed(30)
	const ir = sim(inside, { ms: 3000, step: 4, inputs: stream(-100, 40, 100, 2500), onTick: (w, s) => s.mode === 'cover' && s.release(w) })
	check('S26', 'from inside the passage there is no leap', ir.events.every(e => e.type !== 'leap'))
	// The v10 law has neither the boost nor the leap.
	const v10 = createFilmScrub({ siteStart: SITE, lapsePhase, t0: 40, autoStart: false, intent: 'pause' })
	const vr = sim(v10, { ms: 3000, step: 4, inputs: stream(-100, 40, 100, 2500) })
	check('S26', 'the v10 law (?law=slew) keeps its 3x and never leaps', Math.max(...vr.samples.map(s => Math.abs(s.rate))) <= 3.015 && vr.events.every(e => e.type !== 'leap'))
}

// ---- S23 purity under the new law, with flicks, flings and returns --------------------------------------------------------------------------
{
	const rng = seed => () => {
		seed |= 0
		seed = (seed + 0x6d2b79f5) | 0
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
	const run = seed => {
		const r = rng(seed)
		const sc = mk({ H: 500 + Math.floor(r() * 600), reduced: r() < 0.1, flick: r() < 0.7 })
		const trace = []
		let now = 0
		sc.tick(now)
		for (let i = 0; i < 400; i++) {
			now += 8 + r() * 24
			const pick = r()
			if (pick < 0.12)
				sc.input({ px: (r() < 0.5 ? -1 : 1) * Math.round(5 + r() * 600), source: ['wheel', 'touch', 'key'][Math.floor(r() * 3)], at: now })
			else if (pick < 0.13) sc.fling({ pxPerSec: (r() - 0.5) * 6000, at: now })
			else if (pick < 0.15) sc.release(now)
			else if (pick < 0.155)
				sc.jump({ t: r() * 60, g: r() < 0.3 ? 1 : 0, cause: ['goto', 'home', 'chapter', 'skip', 'station', 'key'][Math.floor(r() * 6)], resume: r() < 0.5 })
			else if (pick < 0.16) sc.setIntent(r() < 0.5 ? 'pause' : 'play')
			else if (pick < 0.163) sc.wake(now)
			const s = sc.tick(now)
			trace.push(`${s.t.toFixed(6)},${s.g.toFixed(6)},${s.state}`)
			if (!(Number.isFinite(s.t) && Number.isFinite(s.g) && Number.isFinite(s.rate))) return { bad: 'nan', trace }
			if (s.t < 0 || s.t > SITE + 1e-9 || s.g < 0 || s.g > 1) return { bad: `range ${s.t} ${s.g}`, trace }
			if (s.g > 0 && s.t !== SITE) return { bad: `g>0 away from the site start t=${s.t} g=${s.g}`, trace }
			if (s.mode === null && Math.abs(s.rate) > SCRUB.elan.maxRate + 0.001 && s.state === 'scrub') return { bad: `rate ${s.rate}`, trace }
		}
		return { bad: null, trace }
	}
	let bad = null
	let diff = 0
	for (let seed = 1; seed <= 600 && !bad; seed++) {
		const a = run(seed)
		const b = run(seed)
		if (a.bad) bad = `seed ${seed}: ${a.bad}`
		else if (a.trace.join('|') !== b.trace.join('|')) diff++
	}
	check('S23', '600 random sequences (flicks, flings, returns): never NaN, in range, g > 0 only at the site start', !bad, bad ?? 'ok')
	check('S23', 'deterministic', diff === 0, `${diff} differing`)
}

// ---- S24 the finger thrown on lift ------------------------------------------------------------------------------------------------------------
{
	const sc = placed(15)
	const { samples } = sim(sc, { ms: 2000, step: 4, inputs: [{ at: 100, fling: 1400 }] })
	const dt = samples.at(-1).t - 15
	const B = SCRUB.elan.boost
	const x = Math.min(1, Math.max(0, (1400 - B.fromPxS) / (B.toPxS - B.fromPxS)))
	const boost = 1 + (B.max - 1) * x * x * (3 - 2 * x)
	const want = Math.min(1400 * k * boost, SCRUB.elan.maxRate) * (SCRUB.elan.flingCoastMs / 1000 / 3)
	check('S24', 'a finger thrown at 1400 px/s coasts at its boosted speed (the same as its drag) over 0.9 s (+-3 %)', near(dt, want, 0.03 * want), `${dt.toFixed(4)} (${want.toFixed(4)})`)
	check('S24', 'under the cap', Math.max(...samples.map(s => s.rate)) <= SCRUB.elan.maxRate + 0.001)
	const slow = placed(15)
	check('S24', 'a slow lift does not throw', slow.fling({ pxPerSec: 200, at: 10 }) === false)
	const v10 = createFilmScrub({ siteStart: SITE, t0: 15, autoStart: false, intent: 'pause' })
	check('S24', 'the v10 law has no fling', v10.fling({ pxPerSec: 2000, at: 10 }) === false)
}

test('S17 to S24: momentum, the arrival flick and the return', () => {
	const failed = results.filter(r => !r.ok)
	expect(failed).toEqual([])
	expect(results.length).toBeGreaterThan(40)
}, 180000)
