// anim/curves.js - pure curve tools of the v11 "natural" animation pass (decisions-animation-v11.md section 3.2).
//
// Everything here is a pure function of its arguments: no state is kept from one call to the next, no integrator, no mixer.
// The film can therefore be rewound, frozen and driven by the scroll in both directions (contract v9/v10: the film is a pure
// function of time). No dependency (three.js is not imported): the module runs under Node for the unit tests.
//
//   EASE.*                named curves [0,1] -> R with f(0) = 0 and f(1) = 1 (the overshoot curves end at 1 as well)
//   track(keys)           piecewise curve through keys [[t, v, ease?], ...], exact at the keys
//   trackH(keys)          monotone cubic Hermite through keys [[t, v], ...] (hand paths: no overshoot between keys)
//   spring(t, steps, o)   closed-form damped spring driven by steps [[ti, delta_i], ...]; exactly the sum of the deltas after the window
//   lag(f, dt)            f(t - dt); lag(f, 0) is f itself
//   phaseOf(freqKeys)     phase (radians) of an oscillator whose frequency is piecewise linear in time: integrated, never f(t) * t
//
// Forbidden in a new layer (they were the sources of the jumps measured in v10b): Math.sqrt(f) at f = 0 (infinite slope), |sin| (a corner), a cubic
// smoothstep for a visible start (C1 only: the acceleration jumps). `EASE.inOut` is the quintic (C2) used everywhere in characters.js.

const PI = Math.PI
const TAU = PI * 2

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, k) => a + (b - a) * k

/** Quintic smoothstep (C2): the curve of `smooth` in characters.js. */
export const smooth = (k) => {
	const x = clamp(k, 0, 1)
	return x * x * x * (x * (x * 6 - 15) + 10)
}

// Half quintics. in(k) = 2k^3 - k^4: value 0, slope 0 and curvature 0 at k = 0; value 1, slope 2 and curvature 0 at k = 1 (C2 at both ends of a segment that continues at slope 2).
const easeIn = (k) => {
	const x = clamp(k, 0, 1)
	return 2 * x * x * x - x * x * x * x
}
const easeOut = (k) => 1 - easeIn(1 - clamp(k, 0, 1))

const BASIC = { inOut: smooth, in: easeIn, out: easeOut, linear: (k) => clamp(k, 0, 1) }
const resolveEase = (e) => {
	if (typeof e === 'function') return e
	if (e == null) return smooth
	const f = BASIC[e]
	if (!f) throw new Error(`unknown ease: ${e}`)
	return f
}

/** A track through keys [[t, v, ease?], ...] sorted by t. The ease of key i shapes the segment that ENDS at key i (default `inOut`). */
export function track(keys) {
	const n = keys.length
	const ts = keys.map((k) => k[0])
	const vs = keys.map((k) => k[1])
	const es = keys.map((k) => resolveEase(k[2]))
	return (t) => {
		if (!(t > ts[0])) return vs[0]
		if (t >= ts[n - 1]) return vs[n - 1]
		let i = 1
		while (t > ts[i]) i++
		const k = (t - ts[i - 1]) / (ts[i] - ts[i - 1])
		return lerp(vs[i - 1], vs[i], es[i](k))
	}
}

/** Overshoot: reaches 1 + os at k1, then settles on 1 (monotone pieces, C2 at the joints). */
const outBack = (os = 0.06, k1 = 0.6) => track([[0, 0], [k1, 1 + os, 'inOut'], [1, 1, 'inOut']])
/** Goes back by `a` before leaving (anticipation), reaches 1. */
const anticipate = (a = 0.12, k1 = 0.22) => track([[0, 0], [k1, -a, 'inOut'], [1, 1, 'inOut']])

export const EASE = {
	...BASIC,
	outBack: (os, k1) => outBack(os, k1),
	anticipate: (a, k1) => anticipate(a, k1),
	outSettle: outBack(0.04, 0.7),
}

