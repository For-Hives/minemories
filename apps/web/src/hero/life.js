// Minemories, scene V1: the life of the world (life.js module, see MODULES.md).
// Animated campfire (flame strip of the game), smoke of the fire and of the chimney, embers,
// fireflies, needles falling from the spruces, golden dust in the low sun, distant birds.
// Pass v3 (atmosphere without text): undulating smoke column, spray of sparks (fireFlare), fire glow that
// breathes during the act III freeze, butterflies near the flowers, bats at dusk, snow, drizzle,
// low mist at the grey dawn, more needles in S2-S4, seasons (seasonAt) readable through the colour of the leaves.
// Pass v4 ("The kept evening", contract v4 of HOST-API.md): THE EMBER (state.ember), a square pixel sprite at constant
// screen size (sharp 3 x 3 cell core, additive halo, HDR centre for the bloom), suspended from the capture to the
// diorama, that brightens (state.ember.pulse) and releases a ring of pixels at the birth of the wave (state.wave);
// `features` announces 'ember' (the scene then turns its fallback ember off). The light of the fire becomes the glow of the ember
// when the fire is dead (same PointLight: constant number of lights). Smoke that fades out or back in when
// the fire dies or relights (no more grains vanishing at once). Timelapse: fireflies and dust turned off
// when the days go by (they blinked once per cycle). Forgetting (state.forgetting) applied to the particles
// from the edges of the image (the ember escapes it). Particle clock: state.particleClock if the host gives it
// (rewind), otherwise state.clock.
// Pass v5 ("You told him stay", brief v5 b2, d; contract v5 of HOST-API.md): a single luminous motif during
// the absence. `absenceOf(state)` (pure) is 1 from the end of the capture freeze to the return of the fire, 0 in act I and at both
// freeze frames: fireflies, golden dust, birds, bats, butterflies and needles are silent then (an orange needle as a
// 3-cell cross read as a second ember, fireflies as "the glow"). The light of the ember
// (dead fire) carries further and gets stronger by day (grey dawn); it follows state.ember.lightGain (x2 at the memory,
// 31.3 -> 32.0 s in v7 time) and its halo grows a little with it. Snow: flakes capped at a few CSS px (big
// white squares near the lens read as dead pixels).
//
// Rules kept:
// - scene space = world - capture origin; fixed positions go through toScene();
// - each particle i is a pure function of (i, clock): no accumulated state, scrubbing works
//   in both directions (the only cosmetic exception: the estimate of the clock speed,
//   which only tunes the opacity of the birds, the dust and the needles);
// - a single draw call per system (THREE.Points + ShaderMaterial), pixel squares, bold colours;
// - everything switches off according to state.fire, state.chimney and state.night.

import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const LIFE = {
	campfire: [91.5, -60, 105.5], // fallback: bottom of the campfire block (world), if the capture has no flames
	chimney: [97.5, -50, 97.5], // top of the v0-v1 chimney (world block 97 -51 97); option `chimneys` for several flues
	// Chimney smoke (option `chimneySmoke`, missing keys taken from here): base sRGB grey, opacity, rise speed
	// (blocks/s), life time (s), size at the start and at the end, factor on the wind drift.
	chimneySmoke: { tone: 0.5, alpha: 0.6, rise: [0.75, 1.1], life: [7, 10.5], size: [0.38, 1.25], drift: 1 },
	flame: { frames: 8, frameTime: 0.14, seq: [0, 1, 2, 3, 4, 3, 2, 1] }, // v12: frameTime 0.14 (was 0.1, the game's 2 ticks): one back-and-forth in 1.12 s, // campfire_fire.png.mcmeta: frametime 2 ticks; v7c: `seq` = order of the images (back and forth over 0 to 4), see flameFrame
	windDir: [0.8, 0, -0.6], // drift direction of the smoke and of the needles (toward the right of the frame)
	// Decay 1.3 (instead of 2): range closer to the block light of Minecraft; the dog sitting at
	// 4 blocks and the facade stay lit at night, without burning the player at 1.4 blocks.
	fireLight: { color: '#ff8a3d', intensity: 6, distance: 16, decay: 1.3, height: 0.75 },
	counts: {
		high: { smokeFire: 44, smokeChimney: 28, sparks: 28, pops: 7, flare: 22, fireflies: 40, leaves: 96, dust: 56, birdsA: 5, birdsB: 4, butterflies: 8, bats: 6, snow: 170, rain: 130, mist: 30 },
		low: { smokeFire: 22, smokeChimney: 14, sparks: 14, pops: 4, flare: 10, fireflies: 22, leaves: 40, dust: 20, birdsA: 3, birdsB: 2, butterflies: 4, bats: 3, snow: 70, rain: 55, mist: 14 },
	},
	// Colours in sRGB 0..1 (converted to linear); values > 1 are HDR for the bloom.
	colors: {
		sparkHot: [7.0, 3.4, 0.8],
		sparkCool: [2.6, 0.32, 0.05],
		ember: [5.0, 1.8, 0.35],
		firefly: [2.2, 3.4, 0.55],
		needle: [0.36, 0.55, 0.3],
		needleDry: [0.66, 0.44, 0.2],
		bird: [0.07, 0.06, 0.06],
		fireGlow: [1.0, 0.42, 0.12],
		leafGold: [0.86, 0.6, 0.16], // birch leaves in autumn
		snow: [0.92, 0.95, 1.0],
		rain: [0.62, 0.7, 0.82],
		bat: [0.03, 0.028, 0.035],
		wing: [[1.0, 0.55, 0.12], [0.96, 0.92, 0.82], [1.0, 0.86, 0.2], [0.55, 0.7, 1.0]], // orange, white, lemon, blue
	},
	// Names of the systems whose only role is decoration: the host hides them in low quality
	// (mods.life.decorative). Snow stays (it tells the time), so do smoke, embers and fireflies.
	decorative: ['dust', 'needles', 'birds', 'butterflies', 'bats', 'mist', 'rain'],
	// Density of the falling needles and leaves according to the stage (S0 -> S4): the forest comes undone with time.
	leafDensity: [0.5, 0.58, 0.72, 0.88, 1],
	// Calendar of the seasons (pure function of the story phase, in days since the start of act I).
	// The real phases of the film: switch S1 at 2, S2 at 4, S3 at 6, S4 at 8, grey dawn at 10.27 (see main.js, TIMELINE.swaps).
	// Winters: [start, end]; the snow rises and falls over `ramp` days; autumn precedes each winter by `lead` days.
	// Rain: passages [start, end] (a single one in S3), plus a drizzle that follows `grey` (grey dawn).
	seasons: {
		winters: [[2.5, 4.0], [5.4, 6.0], [7.3, 7.9]],
		ramp: 0.3,
		lead: 0.9,
		rain: [[6.3, 7.1]],
		drizzleGrey: 0.5,
	},
	// Centre of the bat flight, relative to the fire (scene space): above the gap in the spruces, in front of the reference camera.
	batCentre: [-20, 21, -33],
	// World box of the chalet (roof included): no snow or rain inside (they would go through the roof).
	shelter: { min: [88, -62, 88], max: [99.5, -49.4, 98] },
	// Ember (contract v4). Sizes as a fraction of the canvas WIDTH, with floors in CSS px (phone portrait):
	// halo >= 22 px, 3 x 3 cell core of cells >= 2.5 CSS px (cells rounded to the device pixel: sharp edges).
	// LINEAR colours (not sRGB): `hot` (central cell, HDR above the bloom threshold), `mid` (cross, saturated orange,
	// under the threshold: stays orange after ACES), `rim` (corners, dark red: readable outline on snow and grey).
	ember: {
		halo: 0.034,
		minHaloPx: 28,
		core: 0.0105,
		minCellPx: 3,
		hot: [4.5, 1.8, 0.25],
		mid: [1.25, 0.16, 0.006],
		rim: [0.32, 0.018, 0.002],
		haloColor: [1.3, 0.3, 0.03],
		haloGain: 1.15,
		haloSoft: 0.5, // standard deviation of the halo gaussian, as a fraction of its radius
		// Ring of pixels at the birth of the wave (from state.wave.progress): max radius as a fraction of the width
		// (floor in CSS px), visible over the first 22 % of the rewind.
		ring: { radius: 0.075, minPx: 34, until: 0.22, gain: 0.8 },
		// Glow carried when the fire is dead: the PointLight of the fire passes to the ember.
		// v5 (brief b2): range >= 3 blocks (the dog is about 2.3 blocks away horizontally, about 2.8 in 3D), amber colour (the
		// cream coat must turn warm cream, hue 50 to 80 deg, not orange), boost by day (`day`) and at the grey dawn
		// (`grey`): a constant point light is not seen under daylight, and burns at night. Final intensity:
		// intensity x (1 + day x day + grey x grey) x ember strength x "ember" share x state.ember.lightGain.
		// `flicker`: share of the ember flicker carried to the light (the lit ground must not blink).
		// Measured (../renders-v5/life/light1, differential mask, ?dogWarm=0): at 29.5 s, intensity 16 (trial b) only gains
		// 0.8 of C* on the coat (the dog turns its back to the ember; the forgetting of look.js greys the lit ground) and
		// whitens the ground: moderate setting, the warmth of the coat stays with look.js (dogKeepWhite) and the fallback of the scene.
		light: { intensity: 1.2, distance: 6.5, decay: 1.2, color: '#ffb468', day: 1.5, grey: 3, flicker: 0.4 },
		// v5: the halo follows state.ember.lightGain (>= 1): radius x (1 + haloGain x (g - 1)), brightness x (1 + glowGain x (g - 1)).
		gain: { halo: 0.15, glow: 0.3 },
	},
	// v5: systems that go quiet during the absence (absenceOf), so that the ember stays the only point of light.
	absenceQuiet: ['fireflies', 'dust', 'birds', 'bats', 'butterflies', 'needles'],
	// v7 (fix "orange object on the ground"): the needles switch off from 9.8 to 10.4 s and do not come back. A needle
	// lying near the lens takes the colour of the ember (373 px measured at the 10.6 s freeze, 0 without this system) and reads
	// as an orange shape on the ground. Pure function of state.t (scrubbing in both directions); 0 at both freezes, which stay
	// identical. `null` (or ?leafOff=0) gives v6.
	leafOff: [9.8, 10.4],
	// Snow: maximum screen size of a flake, in CSS px (v5).
	snowMaxCss: 4,
	// Forgetting of the particles: same settings as look.js (PARAMS.forget*, 22/10) so that the front coincides.
	forget: { gain: 1.8, world: 0.85, soft: 0.5, max: 0.94, round: 0, tint: [0.93, 1.0, 1.1] },
	birdHeight: 30, // above the ground of the fire
	birdRadius: 72,
	nearFade: [1.5, 4.5], // distance to the camera (blocks) where the near particles fade out
	nearFadeSoft: [4, 9], // same for the dust and the fireflies (otherwise big squares in front of the lens)
}

// World position [x, y, z] -> scene space.
export const toScene = (p, origin) => [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]]

// Integer hash -> [0, 1), stable (same family as hash01 of main.js).
export function hash01(...ints) {
	let h = 0x9e3779b1
	for (const v of ints) {
		h = Math.imul(h ^ (v | 0), 0x85ebca6b)
		h = (h ^ (h >>> 13)) | 0
		h = Math.imul(h, 0xc2b2ae35)
		h ^= h >>> 16
	}
	return (h >>> 0) / 4294967296
}

const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const lerp = (a, b, k) => a + (b - a) * k
function smoothstep(e0, e1, x) {
	const k = clamp((x - e0) / (e1 - e0), 0, 1)
	return k * k * (3 - 2 * k)
}
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
// sRGB -> linear, keeping the HDR values > 1 as they are (already "light").
const linRgb = (c) => c.map((v) => (v > 1 ? v : toLinear(Math.max(0, v))))

