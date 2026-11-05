// Minemories · the film clock driven by the visitor's scroll (decisions-v10 sections 2 and 3). PURE: no DOM, no timers, no clock of its own; every instant comes in as an argument
// (`tick(nowMs)`, `input({ at })`), so the same inputs always give the same trajectory and the module runs under Node (tests S1 to S16).
//
// Model B. The film time `t` belongs to the page. Wheel, finger and keys give the clock deltas; nothing is queued, nothing is caught up:
//   - 1 CSS px of input = 1/280 s of film (`pxToFilm`), applied in a straight line over 120 ms (`slewMs`), no inertia added;
//   - the film never goes faster than 3x in either direction (`maxRate`): what goes beyond is DROPPED, so the film stops at most 120 ms after the last input;
//   - after 1.6 s without input the film starts again by itself (ramp 0 -> 1x in 0.6 s, linear), unless the visitor paused it or reduced motion is on;
//   - the hand-over to the site is a position `g` (0 to 1, the "glide") that only moves while t is at the site start: scroll drives it both ways;
//   - host stops (10.6 s for 1.2 s, 51.8 s for 2.2 s) happen only in automatic playback, going forward, on the exact instant.
// Guards against flashes apply to driven motion only (never to automatic playback, whose figures were measured in v9d): sky cycles per wall second, cuts crossed per second,
// minimum time between two changes of direction in the sensitive passages, jumps per second.
//
//   const scrub = createFilmScrub({ siteStart: 55.5, holds: [{ id: 'capture', at: 10.6, wall: 1.2 }, ...], stations: [1, 5.5, ...], lapsePhase: (t) => cycles })
//   scrub.input({ px: 100, source: 'wheel', at: event.timeStamp })     // px > 0 goes forward
//   const { t, g, rate, state, events } = scrub.tick(performance.now())
//
// v13 (05/11/2026, Andy: "more human, more natural, a bit of acceleration and deceleration"; "a wheel-down on arrival goes to the site, and coming back up puts me where I was"):
//   - `law: 'elan'` (the page's law; 'slew' stays the default of this module and the `?law=slew` comparison): each input is an IMPULSE that keeps its distance exactly (1 px =
//     1/280 s, as before) but spends it on a velocity that rises in ~40 ms and glides down to zero on an ease-out (v = a (1 - s / T)^2) of finite length T: 200 ms for the fine
//     deltas of a trackpad (its system already adds its own momentum), up to 750 ms for a wheel notch, 900 ms for a finger thrown on lift. Notches that follow each other add up:
//     the film accelerates under a quick wheel and coasts to a dead stop. What goes beyond 3x is still DROPPED (the impulses still running are scaled down: nothing is banked or
//     caught up), and every guard applies to the coast (it is driven motion). No randomness: the same inputs give the same trajectory.
//   - `flick: true`: the visitor who just arrived and gives a first forward wheel or swipe wants to see what comes next. The position is KEPT (`memory`), the film rushes forward
//     for 0.34 s (up to 8x, but never into the day/night lapse, the rewind wave or within 0.35 s of a cut: the rush stops at the first such barrier, so no flash can come of it),
//     the page covers the cut with the last frame (`mode: 'cover'`, the clock waits for `release()`), then the END of the film plays at 2x from 52.3 s (after the last freeze
//     and the last cut: the camera leaves the fire and cranes up to the whole model under "That evening was kept by Minemories") and the glide sets it in its panel (1 s).
//   - any jump to the site from the middle of the film (the flick, Skip, Escape, End, a foreign scroll) keeps the position. At the top of the site, past the detent, the way up
//     then RETURNS: the glide plays back on its own (0.9 s), the page covers the cut again, and the film starts again exactly where the visitor left it, with the same intent.