/** Monotone cubic Hermite (Fritsch-Carlson), the construction of `monotoneKeys` in scene.js. Constant before and after the keys. */
export function trackH(keys) {
	const n = keys.length
	const xs = keys.map((k) => k[0])
	const ys = keys.map((k) => k[1])
	const h = xs.slice(1).map((x, i) => x - xs[i])
	const d = h.map((hi, i) => (ys[i + 1] - ys[i]) / hi)
	const m = xs.map((_, i) => {
		if (i === 0) return d[0]
		if (i === n - 1) return d[n - 2]
		if (d[i - 1] * d[i] <= 0) return 0
		const w1 = 2 * h[i] + h[i - 1]
		const w2 = h[i] + 2 * h[i - 1]
		return (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
	})
	return (x) => {
		if (x <= xs[0]) return ys[0]
		if (x >= xs[n - 1]) return ys[n - 1]
		let i = 0
		while (x > xs[i + 1]) i++
		const s = (x - xs[i]) / h[i]
		const s2 = s * s
		const s3 = s2 * s
		return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h[i] * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h[i] * m[i + 1]
	}
}

/**
 * Step response of a damped spring (closed form), summed over a list of steps.
 *   steps   [[ti, delta_i], ...]: the target goes up by delta_i at ti
 *   f       natural frequency (Hz); zeta damping ratio (< 1); window W (s) after which the response is EXACTLY the final value
 * S(tau) = 1 - e^(-zeta w tau) (cos wd tau + zeta w / wd sin wd tau) * cut(tau) for 0 < tau < W, 1 afterwards; cut falls from 1 to 0 over the last quarter of W
 * (quintic): the residual (below 1e-3 at 0.75 W for the default window) is forced to zero, the curve and its slope are continuous at W.
 * The default window is the one that puts e^(-zeta w 0.75 W) under 1e-3.
 */
export function springWindow(f, zeta) {
	const w = TAU * f
	return Math.log(1000) / (zeta * w * 0.75)
}
export function springStep(tau, f, zeta, window) {
	if (!(tau > 0)) return 0
	const z = Math.min(zeta, 0.999)
	const W = window ?? springWindow(f, z)
	if (tau >= W) return 1
	const w = TAU * f
	const wd = w * Math.sqrt(1 - z * z)
	const decay = Math.exp(-z * w * tau)
	const residual = decay * (Math.cos(wd * tau) + ((z * w) / wd) * Math.sin(wd * tau))
	const cut = 1 - smooth((tau - 0.75 * W) / (0.25 * W))
	return 1 - residual * cut
}
export function spring(t, steps, { f = 3, zeta = 0.6, window } = {}) {
	let x = 0
	for (let i = 0; i < steps.length; i++) x += steps[i][1] * springStep(t - steps[i][0], f, zeta, window)
	return x
}

/**
 * Response of the same spring to a unit velocity kick at tau = 0 (a landing): it starts at 0 (with a 0.05 s quintic ramp-in), its first peak is about 1 and it is exactly 0 after the window (same quintic cut as
 * `springStep`, applied to the whole response). Pure; used for the squash after a hop.
 */
export function springKick(tau, f, zeta, window) {
	if (!(tau > 0)) return 0
	const z = Math.min(zeta, 0.999)
	const W = window ?? springWindow(f, z)
	if (tau >= W) return 0
	const w = TAU * f
	const wd = w * Math.sqrt(1 - z * z)
	const tPeak = Math.atan2(wd, z * w) / wd
	const peak = Math.exp(-z * w * tPeak) * Math.sin(wd * tPeak)
	const cut = 1 - smooth((tau - 0.75 * W) / (0.25 * W))
	// a short quintic ramp-in (0.05 s): a landing is an impact, but the curve itself starts C2
	return ((Math.exp(-z * w * tau) * Math.sin(wd * tau)) / peak) * cut * smooth(tau / 0.05)
}

/** f delayed by dt seconds: lag(f, 0) is f. */
export function lag(f, dt) {
	if (!dt) return f
	return (t) => f(t - dt)
}

/**
 * Phase (rad) of an oscillator whose frequency is piecewise linear: freqKeys [[t, hz], ...]. phi(t) = 2 pi integral of f, closed form per segment
 * (never sin(2 pi f(t) t), which jumps when f changes). Constant frequency before and after the keys; phi(first key) = 0.
 */
export function phaseOf(freqKeys) {
	const ts = freqKeys.map((k) => k[0])
	const fs = freqKeys.map((k) => k[1])
	const cum = [0]
	for (let i = 1; i < ts.length; i++) cum.push(cum[i - 1] + ((fs[i - 1] + fs[i]) / 2) * (ts[i] - ts[i - 1]))
	const n = ts.length
	return (t) => {
		if (t <= ts[0]) return TAU * fs[0] * (t - ts[0])
		if (t >= ts[n - 1]) return TAU * (cum[n - 1] + fs[n - 1] * (t - ts[n - 1]))
		let i = 1
		while (t > ts[i]) i++
		const dt = t - ts[i - 1]
		const slope = (fs[i] - fs[i - 1]) / (ts[i] - ts[i - 1])
		return TAU * (cum[i - 1] + fs[i - 1] * dt + 0.5 * slope * dt * dt)
	}
}

/**
 * Raised bump: 0 outside [a, d], 1 on [b, c], quintic ramps (C2). The shape of every "window" weight of the pass.
 */
export const window4 = (x, a, b, c, d) => smooth((x - a) / (b - a || 1)) * (1 - smooth((x - c) / (d - c || 1)))