// Image of the flame strip at clock c (0..frames-1), in the order `LIFE.flame.seq`. v7c: only images 0 to 4, back and forth
// (0 1 2 3 4 3 2 1, 0.8 s). Measured (fixed render, fire tile, 1440 x 900, t = 8.6 / 12.5 / 14 / 16 s): the luminance of the tile is
// 0.28 to 0.39 with images 0 to 4 (max gap 0.06) and 0.18 to 0.30 with images 5 to 7; the loop 0 -> 7 -> 0 of v7b went from 0.35 to 0.21
// then CAME BACK at once from 7 to 0 (0.14 luminance, a step per 0.8 s loop, amplified by the bloom): one of the three flashes per second
// measured in the fire tile. The two freeze frames (same clock) stay identical to each other.
export function flameFrame(clock, frames = LIFE.flame.frames, frameTime = LIFE.flame.frameTime, seq = LIFE.flame.seq) {
	if (!seq?.length) return ((Math.floor(clock / frameTime) % frames) + frames) % frames
	return seq[((Math.floor(clock / frameTime) % seq.length) + seq.length) % seq.length] % frames
}

// v5: the absence, pure function of the shared state (0..1). 1 when the player has left and the ember keeps watch: the ember
// is born (state.ember.born) and (it is "discreet", or the forgetting is engaged, or the fire is not at full). Outside a freeze
// only for the discreet ember (at the freezes, ember at 1, fire at 1, forgetting at 0: 0, hence identical freezes).
// Ramp 11.5 -> 12.0 s (the ember is "discreet" and the night has fallen); held during the memory (forgetting 0.75) and the rewind (forgetting,
// fire out); falls when the fire relights (35.5 -> 36 s). state.absence (number) imposes it.
export function absenceOf(state = {}) {
	if (Number.isFinite(state.absence)) return clamp(state.absence, 0, 1)
	const E = state.ember
	if (!E || !E.born) return 0
	// The "discreet ember" term also waits for the night (night >= 0.63, i.e. 11.5 s; 1 at 12.0 s): act I (0 -> 11.5 s)
	// stays identical to v4 at the pixel, while the ember starts to dim from 10.95 s.
	const night = Number.isFinite(state.night) ? state.night : 0
	const discreet = state.frozen ? 0 : smoothstep(0.99, 0.72, Number.isFinite(E.strength) ? E.strength : 1) * smoothstep(0.63, 0.75, night)
	const forgot = smoothstep(0, 0.3, Number.isFinite(state.forgetting) ? state.forgetting : 0)
	const cold = smoothstep(0.98, 0.6, Number.isFinite(state.fire) ? Math.min(1, state.fire) : 1)
	return Math.max(discreet, forgot, cold)
}

// Flicker of the fire, around 1. v7c: smoothed and slowed (anti-flash rule, "< 3 flashes/s" measured frame by frame, HOST-API section 20): three sines
// from 0.7 to 1.5 Hz (v7b: 1.8 / 2.9 / 4.7 Hz + random walks at 14 Hz, +/- 20 %: the halo of the fire at night, above the bloom threshold, went
// 3 times per second from light to dark) and a slow value noise (2.5 Hz, interpolated: no more steps). Amplitude +/- 11.5 % at most.
// v12 (checkup v11b P1 n° 0: the campfire tile flashed 3 times a second at 1 440 px, 25 313 px2 against 21 800, 17.5 to 21.8 s): the 1.5 Hz sine (9.6 rad/s) is gone and the 1.2 Hz one is smaller;
// the flame strip changes image every 0.14 s (was 0.1 s: the back-and-forth of 8 images lasts 1.12 s instead of 0.8 s). Same rule in look.js (halo of the fire).
export const FIRE_FLICKER = { sines: [[0.05, 4.2, 0], [0.03, 7.3, 1.1]], noise: { amp: 0.03, rate: 2.5 } }
export function fireFlicker(clock) {
	const c = clock
	const u = c * FIRE_FLICKER.noise.rate
	const i = Math.floor(u)
	const k = smoothstep(0, 1, u - i)
	const n = (hash01(i, 77) - 0.5) * (1 - k) + (hash01(i + 1, 77) - 0.5) * k
	let f = 1 + FIRE_FLICKER.noise.amp * 2 * n
	for (const [a, w, p] of FIRE_FLICKER.sines) f += a * Math.sin(c * w + p)
	return f
}

// Deterministic cycle of a particle: period P, own offset -> { n (cycle number), age }.
function cycle(clock, period, offset) {
	const u = (clock + offset) / period
	const n = Math.floor(u)
	return { n, age: (u - n) * period }
}

// Seasons: pure function of the story phase (elapsed days, unbounded during act II).
// Returns { snow, autumn, rain, winter } between 0 and 1. `grey` (0..1) adds the drizzle of the grey dawn.
// The host can also pass its own values in the state (state.snow, state.autumn, state.rain).
export function seasonAt(phase, grey = 0, cal = LIFE.seasons) {
	const pulse = (a, b, ramp) => smoothstep(a - ramp, a, phase) * (1 - smoothstep(b, b + ramp, phase))
	let snow = 0
	let autumn = 0
	for (const [a, b] of cal.winters) {
		snow = Math.max(snow, pulse(a, b, cal.ramp))
		autumn = Math.max(autumn, smoothstep(a - cal.lead - cal.ramp, a - cal.ramp, phase) * (1 - smoothstep(a - cal.ramp, a, phase)))
	}
	let rain = cal.drizzleGrey * clamp(grey, 0, 1)
	for (const [a, b] of cal.rain) rain = Math.max(rain, pulse(a, b, 0.2))
	return { snow, autumn, rain, winter: snow }
}

// ---------------------------------------------------------------------------
// Points material: pixel squares, size in blocks, mist, HDR output
// ---------------------------------------------------------------------------

const VERTEX = /* glsl */ `
attribute vec4 aColor;
attribute float aSize;
attribute float aSeed;
uniform float uViewportH;
uniform float uPxRatio;
varying vec4 vColor;
varying float vSeed;
varying vec3 vPos;
#include <common>
#include <fog_pars_vertex>
void main() {
	vPos = (modelMatrix * vec4(position, 1.0)).xyz;
	vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
	gl_Position = projectionMatrix * mvPosition;
	float depth = max(-mvPosition.z, 0.05);
	float px = aSize * projectionMatrix[1][1] * 0.5 * uViewportH / depth;
	vColor = aColor;
	// Smaller than a pixel: keep 1.5 px and lower the opacity (no sparkle).
	vColor.a *= clamp(px / MIN_PX, 0.0, 1.0);
	vSeed = aSeed;
	#ifdef MAX_CSS
	gl_PointSize = clamp(px, MIN_PX, max(MIN_PX, MAX_CSS * uPxRatio));
	#else
	gl_PointSize = clamp(px, MIN_PX, MAX_PX);
	#endif
	if (aColor.a <= 0.0 || aSize <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
	#include <fog_vertex>
}
`

const FRAGMENT = /* glsl */ `
uniform float uCells;
uniform float uNoise;
uniform float uForget;
uniform vec2 uViewport;
uniform vec4 uFocus; // ember on screen (NDC x, y), aspect factor, 1 / distance of the farthest corner
uniform vec4 uShape; // gain, weight of the outskirts, softness, maximum
uniform vec3 uTint;
uniform vec4 uWave; // ember (scene) xyz, radius of the wave
uniform vec2 uWaveK; // softness of the lift, wave active
varying vec3 vPos;
varying vec4 vColor;
varying float vSeed;
#include <common>
#include <fog_pars_fragment>
float h21(vec2 p, float s) {
	return fract(sin(dot(p, vec2(12.9898, 78.233)) + s * 17.17) * 43758.5453);
}
#if SHAPE == 3
// 8x8 bird seen from afar, 3 images: wings up, glide, wings down.
bool birdPixel(float frame, vec2 c) {
	float dx = c.x < 4.0 ? 3.0 - c.x : c.x - 4.0;
	if (frame < 0.5) return abs(c.y - (5.0 - dx)) < 0.5;
	if (frame < 1.5) return (dx < 0.5 && (abs(c.y - 4.0) < 0.5 || abs(c.y - 3.0) < 0.5)) || (dx > 0.5 && abs(c.y - 3.0) < 0.5);
	return dx < 2.5 && abs(c.y - (3.0 + dx)) < 0.5;
}
#endif
#if SHAPE == 4
// 7x5 butterfly seen from the front: wings open (image 0) or almost closed (image 1), body at the centre.
bool butterflyPixel(float frame, vec2 c) {
	float dx = abs(c.x - 3.0);
	if (dx < 0.5) return c.y > 0.5 && c.y < 3.5;
	if (frame > 0.5) return dx < 1.5 && c.y > 0.5 && c.y < 4.5;
	if (c.y > 3.5) return dx > 1.5;
	if (c.y < 1.5) return dx < 2.5;
	return true;
}
#endif
#if SHAPE == 5
// 8x8 bat: pointed wings with a jagged lower edge, three images (up, glide, down).
bool batPixel(float frame, vec2 c) {
	float dx = c.x < 4.0 ? 3.0 - c.x : c.x - 4.0;
	if (dx < 0.5 && c.y > 2.5 && c.y < 5.5) return true;
	// gl_PointCoord has its origin at the top left: y grows downward.
	float edge = frame < 0.5 ? 4.0 - dx * 0.9 : (frame < 1.5 ? 4.0 : 4.0 + dx * 0.9);
	if (dx > 0.5 && abs(c.y - edge) < 0.6) return true;
	return dx > 0.5 && c.y > edge && c.y < edge + 1.6 && mod(dx, 2.0) < 1.0;
}
#endif
void main() {
	vec2 cell = floor(gl_PointCoord * uCells);
	float a = vColor.a;
	#if SHAPE == 1
		// Smoke: Minecraft-style solid square, opacity per pixel.
		a *= 0.62 + 0.38 * h21(cell + 7.0, vSeed);
	#elif SHAPE == 2
		// Needle: irregular outline.
		vec2 e = min(cell, vec2(uCells - 1.0) - cell);
		if (e.x + e.y < 0.5 && h21(cell, vSeed) < 0.6) discard;
	#elif SHAPE == 3
		if (!birdPixel(vSeed, cell)) discard;
	#elif SHAPE == 4
		if (!butterflyPixel(floor(vSeed), cell)) discard;
	#elif SHAPE == 5
		if (!batPixel(vSeed, cell)) discard;
	#elif SHAPE == 7
		// Mist: disc in big pixels (soft edge by steps), noise per pixel.
		vec2 cc = (cell + 0.5) / uCells - 0.5;
		a *= (1.0 - smoothstep(0.25, 1.0, length(cc) * 2.0)) * (0.6 + 0.4 * h21(cell + 3.0, vSeed));
	#elif SHAPE == 6
		// Rain streak: a narrow column at the centre, lighter at the bottom.
		if (abs(cell.x - (uCells - 1.0) * 0.5) > 0.51) discard;
		a *= 0.35 + 0.65 * (cell.y / max(uCells - 1.0, 1.0));
	#endif
	float shade = 1.0 + uNoise * (h21(cell, vSeed + 3.1) - 0.5) * 2.0;
	vec3 rgb = vColor.rgb * shade;
	// Forgetting (contract v4), same front as look.js (uMm4*): from the edges of the image and the outskirts of the zone toward
	// the ember; lifted behind the rewind wave.
	if (uForget > 0.001) {
		vec2 ndc = gl_FragCoord.xy / max(uViewport, vec2(1.0)) * 2.0 - 1.0;
		float r = length((ndc - uFocus.xy) * vec2(uFocus.z, 1.0)) * uFocus.w;
		float dw = distance(vPos, uWave.xyz);
		float e = max(smoothstep(0.12, 0.95, r), uShape.y * smoothstep(6.0, 26.0, dw));
		float f = uForget;
		if (uWaveK.y > 0.5) f *= smoothstep(uWave.w - uWaveK.x, uWave.w + uWaveK.x, dw);
		float k = clamp((f * uShape.x - (1.0 - e) * 0.9) / uShape.z, 0.0, 1.0) * uShape.w;
		float l = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
		rgb = mix(rgb, uTint * l, k);
	}
	gl_FragColor = vec4(rgb, a);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}
`

const SHAPES = { square: 0, smoke: 1, leaf: 2, bird: 3, butterfly: 4, bat: 5, rain: 6, mist: 7 }
const _size = new THREE.Vector2()

