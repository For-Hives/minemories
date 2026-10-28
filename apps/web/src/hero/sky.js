// Minemories, scene V1: animated sky (gradient dome, square sun and moon, stars, Milky Way, block clouds).
// Everything is drawn in a single full-screen shader (a dome that follows the camera): one draw call, insensitive to the mist.
// Contract: MODULES.md (`createSky({ radius, quality }) -> { object3d, update(state), dispose() }`).
//
// Pass v3: star trails during the timelapse (rotation blur, length according to the speed of the days), rare
// shooting stars, pixelated cirrus that turn pink at sunset, optional aurora (state.aurora, faint, off by default).
// Pass v4 (scroll speed curve: 0.35 -> 0.8 cycle/s at the start, plateaus <= 0.08 at the switches, 1.6 to 1.8):
// the twilight glow, the glow colour and the sun colour are averaged over a PHASE window that opens
// with the speed (same keys as TIMELINE.sky.smooth of scene.js, or state.skySmooth if the host gives it). The sunrise
// that opens the timelapse (cut at 19.5 s, phase 1.21) is no longer a two-frame pink: the dawn is already there
// on the first frame and lasts about 0.4 s. Pure in (phase, speed): scrub in both directions.
//
// Path: the sun and the moon do NOT follow the real course (east -> south -> west). With the low camera of v1
// (world eye 105.5 -57.4 114.5, target 93 -54.5 99), the south is behind the camera: a "true" course would leave the
// frame. The course is therefore described in the frame of the reference camera (horizontal aim axis f, right r, up u):
//   dir(theta) = normalize(f + tan(spread)*cos(theta)*r + tan(peak)*sin(theta)*u),  theta = 2*pi*(phase - 0.25)
// that is an exact ellipse on screen: rise on the right at phase 0.25, culmination above the centre at 0.5, set on the
// left at 0.75. The moon follows the same course shifted by half a day (so it is NOT the opposite of the sun,
// otherwise it would always be behind the camera): it rises on the right at sunset and sets on the left at dawn.
//
// Pass v5 ("You told him stay"): during the forgetting (state.forgetting, contract v4), the sun also fades in
// presence (disc, halo, cloud reflections: option `forgetSun`): a dazzling white square above the ruin
// (24.9 and 27.4 s) was still the strongest point of light of the absence, ahead of the ember. 0 at the freeze frames (forgetting at 0).

import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Course of the sun and the moon (pure functions)
// ---------------------------------------------------------------------------

// Settings of the course, exported so that the integrator can adjust them if the camera changes.
export const SKY_PATH = {
	eye: [6.5, -8.4, 15.5], // v1 reference camera in scene space (origin 99 -49 99)
	target: [-6, -5.5, 0],
	spread: 31, // offset (degrees) of the rise/set point on each side of the aim axis
	peak: 27, // elevation (degrees) of the culmination, just under the top of the frame (vertical field 50 deg)
	starPole: 38, // elevation (degrees) of the pole the stars turn around, in the aim axis
}

const basisCache = new WeakMap()

// Frame of the course: f (horizontal aim), r (right), u (up), plus tangents of the angles.
export function skyPathBasis(path = SKY_PATH) {
	const hit = basisCache.get(path)
	if (hit && hit.key === `${path.eye}|${path.target}|${path.spread}|${path.peak}|${path.starPole}`) return hit
	let fx = path.target[0] - path.eye[0]
	let fz = path.target[2] - path.eye[2]
	const l = Math.hypot(fx, fz) || 1
	fx /= l
	fz /= l
	const deg = Math.PI / 180
	const basis = {
		key: `${path.eye}|${path.target}|${path.spread}|${path.peak}|${path.starPole}`,
		f: [fx, 0, fz],
		r: [-fz, 0, fx], // f x up
		u: [0, 1, 0],
		tx: Math.tan(path.spread * deg),
		ty: Math.tan(path.peak * deg),
		pole: [fx * Math.cos(path.starPole * deg), Math.sin(path.starPole * deg), fz * Math.cos(path.starPole * deg)],
	}
	basisCache.set(path, basis)
	return basis
}

// Direction (normalised) from the scene to the sun. y < 0: below the horizon. Accepts an unbounded phase (act II).
export function sunDirAt(phase, path = SKY_PATH, out = new THREE.Vector3()) {
	const { f, r, tx, ty } = skyPathBasis(path)
	const theta = 2 * Math.PI * (phase - 0.25)
	const c = tx * Math.cos(theta)
	const s = ty * Math.sin(theta)
	return out.set(f[0] + c * r[0], s, f[2] + c * r[2]).normalize()
}

// Same course, half a day later: the moon rises on the right at 0.75 and sets on the left at 0.25.
export function moonDirAt(phase, path = SKY_PATH, out = new THREE.Vector3()) {
	return sunDirAt(phase + 0.5, path, out)
}

// Number of the night: changes at noon, so that a whole night keeps the same moon phase.
export const dayIndexAt = (phase) => Math.floor(phase + 0.5)
// Moon phase 0..7 (0 full moon, 4 new moon), one per night as in Minecraft.
export const moonPhaseAt = (day) => ((Math.floor(day) % 8) + 8) % 8

// ---------------------------------------------------------------------------
// Sky palette (pure function, sRGB 0..1), indexed by e = sin(2*pi*(phase - 0.25)) like skyAt() of main.js.
// The integrator can use it for lighting.zenith / horizon / fog so that the mist joins the horizon.
// ---------------------------------------------------------------------------

