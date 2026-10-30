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
} = {}) {
	const C = override ? { ...SCRUB, ...override } : SCRUB
	const k = C.pxToFilm
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
	const stats = { drops: 0, dropped: 0, cutsRefused: 0, reversalsRefused: 0, jumpsRefused: 0, inputs: 0, lastInputAt: -Infinity }
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

	function subStep(s0, s1, events) {
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
		if (g >= 1 && px >= 0) return
		const A = autoK * C.nominal * dtS
		const S = px * k
		const driven = busy || S !== 0
		// At the site start, any forward motion is the glide's (its own cap), not the film's.
		if (g > 0 || (t >= siteStart && A / C.glideSec + S / (k * glidePx()) > 0)) glideMove(A, S, s1, dtS, driven, events)
		else filmMove(A, S, s1, dtS, driven, events)
	}

	function stateName(now) {
		if (g >= 1) return 'site'
		if (hold) return 'hold'
		if (slews.some((s) => s.end > now)) return 'scrub'
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
			events,
		}
	}

	function setPosition(tt, gg, now) {
		const before = t
		t = clamp(tt, 0, siteStart)
		g = t >= siteStart ? clamp(gg, 0, 1) : 0
		recordCrossings(before, t, now)
		slews = []
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
			if (g >= 1) return topInput(px, source, when)
			if (px === 0) {
				// Even a null input is activity: it restarts the idle delay.
				lastActive = Math.max(lastActive, when)
				return false
			}
			slews.push({ px, start: when, end: when + C.slewMs })
			lastActive = Math.max(lastActive, when + C.slewMs)
			return true
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
			if (v === 'play' && intentNow !== 'play') lastActive = Math.min(lastActive, (lastNow ?? 0) - C.idleMs) // a visitor who presses play does not wait for the idle delay
			intentNow = v
			return intentNow
		},
		setReduced(on) {
			isReduced = Boolean(on)
			if (isReduced) {
				intentNow = 'pause'
				autoK = 0
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
		get lastInputAt() {
			return lastInputAt
		},
		get config() {
			return C
		},
	}

	// At the top of the site: the first inputs towards the top only fill the detent (a scroll that arrives at the top with momentum must not rewind the film).
	function topInput(px, source, when) {
		if (px >= 0) return false
		if (when - detentUpAt > C.detentResetMs) detent = 0
		detentUpAt = when
		const limit = C.topDetentPx[source] ?? C.topDetentPx.wheel
		detent += -px
		if (detent < limit) return false
		const excess = detent - limit
		detent = limit
		if (excess <= 0) return false
		slews.push({ px: -excess, start: when, end: when + C.slewMs })
		lastActive = Math.max(lastActive, when + C.slewMs)
		return true
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