function createPoints(count, { name, shape = 'square', cells = 1, noise = 0, blending = THREE.NormalBlending, fog = true, renderOrder = 0, maxCss = 0 }) {
	const geometry = new THREE.BufferGeometry()
	const pos = new Float32Array(count * 3)
	const col = new Float32Array(count * 4)
	const size = new Float32Array(count)
	const seed = new Float32Array(count)
	const attrs = {
		position: new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage),
		aColor: new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage),
		aSize: new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage),
		aSeed: new THREE.BufferAttribute(seed, 1).setUsage(THREE.DynamicDrawUsage),
	}
	for (const [key, attr] of Object.entries(attrs)) geometry.setAttribute(key, attr)
	geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4)
	const material = new THREE.ShaderMaterial({
		name,
		uniforms: THREE.UniformsUtils.merge([
			THREE.UniformsLib.fog,
			{ uViewportH: { value: 800 }, uPxRatio: { value: 1 }, uViewport: { value: new THREE.Vector2(1280, 800) }, uCells: { value: cells }, uNoise: { value: noise }, uForget: { value: 0 }, uFocus: { value: new THREE.Vector4(0, -0.1, 1, 0.5) }, uShape: { value: new THREE.Vector4(1.8, 0.85, 0.5, 0.94) }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uWave: { value: new THREE.Vector4() }, uWaveK: { value: new THREE.Vector2(0.4, 0) } },
		]),
		vertexShader: VERTEX,
		fragmentShader: FRAGMENT,
		defines: { SHAPE: SHAPES[shape], MIN_PX: '1.5', MAX_PX: '96.0', ...(maxCss > 0 ? { MAX_CSS: maxCss.toFixed(2) } : {}) },
		transparent: true,
		depthWrite: false,
		blending,
		fog,
	})
	const points = new THREE.Points(geometry, material)
	points.name = name
	points.frustumCulled = false
	points.renderOrder = renderOrder
	// Real height of the render target (canvas or EffectComposer).
	points.onBeforeRender = (renderer) => {
		const target = renderer.getRenderTarget()
		if (target) _size.set(target.width, target.height)
		else renderer.getDrawingBufferSize(_size)
		material.uniforms.uViewportH.value = _size.y
		material.uniforms.uViewport.value.copy(_size)
		material.uniforms.uPxRatio.value = _size.x / Math.max(1, renderer.domElement?.clientWidth || _size.x)
	}
	const sys = {
		count,
		points,
		set(i, x, y, z, r, g, b, a, s, sd = 0) {
			pos[i * 3] = x
			pos[i * 3 + 1] = y
			pos[i * 3 + 2] = z
			col[i * 4] = r
			col[i * 4 + 1] = g
			col[i * 4 + 2] = b
			col[i * 4 + 3] = a
			size[i] = s
			seed[i] = sd
		},
		hide(i) {
			col[i * 4 + 3] = 0
			size[i] = 0
		},
		hideAll() {
			col.fill(0)
			size.fill(0)
		},
		commit() {
			for (const attr of Object.values(attrs)) attr.needsUpdate = true
		},
		dispose() {
			points.removeFromParent()
			geometry.dispose()
			material.dispose()
		},
	}
	sys.hideAll()
	return sys
}

// ---------------------------------------------------------------------------
// The ember (contract v4): a camera-facing quad, at constant SCREEN size, drawn in a single call.
// 3 x 3 pixel core (HDR centre, orange cross, dark red corners, opaque: readable in full day and on snow),
// additive halo, ring of pixels at the birth of the wave. Premultiplied blending (One, OneMinusSrcAlpha): the core
// covers the background, the halo adds to it. The centre is snapped to the pixel grid (sharp edges at any size).
// ---------------------------------------------------------------------------

const EMBER_VERTEX = /* glsl */ `
uniform vec2 uViewport;
uniform float uHalf;
uniform float uCoreOdd;
varying vec2 vPx;
void main() {
	vec4 c = projectionMatrix * modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
	if (uHalf <= 0.0 || c.w <= 0.0) {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		vPx = vec2(0.0);
		return;
	}
	// Centre snapped to the pixel grid: at the centre of a pixel if the core is an odd number of pixels.
	vec2 px = (c.xy / c.w * 0.5 + 0.5) * uViewport;
	px = floor(px) + 0.5 * uCoreOdd;
	vPx = position.xy * uHalf;
	vec2 ndc = (px + vPx) / uViewport * 2.0 - 1.0;
	gl_Position = vec4(ndc * c.w, c.z, c.w);
}
`

const EMBER_FRAGMENT = /* glsl */ `
uniform float uCell;
uniform float uCoreA;
uniform float uHaloR;
uniform float uHaloK;
uniform float uRingR;
uniform float uRingA;
uniform vec3 uHot;
uniform vec3 uMid;
uniform vec3 uRim;
uniform vec3 uHaloColor;
uniform float uHaloSoft;
varying vec2 vPx;
#include <common>
void main() {
	vec3 col = vec3(0.0);
	float a = 0.0;
	// Core: 3 x 3 grid of cells of uCell px, centred.
	vec2 g = floor(vPx / uCell + 1.5);
	if (uCoreA > 0.0 && g.x >= 0.0 && g.y >= 0.0 && g.x < 3.0 && g.y < 3.0) {
		vec2 dg = abs(g - 1.0);
		float m = dg.x + dg.y;
		vec3 base = m < 0.5 ? uHot : (m < 1.5 ? uMid : uRim);
		a = uCoreA * (m < 1.5 ? 1.0 : 0.92);
		col = base * a;
	}
	// Halo: soft gaussian, additive.
	float r = length(vPx);
	float s = uHaloR * uHaloSoft;
	// (1 - a): the halo does not wash out the core (it stays orange instead of turning cream).
	col += (1.0 - a) * uHaloColor * uHaloK * exp(-(r * r) / max(s * s, 1e-4));
	// Wave ring: a circle one cell thick, in big pixels.
	if (uRingA > 0.001) {
		vec2 q = (floor(vPx / uCell) + 0.5) * uCell;
		float d = abs(length(q) - uRingR);
		col += uMid * uRingA * (1.0 - smoothstep(0.5 * uCell, 1.0 * uCell, d));
	}
	gl_FragColor = vec4(col, a);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}
`

const _vp = new THREE.Vector2()

function createEmberSprite(settings) {
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3))
	geometry.setIndex([0, 1, 2, 0, 2, 3])
	geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4)
	const v3 = (c) => new THREE.Vector3(...c)
	const uniforms = {
		uViewport: { value: new THREE.Vector2(1280, 800) },
		uHalf: { value: 0 },
		uCoreOdd: { value: 1 },
		uCell: { value: 3 },
		uCoreA: { value: 0 },
		uHaloR: { value: 12 },
		uHaloK: { value: 0 },
		uRingR: { value: 0 },
		uRingA: { value: 0 },
		uHot: { value: v3(settings.hot) },
		uMid: { value: v3(settings.mid) },
		uRim: { value: v3(settings.rim) },
		uHaloColor: { value: v3(settings.haloColor) },
		uHaloSoft: { value: settings.haloSoft ?? 0.5 },
	}
	const material = new THREE.ShaderMaterial({
		name: 'ember',
		uniforms,
		vertexShader: EMBER_VERTEX,
		fragmentShader: EMBER_FRAGMENT,
		transparent: true,
		depthWrite: false,
		depthTest: true,
		fog: false,
		blending: THREE.CustomBlending,
		blendSrc: THREE.OneFactor,
		blendDst: THREE.OneMinusSrcAlphaFactor,
		blendSrcAlpha: THREE.OneFactor,
		blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
	})
	// Contract v4: the forgetting does not touch the ember.
	material.userData.mmKeepColor = true
	const mesh = new THREE.Mesh(geometry, material)
	mesh.name = 'ember'
	mesh.frustumCulled = false
	mesh.renderOrder = 21
	// Screen size at the real resolution of the target (canvas or EffectComposer), floors in CSS px.
	const look = { haloFrac: 0, coreFrac: 0, ringFrac: 0, ringK: 0, on: false }
	mesh.onBeforeRender = (renderer) => {
		const target = renderer.getRenderTarget()
		if (target) _vp.set(target.width, target.height)
		else renderer.getDrawingBufferSize(_vp)
		uniforms.uViewport.value.copy(_vp)
		if (!look.on) {
			uniforms.uHalf.value = 0
			return
		}
		const css = Math.max(1, renderer.domElement?.clientWidth || _vp.x)
		const k = _vp.x / css // px of the target per CSS px
		const cssW = _vp.x / k
		const cell = Math.max(2, Math.round(Math.max((look.coreFrac * cssW) / 3, settings.minCellPx) * k))
		const halo = Math.max(look.haloFrac * cssW, settings.minHaloPx) * k
		const ring = Math.max(look.ringFrac * cssW, look.ringFrac > 0 ? settings.ring.minPx * look.ringK : 0) * k
		uniforms.uCell.value = cell
		uniforms.uCoreOdd.value = (3 * cell) % 2
		uniforms.uHaloR.value = halo * 0.5
		uniforms.uRingR.value = ring
		uniforms.uHalf.value = Math.ceil(Math.max(halo * 0.75, ring + 2 * cell, 2 * cell) + 1)
	}
	return { mesh, material, uniforms, look, dispose: () => (mesh.removeFromParent(), geometry.dispose(), material.dispose()) }
}

// ---------------------------------------------------------------------------
// Reading of a capture: fire, needles (centres of the spruce triangles), ground of the fireflies
// ---------------------------------------------------------------------------

const PLANTS =
	/(short_grass|tall_grass|fern|poppy|dandelion|cornflower|oxeye_daisy|azure_bluet|allium|lily_of_the_valley|tulip|orchid|sweet_berry_bush|sapling|vine|cobweb|moss_carpet|_carpet|bush|flower|lilac|peony|rose|sunflower|dead_bush|mushroom|leaf_litter|petals|glow_lichen)/
const FLOWERS = /(poppy|dandelion|cornflower|oxeye_daisy|azure_bluet|allium|lily_of_the_valley|tulip|orchid|rose_bush|lilac|peony|sunflower|flower)/
const NATURAL =
	/^(grass_block|dirt|podzol|coarse_dirt|rooted_dirt|moss_block|stone|gravel|dirt_path|mud|sand|red_sand|snow|snow_block|andesite|granite|diorite|tuff|deepslate|clay|mycelium|cut)$/

function classify(materialName = '') {
	const block = materialName.split(' / ')[0].replace(/^[a-z0-9_]+:/, '')
	if (block.includes('leaves')) return 'leaf'
	if (PLANTS.test(block)) return 'plant'
	if (NATURAL.test(block)) return 'ground'
	return 'built'
}

const cellKey = (x, y, z) => `${x},${y},${z}`
const colKey = (x, z) => `${x},${z}`