const PALETTE = {
	zenith: [
		[-0.4, '#03060f'],
		[-0.18, '#070d22'],
		[-0.06, '#18224a'],
		[0.0, '#33407a'],
		[0.08, '#4a64a6'],
		[0.25, '#3a6fc4'],
		[0.6, '#2560c4'],
		[1.0, '#1f58bd'],
	],
	horizon: [
		[-0.4, '#0b1226'],
		[-0.18, '#151e3d'],
		[-0.06, '#3a3a66'],
		[0.0, '#a7778a'],
		[0.04, '#e39a73'],
		[0.12, '#efc29a'],
		[0.3, '#b4cfe8'],
		[1.0, '#a3c6ea'],
	],
	// Warm glow on the sun side (added to the gradient), strongest at the horizon.
	glow: [
		[-0.16, '#5b2c4c'],
		[-0.06, '#c4513a'],
		[0.0, '#ff7a32'],
		[0.08, '#ffa14a'],
		[0.25, '#ffd9a0'],
	],
	sun: [
		[-0.05, '#ff6a2a'],
		[0.05, '#ff9a4a'],
		[0.25, '#ffd49a'],
		[0.6, '#fff4e2'],
	],
	grey: { zenith: '#8c949b', horizon: '#a6abae', glow: '#b4aaa2', sun: '#d6dade' },
}

const toRgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
const PAL = Object.fromEntries(
	Object.entries(PALETTE).map(([k, v]) => [
		k,
		Array.isArray(v) ? v.map(([x, h]) => [x, toRgb(h)]) : Object.fromEntries(Object.entries(v).map(([g, h]) => [g, toRgb(h)])),
	]),
)

const sstep = (a, b, x) => {
	const k = Math.min(1, Math.max(0, (x - a) / (b - a)))
	return k * k * (3 - 2 * k)
}
const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]

function sample(keys, x) {
	if (x <= keys[0][0]) return keys[0][1]
	for (let i = 1; i < keys.length; i++) {
		if (x <= keys[i][0]) return mix3(keys[i - 1][1], keys[i][1], sstep(keys[i - 1][0], keys[i][0], x))
	}
	return keys[keys.length - 1][1]
}

// "Hourly" elevation used by the palette (same convention as main.js).
export const elevationAt = (phase) => Math.sin(2 * Math.PI * (phase - 0.25))

export function skyPaletteAt(e, grey = 0) {
	let zenith = sample(PAL.zenith, e)
	let horizon = sample(PAL.horizon, e)
	let glow = sample(PAL.glow, e)
	let sun = sample(PAL.sun, e)
	if (grey > 0) {
		zenith = mix3(zenith, PAL.grey.zenith, grey)
		horizon = mix3(horizon, PAL.grey.horizon, grey)
		glow = mix3(glow, PAL.grey.glow, grey)
		sun = mix3(sun, PAL.grey.sun, grey)
	}
	// The mist takes the colour of the horizon, slightly pulled toward the zenith (the distance turns blue).
	const fog = mix3(horizon, zenith, 0.12)
	// Strength of the twilight glow: none in full day and in full night.
	const twilight = sstep(-0.24, -0.03, e) * (1 - sstep(0.1, 0.4, e)) * (1 - 0.75 * grey)
	return { zenith, horizon, fog, glow, sun, twilight }
}

// ---------------------------------------------------------------------------
// Shader
// ---------------------------------------------------------------------------

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = (modelMatrix * vec4(position, 0.0)).xyz;
	vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	p.z = p.w * 0.99995; // just before the far plane: never clipped, always behind
	gl_Position = p;
}
`

const FRAG = /* glsl */ `
#define CLOUD_STEPS __CLOUD_STEPS__
#define STAR_STEPS_MAX 8
#define MILKY __MILKY__
varying vec3 vDir;

uniform vec3 uZenith, uHorizon, uGround, uGlow, uSunColor, uSunTint;
uniform float uTwilight, uNight, uGrey, uGain;
uniform vec3 uSunDir, uSunRight, uSunUp;
uniform vec3 uMoonDir, uMoonRight, uMoonUp;
uniform float uSunLow, uSunSize, uMoonSize, uSunVis, uMoonVis, uMoonPhase;
uniform mat3 uStarRot;
uniform vec3 uStarPole, uFwd, uRightB;
uniform float uTrail, uStarStrobe, uMeteorOn, uCirrus, uAurora;
uniform int uStarSteps;
uniform float uTime, uStarDensity;
uniform vec3 uCamPos;
uniform vec2 uCloudOffset;
uniform float uCloudBase, uCloudTop, uCloudCell, uCloudCover, uCloudFar, uCloudOpacity;
uniform vec3 uCloudLit, uCloudShade, uCloudSide;