export const SCRUB = Object.freeze({
	pxToFilm: 1 / 280, // film seconds per CSS px
	slewMs: 120, // each input is applied linearly over this time
	maxRate: 3, // |film s per wall s|, both directions
	lapse: Object.freeze([28.8, 37.8]), // the day/night passage of the film
	lapseMaxCycles: 1.0, // day/night cycles per WALL second while driving
	cuts: Object.freeze([26.1, 45.3, 50.5]), // hard cuts of the film
	cutWindowMs: 1000,
	cutMax: 2, // crossings of a cut per sliding window
	sensitive: Object.freeze([Object.freeze([28.8, 37.8]), Object.freeze([42.3, 45.3])]),
	cutGuard: 0.3, // seconds around a cut that count as sensitive
	reversalMinMs: 500, // minimum time between two changes of direction in a sensitive passage
	idleMs: 1600, // without input, the film starts again after this
	rampMs: 600, // linear ramp of the automatic speed, 0 -> nominal
	nominal: 1,
	glideSec: 1.8, // the automatic glide to the site (v12: 1.2 s was read as a zoom then a dezoom; Andy asked for a smoother hand-over)
	glidePx: (H) => Math.min(640, Math.max(360, 0.5 * H)), // the glide under the scroll, in input px
	glideMaxRate: 2.5, // g per second
	topDetentPx: Object.freeze({ wheel: 120, key: 120, touch: 60 }), // at the top of the site: input absorbed before the film rewinds
	detentResetMs: 600,
	lineToPx: 40, // wheel deltaMode 1
	pageToPx: 0.9, // wheel deltaMode 2, x viewport height
	keyPx: Object.freeze({ arrow: 120, page: 0.9 }), // arrows in px, page keys x viewport height
	jumpMinMs: 400, // between two limited jumps (Home, chapters, stations): 2.5 per second
	announceMaxRate: 1.5, // screen reader announcements are made at this speed or slower
	maxDtMs: 250, // longest wall step one tick integrates
	subStepMs: 2,
	reduced: Object.freeze({ gesturePx: 80, lockoutMs: 450 }),
	law: 'slew', // 'slew' (v10: linear over 120 ms) or 'elan' (v13: impulses with momentum)
	elan: Object.freeze({
		attackMs: 40, // the velocity rises toward the impulses on this time constant
		coastMinMs: 200, // length of the coast of a fine delta (trackpad, a finger that drags)
		coastMaxMs: 750, // length of the coast of a wheel notch
		smallPx: 12, // at or under this, the coast is coastMinMs
		bigPx: 100, // at or over this, the coast is coastMaxMs (smooth in between)
		keyCoastMs: 550,
		flingCoastMs: 900, // the coast of a finger thrown on lift
		flingMinPxPerS: 350, // slower lifts do not throw
		brake: 0.25, // an input against the motion keeps this share of the impulses still running the other way
		stopRate: 0.01, // once every impulse has ended, |film s per wall s| under which the attack's lag stops dead
	}),
	flick: Object.freeze({
		minPx: 24, // forward input gathered (within gatherMs) before the arrival flick fires: a stray tick of a trackpad is not a wish
		gatherMs: 300,
		burstMs: 340, // the rush forward
		burstMaxRate: 8, // its peak speed, reached at the end (ease-in), never inside a sensitive passage
		barrierGuard: 0.35, // the rush stops this far before a cut, the lapse or the rewind wave
		landAt: 52.3, // after the rush the film lands here (after the 51.8 freeze and the 50.5 cut): its end is the crane up to the model
		endRate: 2, // the end of the film plays at this speed (52.3 -> 55.5 in 1.6 s; no sensitive passage there)
		glideSec: 1.0, // then the glide to the site
		returnSec: 0.9, // the glide played back when the visitor comes up from the site
		quietMs: 280, // after a return, the rest of the gesture (inputs closer than this to each other) is dropped: its momentum must not rewind the film away
		keepMin: 0.5, // a position closer than this to the site start is not kept (the visitor saw the end)
	}),
})

const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const LIMITED_JUMPS = new Set(['home', 'chapter', 'station'])

/** Wheel delta in CSS px (forward positive). Lines are 40 px, pages 0.9 viewport heights; Ctrl + wheel is the browser's zoom; deltaX is ignored. */
export function normalizeWheel(e, H = 900, config = SCRUB) {
	if (!e || e.ctrlKey) return 0
	const dy = Number(e.deltaY) || 0
	if (e.deltaMode === 1) return dy * config.lineToPx
	if (e.deltaMode === 2) return dy * config.pageToPx * H
	return dy
}

/** Keys that move the film (decisions-v10 section 2.7): arrows 120 px, Space and the page keys 0.9 viewport heights (Shift + Space goes back). Anything else: 0. */
export function keyToPx(e, H = 900, config = SCRUB) {
	if (!e || e.altKey || e.ctrlKey || e.metaKey) return 0
	switch (e.key) {
		case 'ArrowDown':
			return config.keyPx.arrow
		case 'ArrowUp':
			return -config.keyPx.arrow
		case 'PageDown':
			return config.keyPx.page * H
		case 'PageUp':
			return -config.keyPx.page * H
		case ' ':
		case 'Spacebar':
			return (e.shiftKey ? -1 : 1) * config.keyPx.page * H
		default:
			return 0
	}
}