// Analyses a stage root (scene coordinates). Result cached per root.
export function analyzeStage(root) {
	root.updateMatrixWorld(true)
	const leaves = new Set()
	const solid = new Set()
	const groundTop = new Map()
	const builtTop = new Map()
	const flames = []
	const flowers = new Map()
	const flameBox = new THREE.Box3()
	const a = new THREE.Vector3()
	const b = new THREE.Vector3()
	const c = new THREE.Vector3()
	const n = new THREE.Vector3()
	const e = new THREE.Vector3()
	const vn = new THREE.Vector3()
	root.traverse((o) => {
		if (!o.isMesh || Array.isArray(o.material) || !o.geometry?.attributes?.position) return
		const name = o.material.name ?? ''
		if (name.includes('campfire_fire')) {
			flames.push(o)
			flameBox.expandByObject(o)
		}
		const kind = classify(name)
		const [blockName, textureName = blockName] = name.split(' / ')
		const isFlower = kind === 'plant' && FLOWERS.test(textureName) && !/pot|box/.test(textureName)
		const g = o.geometry
		const pos = g.attributes.position
		const nor = g.attributes.normal
		const index = g.index
		const m = o.matrixWorld
		const linear = new THREE.Matrix3().setFromMatrix4(m)
		const count = index ? index.count : pos.count
		for (let i = 0; i + 2 < count; i += 3) {
			const ia = index ? index.getX(i) : i
			const ib = index ? index.getX(i + 1) : i + 1
			const ic = index ? index.getX(i + 2) : i + 2
			a.fromBufferAttribute(pos, ia).applyMatrix4(m)
			b.fromBufferAttribute(pos, ib).applyMatrix4(m)
			c.fromBufferAttribute(pos, ic).applyMatrix4(m)
			n.subVectors(b, a).cross(e.subVectors(c, a))
			const len = n.length()
			if (len < 1e-12) continue
			n.divideScalar(len)
			if (nor && vn.fromBufferAttribute(nor, ia).applyMatrix3(linear).dot(n) < 0) n.negate()
			// Centre of the triangle, pushed slightly inside the block (the full faces lie on the cell planes).
			const x = Math.floor((a.x + b.x + c.x) / 3 - n.x * 0.01)
			const y = Math.floor((a.y + b.y + c.y) / 3 - n.y * 0.01)
			const z = Math.floor((a.z + b.z + c.z) / 3 - n.z * 0.01)
			if (isFlower && !flowers.has(cellKey(x, y, z))) flowers.set(cellKey(x, y, z), { x: x + 0.5, y: y + 0.55, z: z + 0.5 })
			if (kind === 'leaf') leaves.add(cellKey(x, y, z))
			else if (kind !== 'plant') solid.add(cellKey(x, y, z))
			const ck = colKey(x, z)
			if (kind === 'ground') groundTop.set(ck, Math.max(groundTop.get(ck) ?? -Infinity, y))
			else if (kind === 'built') builtTop.set(ck, Math.max(builtTop.get(ck) ?? -Infinity, y))
		}
	})

	// Fire: centre in x/z, bottom of the block in y.
	const fire = flames.length
		? {
				x: (flameBox.min.x + flameBox.max.x) / 2,
				y: Math.floor(flameBox.min.y + 0.01),
				z: (flameBox.min.z + flameBox.max.z) / 2,
			}
		: null

	// Needles: underside of the canopy (leaf cell with no leaves below), with the ground where they land.
	const leafEmitters = []
	for (const key of leaves) {
		const [x, y, z] = key.split(',').map(Number)
		if (leaves.has(cellKey(x, y - 1, z))) continue
		let land = null
		for (let yy = y - 1; yy >= y - 48; yy--) {
			if (solid.has(cellKey(x, yy, z)) || leaves.has(cellKey(x, yy, z))) {
				land = yy + 1
				break
			}
		}
		if (land === null || y - land < 1.5) continue
		leafEmitters.push({ x: x + 0.5, y: y - 0.02, z: z + 0.5, land })
	}
	// Stable order (the Sets follow the order of the triangles, already stable); ceiling for big captures.
	const leafList = leafEmitters.length > 800 ? leafEmitters.filter((_, i) => hash01(i, 91) < 800 / leafEmitters.length) : leafEmitters

	// Ground of the fireflies: natural ground columns with nothing built above (clearing, undergrowth).
	const groundColumns = []
	for (const [ck, top] of groundTop) {
		const built = builtTop.get(ck)
		if (built !== undefined && built >= top) continue
		const [x, z] = ck.split(',').map(Number)
		groundColumns.push({ x: x + 0.5, y: top + 1, z: z + 0.5 })
	}

	return { fire, flames, leafEmitters: leafList, groundColumns, flowers: [...flowers.values()] }
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene
 * @param {number[]} o.origin origin of the capture (world), e.g. [99, -49, 99]
 * @param {THREE.Object3D[]} [o.stageRoots] roots S0..S4 (analysed at once)
 * @param {string} [o.flameStripUrl] URL of assets/mc/blocks/campfire_fire.png
 * @param {'high'|'low'} [o.quality]
 * @param {boolean} [o.fireLight] adds the PointLight of the fire (true by default)
 * @param {number[]} [o.windDir] world direction of the drift
 * @param {number[][]} [o.chimneys] tops of the chimney flues (world); default [LIFE.chimney]. The chimney smoke
 *   particles are spread among them (same total).
 * @param {{ tone?: number, alpha?: number, rise?: number[], life?: number[], size?: number[], drift?: number }} [o.chimneySmoke]
 *   chimney smoke: tint (sRGB grey 0..1), opacity, rise [min, max] (blocks/s), life [min, max] (s), size
 *   [start, end] (blocks), factor on the wind drift; defaults in LIFE.chimneySmoke (v1 settings)
 * @param {boolean} [o.chimneyFollowsFire] the chimney smoke goes out with `state.fire` (true by default: the house falls asleep
 *   when the fire dies, even if the host keeps `chimney` at 1)
 * @param {boolean} [o.bats] bats at dusk (true by default; never during a freeze)
 * @param {boolean} [o.autoSeason] if true, snow, autumn and rain are deduced from `state.phase` (seasonAt) when
 *   the host does not provide `state.snow`, `state.autumn`, `state.rain`; false by default (nothing falls without an instruction)
 * @param {number[]} [o.batCentre] centre of the bat flight, relative to the fire (scene space)
 * @param {{ min: number[], max: number[] }} [o.shelter] world box of the chalet: snow and rain do not fall inside it
 * @param {{ bright?: number, size?: number }} [o.fireflyLook] fireflies: factor on their HDR colour (1 by default)
 *   and size in blocks (0.1 by default)
 * @param {boolean} [o.ember] draws the ember of contract v4 and announces `features` 'ember' (true by default; false: the
 *   scene keeps its fallback ember). Hot switch: `life.setEmber(bool)`.
 * @param {boolean} [o.emberLight] when the fire is dead, its PointLight becomes the glow of the ember (true by default)
 * @param {boolean} [o.emberRing] ring of pixels leaving the ember at the birth of the wave (FALSE by default: at
 *   960 px it read as a target; decision for Andy and Breval)
 * @param {boolean} [o.forgetParticles] the forgetting (state.forgetting) also desaturates the particles (true by default)
 * @param {object} [o.emberLook] settings of the ember, merged into LIFE.ember (sizes, colours, ring, light)
 * @param {object} [o.forgetLook] front of the forgetting of the particles, merged into LIFE.forget (keep equal to look.js)
 */
export function createLife({
	scene,
	origin,
	stageRoots = [],
	flameStripUrl,
	quality = 'high',
	fireLight = true,
	windDir = LIFE.windDir,
	chimneys = [LIFE.chimney],
	chimneySmoke = {},
	fireflyLook = {},
	autoSeason = false,
	chimneyFollowsFire = true,
	bats: batsOn = true,
	batCentre = LIFE.batCentre,
	shelter = LIFE.shelter,
	ember: emberOn = true,
	emberLight = true,
	emberRing = false,
	forgetParticles = true,
	emberLook = {},
	forgetLook = {},
	quietAbsence = true, // v5: LIFE.absenceQuiet go quiet during the absence (absenceOf)
	leafOff = LIFE.leafOff, // v7: [start, end] (s) of the final extinction of the needles; null = v6
	snowMaxCss = LIFE.snowMaxCss, // v5: max screen size of a flake (CSS px); 0 = no cap (v4)
} = {}) {
	const chimneyLook = { ...LIFE.chimneySmoke, ...chimneySmoke }
	const flyLook = { bright: 1, size: 0.1, ...fireflyLook }
	const counts = LIFE.counts[quality] ?? LIFE.counts.high
	const group = new THREE.Group()
	group.name = 'life'
	scene?.add(group)

	const wind = new THREE.Vector3().fromArray(windDir).setY(0).normalize()
	const C = Object.fromEntries(Object.entries(LIFE.colors).map(([k, v]) => [k, Array.isArray(v[0]) ? v.map(linRgb) : linRgb(v)]))

	// --- analysis of the stages -----------------------------------------------------
	const analyses = new WeakMap()
	const analysisOf = (root) => {
		if (!root) return null
		if (!analyses.has(root)) {
			try {
				analyses.set(root, analyzeStage(root))
			} catch (error) {
				console.warn('[life] capture analysis failed', error)
				analyses.set(root, { fire: null, flames: [], leafEmitters: [], groundColumns: [], flowers: [] })
			}
		}
		return analyses.get(root)
	}
	for (const root of stageRoots) analysisOf(root)

	const fallbackFire = toScene(LIFE.campfire, origin)
	let fireAt = null
	for (const root of stageRoots) fireAt ??= analysisOf(root)?.fire
	const fire = new THREE.Vector3(...(fireAt ? [fireAt.x, fireAt.y, fireAt.z] : fallbackFire))
	const flues = (chimneys?.length ? chimneys : [LIFE.chimney]).map((p) => new THREE.Vector3(...toScene(p, origin)))

	// --- animated flames ----------------------------------------------------------
	let strip = null
	const patched = new Map() // material -> { map, emissiveMap, visible }
	if (flameStripUrl) {
		new THREE.TextureLoader().load(
			flameStripUrl,
			(texture) => {
				// glTF convention: V = 0 at the top of the image, so no flip.
				texture.flipY = false
				texture.colorSpace = THREE.SRGBColorSpace
				texture.magFilter = THREE.NearestFilter
				texture.minFilter = THREE.NearestFilter
				texture.generateMipmaps = false
				texture.wrapS = THREE.ClampToEdgeWrapping
				texture.wrapT = THREE.ClampToEdgeWrapping
				texture.repeat.set(1, 1 / LIFE.flame.frames)
				texture.needsUpdate = true
				strip = texture
				for (const root of stageRoots) patchFlames(root)
				if (current) patchFlames(current)
			},
			undefined,
			(error) => console.warn('[life] flame strip not found, flames frozen', error),
		)
	}
	function patchFlames(root) {
		const info = analysisOf(root)
		if (!info) return
		for (const mesh of info.flames) {
			const m = mesh.material
			if (!patched.has(m)) patched.set(m, { map: m.map, emissiveMap: m.emissiveMap, visible: m.visible })
			if (!strip) continue
			m.map = strip
			if (m.emissiveMap) m.emissiveMap = strip
			m.needsUpdate = true
		}
	}

	// --- light of the fire (always present: the number of lights stays constant) ---
	const L = LIFE.fireLight
	const light = fireLight ? new THREE.PointLight(L.color, 0, L.distance, L.decay) : null
	if (light) {
		light.name = 'campfire'
		light.castShadow = false
		light.position.set(fire.x, fire.y + L.height, fire.z)
		group.add(light)
	}

	// --- systems -------------------------------------------------------------------
	const smoke = createPoints(counts.smokeFire + counts.smokeChimney, { name: 'smoke', shape: 'smoke', cells: 8, noise: 0.12, renderOrder: 2 })
	const embers = createPoints(counts.sparks + counts.pops + counts.flare, { name: 'embers', cells: 2, noise: 0.15, renderOrder: 3 })
	const fireflies = createPoints(counts.fireflies, { name: 'fireflies', cells: 1, blending: THREE.AdditiveBlending, renderOrder: 3 })
	const leaves = createPoints(counts.leaves, { name: 'needles', shape: 'leaf', cells: 3, noise: 0.25, renderOrder: 1 })
	const dust = createPoints(counts.dust, { name: 'dust', cells: 1, blending: THREE.AdditiveBlending, renderOrder: 3 })
	const birds = createPoints(counts.birdsA + counts.birdsB, { name: 'birds', shape: 'bird', cells: 8, fog: false, renderOrder: 0 })
	const butterflies = createPoints(counts.butterflies, { name: 'butterflies', shape: 'butterfly', cells: 7, noise: 0.1, renderOrder: 2 })
	const bats = createPoints(counts.bats, { name: 'bats', shape: 'bat', cells: 8, fog: false, renderOrder: 0 })
	const snowfall = createPoints(counts.snow, { name: 'snow', cells: 1, renderOrder: 3, maxCss: snowMaxCss })
	const rain = createPoints(counts.rain, { name: 'rain', shape: 'rain', cells: 9, renderOrder: 3 })
	const mist = createPoints(counts.mist, { name: 'mist', shape: 'mist', cells: 10, noise: 0.04, renderOrder: 1 })
	const systems = [smoke, embers, fireflies, leaves, dust, birds, butterflies, bats, snowfall, rain, mist]
	for (const s of systems) group.add(s.points)
	// Ember (contract v4): outside `points` (the scene sets the visibility of each `points` system). Always
	// in the scene, even when out (degenerate quad): its shader is compiled from the first frame, not at the capture.
	const EM = { ...LIFE.ember, ...emberLook, ring: { ...LIFE.ember.ring, ...(emberLook.ring ?? {}) }, light: { ...LIFE.ember.light, ...(emberLook.light ?? {}) } }
	const ember = createEmberSprite(EM)
	group.add(ember.mesh)
	// v5: 'emberLight' = the light of the ember (dead fire) reads state.ember.lightGain. It hardly warms the
	// coat (measured: +0.2 to +0.5 of C* at dawn): the scene keeps its warm fallback (TIMELINE.dogWarm.gain).
	const features = new Set([...(emberOn ? ['ember'] : []), ...(emberOn && emberLight && fireLight ? ['emberLight'] : [])])
	// Live settings (A/B comparisons without reloading: window.__mm.mods.life.params). Read every frame.
	const params = { quietAbsence, leafOff, emberLight, light: EM.light, gain: { ...LIFE.ember.gain, ...(emberLook.gain ?? {}) } }
	const emberLightColor = new THREE.Color()
	const fireLightColor = new THREE.Color(LIFE.fireLight.color)
	const emberPos = new THREE.Vector3()
	const batMid = new THREE.Vector3(fire.x + batCentre[0], fire.y + batCentre[1], fire.z + batCentre[2])
	const shelterBox = new THREE.Box3(new THREE.Vector3(...toScene(shelter.min, origin)), new THREE.Vector3(...toScene(shelter.max, origin)))

	// --- current stage ------------------------------------------------------------------
	let current = null
	let leafEmitters = []
	let anchors = []
	let flowerSpots = []
	function setStage(root) {
		current = root ?? null
		const info = analysisOf(current)
		if (current) patchFlames(current)
		// Needles: trees close to the clearing first (otherwise the whole canopy).
		const near = (info?.leafEmitters ?? []).filter((p) => Math.hypot(p.x - fire.x, p.z - fire.z) < 20)
		leafEmitters = near.length >= 12 ? near : (info?.leafEmitters ?? [])
		// Fireflies: ground columns within 24 blocks of the fire, at a reasonable height.
		anchors = (info?.groundColumns ?? []).filter(
			(p) => Math.hypot(p.x - fire.x, p.z - fire.z) < 17 && Math.abs(p.y - fire.y) < 9 && Math.hypot(p.x - fire.x, p.z - fire.z) > 1.2,
		)
		// Flowers: those of the clearing (butterflies); with no flowers in the capture, no butterflies.
		const flowers = info?.flowers ?? []
		const nearFlowers = flowers.filter((p) => Math.hypot(p.x - fire.x, p.z - fire.z) < 20)
		flowerSpots = nearFlowers.length >= 3 ? nearFlowers : flowers
		if (anchors.length < 8) {
			anchors = Array.from({ length: 24 }, (_, i) => {
				const r = 3 + 12 * hash01(i, 5)
				const th = 2 * Math.PI * hash01(i, 6)
				return { x: fire.x + r * Math.cos(th), y: fire.y + 0.5, z: fire.z + r * Math.sin(th) }
			})
		}
	}
	setStage(stageRoots[0] ?? null)

	// --- clock speed (cosmetic estimate) ---------------------------------------
	let prevT = null
	let prevClock = null
	let rate = 1
	let prevPhase = null
	let cyc = 0 // day/night cycles per second of story (cosmetic estimate; state.cycleRate replaces it)

	// Light colours read in state.lighting (keys of the contract, otherwise those of v0).
	const amb = [0, 0, 0]
	const sunLin = [1, 1, 1]
	const horizonLin = [0.5, 0.6, 0.7]
	const sunDir = new THREE.Vector3(0, 1, 0)
	const camPos = new THREE.Vector3()
	const tmp = new THREE.Vector3()

	function readLight(state) {
		const Lt = state.lighting ?? {}
		const hemi = linRgb(Lt.hemiSky ?? Lt.sky ?? [0.6, 0.66, 0.75])
		const sun = linRgb(Lt.sunColor ?? Lt.lightColor ?? [1, 0.95, 0.85])
		const hor = linRgb(Lt.horizon ?? Lt.fog ?? Lt.sky ?? [0.6, 0.66, 0.75])
		if (state.sunDir?.isVector3) sunDir.copy(state.sunDir)
		else if (Array.isArray(Lt.dir)) sunDir.fromArray(Lt.dir)
		const night = clamp(state.night ?? Lt.night ?? 0, 0, 1)
		const day = clamp(state.daylight ?? 1 - night, 0, 1)
		const sunUp = smoothstep(-0.02, 0.15, sunDir.y)
		for (let k = 0; k < 3; k++) {
			amb[k] = hemi[k] * (0.3 + 0.55 * day) + sun[k] * 0.45 * day * sunUp + 0.012
			sunLin[k] = sun[k]
			horizonLin[k] = hor[k]
		}
		return { night, day }
	}

	// --- smoke (fire + chimney) -------------------------------------------------------------
	// The column is a wavering thread: each grain keeps the lateral offset the smoke had at its start
	// (sine of the emission instant), so the column snakes upward, with denser puffs running along
	// it. Everything stays a pure function of (i, clock).
	const windPerp = new THREE.Vector3(-wind.z, 0, wind.x)
	function updateSmoke(ctx) {
		const emitters = [
			{ start: 0, count: counts.smokeFire, at: fire, lift: 0.95, amount: ctx.fire, life: [6.5, 9.5], rise: [1.0, 1.45], size: [0.26, 0.7], alpha: 0.4, glow: 1, snake: 0.3, snakeRate: 0.9, phase: 0 },
		]
		// Chimney: the count is spread among the flues in fixed slices (particle i -> stable flue).
		// Two neighbouring flues: each column is a bit thinner (they overlap on screen), but keeps
		// its opacity (at 0.8 x 0.6, the smoke got lost in the golden sky of act I).
		const share = flues.length > 1 ? 0.85 : 1
		flues.forEach((at, j) => {
			const from = Math.round((j * counts.smokeChimney) / flues.length)
			const to = Math.round(((j + 1) * counts.smokeChimney) / flues.length)
			emitters.push({
				start: counts.smokeFire + from,
				count: to - from,
				at,
				lift: 0.15,
				amount: ctx.chimney,
				life: chimneyLook.life,
				rise: chimneyLook.rise,
				size: [chimneyLook.size[0] * share, chimneyLook.size[1] * share],
				alpha: chimneyLook.alpha,
				tone: chimneyLook.tone,
				drift: chimneyLook.drift,
				glow: 0,
				snake: 0.5,
				snakeRate: 0.62 + 0.11 * j,
				phase: 1.7 * j,
			})
		})
		for (const em of emitters) {
			for (let k = 0; k < em.count; k++) {
				const i = em.start + k
				const life = lerp(em.life[0], em.life[1], hash01(i, 1))
				const { n, age } = cycle(ctx.clock, life, (k / em.count) * life + hash01(i, 2) * 0.4)
				// When the fire dies or relights, the grains fade out or back in (soft threshold) instead of
				// disappearing at once. Full fire (amount = 1): all visible, as before.
				const pick = hash01(i, n, 3)
				const keep = smoothstep(pick - 0.15, pick, em.amount * 1.05)
				if (em.amount < 0.004 || keep <= 0) {
					smoke.hide(i)
					continue
				}
				const s1 = hash01(i, n, 4)
				const s2 = hash01(i, n, 5)
				const s3 = hash01(i, n, 6)
				const k01 = age / life
				// A dying smoke (low amount) rises more slowly: it drags above the flue.
				const vy = lerp(em.rise[0], em.rise[1], s1) * (0.55 + 0.45 * Math.min(1, em.amount * 1.4))
				const y = em.at.y + em.lift + vy * age * (1 - 0.032 * age)
				const sway = 0.22 * Math.sqrt(age)
				// Gust: the drift due to the wind breathes slowly, seen at the moment of emission.
				const born = ctx.clock - age
				const gust = 1 + 0.35 * Math.sin(born * 0.21 + em.phase)
				const drift = (em.drift ?? 1) * (0.05 + ctx.wind * (0.22 + 0.18 * s3) * gust) * age ** 1.55
				const snake = em.snake * Math.sin(born * em.snakeRate + em.phase) * smoothstep(0, 2.5, age) * (0.35 + 0.65 * Math.min(1, k01 * 2.2))
				const x = em.at.x + (s2 - 0.5) * 0.45 + sway * Math.sin(age * 0.8 + s3 * 6.28) + wind.x * drift + windPerp.x * snake
				const z = em.at.z + (s3 - 0.5) * 0.45 + sway * Math.cos(age * 0.7 + s1 * 6.28) + wind.z * drift + windPerp.z * snake
				const size = lerp(em.size[0], em.size[1], Math.sqrt(k01)) * (0.85 + 0.3 * s2)
				// Puffs: denser packets (+25 %) run up the column (same emission sine, other cadence).
				const puff = 0.78 + 0.22 * Math.sin(born * 1.9 + em.phase * 2.1)
				const alpha = keep * em.alpha * puff * smoothstep(0, 0.35, age) * (1 - smoothstep(0.45, 1, k01)) * smoothstep(0, 0.25, em.amount)
				// Minecraft mid grey, lit by the sky; orange glow of the fire only over 1.5 blocks above
				// the flames (otherwise the whole column turned salmon at night).
				const grey = toLinear((em.glow ? 0.42 : (em.tone ?? 0.5)) + 0.15 * s1)
				const above = y - em.at.y - em.lift
				const glow = em.glow * em.amount * Math.exp(-age * 2.2) * (0.3 + 0.8 * ctx.night) * (1 - smoothstep(0.6, 1.5, above))
				smoke.set(
					i,
					x,
					y,
					z,
					grey * amb[0] * 1.25 + glow * C.fireGlow[0],
					grey * amb[1] * 1.25 + glow * C.fireGlow[1],
					grey * amb[2] * 1.25 + glow * C.fireGlow[2],
					alpha,
					size,
					s3 * 10,
				)
			}
		}
	}

	// --- embers: rising sparks + embers that jump and fall + spray (fireFlare) -----------
	function updateEmbers(ctx) {
		const amount = ctx.fire
		const flare = ctx.flare
		for (let i = 0; i < counts.sparks; i++) {
			const life = lerp(1.0, 2.2, hash01(i, 11))
			const { n, age } = cycle(ctx.clock, life, hash01(i, 12) * life)
			if (amount < 0.004 || hash01(i, n, 13) > amount * 0.95) {
				embers.hide(i)
				continue
			}
			const s1 = hash01(i, n, 14)
			const s2 = hash01(i, n, 15)
			const s3 = hash01(i, n, 16)
			const k01 = age / life
			const y = fire.y + 0.35 + 0.3 * s1 + (1.3 + 1.3 * s2) * (1 + 0.5 * flare) * age - 0.22 * age * age
			const wob = 0.14 * Math.sin(age * 7 + s3 * 6.28)
			const drift = ctx.wind * 0.35 * age * age
			const x = fire.x + (s1 - 0.5) * 0.55 + wob + wind.x * drift
			const z = fire.z + (s3 - 0.5) * 0.55 + 0.14 * Math.cos(age * 6 + s2 * 6.28) + wind.z * drift
			const heat = (1 - k01) ** 2
			const twinkle = hash01(i, n, Math.floor(age * 12) + 100) > 0.22 ? 1 : 0.3
			const alpha = twinkle * (1 - smoothstep(0.7, 1, k01)) * smoothstep(0, 0.3, amount)
			embers.set(
				i,
				x,
				y,
				z,
				lerp(C.sparkCool[0], C.sparkHot[0], heat),
				lerp(C.sparkCool[1], C.sparkHot[1], heat),
				lerp(C.sparkCool[2], C.sparkHot[2], heat),
				alpha,
				0.07 * (1 - 0.45 * k01) * (1 + 0.35 * flare),
				s2,
			)
		}
		for (let k = 0; k < counts.pops; k++) {
			const i = counts.sparks + k
			const period = lerp(2.6, 6, hash01(i, 21))
			const { n, age } = cycle(ctx.clock, period, hash01(i, 22) * period)
			if (amount < 0.004 || hash01(i, n, 23) > amount * 0.9) {
				embers.hide(i)
				continue
			}
			const th = 2 * Math.PI * hash01(i, n, 24)
			const vh = lerp(0.5, 1.3, hash01(i, n, 25))
			const vy = lerp(2.6, 3.8, hash01(i, n, 26))
			const y0 = fire.y + 0.55
			const ground = fire.y + 0.04
			const g = 9.8
			const tLand = (vy + Math.sqrt(vy * vy + 2 * g * (y0 - ground))) / g
			const tf = Math.min(age, tLand)
			const lying = Math.max(0, age - tLand)
			if (lying > 1.2) {
				embers.hide(i)
				continue
			}
			const x = fire.x + Math.cos(th) * (0.25 + vh * tf)
			const z = fire.z + Math.sin(th) * (0.25 + vh * tf)
			const y = Math.max(ground, y0 + vy * tf - 0.5 * g * tf * tf)
			const cool = smoothstep(0, 1.2, lying)
			embers.set(
				i,
				x,
				y,
				z,
				lerp(C.ember[0], C.sparkCool[0] * 0.5, cool),
				lerp(C.ember[1], C.sparkCool[1] * 0.4, cool),
				lerp(C.ember[2], C.sparkCool[2] * 0.4, cool),
				(1 - cool * 0.8) * smoothstep(0, 0.3, amount),
				0.1,
				hash01(i, n, 27),
			)
		}
		// Spray: when the player feeds the fire, bright sparks burst out fast and high (fireFlare 0..1).
		for (let k = 0; k < counts.flare; k++) {
			const i = counts.sparks + counts.pops + k
			const life = lerp(0.8, 1.7, hash01(i, 111))
			const { n, age } = cycle(ctx.clock, life, hash01(i, 112) * life)
			if (flare < 0.01 || amount < 0.004 || hash01(i, n, 113) > flare) {
				embers.hide(i)
				continue
			}
			const th = 2 * Math.PI * hash01(i, n, 114)
			const vh = lerp(0.3, 1.1, hash01(i, n, 115))
			const vy = lerp(2.4, 4.6, hash01(i, n, 116))
			const k01 = age / life
			const x = fire.x + Math.cos(th) * vh * age + wind.x * ctx.wind * 0.35 * age * age
			const z = fire.z + Math.sin(th) * vh * age + wind.z * ctx.wind * 0.35 * age * age
			const y = fire.y + 0.5 + vy * age - 2.2 * age * age
			const heat = (1 - k01) ** 1.5
			embers.set(
				i,
				x,
				y,
				z,
				lerp(C.sparkCool[0], C.sparkHot[0], heat),
				lerp(C.sparkCool[1], C.sparkHot[1], heat),
				lerp(C.sparkCool[2], C.sparkHot[2], heat),
				(1 - smoothstep(0.6, 1, k01)) * smoothstep(0, 0.08, age),
				0.09 * (1 - 0.5 * k01),
				hash01(i, n, 117),
			)
		}
	}

	// --- fireflies ------------------------------------------------------------------------------
	function updateFireflies(ctx) {
		// No fireflies in winter, fewer in autumn; none at the grey dawn.
		// Off when the days go by (lapseK): they lit up every night, one blink per cycle.
		const k = smoothstep(0.35, 0.85, ctx.night) * (1 - ctx.grey) * (1 - ctx.snow) * (1 - 0.6 * ctx.autumn) * (1 - ctx.lapseK) * ctx.calm * ctx.hush('fireflies')
		for (let i = 0; i < counts.fireflies; i++) {
			if (k < 0.004 || !anchors.length) {
				fireflies.hide(i)
				continue
			}
			const period = lerp(14, 22, hash01(i, 31))
			const { n, age } = cycle(ctx.clock, period, hash01(i, 32) * period)
			const an = anchors[Math.floor(hash01(i, n, 33) * anchors.length)]
			const s = [34, 35, 36, 37, 38, 39].map((salt) => hash01(i, n, salt))
			const c = ctx.clock
			const h = 0.35 + 1.9 * s[0]
			const x = an.x + (s[1] - 0.5) * 0.8 + 1.1 * Math.sin(c * 0.23 * (1 + s[2]) + s[3] * 6.28) + 0.3 * Math.sin(c * 0.9 + s[4] * 6.28)
			const z = an.z + (s[4] - 0.5) * 0.8 + 1.1 * Math.cos(c * 0.19 * (1 + s[3]) + s[5] * 6.28) + 0.3 * Math.cos(c * 1.1 + s[1] * 6.28)
			const y = an.y + h + 0.3 * Math.sin(c * 0.6 + s[2] * 6.28) + 0.08 * Math.sin(c * 2.3 + s[5] * 6.28)
			const fade = smoothstep(0, 1.5, age) * (1 - smoothstep(period - 1.5, period, age))
			const blinkPeriod = 2 + 3 * hash01(i, 40)
			const glow = smoothstep(0.15, 0.9, Math.sin(2 * Math.PI * (c / blinkPeriod + hash01(i, 41))))
			const bright = (0.25 + 0.75 * glow) * flyLook.bright
			fireflies.set(i, x, y, z, C.firefly[0] * bright, C.firefly[1] * bright, C.firefly[2] * bright, k * fade * (0.12 + 0.88 * glow) * ctx.nearSoft(x, y, z), flyLook.size, 0)
		}
	}

	// --- spruce needles and leaves ---------------------------------------------------------
	// More grains as the world ages (LIFE.leafDensity, per stage), more golden in autumn,
	// almost nothing under the snow.
	function updateLeaves(ctx) {
		const k = ctx.calm * (1 - 0.8 * ctx.snow) * ctx.hush('needles') * ctx.leafK
		const density = LIFE.leafDensity[clamp(Math.round(ctx.stage), 0, LIFE.leafDensity.length - 1)]
		const dryShare = 0.55 + 0.4 * ctx.autumn
		for (let i = 0; i < counts.leaves; i++) {
			if (k < 0.004 || !leafEmitters.length || hash01(i, 62) > density) {
				leaves.hide(i)
				continue
			}
			const period = lerp(8, 14, hash01(i, 51))
			const { n, age } = cycle(ctx.clock, period, hash01(i, 52) * period)
			if (hash01(i, n, 53) > 0.35 + 0.65 * ctx.wind) {
				leaves.hide(i)
				continue
			}
			const em = leafEmitters[Math.floor(hash01(i, n, 54) * leafEmitters.length)]
			const v = lerp(0.45, 0.85, hash01(i, n, 55))
			const tFall = (em.y - em.land) / v
			const fell = Math.min(age, tFall)
			const lie = Math.max(0, age - tFall)
			const ph = hash01(i, n, 56) * 6.28
			const sway = 0.32 * Math.min(1, fell)
			const drift = (0.08 + 0.5 * ctx.wind) * fell
			const x = em.x + (hash01(i, n, 57) - 0.5) * 0.9 + sway * Math.sin(fell * 2.2 + ph) + wind.x * drift
			const z = em.z + (hash01(i, n, 58) - 0.5) * 0.9 + sway * Math.cos(fell * 2.2 + ph) + wind.z * drift
			const y = age < tFall ? em.y - v * age : em.land + 0.03
			const alpha = k * smoothstep(0, 0.3, age) * (1 - smoothstep(1.2, 3.0, lie)) * (1 - smoothstep(period - 0.4, period, age))
			const sel = hash01(i, n, 59)
			const base = sel < dryShare * 0.35 * (0.4 + ctx.autumn * 1.4) ? C.leafGold : sel < dryShare ? C.needleDry : C.needle
			leaves.set(i, x, y, z, base[0] * amb[0] * 2.2, base[1] * amb[1] * 2.2, base[2] * amb[2] * 2.2, alpha * ctx.nearLeaf(x, y, z), 0.15, hash01(i, n, 60) * 10)
		}
	}

	// --- golden dust, pollen ----------------------------------------------------------------
	function updateDust(ctx) {
		const sy = sunDir.y
		const lowSun = smoothstep(0.0, 0.06, sy) * (0.25 + 0.75 * (1 - smoothstep(0.25, 0.5, sy)))
		const k = ctx.day * lowSun * (1 - ctx.grey) * ctx.calm * (1 - 0.85 * ctx.snow) * (1 - ctx.lapseK) * ctx.hush('dust')
		const cx = fire.x + 3
		const cy = fire.y + 2.6
		const cz = fire.z - 4
		const hx = 12
		const hy = 3.2
		const hz = 12
		for (let i = 0; i < counts.dust; i++) {
			if (k < 0.004) {
				dust.hide(i)
				continue
			}
			const s = [61, 62, 63, 64, 65, 66].map((salt) => hash01(i, salt))
			const c = ctx.clock
			const fx = (((s[0] + c * 0.004 * (s[3] - 0.3)) % 1) + 1) % 1
			const fy = (((s[1] + c * 0.006 * (s[4] - 0.4)) % 1) + 1) % 1
			const fz = (((s[2] + c * 0.004 * (s[5] - 0.6)) % 1) + 1) % 1
			const x = cx + (fx - 0.5) * 2 * hx + 0.15 * Math.sin(c * 0.7 + s[3] * 6.28)
			const y = cy + (fy - 0.5) * 2 * hy + 0.12 * Math.sin(c * 0.9 + s[4] * 6.28)
			const z = cz + (fz - 0.5) * 2 * hz + 0.15 * Math.cos(c * 0.6 + s[5] * 6.28)
			const edge = Math.sqrt(Math.sin(Math.PI * fx) * Math.sin(Math.PI * fy) * Math.sin(Math.PI * fz))
			// Forward scattering: shines when looking toward the sun.
			const mu = ctx.hasCamera ? tmp.set(x - camPos.x, y - camPos.y, z - camPos.z).normalize().dot(sunDir) : 0.5
			const scatter = 0.8 + 2.4 * Math.max(0, mu) ** 6
			const twinkle = 0.55 + 0.45 * Math.sin(c * (1.5 + s[0] * 2) + s[1] * 6.28)
			// Discreet: a few fine grains in the light, not confetti.
			const e = 0.6 * scatter
			dust.set(i, x, y, z, sunLin[0] * e, sunLin[1] * e * 0.85, sunLin[2] * e * 0.55, k * edge * twinkle * ctx.nearSoft(x, y, z), 0.03 + 0.02 * s[4], 0)
		}
	}

	// --- distant birds ------------------------------------------------------------------------
	function updateBirds(ctx) {
		const k = smoothstep(0.35, 0.75, ctx.day) * (1 - ctx.night) * ctx.calm * (1 - 0.6 * ctx.grey) * (1 - ctx.lapseK) * (1 - 0.75 * ctx.snow) * ctx.hush('birds')
		const c = ctx.clock
		const col = [0, 1, 2].map((j) => lerp(C.bird[j], horizonLin[j], 0.15))
		const flap = (j) => {
			const cyc = (((c + j * 0.37) / 3.1) % 1 + 1) % 1
			if (cyc > 0.45) return 1
			return [0, 1, 2, 1][Math.floor(c * 9 + j * 1.7) & 3]
		}
		// Flight A: circles far behind the clearing.
		const R = LIFE.birdRadius + 12 * Math.sin(c * 0.05)
		const th = (c * 2 * Math.PI) / 95 + 2.2
		const tx = -Math.sin(th)
		const tz = Math.cos(th)
		for (let j = 0; j < counts.birdsA; j++) {
			if (k < 0.004) {
				birds.hide(j)
				continue
			}
			const row = Math.ceil(j / 2)
			const side = j === 0 ? 0 : j % 2 ? 1 : -1
			const x = fire.x + R * Math.cos(th) - tx * row * 2.6 + Math.cos(th) * side * row * 2.0
			const z = fire.z + R * Math.sin(th) - tz * row * 2.6 + Math.sin(th) * side * row * 2.0
			const y = fire.y + LIFE.birdHeight + 1.2 * Math.sin(c * 0.5 + j)
			birds.set(j, x, y, z, col[0], col[1], col[2], k, 2.5, flap(j))
		}
		// Flight B: crosses the sky from time to time.
		const u = ((c / 64 + 0.3) % 1 + 1) % 1
		const dir = tmp.set(0.78, 0, -0.63)
		for (let j = 0; j < counts.birdsB; j++) {
			const i = counts.birdsA + j
			if (k < 0.004) {
				birds.hide(i)
				continue
			}
			const along = (u - 0.5) * 260 - j * 3.2
			const x = fire.x - 45 + dir.x * along + (j % 2 ? 1.8 : -1.8) * j * 0.6
			const z = fire.z - 40 + dir.z * along + j * 1.2
			const y = fire.y + LIFE.birdHeight - 4 + 1.0 * Math.sin(c * 0.6 + j * 2)
			const fadeEnds = Math.sin(Math.PI * u) ** 0.5
			birds.set(i, x, y, z, col[0], col[1], col[2], k * fadeEnds, 2.4, flap(j + 5))
		}
	}

	// An inactive system returns the attribute array only once (then 'idle': no needless upload).
	const dormant = (sys, k) => {
		if (k >= 0.004) {
			sys.dormant = false
			return false
		}
		if (sys.dormant) return true
		sys.hideAll()
		sys.dormant = true
		return false
	}

	// --- day butterflies, near the flowers ---------------------------------------------------------
	function updateButterflies(ctx) {
		const sunUp = smoothstep(0.1, 0.34, sunDir.y)
		const k = flowerSpots.length ? ctx.day * sunUp * (1 - ctx.grey) * (1 - ctx.snow) * (1 - 0.5 * ctx.autumn) * (1 - ctx.lapseK) * ctx.calm * ctx.hush('butterflies') : 0
		if (dormant(butterflies, k)) return 'idle'
		if (k < 0.004) return undefined
		for (let i = 0; i < counts.butterflies; i++) {
			const period = lerp(26, 44, hash01(i, 71))
			const { n, age } = cycle(ctx.clock, period, hash01(i, 72) * period)
			const fl = flowerSpots[Math.floor(hash01(i, n, 73) * flowerSpots.length)]
			const c = ctx.clock
			const w = c * (0.5 + 0.35 * hash01(i, 74)) + hash01(i, n, 75) * 6.28
			// Slow figure eight around the flower, with a small vertical beat at the pace of the wings.
			const x = fl.x + 1.0 * Math.sin(w) + 0.45 * Math.sin(w * 2.3 + 1.0)
			const z = fl.z + 0.8 * Math.sin(w * 0.5 + 2.0) * Math.cos(w * 0.5) + 0.4 * Math.cos(w * 1.7)
			const y = fl.y + 0.35 + 0.3 * Math.sin(w * 1.3) + 0.5 * hash01(i, n, 76) + 0.05 * Math.sin(c * 14 + i)
			const fade = smoothstep(0, 1.5, age) * (1 - smoothstep(period - 1.5, period, age))
			const frame = Math.floor(c * 8 + i * 3) & 1
			const wing = C.wing[i % C.wing.length]
			// Lit by the ambient light, with a floor of aperture to stay readable against the light.
			const lit = (j) => Math.min(1.1, amb[j] * 1.9 + 0.06) * wing[j]
			butterflies.set(i, x, y, z, lit(0), lit(1), lit(2), k * fade * ctx.nearSoft(x, y, z), 0.42, frame + 0.9 * hash01(i, 77))
		}
		return undefined
	}

	// --- bats at dusk --------------------------------------------------------------------
	const batF = new THREE.Vector3(batCentre[0], 0, batCentre[2]).normalize()
	const batR = new THREE.Vector3(-batF.z, 0, batF.x)
	function updateBats(ctx) {
		// Narrow window around sunset: they come out when the glow of the horizon falls.
		const dusk = smoothstep(0.1, 0.0, sunDir.y) * smoothstep(-0.32, -0.1, sunDir.y)
		// Never during a freeze (menu, diorama): a bat frozen in mid-flight would read as a defect.
		const k = batsOn && !ctx.frozen ? dusk * (1 - ctx.grey) * (1 - ctx.snow) * (1 - ctx.lapseK) * ctx.calm * ctx.hush('bats') : 0
		if (dormant(bats, k)) return 'idle'
		if (k < 0.004) return undefined
		const c = ctx.clock
		const col = [0, 1, 2].map((j) => lerp(C.bat[j], horizonLin[j], 0.18))
		for (let j = 0; j < counts.bats; j++) {
			const a = 0.5 + 0.45 * hash01(j, 81)
			const p1 = hash01(j, 82) * 6.28
			const p2 = hash01(j, 83) * 6.28
			// Angular path: two slow sines and a quick jerk (bats turn sharply).
			const lat = 13 * Math.sin(c * 0.42 * a + p1) + 3.2 * Math.sin(c * 1.9 * a + p2)
			const dep = 6 * Math.sin(c * 0.31 * a + p2 + 1)
			const up = 5.5 * Math.sin(c * 0.53 * a + p1 * 2) + 1.6 * Math.sin(c * 2.3 + p2)
			const x = batMid.x + batR.x * lat + batF.x * dep
			const z = batMid.z + batR.z * lat + batF.z * dep
			const y = batMid.y + up
			const frame = [0, 1, 2, 1][Math.floor(c * 11 + j * 1.3) & 3]
			// They enter and leave the frame a little at a time: window offset according to the animal.
			const stagger = smoothstep(0.0, 0.5, k * 1.4 - hash01(j, 84) * 0.6)
			bats.set(j, x, y, z, col[0], col[1], col[2], stagger, 1.5, frame)
		}
		return undefined
	}

	// --- fall zone (snow, rain): a volume in front of the camera, otherwise around the fire ------------------
	const camFwd = new THREE.Vector3()
	const camRight = new THREE.Vector3()
	function fallVolume(ctx, s, dMin, dMax, out) {
		// s = [u, v, w] in [0, 1)^3: depth, side, height.
		const depth = lerp(dMin, dMax, s[0])
		if (!ctx.hasCamera) {
			return out.set(fire.x + (s[1] - 0.5) * 2 * 16, fire.y, fire.z + (s[0] - 0.5) * 2 * 16)
		}
		const half = depth * 0.62
		return out.set(camPos.x + camFwd.x * depth + camRight.x * (s[1] - 0.5) * 2 * half, 0, camPos.z + camFwd.z * depth + camRight.z * (s[1] - 0.5) * 2 * half)
	}
	const fallPos = new THREE.Vector3()
	const flat = new THREE.Vector3()

	// --- snow ---------------------------------------------------------------------------------------
	function updateSnow(ctx) {
		const k = ctx.snow
		if (dormant(snowfall, k)) return 'idle'
		if (k < 0.004) return undefined
		const top = 9.5
		// Lit by the sky (never darker than the moon) and pinked by the fire when close.
		const floorLight = [0.1, 0.13, 0.2]
		for (let i = 0; i < counts.snow; i++) {
			const v = lerp(0.7, 1.25, hash01(i, 91))
			const period = top / v
			const { n, age } = cycle(ctx.clock, period, hash01(i, 92) * period)
			if (hash01(i, n, 93) > k) {
				snowfall.hide(i)
				continue
			}
			const s = [hash01(i, n, 94), hash01(i, n, 95), hash01(i, n, 96)]
			fallVolume(ctx, s, 4.5, 24, fallPos)
			const swayPh = hash01(i, n, 97) * 6.28
			const x = fallPos.x + 0.35 * Math.sin(age * 1.3 + swayPh) + wind.x * ctx.wind * 0.5 * age
			const z = fallPos.z + 0.35 * Math.cos(age * 1.1 + swayPh) + wind.z * ctx.wind * 0.5 * age
			const y = fire.y + 0.3 + top - v * age
			if (y < fire.y + 0.05) {
				snowfall.hide(i)
				continue
			}
			if (shelterBox.containsPoint(flat.set(x, y, z))) {
				snowfall.hide(i)
				continue
			}
			const fade = smoothstep(0, 0.8, age) * (1 - smoothstep(period - 0.6, period, age))
			const r = (j) => Math.min(1.15, Math.max(amb[j] * 2.6, floorLight[j] * ctx.night)) * C.snow[j]
			// Varied sizes (0.05 to 0.15 block, mostly small): flakes all the same read as dead pixels.
			snowfall.set(i, x, y, z, r(0), r(1), r(2), 0.9 * fade * ctx.nearSoft(x, y, z), lerp(0.05, 0.15, hash01(i, 98) ** 2), 0)
		}
		return undefined
	}

	// --- fine rain --------------------------------------------------------------------------------------
	function updateRain(ctx) {
		const k = ctx.rain
		if (dormant(rain, k)) return 'idle'
		if (k < 0.004) return undefined
		const top = 11
		for (let i = 0; i < counts.rain; i++) {
			const v = lerp(8.5, 11, hash01(i, 121))
			const period = top / v
			const { n, age } = cycle(ctx.clock, period, hash01(i, 122) * period)
			if (hash01(i, n, 123) > k) {
				rain.hide(i)
				continue
			}
			const s = [hash01(i, n, 124), hash01(i, n, 125), hash01(i, n, 126)]
			fallVolume(ctx, s, 6, 18, fallPos)
			const x = fallPos.x + wind.x * 0.6 * age
			const z = fallPos.z + wind.z * 0.6 * age
			const y = fire.y + 0.1 + top - v * age
			if (shelterBox.containsPoint(flat.set(x, y, z))) {
				rain.hide(i)
				continue
			}
			const r = (j) => Math.min(1, amb[j] * 3 + 0.04) * C.rain[j]
			rain.set(i, x, y, z, r(0), r(1), r(2), 0.42 * smoothstep(0, 0.2, age) * ctx.nearSoft(x, y, z), 0.6, 0)
		}
		return undefined
	}

	// --- low mist of the grey dawn -------------------------------------------------------------------
	function updateMist(ctx) {
		const k = ctx.grey * (1 - ctx.snow)
		if (dormant(mist, k)) return 'idle'
		if (k < 0.004) return undefined
		const dFire = ctx.hasCamera ? Math.hypot(fire.x - camPos.x, fire.z - camPos.z) : 0
		for (let i = 0; i < counts.mist; i++) {
			const period = lerp(40, 70, hash01(i, 131))
			const { n, age } = cycle(ctx.clock, period, hash01(i, 132) * period)
			const r = lerp(3, 20, Math.sqrt(hash01(i, n, 133)))
			const th = 2 * Math.PI * hash01(i, n, 134)
			const c = ctx.clock
			const x = fire.x + r * Math.cos(th) + 1.6 * Math.sin(c * 0.07 + i) + wind.x * 0.12 * age
			const z = fire.z + r * Math.sin(th) + 1.6 * Math.cos(c * 0.06 + i * 1.7) + wind.z * 0.12 * age
			const y = fire.y + 0.45 + 0.8 * hash01(i, n, 135) + 0.15 * Math.sin(c * 0.2 + i)
			// Never between the camera and the fire: the dog and the chalet stay sharp (only the distance is blurred).
			const behind = ctx.hasCamera ? smoothstep(dFire - 3, dFire + 1, Math.hypot(x - camPos.x, z - camPos.z)) : 1
			const fade = smoothstep(0, 6, age) * (1 - smoothstep(period - 6, period, age))
			const g = (j) => Math.min(1.1, horizonLin[j] * 0.9 + amb[j] * 0.35)
			mist.set(i, x, y, z, g(0), g(1), g(2), 0.34 * k * fade * behind * ctx.nearSoft(x, y, z), lerp(3.2, 5.2, hash01(i, n, 136)), hash01(i, n, 137) * 10)
		}
		return undefined
	}

	// --- update ------------------------------------------------------------------------------
	function update(state) {
		// Particle clock: state.particleClock if the host gives it (at the rewind, the clock of the band that
		// runs backward; elsewhere it equals state.clock), otherwise state.clock.
		const clock = Number.isFinite(state.particleClock) ? state.particleClock : Number.isFinite(state.clock) ? state.clock : (state.t ?? 0)
		// Clock speed (only used to erase what strobes when sped up).
		// With state.particleClock (rewind: the clock runs back at up to about 11x), clockRate is 0 (freeze): the real
		// speed is read from the derivative of this clock, so that `calm` erases what strobes.
		if (Number.isFinite(state.clockRate) && !Number.isFinite(state.particleClock)) rate = Math.abs(state.clockRate)
		else if (prevT !== null && Number.isFinite(state.t)) {
			const dt = state.t - prevT
			if (Math.abs(dt) > 1e-4 && Math.abs(dt) < 1) rate = Math.abs((clock - prevClock) / dt)
		}
		// Day/night cycles per second: state.cycleRate if the host gives it, otherwise estimated from the phase.
		if (Number.isFinite(state.cycleRate)) cyc = Math.abs(state.cycleRate)
		else if (prevT !== null && prevPhase !== null && Number.isFinite(state.t) && Number.isFinite(state.phase)) {
			const dt = state.t - prevT
			if (Math.abs(dt) > 1e-4 && Math.abs(dt) < 1) cyc = Math.abs((state.phase - prevPhase) / dt)
		}
		prevT = Number.isFinite(state.t) ? state.t : prevT
		prevClock = clock
		prevPhase = Number.isFinite(state.phase) ? state.phase : prevPhase

		const { night, day } = readLight(state)
		const grey = clamp(state.grey ?? 0, 0, 1)
		const season = autoSeason && Number.isFinite(state.phase) ? seasonAt(state.phase, grey) : { snow: 0, autumn: 0, rain: 0 }
		const fireNow = clamp(state.fire ?? 0, 0, 1)
		// v5: the absence (pure); the systems of LIFE.absenceQuiet go quiet there (x (1 - absence)).
		const absence = absenceOf(state)
		const quietK = params.quietAbsence ? 1 - absence : 1
		// v7: final extinction of the needles (pure in state.t; without t, partial state of a test bench: unchanged).
		const leafK = params.leafOff && Number.isFinite(state.t) ? 1 - smoothstep(params.leafOff[0], params.leafOff[1], state.t) : 1
		const ctx = {
			absence,
			leafK,
			hush: (name) => (LIFE.absenceQuiet.includes(name) ? quietK : 1),
			clock,
			fire: fireNow,
			chimney: clamp(state.chimney ?? 0, 0, 1) * (chimneyFollowsFire ? smoothstep(0, 0.6, fireNow) : 1),
			wind: clamp(state.wind ?? 0.3, 0, 1),
			night,
			day,
			grey,
			stage: Number.isFinite(state.stage) ? state.stage : 0,
			snow: clamp(state.snow ?? season.snow, 0, 1),
			autumn: clamp(state.autumn ?? season.autumn, 0, 1),
			rain: clamp(state.rain ?? season.rain, 0, 1),
			flare: clamp(state.fireFlare ?? 0, 0, 1),
			frozen: Boolean(state.frozen),
			lapseK: smoothstep(0.25, 0.7, cyc),
			calm: 1 - smoothstep(3, 12, rate),
			hasCamera: Boolean(state.camera),
			// Erases what passes right in front of the lens (otherwise big blurry squares).
			near: state.camera ? (x, y, z) => smoothstep(LIFE.nearFade[0], LIFE.nearFade[1], Math.hypot(x - camPos.x, y - camPos.y, z - camPos.z)) : () => 1,
			nearLeaf: state.camera ? (x, y, z) => smoothstep(3, 7.5, Math.hypot(x - camPos.x, y - camPos.y, z - camPos.z)) : () => 1,
			nearSoft: state.camera ? (x, y, z) => smoothstep(LIFE.nearFadeSoft[0], LIFE.nearFadeSoft[1], Math.hypot(x - camPos.x, y - camPos.y, z - camPos.z)) : () => 1,
		}
		if (state.camera) {
			state.camera.getWorldPosition(camPos)
			state.camera.getWorldDirection(camFwd)
			camFwd.y = 0
			if (camFwd.lengthSq() < 1e-6) camFwd.set(0, 0, -1)
			camFwd.normalize()
			camRight.set(-camFwd.z, 0, camFwd.x)
		}

		// Act III freeze (game frozen, fire lit, after the timelapse): the glow of the fire breathes, very slowly.
		// state.breath (0..1) forces or cuts it; without it, it is deduced: frozen + fire + phase > 1 (the menu is at 0.81).
		const breath = clamp(state.breath ?? (state.frozen && fireNow > 0.5 && Number.isFinite(state.phase) && state.phase > 1 ? 1 : 0), 0, 1)
		const breathT = Number.isFinite(state.breathT) ? state.breathT : Number.isFinite(state.t) ? state.t : clock

		// Flames: image of the strip, extinction.
		if (strip) strip.offset.y = flameFrame(clock) / LIFE.flame.frames
		for (const [m, orig] of patched) m.visible = orig.visible && ctx.fire > 0.02
		// When sped up, the flicker would fall at random on every frame (flash): it flattens with calm.
		const E = state.ember
		const emberK = emberOn && E && Number.isFinite(E.strength) ? clamp(E.strength, 0, 1) : 0
		if (E) {
			const sp = Array.isArray(E.scenePos) ? E.scenePos : Array.isArray(E.pos) ? toScene(E.pos, origin) : null
			if (sp) emberPos.fromArray(sp)
		}
		// Slow flicker of the ember, on the scene clock (frozen during the freezes: same image at both freezes).
		const emberFlicker = 1 + 0.07 * Math.sin(clock * 2.3) + 0.05 * Math.sin(clock * 3.9 + 1.1) + 0.03 * Math.sin(clock * 7.1 + 2.0)
		// v5: gain of the ember glow (state.ember.lightGain >= 1; 1 at the freezes and outside the memory).
		const lightGain = E && Number.isFinite(E.lightGain) ? Math.max(1, E.lightGain) : 1
		if (light) {
			const fireI = L.intensity * ctx.fire * (1 + (fireFlicker(clock) - 1) * ctx.calm) * (1 + 0.4 * ctx.flare) * (1 + 0.08 * breath * Math.sin((2 * Math.PI * breathT) / 4))
			// Dead fire: the same light passes to the ember (short range). Lit fire: nothing changes (freezes).
			// pw: "ember" share of the light (0 while the fire is above half, 1 fire out); position, range,
			// decay and colour slide with it (no jump while the fire dies).
			const pw = params.emberLight && emberK > 0 ? 1 - smoothstep(0, 0.5, ctx.fire) : 0
			const LE = params.light
			light.position.set(fire.x, fire.y + L.height, fire.z)
			if (pw > 0) light.position.lerp(emberPos, pw)
			light.distance = lerp(L.distance, LE.distance, pw)
			light.decay = lerp(L.decay, LE.decay, pw)
			if (pw > 0) light.color.copy(fireLightColor).lerp(emberLightColor.set(LE.color ?? L.color), pw)
			else light.color.copy(fireLightColor)
			const boost = 1 + (LE.day ?? 0) * day + (LE.grey ?? 0) * grey
			const lf = 1 + (emberFlicker - 1) * (LE.flicker ?? 1)
			light.intensity = fireI + LE.intensity * boost * emberK * pw * lf * lightGain
		}

		// Ember (contract v4).
		const lk = ember.look
		lk.on = emberK > 0.002 && features.has('ember')
		if (lk.on) {
			const pulse = clamp(E.pulse ?? 0, 0, 1)
			ember.mesh.position.copy(emberPos)
			const U = ember.uniforms
			lk.coreFrac = EM.core * (1 + 0.15 * pulse)
			const gl = params.gain
			lk.haloFrac = EM.halo * (0.85 + 0.15 * emberK) * (1 + 0.7 * pulse) * (1 + (gl.halo ?? 0) * (lightGain - 1))
			// Birth (0.08 s) and absorption: the core appears and fades with the brightness.
			U.uCoreA.value = smoothstep(0, 0.22, emberK)
			const glow = emberK * emberFlicker * (1 + 0.5 * pulse) * (1 + (gl.glow ?? 0) * (lightGain - 1))
			U.uHaloK.value = EM.haloGain * glow
			const hot = EM.hot
			const mid = EM.mid
			U.uHot.value.set(hot[0], hot[1], hot[2]).multiplyScalar((0.35 + 0.65 * emberK) * emberFlicker * (1 + 0.4 * pulse))
			U.uMid.value.set(mid[0], mid[1], mid[2]).multiplyScalar(0.55 + 0.45 * emberK)
			// Ring: only at the start of the rewind (state.wave), pure in progress.
			const W = state.wave
			const p = W && Number.isFinite(W.progress) ? W.progress : -1
			const ringOn = emberRing && p >= 0 && p < EM.ring.until
			const u = ringOn ? p / EM.ring.until : 0
			lk.ringFrac = ringOn ? EM.ring.radius * (1 - (1 - u) ** 2.2) : 0
			lk.ringK = ringOn ? 1 - (1 - u) ** 2.2 : 0
			U.uRingA.value = ringOn ? EM.ring.gain * smoothstep(0, 0.08, u) * (1 - smoothstep(0.45, 1, u)) : 0
		}

		// Forgetting of the particles (the ember escapes it: its material is separate).
		const forget = forgetParticles ? clamp(state.forgetting ?? 0, 0, 1) : 0
		const FG = { ...LIFE.forget, ...forgetLook }
		let fx = 0
		let fy = -0.1
		if (forget > 0 && state.camera && E) {
			tmp.copy(emberPos).project(state.camera)
			if (tmp.z < 1 && Number.isFinite(tmp.x) && Number.isFinite(tmp.y)) {
				fx = clamp(tmp.x, -0.6, 0.6)
				fy = clamp(tmp.y, -0.6, 0.6)
			}
		}
		const ax = lerp(1, state.camera?.aspect || 1, clamp(FG.round, 0, 1))
		const far = Math.max(Math.hypot((1 + Math.abs(fx)) * ax, 1 + Math.abs(fy)), 1e-3)
		const tl = 0.2126 * FG.tint[0] + 0.7152 * FG.tint[1] + 0.0722 * FG.tint[2] || 1
		const Wv = state.wave
		const waveOn = Boolean(Wv && Number.isFinite(Wv.radius))
		const R = waveOn ? Math.max(0, Wv.radius) : 0
		for (const sys of systems) {
			const u = sys.points.material.uniforms
			u.uForget.value = forget
			if (forget <= 0) continue
			u.uFocus.value.set(fx, fy, ax, 1 / far)
			u.uShape.value.set(FG.gain, FG.world, Math.max(FG.soft, 0.05), clamp(FG.max, 0, 1))
			u.uTint.value.set(FG.tint[0] / tl, FG.tint[1] / tl, FG.tint[2] / tl)
			u.uWave.value.set(emberPos.x, emberPos.y, emberPos.z, R)
			u.uWaveK.value.set(clamp(0.4 + 0.25 * R, 0.4, 2), waveOn ? 1 : 0)
		}

		const run = (fn, sys) => {
			let result
			try {
				result = fn(ctx)
			} catch (error) {
				sys.hideAll()
				console.warn(`[life] ${sys.points.name}`, error)
			}
			if (result !== 'idle') sys.commit()
		}
		run(updateSmoke, smoke)
		run(updateEmbers, embers)
		run(updateFireflies, fireflies)
		run(updateLeaves, leaves)
		run(updateDust, dust)
		run(updateBirds, birds)
		run(updateButterflies, butterflies)
		run(updateBats, bats)
		run(updateSnow, snowfall)
		run(updateRain, rain)
		run(updateMist, mist)
	}

	function dispose() {
		for (const s of systems) s.dispose()
		ember.dispose()
		for (const [m, orig] of patched) {
			m.map = orig.map
			m.emissiveMap = orig.emissiveMap
			m.visible = orig.visible
			m.needsUpdate = true
		}
		patched.clear()
		strip?.dispose()
		light?.removeFromParent()
		light?.dispose()
		group.removeFromParent()
	}

	return {
		object3d: group,
		update,
		setStage,
		dispose,
		lights: { fire: light },
		points: Object.fromEntries(systems.map((s) => [s.points.name, s.points])),
		decorative: LIFE.decorative,
		// Contract v4: 'ember' = life.js draws the ember (the scene turns its fallback ember off).
		features,
		ember: ember.mesh,
		// v5: live settings (quietAbsence, emberLight, light, gain), read every frame.
		params,
		// Hot switch (comparison with the fallback ember of the scene): without 'ember', the scene takes its own back.
		setEmber(on) {
			if (on) features.add('ember')
			else features.delete('ember')
		},
	}
}