float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
	p3 = fract(p3 * 0.1031);
	p3 += dot(p3, p3.zyx + 31.32);
	return fract((p3.x + p3.y) * p3.z);
}
vec2 hash23(vec3 p3) {
	p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash12(i), b = hash12(i + vec2(1.0, 0.0));
	float c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float vnoise3(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float n000 = hash13(i), n100 = hash13(i + vec3(1, 0, 0)), n010 = hash13(i + vec3(0, 1, 0)), n110 = hash13(i + vec3(1, 1, 0));
	float n001 = hash13(i + vec3(0, 0, 1)), n101 = hash13(i + vec3(1, 0, 1)), n011 = hash13(i + vec3(0, 1, 1)), n111 = hash13(i + vec3(1, 1, 1));
	return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

// Full cloud cell? Two-octave noise on the grid, threshold = coverage: Minecraft-style clumps.
bool cloudCell(vec2 c) {
	float n = vnoise(c * 0.21) * 0.68 + vnoise(c * 0.53 + 17.0) * 0.32;
	return n > 1.0 - uCloudCover;
}

// Anti-aliased coverage of a centred square (half side s, coordinate d, pixel width w).
float boxCover(vec2 d, float s, vec2 w) {
	vec2 k = clamp(0.5 + (s - abs(d)) / max(w, vec2(1e-5)), 0.0, 1.0);
	return k.x * k.y;
}

// Coordinates in the square of a celestial body (-1..1 inside).
vec2 discUV(vec3 v, vec3 dir, vec3 right, vec3 up, float size, out float front) {
	front = dot(v, dir);
	return vec2(dot(v, right), dot(v, up)) / (max(front, 1e-4) * size);
}

void main() {
	vec3 v = normalize(vDir);
	float h = v.y;
	float hp = max(h, 0.0);

	// --- Base gradient: thick horizon, deep zenith ---
	vec3 col = mix(uHorizon, uZenith, pow(hp, 0.5));
	// Below the horizon: ground mist (matches the mist of the scene).
	col = mix(col, uGround, smoothstep(0.0, -0.18, h));

	// --- Scattering around the sun (Mie) and twilight glow on the sun side ---
	float cs = max(dot(v, uSunDir), 0.0);
	vec2 vh = normalize(v.xz + vec2(1e-5));
	vec2 sh = normalize(uSunDir.xz + vec2(1e-5));
	float az = 0.5 + 0.5 * dot(vh, sh);
	float band = exp(-hp * 6.0) * (1.0 - smoothstep(0.0, -0.12, h));
	col += uGlow * uTwilight * band * (0.25 + 1.2 * pow(az, 4.0));
	// Belt of Venus: pale pink band on the opposite side, above the shadow of the Earth.
	col += vec3(0.42, 0.22, 0.30) * uTwilight * exp(-abs(h - 0.07) * 22.0) * pow(1.0 - az, 2.0) * 0.35;
	float mie = pow(cs, 5.0) * mix(0.03, 0.16, uTwilight) + pow(cs, 32.0) * 0.32 + pow(cs, 260.0) * 1.4;
	col += uSunColor * mie * uSunVis * (1.0 - 0.75 * uGrey) * (1.0 - smoothstep(0.0, -0.1, h) * 0.6);

	// --- Moon: cold halo ---
	float cm = max(dot(v, uMoonDir), 0.0);
	col += vec3(0.30, 0.40, 0.75) * (pow(cm, 18.0) * 0.05 + pow(cm, 220.0) * 0.22) * uMoonVis * uNight;

	// --- Square stars (and Milky Way) ---
	float above = smoothstep(-0.01, 0.22, h);
	float starK = uNight * above * (1.0 - 0.8 * uGrey) * (1.0 - 0.5 * uStarStrobe);
	if (starK > 0.002) {
		vec3 ws0 = uStarRot * v;
		// Long exposure during the timelapse: the sky is sampled at older and older instants
		// (rotation of the sky around the pole). A single pass when the days do not go by fast.
		float stepsF = float(max(uStarSteps, 1));
		float wgt = pow(1.0 / stepsF, 0.55);
		vec3 starAcc = vec3(0.0);
		for (int si = 0; si < STAR_STEPS_MAX; si++) {
			if (si >= uStarSteps) break;
			float ang = uTrail * float(si) / max(stepsF - 1.0, 1.0);
			vec3 ws = ws0 * cos(ang) + cross(uStarPole, ws0) * sin(ang) + uStarPole * dot(uStarPole, ws0) * (1.0 - cos(ang));
			vec3 a = abs(ws);
			vec2 fuv;
			float face;
			if (a.x >= a.y && a.x >= a.z) { fuv = ws.yz / a.x; face = ws.x > 0.0 ? 1.0 : 2.0; }
			else if (a.y >= a.z) { fuv = ws.xz / a.y; face = ws.y > 0.0 ? 3.0 : 4.0; }
			else { fuv = ws.xy / a.z; face = ws.z > 0.0 ? 5.0 : 6.0; }
			vec3 nb = normalize(vec3(0.35, 0.55, 0.76));
			float bd = dot(ws, nb);
			float milky = exp(-bd * bd * 16.0);
			vec2 grid = fuv * 260.0;
			vec2 cell = floor(grid);
			vec2 w = fwidth(grid);
			float hs = hash13(vec3(cell, face * 7.13));
			float density = uStarDensity * (1.0 + 2.2 * milky);
			if (hs < density) {
				vec2 r2 = hash23(vec3(cell, face + 3.7));
				float r3 = hash13(vec3(cell.yx, face * 1.91));
				vec2 c0 = 0.25 + 0.5 * r2;
				float mag = pow(r3, 5.0); // many faint stars, very few bright ones
				float s = mix(0.07, 0.19, mag);
				float cov = boxCover(grid - cell - c0, s, w);
				float tw = 0.78 + 0.22 * sin(uTime * (1.7 + 3.1 * r2.x) + 6.2831 * r2.y);
				vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.86, 0.68), smoothstep(0.55, 1.0, r2.y));
				starAcc += tint * cov * mix(0.35, 3.2, mag) * tw;
			}
		}
		col += starAcc * wgt * starK;
#if MILKY
		float mw = vnoise3(ws0 * 5.0) * 0.6 + vnoise3(ws0 * 13.0) * 0.4;
		float lane = smoothstep(0.35, 0.75, vnoise3(ws0 * 7.0 + 4.0));
		vec3 nb2 = normalize(vec3(0.35, 0.55, 0.76));
		float bd2 = dot(ws0, nb2);
		float milky2 = exp(-bd2 * bd2 * 16.0);
		col += vec3(0.20, 0.22, 0.34) * milky2 * mw * mw * (1.0 - 0.6 * lane) * 0.16 * starK;
#endif
	}

	// --- Shooting star (rare: a 0.8 s pass about every 11 s, one time out of two) ---
	if (uMeteorOn > 0.001 && uNight > 0.6 && h > 0.12) {
		float slot = floor(uTime / 11.0);
		float h0 = hash12(vec2(slot, 3.3));
		float t0 = slot * 11.0 + 1.5 + 8.0 * hash12(vec2(slot, 7.7));
		float u = (uTime - t0) / 0.8;
		if (h0 < 0.5 && u > 0.0 && u < 1.0) {
			vec3 up = vec3(0.0, 1.0, 0.0);
			float r1 = hash12(vec2(slot, 11.1)), r2 = hash12(vec2(slot, 13.7)), r3 = hash12(vec2(slot, 17.9)), r4 = hash12(vec2(slot, 19.3));
			vec3 A = normalize(uFwd * (0.9 + 0.3 * r1) + uRightB * (r2 * 1.2 - 0.6) + up * (0.34 + 0.3 * r3));
			vec3 B = normalize(A + uRightB * ((r4 - 0.5) * 0.5) - up * (0.1 + 0.08 * r1));
			vec3 head = normalize(mix(A, B, u));
			vec3 tail = normalize(mix(A, B, max(u - 0.3, 0.0)));
			vec3 ab = head - tail;
			float tt = clamp(dot(v - tail, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
			float d = length(v - (tail + ab * tt));
			float fadeU = sin(3.14159 * u);
			col += vec3(0.8, 0.9, 1.0) * exp(-d * d / (0.0028 * 0.0028)) * (0.15 + 0.85 * tt) * fadeU * 3.0 * uMeteorOn * (1.0 - uStarStrobe) * smoothstep(0.12, 0.3, h);
		}
	}

	// --- Square sun (procedural 16 x 16 texture) ---
	float hz = smoothstep(-0.0015, 0.0015, h); // the horizon cuts the body sharply
	float front;
	vec2 su = discUV(v, uSunDir, uSunRight, uSunUp, uSunSize, front);
	if (front > 0.0 && max(abs(su.x), abs(su.y)) < 1.3) {
		vec2 sw = fwidth(su);
		float cov = boxCover(su, 1.0, sw);
		vec2 px = floor((su * 0.5 + 0.5) * 16.0);
		float d = max(abs(px.x - 7.5), abs(px.y - 7.5));
		float n = hash12(px + 11.0);
		// Near the horizon the disc flattens (less core/edge contrast), otherwise it looks hollow.
		vec3 core = vec3(1.0, 0.98, 0.88) * mix(22.0, 7.0, uSunLow);
		vec3 ring = vec3(1.0, 0.86, 0.45) * mix(11.0, 6.0, uSunLow);
		vec3 rim = vec3(1.0, 0.62, 0.25) * mix(5.0, 4.0, uSunLow);
		vec3 sc = d < 4.0 ? core : (d < 6.0 ? ring : rim);
		sc *= 0.9 + 0.2 * n;
		sc *= uSunTint; // at the horizon: less intense and orange, so that the colour survives the tone mapping
		col = mix(col, sc, cov * hz * uSunVis * (1.0 - uGrey));
	}

	// --- Square moon with phases ---
	vec2 mu = discUV(v, uMoonDir, uMoonRight, uMoonUp, uMoonSize, front);
	if (front > 0.0 && max(abs(mu.x), abs(mu.y)) < 1.3) {
		vec2 mw2 = fwidth(mu);
		float cov = boxCover(mu, 1.0, mw2);
		vec2 px = floor((mu * 0.5 + 0.5) * 16.0);
		vec2 pc = (px + 0.5) / 8.0 - 1.0; // pixel centre, -1..1
		float n = hash12(px + 41.0);
		// Craters: a few fixed darker spots.
		float crater = 0.0;
		crater += step(length(px - vec2(4.0, 10.0)), 1.6) * 1.0;
		crater += step(length(px - vec2(10.0, 5.0)), 2.1);
		crater += step(length(px - vec2(11.0, 11.0)), 1.1);
		crater += step(length(px - vec2(6.0, 4.0)), 1.0);
		crater += step(length(px - vec2(8.0, 8.0)), 0.6);
		vec3 base = vec3(0.80, 0.85, 0.95) * (0.84 + 0.22 * n) * (1.0 - 0.42 * min(crater, 1.0));
		// Phase: lighting of a cylinder by a light turning around it (0 full, 4 new).
		float ang = 6.2831853 * uMoonPhase / 8.0;
		float nz = sqrt(max(1.0 - pc.x * pc.x, 0.0));
		float lit = step(0.0, pc.x * sin(ang) + nz * cos(ang) + 0.02);
		// Dark part: bluish ashen light, so that the square stays readable as a crescent.
		// Lit face x 1.3 (x 1.9 made a big halo under the bloom); lighter dark face, the square stays whole.
		vec3 mc = lit > 0.5 ? base * 1.3 : base * vec3(0.28, 0.32, 0.42);
		col = mix(col, mc, cov * hz * uMoonVis * mix(0.8, 1.0, lit) * (1.0 - 0.6 * uGrey));
	}

	// --- Cirrus: very high bands of pixels, taking the colour of the sunset ---
	if (uCirrus > 0.001 && h > 0.03) {
		vec2 q = v.xz / (h + 0.28);
		q = q * vec2(5.0, 11.0) + vec2(uCloudOffset.x * 0.004, 0.0);
		vec2 qc = floor(q);
		float cn = vnoise(qc * vec2(0.42, 1.3) + 5.0) * 0.65 + vnoise(qc * vec2(0.9, 2.6) + 31.0) * 0.35;
		float band = smoothstep(0.56, 0.82, cn) * smoothstep(0.03, 0.16, h) * (1.0 - smoothstep(0.5, 0.85, h));
		float lowSun = clamp(uTwilight * 1.4 + 0.25, 0.0, 1.0);
		vec3 cc = mix(vec3(0.82, 0.88, 0.96) * (0.55 + 0.45 * (1.0 - uNight)), uGlow * 1.5 + vec3(0.18, 0.1, 0.1), lowSun * (0.4 + 0.6 * pow(az, 2.0)));
		col = mix(col, cc, band * uCirrus * (0.22 + 0.4 * uTwilight) * (1.0 - 0.8 * uGrey) * (1.0 - 0.85 * uNight));
	}

	// --- Aurora (optional): green curtains with a purple fringe, streaked vertically ---
	if (uAurora > 0.002 && h > 0.05) {
		float azi = atan(dot(v, uRightB), dot(v, uFwd));
		float x = azi * 3.0;
		float baseH = 0.33 + 0.09 * sin(x * 1.3 + uTime * 0.04) + 0.04 * sin(x * 3.1 - uTime * 0.07);
		float dh = h - baseH;
		float curtain = smoothstep(-0.04, 0.0, dh) * exp(-max(dh, 0.0) * 6.5);
		float ray = vnoise(vec2(floor(azi * 46.0), uTime * 0.12)) * 0.6 + vnoise(vec2(floor(azi * 120.0), uTime * 0.31 + 9.0)) * 0.4;
		float env = smoothstep(-1.15, -0.55, azi) * (1.0 - smoothstep(0.55, 1.15, azi));
		vec3 ac = mix(vec3(0.12, 1.0, 0.5), vec3(0.5, 0.28, 1.0), smoothstep(0.02, 0.4, dh));
		col += ac * curtain * (0.25 + 0.75 * ray) * env * uAurora * 0.5 * smoothstep(0.05, 0.16, h);
	}

	// --- Flat block clouds (12 x 4 x 12), walked with a DDA from the camera ---
	if (h > 0.004 && uCloudOpacity > 0.001 && uCamPos.y < uCloudBase) {
		float tB = (uCloudBase - uCamPos.y) / h;
		if (tB < uCloudFar) {
			float tT = (uCloudTop - uCamPos.y) / h;
			vec2 p = (uCamPos.xz + v.xz * tB + uCloudOffset) / uCloudCell;
			vec2 cell = floor(p);
			vec2 dirc = v.xz;
			vec2 stp = sign(dirc);
			vec2 inv = 1.0 / max(abs(dirc), vec2(1e-5));
			vec2 nextB = (stp * (cell - p) + max(stp, 0.0)) * inv * uCloudCell; // distance (t) to the next boundary
			float t = tB;
			int hitFace = -1; // 0 below, 1 x side, 2 z side
			if (cloudCell(cell)) hitFace = 0;
			for (int i = 0; i < CLOUD_STEPS; i++) {
				if (hitFace >= 0) break;
				float dt;
				int axis;
				if (nextB.x < nextB.y) { dt = nextB.x; axis = 1; } else { dt = nextB.y; axis = 2; }
				if (t + dt > tT) break;
				t += dt;
				nextB -= dt;
				if (axis == 1) { cell.x += stp.x; nextB.x = uCloudCell * inv.x; }
				else { cell.y += stp.y; nextB.y = uCloudCell * inv.y; }
				if (cloudCell(cell)) hitFace = axis;
			}
			if (hitFace >= 0) {
				vec3 nrm = hitFace == 0 ? vec3(0.0, -1.0, 0.0) : (hitFace == 1 ? vec3(-stp.x, 0.0, 0.0) : vec3(0.0, 0.0, -stp.y));
				float sunSide = max(dot(nrm, normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + vec3(1e-5))), 0.0);
				vec3 cc = hitFace == 0 ? uCloudShade : mix(uCloudSide, uCloudLit, sunSide * 0.85);
				// Silver edge: the light goes through the cloud when looking toward the sun.
				cc += uSunColor * pow(cs, 6.0) * 0.55 * uSunVis * (1.0 - uGrey);
				cc += vec3(0.25, 0.32, 0.55) * pow(cm, 8.0) * 0.12 * uMoonVis * uNight;
				// Aerial perspective: the far cloud melts into the horizon sky.
				float far = smoothstep(uCloudFar * 0.25, uCloudFar, t);
				cc = mix(cc, col, far * 0.85);
				float alpha = uCloudOpacity * (1.0 - smoothstep(uCloudFar * 0.6, uCloudFar, t));
				col = mix(col, cc, alpha);
			}
		}
	}

	col *= uGain;

	// Perceptual dithering (triangular, ~1.5/255 in near-sRGB space): no banding in the gradients.
	vec3 g = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));
	float dn = hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.xy + 19.19) - 1.0;
	g += dn * (1.5 / 255.0);
	col = pow(max(g, vec3(0.0)), vec3(2.2));

	gl_FragColor = vec4(col, 1.0);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const setLin = (vec, rgb) => vec.set(srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2]))