export function createFilmScrub({
	siteStart = 55.5,
	holds = [],
	stations = [],
	lapsePhase = null,
	reduced = false,
	config: override = null,
	H = 900,
	intent = 'play',
	t0 = 0,
	g0 = 0,
	autoStart = true,
	law = null,
	flick = false,
} = {}) {
	const C = override ? { ...SCRUB, ...override } : SCRUB
	const k = C.pxToFilm
	const elan = (law ?? C.law) === 'elan'
	const E = C.elan
	const F = C.flick
	const stops = holds.map((h) => ({ id: h.id, at: h.at, wall: h.wall }))
	const stationTimes = stations.map((s) => (typeof s === 'number' ? s : s.t))
	let isReduced = Boolean(reduced)
	let intentNow = isReduced ? 'pause' : intent === 'pause' ? 'pause' : 'play'
	let vh = H
	let t = clamp(t0, 0, siteStart)
	if (isReduced && stationTimes.length && !(t >= siteStart)) t = stationTimes[nearestStation(t)]
	let g = t >= siteStart ? clamp(g0, 0, 1) : 0
	let autoK = autoStart && intentNow === 'play' && !isReduced ? 1 : 0
	let lastNow = null
	let lastRate = 0
	let slews = [] // { px, start, end }
	let lastActive = -Infinity // wall ms at which the last input's spreading ends (the idle delay counts from there)
	let lastInputAt = -Infinity
	const done = new Set() // host stops already played in this viewing
	let hold = null // { id, left, at, wall }
	let lastDir = 0
	let lastDirChange = -Infinity
	let crossLog = [] // wall ms of the cut crossings, for the sliding window
	let lastJumpAt = -Infinity
	let detent = 0
	let detentUpAt = -Infinity
	let station = isReduced ? nearestStation(t) : -1
	let acc = 0 // reduced motion: input gathered towards the next station
	let lockUntil = -Infinity
	let pending = [] // events produced between two ticks (jumps, stations)
	let refusingReversal = false
	let pulses = [] // elan: { amp (film s per wall s at `start`), tau (ms), start (wall ms) }
	let vel = 0 // elan: the driven velocity on screen (film s per wall s)
	// v13: the arrival flick and the kept position.
	let armed = Boolean(flick) && !isReduced && t < siteStart - F.keepMin && g === 0
	let gather = 0
	let gatherAt = -Infinity
	let mode = null // null | 'burst' | 'cover' | 'arrive' (the glide after a flick) | 'return' (the glide played back)
	let coverFor = null // 'skip' | 'return': what release() does
	let burstStart = 0
	let burstFrom = 0
	let barrier = 0
	let memory = null // { t, intent }: where the visitor left the film
	let quiet = false // after a return: the gesture that asked for it is still sending its momentum
	let quietAt = -Infinity // wall ms of the last input of that gesture
	const stats = { drops: 0, dropped: 0, cutsRefused: 0, reversalsRefused: 0, jumpsRefused: 0, inputs: 0, lastInputAt: -Infinity, flicks: 0, returns: 0 }
	let phaseNow = phaseOf(g)

	function phaseOf(gg) {
		return gg >= 1 ? 'site' : gg > 0 ? 'glide' : 'film'
	}
	function nearestStation(tt) {
		let best = 0
		stationTimes.forEach((s, i) => {
			if (Math.abs(s - tt) < Math.abs(stationTimes[best] - tt)) best = i
		})
		return best
	}
	const glidePx = () => C.glidePx(vh)
	const inLapse = (tt) => tt >= C.lapse[0] && tt <= C.lapse[1]
	const inSensitive = (tt) => C.sensitive.some(([a, b]) => tt >= a && tt <= b) || C.cuts.some((c) => Math.abs(tt - c) <= C.cutGuard)
	const rearm = () => {
		for (const h of stops) if (t < h.at - 1.5) done.delete(h.id)
	}
	const log = (e) => pending.push(e)

	function busyAt(s0, s1) {
		for (const s of slews) if (s.start < s1 && s.end > s0) return true
		return false
	}

	// v13: the first sensitive instant ahead of `tt` (the start of the lapse or of the rewind wave, a cut), minus the guard; `tt` itself when it is already inside one.
	function barrierAfter(tt) {
		if (inSensitive(tt)) return tt
		let b = siteStart
		for (const [a] of C.sensitive) if (a > tt) b = Math.min(b, a - F.barrierGuard)
		for (const c of C.cuts) if (c > tt) b = Math.min(b, c - C.cutGuard - F.barrierGuard)
		return Math.max(tt, b)
	}

	// Elan: the length of the coast of an impulse, from the size of the delta (fine deltas short, notches long, smooth in between).
	function coastOf(px, source) {
		if (source === 'key') return E.keyCoastMs
		if (source === 'touch') return E.coastMinMs
		const x = clamp((Math.abs(px) - E.smallPx) / (E.bigPx - E.smallPx), 0, 1)
		const s = x * x * (3 - 2 * x)
		return E.coastMinMs + (E.coastMaxMs - E.coastMinMs) * s
	}

	function addPulse(dist, tau, when) {
		// An input against the motion brakes: what still runs the other way is mostly let go (the hand that grabs the film).
		const running = pulseRate(when)
		if (running !== 0 && Math.sign(running) !== Math.sign(dist)) for (const p of pulses) if (Math.sign(p.amp) !== Math.sign(dist)) p.amp *= E.brake
		// v = amp (1 - s / T)^2 over [0 ; T] covers amp * T / 3: the amplitude that covers `dist` exactly.
		pulses.push({ amp: (3 * dist) / (tau / 1000), tau, start: when })
	}

	function pulseRate(at) {
		let u = 0
		for (const p of pulses) {
			const s = (at - p.start) / p.tau
			if (s >= 0 && s < 1) u += p.amp * (1 - s) * (1 - s)
		}
		return u
	}

	function recordCrossings(from, to, now) {
		const lo = Math.min(from, to)
		const hi = Math.max(from, to)
		for (const c of C.cuts) if (lo < c && hi >= c && (from < c) !== (to < c)) crossLog.push(now)
	}

	// Film motion of one sub-step. A is the automatic part (film s, >= 0), S the driven part (film s, signed). `now` is the end of the sub-step (wall ms).
	function filmMove(A, S, now, dtS, driven, events) {
		let m = A + S
		if (m === 0) return
		if (driven) {
			const cap = C.maxRate * dtS
			if (Math.abs(m) > cap) {
				stats.dropped += Math.abs(m) - cap
				stats.drops++
				m = Math.sign(m) * cap
			}
			// Sky: at most `lapseMaxCycles` day/night cycles per wall second while driving.
			if (lapsePhase && (inLapse(t) || inLapse(t + m))) {
				const maxDphi = C.lapseMaxCycles * dtS
				const p0 = lapsePhase(t)
				if (Math.abs(lapsePhase(t + m) - p0) > maxDphi) {
					let lo = 0
					let hi = 1
					for (let i = 0; i < 24; i++) {
						const mid = (lo + hi) / 2
						if (Math.abs(lapsePhase(t + m * mid) - p0) > maxDphi) hi = mid
						else lo = mid
					}
					stats.dropped += Math.abs(m) * (1 - lo)
					m *= lo
				}
			}
			// Direction changes in the sensitive passages: at least `reversalMinMs` since the last change.
			const dir = Math.sign(m)
			if (dir !== 0 && lastDir !== 0 && dir !== lastDir && inSensitive(t) && now - lastDirChange < C.reversalMinMs) {
				if (!refusingReversal) {
					refusingReversal = true
					stats.reversalsRefused++
					events.push({ type: 'reversal-refused', t })
				}
				return
			}
			refusingReversal = false
		}
		let next = t + m
		// Cuts: at most `cutMax` crossings per sliding window while driving; a refused crossing leaves t 1 ms before the cut, on the current side.
		if (driven) {
			crossLog = crossLog.filter((x) => now - x < C.cutWindowMs)
			for (const c of C.cuts) {
				const forward = m > 0 && t < c && next >= c
				const backward = m < 0 && t >= c && next < c
				if (!forward && !backward) continue
				if (crossLog.length >= C.cutMax) {
					next = forward ? c - 1e-3 : c + 1e-3
					stats.cutsRefused++
					events.push({ type: 'cut-refused', cut: c, t: next })
					if ((forward && next <= t) || (backward && next >= t)) next = t
					break
				}
			}
		}
		// A host stop only in automatic playback, going forward, on the exact instant.
		if (!driven && m > 0 && !isReduced && intentNow === 'play') {
			for (const h of stops) {
				if (done.has(h.id)) continue
				if (t < h.at && next >= h.at) {
					done.add(h.id)
					next = h.at
					hold = { id: h.id, at: h.at, wall: h.wall, left: h.wall }
					events.push({ type: 'hold', phase: 'start', id: h.id, at: h.at, wall: h.wall })
					break
				}
			}
		}
		// The end of the film: what goes past the site start is the glide's.
		if (next > siteStart) {
			const f = (next - siteStart) / m
			next = siteStart
			recordCrossings(t, next, now)
			noteDir(Math.sign(m), now)
			t = next
			const dg = (f * A) / C.glideSec + (f * S) / (k * glidePx())
			g = clamp(g + Math.min(dg, C.glideMaxRate * dtS), 0, 1)
			return
		}
		if (next < 0) {
			stats.dropped += -next
			next = 0
		}
		if (next !== t) {
			recordCrossings(t, next, now)
			noteDir(Math.sign(next - t), now)
		}
		t = next
		rearm()
	}

	function noteDir(dir, now) {
		if (dir === 0) return
		if (dir !== lastDir) {
			lastDir = dir
			lastDirChange = now
		}
	}

	function glideMove(A, S, now, dtS, driven, events) {
		const req = A / C.glideSec + S / (k * glidePx())
		if (req === 0) return
		const cap = C.glideMaxRate * dtS
		let dg = clamp(req, -cap, cap)
		if (driven && Math.abs(req) > cap) {
			stats.drops++
			stats.dropped += (Math.abs(req) - cap) * k * glidePx()
		}
		const next = g + dg
		if (next >= 1) {
			g = 1
			return
		}
		if (next <= 0) {
			// The rest of the movement goes back into the film (t leaves the site start).
			const f = Math.abs(req) > 0 ? -next / Math.abs(req) : 0
			g = 0
			if (f > 0) filmMove(f * A, f * S, now, dtS, driven, events)
			return
		}
		g = next
	}

	// v13: the choreographies of the flick and of the return. They are not driven motion and not playback: nothing else moves while they run.
	function modeStep(s0, s1, events) {
		const dtS = (s1 - s0) / 1000
		if (mode === 'burst') {
			const e = clamp((s1 - burstStart) / F.burstMs, 0, 1)
			const rate = 1 + (F.burstMaxRate - 1) * e * e
			const next = Math.min(barrier, t + rate * dtS)
			if (next > t) {
				recordCrossings(t, next, s1)
				noteDir(1, s1)
				t = next
			}
			if (e >= 1) {
				mode = 'cover'
				coverFor = 'skip'
				events.push({ type: 'flick', phase: 'cover', from: burstFrom, at: t })
			}
			return
		}
		if (mode === 'arrive') {
			if (t < siteStart) {
				const next = Math.min(siteStart, t + F.endRate * dtS)
				recordCrossings(t, next, s1)
				t = next
				return
			}
			g = clamp(g + dtS / F.glideSec, 0, 1)
			if (g >= 1) {
				mode = null
				events.push({ type: 'flick', phase: 'site', from: memory?.t ?? null })
			}
			return
		}
		if (mode === 'return') {
			g = clamp(g - dtS / F.returnSec, 0, 1)
			if (g <= 0) {
				mode = 'cover'
				coverFor = 'return'
				events.push({ type: 'return', phase: 'cover', to: memory?.t ?? siteStart })
			}
		}
		// 'cover': still until release().
	}

	function subStep(s0, s1, events) {
		if (mode) {
			modeStep(s0, s1, events)
			return
		}
		const dtS = (s1 - s0) / 1000
		let px = 0
		let busy = false
		for (const s of slews) {
			const o = Math.min(s1, s.end) - Math.max(s0, s.start)
			if (o > 0) {
				px += (s.px * o) / (s.end - s.start)
				busy = true
			}
		}
		let elanS = null // elan: the driven film motion of this sub-step (film s), instead of px * k
		if (elan) {
			let u = pulseRate((s0 + s1) / 2)
			if (Math.abs(u) > C.maxRate) {
				// Beyond 3x the excess is dropped: every impulse still running is scaled down, so nothing is banked for later.
				const f = C.maxRate / Math.abs(u)
				stats.drops++
				stats.dropped += (Math.abs(u) - C.maxRate) * dtS
				for (const p of pulses) p.amp *= f
				u *= f
			}
			vel += (u - vel) * (1 - Math.exp(-(s1 - s0) / E.attackMs))
			pulses = pulses.filter((p) => s1 - p.start < p.tau)
			if (pulses.length === 0 && Math.abs(vel) < E.stopRate) vel = 0
			busy = vel !== 0 || pulses.length > 0
			if (busy) lastActive = Math.max(lastActive, s1)
			elanS = vel * dtS
		}
		// A host stop: the timer runs (the pause suspends it), an input ends it for good.
		if (hold) {
			if (busy) {
				events.push({ type: 'hold', phase: 'end', id: hold.id, at: hold.at, reason: 'input' })
				hold = null
			} else {
				if (intentNow === 'play') hold.left -= dtS
				if (hold.left <= 0) {
					events.push({ type: 'hold', phase: 'end', id: hold.id, at: hold.at, reason: 'timeout' })
					hold = null
				}
				return
			}
		}
		// The automatic speed: straight down to 0 in 120 ms under the driven motion, straight up to nominal in 0.6 s once the idle delay has passed.
		if (busy || intentNow === 'pause' || isReduced) autoK = Math.max(0, autoK - dtS / (C.slewMs / 1000))
		else if (s0 >= lastActive + C.idleMs) autoK = Math.min(1, autoK + dtS / (C.rampMs / 1000))
		// On the site the clock sleeps: nothing is automatic there (the first rewinding input finds the film at rest).
		if (g >= 1) autoK = 0
		if (g >= 1 && (elanS ?? px) >= 0) return
		const A = autoK * C.nominal * dtS
		const S = elanS ?? px * k
		const driven = busy || S !== 0
		// At the site start, any forward motion is the glide's (its own cap), not the film's.
		if (g > 0 || (t >= siteStart && A / C.glideSec + S / (k * glidePx()) > 0)) glideMove(A, S, s1, dtS, driven, events)
		else filmMove(A, S, s1, dtS, driven, events)
	}

	function stateName(now) {
		if (mode) return mode
		if (g >= 1) return 'site'
		if (hold) return 'hold'
		if (slews.some((s) => s.end > now) || vel !== 0 || pulses.length > 0) return 'scrub'
		if (intentNow === 'pause' || isReduced) return 'paused'
		if (now < lastActive + C.idleMs) return 'held'
		return 'auto'
	}

	function snapshot(now, events) {
		const rampK = autoK
		return {
			t,
			g,
			rate: lastRate,
			state: stateName(now),
			intent: intentNow,
			phase: phaseOf(g),
			station,
			idleLeft: Math.max(0, lastActive + C.idleMs - now),
			rampK,
			mode,
			cover: mode === 'cover' ? coverFor : null,
			memory: memory ? { ...memory } : null,
			armed,
			events,
		}
	}

	function setPosition(tt, gg, now) {
		const before = t
		t = clamp(tt, 0, siteStart)
		g = t >= siteStart ? clamp(gg, 0, 1) : 0
		recordCrossings(before, t, now)
		slews = []
		pulses = []
		vel = 0
		mode = null
		coverFor = null
		quiet = false
		lastDir = 0
		refusingReversal = false
		detent = 0
		if (hold) {
			log({ type: 'hold', phase: 'end', id: hold.id, at: hold.at, reason: 'jump' })
			hold = null
		}
		for (const h of stops) {
			if (t > h.at + 0.5) done.add(h.id)
			else done.delete(h.id)
		}
		if (isReduced) station = nearestStation(t)
	}

	const api = {
		/** An input of `px` CSS px (px > 0 forward) from the wheel, a finger or a key. Returns false when it is ignored. */
		input({ px = 0, source = 'wheel', at } = {}) {
			const now = lastNow ?? 0
			const when = Math.max(Number.isFinite(at) ? at : now, now)
			stats.inputs++
			lastInputAt = when
			stats.lastInputAt = when
			if (!Number.isFinite(px)) return false
			if (isReduced) return reducedInput(px, source, when)
			if (mode) {
				// The flick and the return run to their end (the momentum of the gesture that started them is not a new wish).
				quietAt = when
				return false
			}
			if (quiet) {
				if (when - quietAt <= F.quietMs) {
					quietAt = when
					return false
				}
				quiet = false
			}
			if (g >= 1) return topInput(px, source, when)
			if (px === 0) {
				// Even a null input is activity: it restarts the idle delay.
				lastActive = Math.max(lastActive, when)
				return false
			}
			if (armed && g === 0) {
				if (px < 0 || (source !== 'wheel' && source !== 'touch') || t >= siteStart - F.keepMin) armed = false
				else {
					if (when - gatherAt > F.gatherMs) gather = 0
					gather += px
					gatherAt = when
					if (gather < F.minPx) return false
					startFlick(when)
					return true
				}
			}
			push(px, source, when)
			return true
		},
		/** Elan: a finger thrown on lift at `pxPerSec` (> 0 forward): it coasts. Returns false when it does not throw. */
		fling({ pxPerSec = 0, at } = {}) {
			const when = Math.max(Number.isFinite(at) ? at : (lastNow ?? 0), lastNow ?? 0)
			if (!elan || isReduced || mode || g >= 1 || !Number.isFinite(pxPerSec) || Math.abs(pxPerSec) < E.flingMinPxPerS) return false
			if (armed) {
				// A forward throw from the arrival state is the flick (a short fast swipe may not have gathered its 24 px yet); a backward one takes the film in hand.
				if (pxPerSec > 0 && t < siteStart - F.keepMin) {
					startFlick(when)
					return true
				}
				armed = false
			}
			const rate = clamp(pxPerSec * k, -C.maxRate, C.maxRate)
			addPulse(rate * (E.flingCoastMs / 1000), E.flingCoastMs, when)
			return true
		},
		/** The page covered the cut of a flick or of a return: the clock goes on (the end of the film plays, or the film comes back where the visitor left it). */
		release(nowMs) {
			if (mode !== 'cover') return false
			const now = Number.isFinite(nowMs) ? Math.max(nowMs, lastNow ?? nowMs) : (lastNow ?? 0)
			const from = { t, g }
			if (coverFor === 'skip') {
				const land = Math.max(t, Math.min(F.landAt, siteStart))
				recordCrossings(t, land, now)
				t = land
				g = 0
				mode = 'arrive'
				coverFor = null
				for (const h of stops) done.add(h.id)
				log({ type: 'jump', cause: 'flick', from, to: { t, g } })
				return true
			}
			const back = memory ?? { t: siteStart, intent: intentNow }
			memory = null
			setPosition(back.t, 0, now)
			intentNow = isReduced ? 'pause' : back.intent
			autoK = 0
			lastActive = now
			quiet = true
			quietAt = Math.max(quietAt, now)
			stats.returns++
			log({ type: 'jump', cause: 'return', from, to: { t, g } })
			return true
		},
		/** The visitor took the film in hand (play, pause, the rail, a chapter): a forward wheel is a scroll of the film from now on. */
		disarm() {
			armed = false
		},
		/** A jump of the position (Skip, End, Home, a chapter, a station, replay, a test). Returns false when the jump is refused. */
		jump({ t: tt = 0, g: gg = 0, cause = 'goto', resume = false } = {}) {
			const now = lastNow ?? 0
			if (LIMITED_JUMPS.has(cause)) {
				if (now - lastJumpAt < C.jumpMinMs) {
					stats.jumpsRefused++
					return false
				}
				lastJumpAt = now
			}
			const from = { t, g }
			armed = false
			// Any jump to the site from the middle of the film keeps where the visitor was (coming up returns there); a jump inside the film forgets it.
			const toSite = clamp(tt, 0, siteStart) >= siteStart && gg > 0
			if (toSite && !memory && from.g === 0 && from.t < siteStart - F.keepMin && !isReduced) memory = { t: from.t, intent: intentNow }
			else if (!toSite) memory = null
			setPosition(tt, gg, now)
			if (resume && intentNow === 'play' && !isReduced) {
				autoK = 1
				lastActive = -Infinity
			} else {
				autoK = 0
				lastActive = now
			}
			log({ type: 'jump', cause, from, to: { t, g } })
			return true
		},
		setIntent(next) {
			const v = next === 'pause' ? 'pause' : 'play'
			if (isReduced) {
				intentNow = 'pause'
				return intentNow
			}
			armed = false
			if (v === 'play' && intentNow !== 'play') lastActive = Math.min(lastActive, (lastNow ?? 0) - C.idleMs) // a visitor who presses play does not wait for the idle delay
			intentNow = v
			return intentNow
		},
		setReduced(on) {
			isReduced = Boolean(on)
			if (isReduced) {
				// A flick or a return under way ends at once where it was going (no rush, no glide in reduced motion).
				if (mode === 'return' || (mode === 'cover' && coverFor === 'return')) {
					t = memory?.t ?? siteStart
					g = 0
				} else if (mode) {
					t = siteStart
					g = 1
				}
				mode = null
				coverFor = null
				memory = null
				intentNow = 'pause'
				autoK = 0
				armed = false
				pulses = []
				vel = 0
				station = nearestStation(t)
				if (g < 1 && stationTimes.length) t = stationTimes[station]
			}
		},
		setViewportHeight(h) {
			if (Number.isFinite(h) && h > 0) vh = h
		},
		/** Reduced motion: the previous (dir < 0) or next (dir > 0) station; after the last one, the site. */
		step(dir) {
			if (!isReduced) return false
			return stationStep(Math.sign(dir) || 0, lastNow ?? 0)
		},
		/** The clock starts counting at `now` without anything else changing (the first frame of the film is on screen: playback starts from here). */
		rebase(now) {
			lastNow = now
		},
		/** The tab was hidden or the page was away: the clock restarts from the idle state at `now`. */
		wake(now) {
			lastNow = now
			lastActive = now
			autoK = 0
			slews = []
			pulses = []
			vel = 0
			if (mode === 'burst') {
				mode = 'cover'
				coverFor = 'skip'
				pending.push({ type: 'flick', phase: 'cover', from: burstFrom, at: t })
			}
		},
		/** Moves the clock to `nowMs` and returns the position. */
		tick(nowMs) {
			const events = pending
			pending = []
			if (lastNow === null) {
				lastNow = nowMs
				return snapshot(nowMs, events)
			}
			let span = nowMs - lastNow
			if (!(span > 0)) {
				lastRate = 0
				return snapshot(nowMs, events)
			}
			if (span > C.maxDtMs) {
				lastNow = nowMs - C.maxDtMs
				span = C.maxDtMs
			}
			const tBefore = t
			const gBefore = g
			const n = Math.max(1, Math.ceil(span / C.subStepMs))
			const step = span / n
			slews = slews.filter((s) => s.end > lastNow)
			for (let i = 0; i < n; i++) subStep(lastNow + i * step, lastNow + (i + 1) * step, events)
			lastNow = nowMs
			crossLog = crossLog.filter((x) => nowMs - x < C.cutWindowMs)
			lastRate = (t - tBefore) / (span / 1000)
			if (g > 0) armed = false // the end of the film was reached: a later forward wheel scrubs
			const next = phaseOf(g)
			if (next !== phaseNow) {
				events.push({ type: 'phase', from: phaseNow, to: next, t, g })
				phaseNow = next
			}
			void gBefore
			return snapshot(nowMs, events)
		},
		get state() {
			return stateName(lastNow ?? 0)
		},
		get position() {
			return { t, g }
		},
		get intent() {
			return intentNow
		},
		get stats() {
			return { ...stats }
		},
		get holding() {
			return hold ? { ...hold } : null
		},
		get station() {
			return station
		},
		get detent() {
			return detent
		},
		get mode() {
			return mode
		},
		get memory() {
			return memory ? { ...memory } : null
		},
		get armed() {
			return armed
		},
		get lastInputAt() {
			return lastInputAt
		},
		get config() {
			return C
		},
	}

	// At the top of the site: the first inputs towards the top only fill the detent (a scroll that arrives at the top with momentum must not rewind the film).
	function topInput(px, source, when) {
		armed = false
		if (px >= 0) return false
		if (when - detentUpAt > C.detentResetMs) detent = 0
		detentUpAt = when
		const limit = C.topDetentPx[source] ?? C.topDetentPx.wheel
		detent += -px
		if (detent < limit) return false
		const excess = detent - limit
		detent = limit
		if (excess <= 0) return false
		if (memory) {
			// v13: the visitor left the film in the middle: the way up takes them back there (the glide plays back on its own, then the page covers the cut).
			mode = 'return'
			detent = 0
			log({ type: 'return', phase: 'glide', to: memory.t })
			return true
		}
		push(-excess, source, when)
		return true
	}

	function push(px, source, when) {
		if (elan) {
			addPulse(px * k, coastOf(px, source), when)
			lastActive = Math.max(lastActive, when)
			return
		}
		slews.push({ px, start: when, end: when + C.slewMs })
		lastActive = Math.max(lastActive, when + C.slewMs)
	}

	function startFlick(when) {
		memory = { t, intent: intentNow }
		armed = false
		gather = 0
		stats.flicks++
		if (hold) {
			log({ type: 'hold', phase: 'end', id: hold.id, at: hold.at, reason: 'input' })
			hold = null
		}
		slews = []
		pulses = []
		vel = 0
		autoK = 0
		burstFrom = t
		burstStart = when
		barrier = barrierAfter(t)
		mode = 'burst'
		log({ type: 'flick', phase: 'burst', from: t, barrier })
	}

	function reducedInput(px, source, when) {
		if (g >= 1) {
			if (px >= 0) return false
			if (when - detentUpAt > C.detentResetMs) detent = 0
			detentUpAt = when
			detent += -px
			if (detent < (C.topDetentPx[source] ?? C.topDetentPx.wheel)) return false
			detent = 0
			return stationStep(-1, when)
		}
		if (when < lockUntil) return false
		acc += px
		if (Math.abs(acc) < C.reduced.gesturePx) return false
		const dir = Math.sign(acc)
		acc = 0
		lockUntil = when + C.reduced.lockoutMs
		return stationStep(dir, when)
	}

	function stationStep(dir, when) {
		if (dir === 0 || stationTimes.length === 0) return false
		const last = stationTimes.length - 1
		const from = { t, g }
		if (g >= 1) {
			if (dir > 0) return false
			station = last
			setPosition(stationTimes[last], 0, when)
			log({ type: 'jump', cause: 'station', from, to: { t, g } })
			return true
		}
		if (dir > 0 && station >= last) {
			setPosition(siteStart, 1, when)
			log({ type: 'jump', cause: 'end', from, to: { t, g } })
			return true
		}
		const next = clamp(station + dir, 0, last)
		if (next === station) return false
		station = next
		setPosition(stationTimes[next], 0, when)
		log({ type: 'jump', cause: 'station', from, to: { t, g } })
		return true
	}

	return api
}
