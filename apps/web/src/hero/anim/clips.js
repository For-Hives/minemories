// anim/clips.js - baked motion clips (decisions-animation-v11.md section 3.6): the format and the pure reader.
//
// STATUS: the format and this reader exist; web/anim/clips/ is EMPTY. No clip of the film comes from a capture: the v11 pass is written by hand (section 2.5, option C). A clip is
// only added if, after the pass, one gesture still looks wrong and Andy films it (renders-v11/CAPTURE-MOUVEMENT.md); the tool that bakes it is renders-v11/tools/mocap/.
//
// A clip is plain JSON ("mm-clip/1"):
//   {
//     "format": "mm-clip/1",
//     "name": "reste-bras",                       // free name
//     "rig": "efe-slim" | "wolf",                 // which model the channels address
//     "fps": 60,                                  // sampling rate of the "samples" channels
//     "duration": 1.2,                            // seconds; the clip is 0 outside [0, duration] (the reader clamps to the ends)
//     "provenance": { "source", "actor", "tool", "model", "license", "date", "synthetic": false, "notes" },   // REQUIRED; nothing without a licence line
//     "channels": {
//       "rightArm.rx": { "mode": "samples", "v": [0, 0.01, ...] },                 // one value per frame, linear interpolation
//       "head.ry":     { "mode": "hermite", "keys": [[t, v, tanIn, tanOut], ...] } // reduced keys, cubic Hermite (tangents in value per second)
//     }
//   }
// Channel name = "<part>.<field>" with the parts of characters.js (head, body, rightArm, leftArm, rightLeg, leftLeg for Efe; head, body, upperBody, tail, ... for the dog) and the fields
// rx ry rz (radians, ZYX order as in the game), px py pz (pixels, model space, y down). A clip is ADDITIVE on the pose of the film: the value of a channel is added to the pose, times a weight
// that rises and falls with a quintic ramp at both ends of the gesture (`clipWeight`), so it can never replace a bridge pose (bench, freeze).
//
// Everything here is a pure function of (clip, t): no state, no mixer. The film stays a pure function of time and can be rewound.

const FIELDS = { px: 0, py: 1, pz: 2, rx: 3, ry: 4, rz: 5 }
const smooth = (k) => {
	const x = Math.min(1, Math.max(0, k))
	return x * x * x * (x * (x * 6 - 15) + 10)
}

/** Validates and freezes a parsed clip. Throws a readable error: a clip without provenance or with an unknown channel is refused, never half-read. */
export function parseClip(raw) {
	const fail = (m) => {
		throw new Error(`clip ${raw?.name ?? '?'}: ${m}`)
	}
	if (!raw || raw.format !== 'mm-clip/1') fail('format must be "mm-clip/1"')
	if (!(raw.duration > 0)) fail('duration must be > 0')
	if (!(raw.fps > 0)) fail('fps must be > 0')
	const prov = raw.provenance
	if (!prov || typeof prov.source !== 'string' || typeof prov.license !== 'string' || !prov.license) fail('provenance.source and provenance.license are required')
	const channels = {}
	for (const [name, ch] of Object.entries(raw.channels ?? {})) {
		const m = /^([A-Za-z]+)\.(px|py|pz|rx|ry|rz)$/.exec(name)
		if (!m) fail(`unknown channel name "${name}"`)
		if (ch.mode === 'samples') {
			if (!Array.isArray(ch.v) || ch.v.length < 2 || ch.v.some((x) => !Number.isFinite(x))) fail(`channel ${name}: "v" must be 2+ finite numbers`)
			channels[name] = { part: m[1], index: FIELDS[m[2]], mode: 'samples', v: Float32Array.from(ch.v) }
		} else if (ch.mode === 'hermite') {
			const keys = ch.keys
			if (!Array.isArray(keys) || keys.length < 2) fail(`channel ${name}: "keys" must hold 2+ keys`)
			for (let i = 0; i < keys.length; i++) {
				if (keys[i].length !== 4 || keys[i].some((x) => !Number.isFinite(x))) fail(`channel ${name}: key ${i} must be [t, v, tanIn, tanOut]`)
				if (i && !(keys[i][0] > keys[i - 1][0])) fail(`channel ${name}: key times must increase`)
			}
			channels[name] = { part: m[1], index: FIELDS[m[2]], mode: 'hermite', keys: keys.map((k) => Float64Array.from(k)) }
		} else fail(`channel ${name}: mode must be "samples" or "hermite"`)
	}
	return Object.freeze({ name: raw.name, rig: raw.rig, fps: raw.fps, duration: raw.duration, provenance: Object.freeze({ ...prov }), channels })
}

/** Value of one channel at t seconds from the start of the clip (clamped to the ends). */
export function sampleChannel(ch, clip, t) {
	if (ch.mode === 'samples') {
		const x = Math.min(Math.max(t, 0) * clip.fps, ch.v.length - 1)
		const i = Math.min(Math.floor(x), ch.v.length - 2)
		const f = x - i
		return ch.v[i] + (ch.v[i + 1] - ch.v[i]) * f
	}
	const keys = ch.keys
	if (t <= keys[0][0]) return keys[0][1]
	if (t >= keys[keys.length - 1][0]) return keys[keys.length - 1][1]
	let i = 1
	while (t > keys[i][0]) i++
	const a = keys[i - 1]
	const b = keys[i]
	const h = b[0] - a[0]
	const s = (t - a[0]) / h
	const s2 = s * s
	const s3 = s2 * s
	return (2 * s3 - 3 * s2 + 1) * a[1] + (s3 - 2 * s2 + s) * h * a[3] + (-2 * s3 + 3 * s2) * b[1] + (s3 - s2) * h * b[2]
}

/** All channels at t: { "rightArm.rx": value, ... }. */
export function sampleClip(clip, t) {
	const out = {}
	for (const [name, ch] of Object.entries(clip.channels)) out[name] = sampleChannel(ch, clip, t)
	return out
}

/** Weight of the gesture at t: a quintic ramp in over `ramp` seconds and out over `ramp` seconds, 0 outside [0, duration]. */
export function clipWeight(clip, t, ramp = 0.15) {
	if (!(t > 0 && t < clip.duration)) return 0
	const r = Math.min(ramp, clip.duration / 2)
	return smooth(t / r) * smooth((clip.duration - t) / r)
}

/**
 * Adds the layers to a pose { part: [x, y, z, rx, ry, rz, sx, sy, sz] } in place. layers = [{ clip, t, weight? }]: t = seconds from the start of the gesture,
 * weight = an extra weight (default 1) multiplied by the ramp. A channel whose part is absent from the pose is ignored. No layer: nothing is touched.
 */
export function applyClipLayers(pose, layers) {
	if (!layers) return
	for (const layer of layers) {
		const w = clipWeight(layer.clip, layer.t, layer.ramp) * (layer.weight ?? 1)
		if (!(w > 0)) continue
		for (const [name, ch] of Object.entries(layer.clip.channels)) {
			const p = pose[ch.part]
			if (p) p[ch.index] += w * sampleChannel(ch, layer.clip, layer.t)
		}
	}
}