// Right/up frame of a celestial body: "upright" square in the image (edges aligned on the vertical).
function discBasis(dir, right, up) {
	right.set(-dir.z, 0, dir.x)
	if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
	right.normalize()
	up.crossVectors(right, dir).normalize()
}

// Twilight smoothing during the timelapse (v4). Keys [cycles/s, window width in cycles], interpolated.
export const SKY_SMOOTH = [
	[0.1, 0.03],
	[0.35, 0.25],
	[0.8, 0.5],
	[1.3, 0.9],
	[1.8, 1.2],
]
function keyed(keys, x) {
	if (x <= keys[0][0]) return x <= 0 ? 0 : keys[0][1] * (x / keys[0][0])
	for (let i = 1; i < keys.length; i++) if (x <= keys[i][0]) return keys[i - 1][1] + ((keys[i][1] - keys[i - 1][1]) * (x - keys[i - 1][0])) / (keys[i][0] - keys[i - 1][0])
	return keys[keys.length - 1][1]
}
// Palette averaged over [phase - w/2, phase + w/2] (triangle weights, one sample every 0.02 cycle at most:
// the twilight band is only about 0.07 cycle wide, fewer samples made it flicker), for the twilight
// glow, its colour and that of the sun; zenith, horizon and mist stay those of the host (already smoothed by
// scene.js). The averaged glow is raised by (1 + keep x w) while the window stays under half a cycle (readable dawn),
// with no gain beyond (fast days: average of a whole day, constant). Without a window: the palette at elevation e.
export function smoothPalette(phase, e, grey, width, keep = 2.5) {
	const pal = skyPaletteAt(e, grey)
	if (!(width > 0.005)) return pal
	const n = Math.min(81, Math.max(9, 2 * Math.ceil(width / 0.04) + 1))
	const glow = [0, 0, 0]
	const sun = [0, 0, 0]
	let twilight = 0
	let total = 0
	for (let i = 0; i < n; i++) {
		const u = i / (n - 1) - 0.5
		const w = 1 - Math.abs(u) * 1.9
		const p = skyPaletteAt(elevationAt(phase + u * width), grey)
		for (let k = 0; k < 3; k++) {
			glow[k] += p.glow[k] * w
			sun[k] += p.sun[k] * w
		}
		twilight += p.twilight * w
		total += w
	}
	for (let k = 0; k < 3; k++) {
		glow[k] /= total
		sun[k] /= total
	}
	const gain = 1 + keep * Math.min(width, 0.5) * (1 - sstep(0.5, 1.0, width))
	return { ...pal, glow, sun, twilight: Math.min(1, (twilight / total) * gain) }
}

export function createSky({
	radius = 400,
	quality = 'high',
	path = SKY_PATH,
	cloudHeight = 64, // base of the clouds in scene space (40 gave huge clouds seen from the low camera)
	cloudThickness = 4,
	cloudCell = 12,
	cloudCover = 0.25, // 0.34: big slabs that took the upper third of the frame
	cloudSpeed = 0.6, // blocks per second of world clock, toward -x (about Minecraft)
	sunSize = 0.052, // half side, as a tangent of the angle (about 6 deg per side)
	moonSize = 0.044,
	starDensity = 0.012, // 0.04 made a star noise that disturbed the title
	meteors = true, // rare shooting stars (night, days that do not go by fast)
	// v4: shooting stars allowed while the ember exists (default false: the ember stays the only luminous event
	// of the absence; decision for Andy and Breval, `tune.sky` of scene.js).
	meteorsWithEmber = false,
	trails = true, // star trails during the timelapse
	cirrus = 0.55, // intensity of the pixelated cirrus (0 removes them; high quality only)
	// Twilight smoothing window [cycles/s, width in cycles], like TIMELINE.sky.smooth.amount of scene.js.
	// `smooth: false` turns the smoothing off; state.skySmooth (cycles) imposes it.
	smooth = SKY_SMOOTH,
	twilightKeep = 2.5, // the averaged glow is raised by (1 + twilightKeep x width): the dawn stays readable
	// v5: share of the sun's presence removed at the held forgetting (state.forgetting >= 0.75); 0 = as in v4.
	forgetSun = 0.6,
} = {}) {
	const high = quality !== 'low'
	const geometry = new THREE.SphereGeometry(radius, high ? 64 : 32, high ? 32 : 16)
	const u = {
		uZenith: { value: new THREE.Vector3() },
		uHorizon: { value: new THREE.Vector3() },
		uGround: { value: new THREE.Vector3() },
		uGlow: { value: new THREE.Vector3() },
		uSunColor: { value: new THREE.Vector3() },
		uSunTint: { value: new THREE.Vector3(1, 1, 1) },
		uTwilight: { value: 0 },
		uNight: { value: 0 },
		uGrey: { value: 0 },
		uGain: { value: 1 },
		uSunDir: { value: new THREE.Vector3(0, 1, 0) },
		uSunRight: { value: new THREE.Vector3(1, 0, 0) },
		uSunUp: { value: new THREE.Vector3(0, 0, 1) },
		uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
		uMoonRight: { value: new THREE.Vector3(1, 0, 0) },
		uMoonUp: { value: new THREE.Vector3(0, 0, 1) },
		uSunLow: { value: 0 },
		uSunSize: { value: sunSize },
		uMoonSize: { value: moonSize },
		uSunVis: { value: 1 },
		uMoonVis: { value: 0 },
		uMoonPhase: { value: 0 },
		uStarRot: { value: new THREE.Matrix3() },
		uStarPole: { value: new THREE.Vector3(0, 1, 0) },
		uFwd: { value: new THREE.Vector3(0, 0, -1) },
		uRightB: { value: new THREE.Vector3(1, 0, 0) },
		uTrail: { value: 0 },
		uStarSteps: { value: 1 },
		uStarStrobe: { value: 0 },
		uMeteorOn: { value: 0 },
		uCirrus: { value: high ? cirrus : 0 },
		uAurora: { value: 0 },
		uTime: { value: 0 },
		uStarDensity: { value: starDensity },
		uCamPos: { value: new THREE.Vector3() },
		uCloudOffset: { value: new THREE.Vector2() },
		uCloudBase: { value: cloudHeight },
		uCloudTop: { value: cloudHeight + cloudThickness },
		uCloudCell: { value: cloudCell },
		uCloudCover: { value: cloudCover },
		uCloudFar: { value: radius * 2.4 },
		uCloudOpacity: { value: 0.88 },
		uCloudLit: { value: new THREE.Vector3() },
		uCloudShade: { value: new THREE.Vector3() },
		uCloudSide: { value: new THREE.Vector3() },
	}
	const material = new THREE.ShaderMaterial({
		name: 'minemories-sky',
		uniforms: u,
		vertexShader: VERT,
		fragmentShader: FRAG.replace('__CLOUD_STEPS__', high ? '14' : '7').replace('__MILKY__', high ? '1' : '0'),
		side: THREE.BackSide,
		depthWrite: false,
		depthTest: false,
		fog: false,
	})
	const mesh = new THREE.Mesh(geometry, material)
	mesh.name = 'sky'
	mesh.renderOrder = -1000
	mesh.frustumCulled = false
	mesh.matrixAutoUpdate = false
	const object3d = new THREE.Group()
	object3d.name = 'sky-root'
	object3d.add(mesh)

	const sun = new THREE.Vector3()
	const moon = new THREE.Vector3()
	const pole = new THREE.Vector3()
	const rot4 = new THREE.Matrix4()
	const camPos = new THREE.Vector3()
	const tmpLin = new THREE.Vector3()
	const tmpSun = new THREE.Vector3()
	let lastT = Number.NaN
	let lastClock = 0
	let lastRate = 1
	let lastPhase = Number.NaN
	let lastPhaseT = Number.NaN
	let cycles = 0 // day/night cycles per second (estimate; state.cycleRate replaces it)

	function update(state = {}) {
		const phase = Number.isFinite(state.phase) ? state.phase : 0.5
		const clock = Number.isFinite(state.clock) ? state.clock : 0
		const L = state.lighting || {}

		// Celestial bodies: direction given by the integrator (e.g. frozen act III), otherwise the default course.
		if (state.sunDir) sun.copy(state.sunDir).normalize()
		else sunDirAt(phase, path, sun)
		if (state.moonDir) moon.copy(state.moonDir).normalize()
		else moonDirAt(phase, path, moon)

		const e = Number.isFinite(L.elevation) ? L.elevation : elevationAt(phase)
		const grey = state.grey ?? 0
		// Speed of the days (cycles/s): given by the host (state.cycleRate) or estimated from the phase.
		const tNow = Number.isFinite(state.t) ? state.t : clock
		if (Number.isFinite(state.cycleRate)) cycles = Math.abs(state.cycleRate)
		else if (Number.isFinite(lastPhaseT) && Math.abs(tNow - lastPhaseT) > 1e-4 && Math.abs(tNow - lastPhaseT) < 1) cycles = Math.abs((phase - lastPhase) / (tNow - lastPhaseT))
		lastPhase = phase
		lastPhaseT = tNow
		const width = Number.isFinite(state.skySmooth) ? Math.max(0, state.skySmooth) : smooth ? keyed(smooth, cycles) : 0
		const pal = smoothPalette(phase, e, grey, width, twilightKeep)
		const zenith = L.zenith ?? pal.zenith
		const horizon = L.horizon ?? L.sky ?? pal.horizon
		const fog = L.fog ?? pal.fog
		const night = state.night ?? sstep(0.12, -0.15, e)

		setLin(u.uZenith.value, zenith)
		setLin(u.uHorizon.value, horizon)
		setLin(u.uGround.value, fog).multiplyScalar(0.92)
		setLin(u.uGlow.value, pal.glow)
		setLin(u.uSunColor.value, L.sunColor ?? pal.sun)
		u.uTwilight.value = pal.twilight
		u.uNight.value = night
		u.uGrey.value = grey

		// v5: the sun fades with the forgetting (pure in state.forgetting; 0 at the freeze frames).
		const forgotten = Math.min(1, Math.max(0, (state.forgetting ?? 0) / 0.75))
		// Disc colour: warm white by day, glowing orange at the horizon.
		const low = 1 - sstep(0.0, 0.3, sun.y)
		u.uSunLow.value = low
		const sunGain = 1 - 0.8 * low
		u.uSunTint.value.set(sunGain, sunGain * (1 - 0.55 * low), sunGain * (1 - 0.88 * low))
		// The disc is HDR (core x 22): a lower coverage is not enough (measured: at 27.4 s a saturated white square
		// remained under the bloom); its luminance therefore drops with the cube, the halo and the reflections by half.
		const pale = 1 - forgetSun * forgotten
		u.uSunTint.value.multiplyScalar(pale * pale * pale)
		u.uSunVis.value = sstep(-0.12, 0.01, sun.y) * (1 - 0.5 * forgetSun * forgotten)
		u.uMoonVis.value = sstep(-0.08, 0.02, moon.y)
		u.uSunDir.value.copy(sun)
		u.uMoonDir.value.copy(moon)
		discBasis(sun, u.uSunRight.value, u.uSunUp.value)
		discBasis(moon, u.uMoonRight.value, u.uMoonUp.value)
		u.uMoonPhase.value = moonPhaseAt(state.day ?? dayIndexAt(phase))

		// Stars: turn around a pole in the aim axis, one turn per day.
		const B = skyPathBasis(path)
		pole.fromArray(B.pole).normalize()
		rot4.makeRotationAxis(pole, -2 * Math.PI * phase)
		u.uStarRot.value.setFromMatrix4(rot4)
		u.uTime.value = Number.isFinite(state.t) ? state.t : clock
		// Long exposure: beyond about 0.25 day/s the stars would stream by as noise; they are stretched along their arc
		// (up to 8 samples, 3 in low quality) and dimmed a little.
		const trail = trails ? sstep(0.25, 1.4, cycles) : 0
		u.uTrail.value = trail * 2 * Math.PI * 0.045 * Math.min(cycles, 1.6)
		u.uStarSteps.value = trail > 0.02 ? (high ? 8 : 3) : 1
		u.uStarStrobe.value = sstep(0.25, 0.9, cycles)
		// Shooting stars: only when the sky is calm (a day lasts more than one second of story).
		// v4: never while the ember exists (state.ember.strength > 0): a shooting star stole the eye at the moment
		// the fire dies (seen at 18.9 and 19.2 s); the ember must stay the only luminous event of the absence.
		const emberLive = !meteorsWithEmber && (state.ember?.strength ?? 0) > 0.002
		u.uMeteorOn.value = meteors && !state.frozen && !emberLive ? 1 - sstep(0.08, 0.2, cycles) : 0
		u.uAurora.value = Math.min(1, Math.max(0, state.aurora ?? 0))
		u.uCirrus.value = high ? cirrus * (1 - 0.8 * Math.min(1, state.grey ?? 0)) : 0
		{
			const Bs = skyPathBasis(path)
			u.uFwd.value.set(Bs.f[0], 0, Bs.f[2])
			u.uRightB.value.set(Bs.r[0], 0, Bs.r[2])
			u.uStarPole.value.copy(pole)
		}

		// Clouds: scroll with the world clock (pure function of clock), tinted by the light of the moment.
		const cloudClock = Number.isFinite(state.cloudClock) ? state.cloudClock : clock
		u.uCloudOffset.value.set(cloudClock * cloudSpeed, cloudClock * cloudSpeed * 0.18)
		// Timelapse: beyond about a quarter of a cell per frame, the clouds jump instead of sliding.
		// They are then faded (the position stays a pure function of clock; only the opacity depends on the rate).
		let rate = state.clockRate
		if (!Number.isFinite(rate)) {
			const t = state.t
			if (Number.isFinite(t) && Number.isFinite(lastT) && t !== lastT) rate = Math.abs((cloudClock - lastClock) / (t - lastT))
			else rate = lastRate
			lastT = t
			lastClock = cloudClock
		}
		lastRate = rate
		const cellsPerFrame = (Math.abs(rate) * cloudSpeed) / (60 * cloudCell)
		const strobe = sstep(0.2, 0.8, cellsPerFrame)
		const day = 1 - night
		const amb = [(zenith[0] + horizon[0]) / 2, (zenith[1] + horizon[1]) / 2, (zenith[2] + horizon[2]) / 2]
		const sunC = L.sunColor ?? pal.sun
		// v12: with a smoothing width (the timelapse), the sun that lights the clouds is averaged over the same window as the palette: the lit clouds (pink, x2 of the mean luminance of a phone
		// frame) no longer snap on and off when the sun crosses the horizon at 1 cycle/s (measured at 60 images/s: 0.98 -> 0.07 of uCloudLit in 0.05 s).
		let sunKRaw = sstep(-0.04, 0.2, sun.y)
		if (width > 0.005) {
			let acc = 0
			let tot = 0
			const n = Math.min(81, Math.max(9, 2 * Math.ceil(width / 0.04) + 1))
			for (let i = 0; i < n; i++) {
				const u = i / (n - 1) - 0.5
				const w = 1 - Math.abs(u) * 1.9
				sunDirAt(phase + u * width, path, tmpSun)
				acc += sstep(-0.04, 0.2, tmpSun.y) * w
				tot += w
			}
			sunKRaw = acc / tot
		}
		const sunK = sunKRaw * (1 - 0.6 * grey)
		const glowK = pal.twilight
		const lit = [0, 1, 2].map((i) => Math.min(1, amb[i] * 0.55 + sunC[i] * sunK * 0.7 + pal.glow[i] * glowK * 0.45 + 0.1 * day))
		const side = [0, 1, 2].map((i) => amb[i] * 0.7 + sunC[i] * sunK * 0.25 + pal.glow[i] * glowK * 0.2 + 0.06 * day)
		const shade = [0, 1, 2].map((i) => amb[i] * 0.62 + sunC[i] * sunK * 0.12 + pal.glow[i] * glowK * 0.18 + 0.04 * day)
		setLin(u.uCloudLit.value, lit)
		setLin(u.uCloudSide.value, side)
		setLin(u.uCloudShade.value, shade)
		// Night: dark clouds but readable against the stars.
		tmpLin.set(0.012, 0.016, 0.03).multiplyScalar(night)
		u.uCloudLit.value.add(tmpLin)
		u.uCloudSide.value.add(tmpLin)
		u.uCloudOpacity.value = (state.cloudOpacity ?? 0.88) * (1 - 0.08 * night) * (1 - 0.7 * strobe)
		// Grey dawn: the sky clouds over.
		u.uCloudCover.value = cloudCover + (0.62 - cloudCover) * grey

		// The dome follows the camera.
		if (state.camera) {
			// object3d is meant to live in scene space (no rotation, no scale).
			state.camera.getWorldPosition(camPos)
			object3d.updateWorldMatrix(true, false)
			object3d.worldToLocal(camPos)
			mesh.position.copy(camPos)
			u.uCamPos.value.copy(camPos)
		}
		mesh.updateMatrix()
	}

	function dispose() {
		object3d.removeFromParent()
		geometry.dispose()
		material.dispose()
	}

	update({})
	return { object3d, update, dispose, uniforms: u, material }
}
