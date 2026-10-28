// Minemories, landing scene v1: "shader-like" light and wind.
// Contract: MODULES.md (look.js section). Scene space = capture coordinates, 1 unit = 1 block.
//
// createLook({ renderer, scene, camera, quality, focus, groundY, skyDistance })
//   -> { render(state), update(state), setSize(w, h), patchMaterials(root), registerEmissive(material, kind),
//       setFocus(center, radius), lights, sunScreen, params, composer, dispose() }
//
// Render chain: RenderPass (linear HDR + depth) -> bloom -> LookPass (rays, scattering
// toward the body, low mist, capture wave, snow, white balance) -> OutputPass (tone mapping + sRGB)
// -> FinishPass (blurred pause, warm/cold grading, vignette, grain).
//
// Optional state fields read by look.js (all without effect when absent; v3, see MODULES.md):
//   pause   0..1   blur and darkening of the frozen world (the background of the Pause menu, without interface)
//   capture { k, center, radius }  light wave of the AFK capture (k 0..1, center = scene point, radius in blocks)
//   abandon 0..1   grading "lived in" (warm) -> "abandoned" (cold); fallback: stage / 4, at small amplitude
//   snow    0..1   snow on the faces turned upward (computed in post, normals derived from the depth)
//   autumn  0..1   autumn tint of the birch leaves
//   frozen         the glow of the fire and of the windows breathes (+/- 8 %, 4 s) instead of flickering
//   breathT        clock of this breathing (default: state.t; the scene adds its ambient life to it)
//   exposure       EV added to the exposure (breathing of the freezes); the diorama presentation (params.presentEV x display) is added to it since v7c
//   fogScale       factor on the mist density (default 1)
//   ambientGain    factor on the hemisphere (default 1)
//   mistScale      factor on the low mist (default 1)
//
// Contract v4 ("The kept evening", HOST-API.md section "Contract v4"):
//   forgetting 0..1  the FORGETTING, per material (never as a full-screen post effect): desaturation and cold veil from the edges
//                    of the image and the outskirts of the zone toward the ember; uniform injected by patchMaterials (captures)
//                    and registerForgetting(root) (characters, decor, falling blocks). Excluded: material.userData
//                    .mmKeepColor === true (collar of the dog, ember). Luminance kept (anti-flash rule).
//   wave   { sceneOrigin, radius, progress, strength } | null  warm wave of the rewind, born from the ember; behind
//                    its front (distance < radius) the forgetting is lifted; warm front capped, without whitening.
//   ember  { scenePos }   focal point of the forgetting (projected on screen)
//   coldGlow 0..1    cold "real life" light on the world (faces turned toward the viewer, stronger at the bottom
//                    of the frame) and cold white balance; the screen glow itself stays that of VeilPass (scene).
//   freezeFrame { at, k }  the grain is drawn from freezeFrame.at during the freezes: both freezes give the same image, grain included.
//   display 0..1     diorama: presentation light (less orange, the fire stays the warm point) and lift of the
//                    player and the dog (materials "dog / ...", "player / ..." received by registerForgetting).
//   The old `capture` channel is no longer read as soon as `wave` is present in the state (no ring, no exposure pulse).
// Contract v5 ("You told him stay", HOST-API.md section "v5"):
//   Dog kept warm: the skin of the dog (material "dog / ..." marked mmKeepColor, collar excluded) escapes the forgetting
//                    (MM4_KEEP) AND the cold screen passes: the "abandoned" grading (cold white balance of
//                    applyAbandon) is cancelled on it, and a warm cream tint, at equal luminance, holds it
//                    during the forgetting (params.dogKeep x forgetting); the ember lights it from close (params.dogEmber x
//                    ember.strength x ember.lightGain, dead fire only). Everything is 0 at both freezes (forgetting 0,
//                    abandon 0, fire lit). "Everything fades, except the dog and the ember."
//   rim { k, sceneMin, sceneMax }  warm outline of the square edge of the capture ('captureRim'): a line on the top faces
//                    along the edge of the box, and a faint warm veil on the cut faces of the edge;
//                    captures and falls only (no characters, no decor). k = 0 until 37.1 s (v7 time).
//   coldGlow (variant, off by default): cyan screen light, distinct from the moon, with a slow
//                    flicker barely perceptible (< 2 Hz, +/- 4 %).
// `features` (Set) announces what look.js does itself ('pause', 'captureWave', v4: 'wave', 'forgetting',
// 'coldLight', 'charLift'; v5: 'captureRim', 'dogKeepWarm'): the integrator does not redo it. 'coldLight' is NOT 'coldGlow': the screen glow
// (gradient at the bottom of the image) stays with the scene.

import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

// ---------------------------------------------------------------------------
// Pure tools
// ---------------------------------------------------------------------------

const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const lerp = (a, b, k) => a + (b - a) * k
function smoothstep(e0, e1, x) {
	if (e0 === e1) return x < e0 ? 0 : 1
	const k = clamp((x - e0) / (e1 - e0), 0, 1)
	return k * k * (3 - 2 * k)
}
const finite = (v, fallback) => (Number.isFinite(v) ? v : fallback)
const rgbOr = (v, fallback) => (Array.isArray(v) && v.length >= 3 && v.every(Number.isFinite) ? v : fallback)

const warned = new Set()
function warnOnce(key, text) {
	if (warned.has(key)) return
	warned.add(key)
	console.warn(`[look] ${text}`)
}

// Plants that bend from their base (texture name without "minecraft:block/").
const PLANTS = [
	'short_grass',
	'tall_grass',
	'grass', // old name of short_grass
	'large_fern',
	'fern',
	'poppy',
	'dandelion',
	'cornflower',
	'oxeye_daisy',
	'azure_bluet',
	'allium',
	'lily_of_the_valley',
	'blue_orchid',
	'red_tulip',
	'orange_tulip',
	'white_tulip',
	'pink_tulip',
	'torchflower',
	'wither_rose',
	'sweet_berry_bush',
	'sapling',
	'dead_bush',
	'bush',
	'sunflower',
	'lilac',
	'rose_bush',
	'peony',
	'pitcher_plant',
]
// Upper halves of two-block plants: their base is already one block above the ground.
const DOUBLE_TOPS = ['tall_grass_top', 'large_fern_top', 'sunflower_top', 'lilac_top', 'rose_bush_top', 'peony_top', 'pitcher_plant_top']
// Crops (textures "<crop>_stage<N>", vanilla and Farmer's Delight): stiff stems, reduced sway.
const CROPS = ['wheat', 'carrots', 'potatoes', 'beetroots', 'cabbages', 'onions', 'tomatoes', 'rice', 'rice_panicles']
// Block namespaces that never move (roofs, furniture, joinery, chimneys, placed decor), even if a
// texture carries a plant name (the grassy roof piece mcwroofs:grass_roof has a "grass" texture).
const STILL_NAMESPACES = ['mcwroofs', 'handcrafted', 'mcwwindows', 'mcwdoors', 'mcwtrpdoors', 'mcwfences', 'mcwlights', 'mcwpaths', 'sootychimneys', 'twigs']
// Wind amplitude per class (multiplies uMmWindAmp).
const WIND_AMP = { plant: 1, plantTop: 1, crop: 0.55, leaves: 1, vine: 1 }

/**
 * Classifies a capture material by its name "<block> / <texture>".
 * The mod names a material after the first block met for a texture (and its settings): the same material
 * may serve other blocks ("supplementaries:flower_box / minecraft:block/red_tulip" also covers the tulips
 * in the open ground; "minecraft:potted_red_tulip / minecraft:block/flower_pot" covers all the pots). The texture
 * therefore wins over the block; the block only serves for isolated vanilla plants and still namespaces.
 * @returns {{ wind: null|'plant'|'plantTop'|'crop'|'leaves'|'vine', emissive: null|'fire'|'embers'|'lantern'|'lamp'|'stove'|'candle'|'glass'|'off' }}
 */
export function classifyMaterial(name = '') {
	const [block = '', texture = ''] = String(name).split(' / ')
	const tex = texture.split('/').pop() || ''
	const ns = block.includes(':') ? block.split(':')[0] : 'minecraft'
	const blk = block.split(':').pop() || ''
	const out = { wind: null, emissive: null }
	const still = STILL_NAMESPACES.includes(ns) || tex === 'flower_pot' || blk.startsWith('potted_')
	if (STILL_NAMESPACES.includes(ns) || tex === 'flower_pot') out.wind = null
	else if (tex.includes('leaves') || blk.includes('leaves')) out.wind = 'leaves'
	else if (tex === 'vine' || tex.endsWith('_vines') || tex.endsWith('_vines_plant') || blk === 'vine') out.wind = 'vine'
	else if (DOUBLE_TOPS.some((p) => tex === p)) out.wind = 'plantTop'
	else if (tex.endsWith('_overlay') || tex.includes('grass_block')) out.wind = null
	else if (CROPS.some((p) => tex.startsWith(`${p}_stage`))) out.wind = 'crop'
	else if (PLANTS.some((p) => tex === p || tex.startsWith(`${p}_`) || tex.endsWith(`_${p}`))) out.wind = 'plant'
	else if (!still && PLANTS.some((p) => blk === p || blk.endsWith(`_${p}`))) out.wind = 'plant'

	if (tex === 'campfire_fire' || tex === 'soul_campfire_fire') out.emissive = 'fire'
	else if (tex.startsWith('campfire_log_lit') || tex.startsWith('soul_campfire_log_lit')) out.emissive = 'embers'
	else if (tex === 'campfire_log' || tex === 'soul_campfire_log') out.emissive = 'off'
	// Other texture of a campfire (food placed on it): lit by the fire, it does not emit.
	else if (blk === 'campfire' || blk === 'soul_campfire') out.emissive = 'off'
	else if (tex.includes('lantern')) out.emissive = 'lantern'
	// Macaw wall lantern: its body is in the minecraft:lantern material; bracket, chain and fitting carry
	// the emissive factor of the block (level 15) but do not emit.
	else if (blk.endsWith('lantern')) out.emissive = 'off'
	// Lit Farmer's Delight stove: only the fire behind the grid emits (strict mask, see MM_EMIMASK 2).
	else if (/^stove_(top|front|side)_on$/.test(tex)) out.emissive = 'stove'
	else if (/(^|_)candle_lit$/.test(tex) || /(^|_)candle_cake_lit$/.test(tex)) out.emissive = 'candle'
	else if (/torch|glowstone|shroomlight|sea_lantern|jack_o_lantern|redstone_lamp_on/.test(tex)) out.emissive = 'lamp'
	// Pane of a Macaw window (chalet v2): its opaque pixels (frame, reflections) take the glow of the interior
	// at night, in S0 only (state.windows); otherwise the pane band stayed white, lit by the lantern.
	else if (ns === 'mcwwindows' && tex === 'glass') out.emissive = 'glass'
	return out
}

// ---------------------------------------------------------------------------
// Settings (changeable live through look.params)
// ---------------------------------------------------------------------------

const PARAMS = {
	toneMapping: 'aces', // 'aces' | 'agx'
	exposureDay: 1.12,
	exposureNight: 1.55,
	sun: 1.35, // multiplies lighting.sunIntensity (v0 scale: about 2.4 in full day)
	moon: 1.6, // multiplies lighting.moonIntensity (v0 scale: about 0.6)
	ambient: 0.85, // multiplies the intensity of the hemisphere
	fill: 0.22, // warm bounce of the ground, as a fraction of the main light
	fogDensityDay: 0.006, // 0.0105 drowned act I in a milky mist and flattened the distant decor
	fogDensityNight: 0.0085,
	fogDensityDawn: 0.014,
	bloomThreshold: 1.05, // linear HDR luminance before exposure: sun, fire, lanterns, fireflies must exceed ~1.5
	bloomStrengthDay: 0.32,
	bloomStrengthNight: 0.72, // 0.85 whitened the flames and the panes
	bloomRadius: 0.6,
	rays: 0.5, // main.js imposes 0.5 x (1 - glareCut): the real gain is params.raysGain
	scatter: 0.42, // scattering halo toward the body in the depth (main.js modulates it: real gain params.scatterGain)
	mist: 0.26, // low mist at dawn
	vignette: 0.3,
	grain: 0.035, // main.js imposes 0.035 (0.02 in low quality): the real gain is params.grainScale
	// --- v3: internal gains (main.js imposes some settings above on every frame; these add to them) ---
	raysGain: 1.35, // sun rays through the spruces
	scatterGain: 1.25, // warm scattering toward the low sun
	goldenMist: 0.65, // warm low mist at the golden hour, x params.mist (the dawn keeps 1)
	mistHeight: 3.2, // thickness of the low mist in blocks
	fillGolden: 0.16, // warm backlight bounce on the facade at the golden hour (fraction of the main light)
	fireFill: 0.55, // at night, the fire lights the decor on the camera side, with its flicker
	fireBoostGain: 1.5, // v9b: gain of `state.fireBoost` (the celebration) in that fill
	grainScale: 0.8,
	splitTone: 1, // warm in the highlights, cold in the shadows
	abandonGrade: 1, // gain of the grading lived in -> abandoned
	greenKeep: 1, // gain of the preservation of the greens in the grey dawn
	pauseDim: 0.4, // darkening of the world in pause (bible v4: -40 %)
	pauseBlur: 0.01, // radius of the pause blur, fraction of the image height
	pulseEV: 0.15, // exposure pulse of the capture
	waveColor: [1.0, 0.9, 0.7], // capture wave (sRGB)
	waveStrength: 0.42, // 1.0 before the finishing pass: the wave whitened the openwork foliage
	waveTrail: 0.04, // trail behind the front (0.12 before): only the front must read
	freezeBreath: 0.08, // amplitude of the glow breathing when the world is frozen
	snowColor: [0.86, 0.92, 1.0],
	autumnColor: [1.0, 0.78, 0.2], // tint of the birch leaves in autumn (sRGB)
	emissiveFire: 7,
	emissiveEmbers: 5,
	emissiveLantern: 5.5,
	emissiveLanternNight: 0.6, // night gain of the lanterns: x (0.4 + this gain x night), negative allowed; main.js sets it per version
	emissiveLamp: 3.0,
	emissiveStove: 5, // stove fire (strict mask), follows state.fire
	emissiveCandle: 0.6, // lit candle (level 3): the whole taper, faintly, follows state.fire
	emissiveGlass: 0.7, // panes of the Macaw windows, x state.windows (main.js: night in S0)
	window: 2.6, // HDR factor of the registered window cards (registerEmissive(m, 'window'))
	wind: 1.0,
	// --- v4 ("The kept evening"): new names, never rewritten by the scene ---
	forget: 1, // gain on state.forgetting (0: forgetting cut on the look side)
	forgetGain: 1.8, // speed of the forgetting front (edges -> ember)
	forgetSoft: 0.5, // softness of the front
	forgetMax: 0.94, // maximum desaturation (0.94: a breath of colour remains)
	forgetWorld: 0.85, // weight of the outskirts of the zone (distance to the ember, 6 -> 26 blocks) in the front
	forgetRound: 0, // 0: front in the shape of the frame; 1: circle (aspect ratio corrected)
	forgetTint: [0.93, 1.0, 1.1], // cold veil of the grey (normalised to luminance 1)
	forgetKeepSat: 1, // during the forgetting, the global saturation rises to >= 1: collar and ember stay bold
	waveGain: 0.55, // warm front of the rewind wave (multiplicative gain per channel). Second pass v4: 0.85 -> 0.55
	//   (blind test v4: "translucent golden blocks", "bug or interface"; the returning colour must be enough)
	waveWarm: [1.0, 0.5, 0.14], // tint of the front (per channel)
	waveTrailLen: 4, // warm trail behind the front (blocks)
	waveGlow: 0.04, // additive glow of the front (linear HDR, x strength), block edges underlined. Second pass v4:
	//   0.12 -> 0.04 (the golden edges read as a "construction plan"); 0.12 sober v4, 0.2 "scanner" (tune)
	coldLight: 1.2, // cold "real life" light at the departure (x state.coldGlow), mostly at the bottom of the frame
	coldLightColor: [0.6, 0.84, 1.0], // sRGB; v5: screen cyan, distinct from the moon (desaturated blue about [0.74; 0.8; 0.95])
	coldGrade: 1, // cold white balance during coldGlow
	charLift: 0.5, // lift of the player and the dog in the diorama (x state.display)
	charLiftColor: [1.0, 0.93, 0.84], // sRGB
	present: 1, // presentation light of the diorama (x state.display)
	presentKey: [1.0, 0.9, 0.8], // colour of the main light of the diorama (sRGB), less orange
	presentSky: [0.6, 0.68, 0.88], // hemisphere of the diorama (sRGB), evening blue
	presentEV: 1.6, // v7c: EV added to the exposure by the diorama presentation (x state.display); v7b set it in scene.js (TIMELINE.display.ev)
	// --- v5 ("You told him stay") ---
	dogKeep: 0.95, // v11b: weight of the coat tint (mix at equal luminance), x max(smoothstep(0, 0.4, forgetting), state.dogCoat). v5: 0.55
	dogKeepTint: [1.0, 0.975, 0.945], // v11b: the white of the coat, as a very light warm white. v5: a cream [1.0, 0.78, 0.62]; the blind test of v11 saw the dog go from white to blue-grey (moon) then beige (cream): one white now
	dogKeepWhite: 1, // cancels on the coat the cold white balance of the abandonment (0: the dog cools down with the place)
	dogEmber: 0.6, // light of the ember on the dog (close, wrapped Lambert), x ember.strength x lightGain, dead fire
	dogEmberFall: 0.25, // attenuation 1 / (1 + f d^2), d in blocks (the dog is about 2.3 blocks from the ember)
	rim: 1, // gain of the outline of the capture edge (x state.rim.k)
	rimColor: [1.0, 0.66, 0.32], // sRGB
	rimGlow: 0.55, // additive glow of the line (linear HDR): under the bloom threshold, it does not whiten
	rimWidth: 0.28, // width of the line in blocks (at least 1.5 px on screen)
	rimWall: 0.12, // warm veil of the cut faces of the edge (fraction of rimGlow)
	coldShimmer: 0.04, // screen flicker of the cold glow (relative amplitude, frequencies 0.7 and 1.9 Hz)
}

// ---------------------------------------------------------------------------
// GLSL of the wind (shared by the colour and depth materials)
// ---------------------------------------------------------------------------

const WIND_VERTEX_PARS = /* glsl */ `
uniform float uMmWindTime;
uniform float uMmWindAmp;
uniform vec2 uMmWindDir;
varying float vMmH;

float mmHash( vec2 c ) {
	return fract( sin( dot( c, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
}

// Gusts: slow bands travelling in the direction of the wind (0.25..1).
float mmGust( vec2 p ) {
	vec2 q = vec2( dot( p, uMmWindDir ), dot( p, vec2( - uMmWindDir.y, uMmWindDir.x ) ) );
	float t = uMmWindTime;
	float g = sin( q.x * 0.11 - t * 1.25 ) * 0.5 + 0.5;
	g *= sin( q.x * 0.043 + q.y * 0.071 - t * 0.37 ) * 0.35 + 0.65;
	return 0.25 + 0.75 * g * g;
}

vec3 mmWindOffset( vec3 wp, vec2 uvv ) {
	vec3 d = vec3( 0.0 );
	float t = uMmWindTime;
	vec2 perp = vec2( - uMmWindDir.y, uMmWindDir.x );
	vMmH = 1.0;
#ifdef MM_WIND
#if MM_WIND == 1
	// Plant: height in the plant from the UV (v = 0 at the top of the sprite), +1 for an upper half.
	float h = clamp( ( 0.998 - uvv.y ) / 0.996, 0.0, 1.0 ) + MM_BASE;
	vMmH = h;
	float w = h <= 1.0 ? h * h : 1.0 + ( h - 1.0 ) * 1.4;
	vec2 cell = floor( wp.xz + 1e-3 );
	float ph = dot( cell, vec2( 0.37, 0.23 ) ) + mmHash( cell ) * 6.2831;
	float g = mmGust( cell );
	float sway = sin( t * 2.1 + ph ) * 0.55 + sin( t * 3.7 + ph * 1.7 ) * 0.22;
	float lean = g * 0.85 + sway * ( 0.3 + 0.5 * g );
	vec2 off = uMmWindDir * lean + perp * sin( t * 1.6 + ph * 2.3 ) * 0.22 * g;
	off *= 0.12 * uMmWindAmp * w * MM_AMP;
	d.xz = off;
	d.y = - dot( off, off ) * 0.9 / max( h, 0.25 );
#elif MM_WIND == 2
	// Leaves: flutter per vertex (continuous in world position, hence without cracks) + slow sway.
	float g = mmGust( wp.xz );
	vec3 p = wp * vec3( 1.7, 2.3, 1.9 );
	d.x = sin( t * 3.1 + p.x + p.y * 0.7 );
	d.y = sin( t * 2.7 + p.z * 1.3 + p.x ) * 0.6;
	d.z = sin( t * 3.4 + p.y + p.z * 0.8 );
	d *= 0.026 * ( 0.35 + 0.65 * g );
	d.xz += uMmWindDir * ( sin( t * 1.05 + dot( wp.xz, vec2( 0.21, 0.17 ) ) ) * 0.5 + 0.5 ) * 0.06 * g;
	d *= uMmWindAmp;
#elif MM_WIND == 3
	// Vines: undulation running down along the vine.
	float g = mmGust( wp.xz );
	float wave = sin( t * 2.3 - wp.y * 1.6 + dot( wp.xz, vec2( 0.5, 0.3 ) ) );
	d.xz = ( uMmWindDir * 0.7 + perp * 0.3 ) * wave * 0.05 * ( 0.4 + 0.6 * g ) * uMmWindAmp;
#endif
#endif
	return d;
}
`

const WIND_VERTEX_MAIN = /* glsl */ `
#include <begin_vertex>
#ifdef MM_WIND
{
	vec4 mmW = modelMatrix * vec4( transformed, 1.0 );
	vec3 mmD = mmWindOffset( mmW.xyz, uv );
	mat3 mmM = mat3( modelMatrix );
	// world -> object (rotation and uniform scale; the captures only have translations)
	transformed += ( mmD * mmM ) / max( dot( mmM[ 0 ], mmM[ 0 ] ), 1e-6 );
}
#endif
`

const FRAGMENT_PARS = /* glsl */ `
varying float vMmH;
#ifdef MM_BIRCH
uniform float uMmAutumn;
uniform vec3 uMmAutumnColor;
#endif
#ifdef MM_SSS
float mmSss( vec3 L, vec3 V ) {
	float back = clamp( dot( - V, L ), 0.0, 1.0 );
	return MM_SSS * ( 0.18 + 2.4 * pow( back, 5.0 ) );
}
#endif
`

// Additions to the fragment (anchored on chunks of three r186, checked at run time).
const FRAGMENT_EDITS = [
	{
		anchor: '#include <color_fragment>',
		code: /* glsl */ `
#ifdef MM_WIND
#if MM_WIND == 1
	diffuseColor.rgb *= mix( 0.58, 1.0, clamp( vMmH, 0.0, 1.0 ) ); // foot of the plants darker
#endif
#endif
#ifdef MM_BIRCH
	{
		// Autumn: the green of the birch turns to gold keeping the luminance of the pixels (the pattern of the leaves stays).
		float mmL = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
		diffuseColor.rgb = mix( diffuseColor.rgb, uMmAutumnColor * ( 0.22 + 2.3 * mmL ), uMmAutumn );
	}
#endif`,
	},
	{
		anchor: '#include <normal_fragment_begin>',
		code: /* glsl */ `
#ifdef MM_UPNORMAL
	// Normals upward for the cross plants (both faces lit like the ground).
	normal = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
	nonPerturbedNormal = normal;
#endif`,
	},
	{
		anchor: '#include <emissivemap_fragment>',
		code: /* glsl */ `
#if defined( MM_EMIMASK ) && defined( USE_EMISSIVEMAP )
#if MM_EMIMASK == 2
	// Stove: only the yellow-orange fire emits; the red bricks (g - b < 0.06 in linear) stay off.
	totalEmissiveRadiance *= smoothstep( 0.3, 0.6, emissiveColor.r ) * smoothstep( 0.06, 0.12, emissiveColor.g - emissiveColor.b );
#else
	// Only the warm and light pixels emit (flame, embers, core of the lanterns).
	totalEmissiveRadiance *= smoothstep( 0.45, 0.85, emissiveColor.r ) * smoothstep( 0.02, 0.3, emissiveColor.r - emissiveColor.b );
#endif
#endif`,
	},
]

// Light transmitted by the foliage, inserted after RE_Direct in the directional lights loop
// (directLight.color y already contains the shadow).
function lightsChunkWithSss() {
	const chunk = THREE.ShaderChunk.lights_fragment_begin
	if (typeof chunk !== 'string') return null
	const start = chunk.indexOf('NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )')
	if (start < 0) return null
	const call = chunk.indexOf('RE_Direct( directLight', start)
	const end = call < 0 ? -1 : chunk.indexOf(';', call)
	if (end < 0) return null
	const add =
		'\n\t\t#ifdef MM_SSS\n\t\treflectedLight.directDiffuse += material.diffuseColor * directLight.color * mmSss( directLight.direction, geometryViewDir ) * RECIPROCAL_PI;\n\t\t#endif\n'
	return chunk.slice(0, end + 1) + add + chunk.slice(end + 1)
}

// ---------------------------------------------------------------------------
// Post-processing passes
// ---------------------------------------------------------------------------

const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`

const SKY_MASK = /* glsl */ `
uniform sampler2D tDepth;
uniform mat4 uProjInv;
uniform float uSkyDist;
// 1 for the sky (empty depth, or very far if the dome writes its depth).
float mmSky( vec2 uv, out vec3 viewPos ) {
	float z = texture2D( tDepth, uv ).x;
	vec4 v = uProjInv * vec4( uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0 );
	viewPos = v.xyz / v.w;
	if ( z >= 0.99999 ) return 1.0;
	return smoothstep( uSkyDist * 0.92, uSkyDist, length( viewPos ) );
}
`

const RAYS_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uSunUv;
uniform float uAspect;
uniform float uDensity;
uniform float uDecay;
varying vec2 vUv;
${SKY_MASK}
void main() {
	vec2 delta = ( vUv - uSunUv ) * ( uDensity / float( RAY_SAMPLES ) );
	vec2 uv = vUv;
	float w = 1.0;
	float acc = 0.0;
	vec3 vp;
	for ( int i = 0; i < RAY_SAMPLES; i ++ ) {
		uv -= delta;
		vec2 q = ( uv - uSunUv ) * vec2( uAspect, 1.0 );
		float r2 = dot( q, q );
		float src = exp( - r2 * 60.0 ) + 0.25 * exp( - r2 * 6.0 );
		vec3 c = texture2D( tDiffuse, clamp( uv, 0.001, 0.999 ) ).rgb;
		src *= 0.6 + 0.4 * clamp( dot( c, vec3( 0.3333 ) ), 0.0, 2.0 );
		acc += mmSky( clamp( uv, 0.001, 0.999 ), vp ) * src * w;
		w *= uDecay;
	}
	gl_FragColor = vec4( vec3( acc / float( RAY_SAMPLES ) ), 1.0 );
}
`

const LOOK_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tRays;
uniform mat4 uCamWorld;
uniform vec3 uBodyDir;
uniform vec3 uScatterColor;
uniform float uScatter;
uniform float uScatterDensity;
uniform vec3 uMistColor;
uniform float uMist;
uniform float uGroundY;
uniform float uMistHeight;
uniform vec3 uRaysColor;
uniform float uRaysOn;
uniform vec3 uWhite;
uniform vec3 uWaveCenter;
uniform vec4 uWave; // radius, width of the front, intensity, length of the trail
uniform vec3 uWaveColor;
uniform float uWaveTrail;
uniform float uSnow;
uniform vec3 uSnowColor;
varying vec2 vUv;
${SKY_MASK}
float mmHash2( vec2 p ) {
	return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
void main() {
	vec4 c = texture2D( tDiffuse, vUv );
	vec3 vp;
	float sky = mmSky( vUv, vp );
	float dist = length( vp );
	vec3 dir = normalize( mat3( uCamWorld ) * vp );
	vec3 camPos = uCamWorld[ 3 ].xyz;
	float solid = 1.0 - sky;
	vec3 wp = camPos + dir * dist;
	// Derivatives of the view position: outside any branching (they are only defined in a uniform flow).
	vec3 dxv = dFdx( vp );
	vec3 dyv = dFdy( vp );
	// Snow: faces turned upward (normal drawn from the depth), speckled at the texture pixel (16 per block).
	if ( uSnow > 0.001 && solid > 0.5 ) {
		float flatK = 1.0 - smoothstep( 0.02, 0.06, ( length( dxv ) + length( dyv ) ) / max( dist, 1.0 ) );
		vec3 nw = normalize( mat3( uCamWorld ) * normalize( cross( dxv, dyv ) ) );
		float up = smoothstep( 0.42, 0.72, nw.y ) * flatK;
		float stip = mmHash2( floor( wp.xz * 16.0 ) + floor( wp.y * 16.0 ) * 7.0 );
		float cover = up * step( stip, uSnow * 1.25 - 0.12 ) * smoothstep( 0.0, 0.25, uSnow );
		float lum = dot( c.rgb, vec3( 0.3, 0.59, 0.11 ) );
		vec3 snowCol = uSnowColor * ( 0.22 + 1.05 * clamp( lum, 0.0, 1.6 ) );
		c.rgb = mix( c.rgb, snowCol, cover * 0.94 );
	}
	// Scattering toward the body (coarse Mie): the depth takes the colour of the low sun.
	float cosT = max( dot( dir, uBodyDir ), 0.0 );
	float mie = pow( cosT, 5.0 ) * 0.7 + pow( cosT, 32.0 ) * 1.6;
	float depthK = 1.0 - exp( - dist * uScatterDensity );
	c.rgb += uScatterColor * ( mie * uScatter * depthK * solid );
	// Low mist (dawn, golden hour): dense at ground level, in depth only.
	float y = camPos.y + dir.y * dist;
	float mist = uMist * exp( - max( y - uGroundY, 0.0 ) / uMistHeight ) * ( 1.0 - exp( - dist * 0.035 ) ) * solid;
	c.rgb = mix( c.rgb, uMistColor + uScatterColor * mie * 0.5, clamp( mist, 0.0, 0.65 ) );
	// Capture wave: a ring of pale light leaving the player and caressing the ground, the chalet and the trees.
	if ( uWave.z > 0.001 && solid > 0.5 ) {
		vec3 dw = wp - uWaveCenter;
		float d = length( vec3( dw.x, dw.y * 0.4, dw.z ) );
		float x = ( d - uWave.x ) / uWave.y;
		float ring = exp( - x * x );
		float trail = ( d < uWave.x ? pow( clamp( 1.0 - ( uWave.x - d ) / uWave.w, 0.0, 1.0 ), 2.5 ) : 0.0 );
		float lum = dot( c.rgb, vec3( 0.3, 0.59, 0.11 ) );
		// Rather multiplicative (the relief of the blocks stays readable) with a pale veil for the dark surfaces of the night.
		float wv = ( ring + trail * uWaveTrail ) * uWave.z;
		c.rgb = c.rgb * ( 1.0 + 2.4 * wv ) + uWaveColor * wv * 0.07;
	}
	// Rays.
	c.rgb += texture2D( tRays, vUv ).rgb * uRaysColor * uRaysOn;
	c.rgb *= uWhite;
	gl_FragColor = c;
}
`

const FINISH_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uSat;
uniform float uGreenKeep;
uniform float uContrast;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uVignette;
uniform vec3 uVignetteColor;
uniform float uGrain;
uniform float uGrainPx;
uniform float uSeed;
uniform float uPause;
uniform float uPauseDim;
uniform float uPauseBlur;
uniform vec2 uResolution;
varying vec2 vUv;
float mmNoise( vec2 p ) {
	return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) + uSeed ) * 43758.5453 );
}
void main() {
	vec4 src = texture2D( tDiffuse, vUv );
	vec3 c = src.rgb;
	float aspect = uResolution.x / max( uResolution.y, 1.0 );
	// Pause: disc blur (golden spiral, rotated per pixel) then darkening, without any interface.
	if ( uPause > 0.001 ) {
		float rad = uPauseBlur * uPause;
		float rot = mmNoise( gl_FragCoord.xy ) * 6.2831;
		vec3 acc = vec3( 0.0 );
		for ( int i = 0; i < PAUSE_TAPS; i ++ ) {
			float fi = float( i ) + 0.5;
			float r = sqrt( fi / float( PAUSE_TAPS ) ) * rad;
			float a = fi * 2.39996 + rot;
			acc += texture2D( tDiffuse, clamp( vUv + vec2( cos( a ) / aspect, sin( a ) ) * r, 0.001, 0.999 ) ).rgb;
		}
		c = acc / float( PAUSE_TAPS );
		float pl = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
		c = mix( c, vec3( pl ) * vec3( 0.92, 0.97, 1.08 ), 0.22 * uPause );
		c *= 1.0 - uPauseDim * uPause;
	}
	c = clamp( c, 0.0, 1.0 );
	// Lift / gamma / gain (display space).
	c = uGain * ( c + uLift * ( 1.0 - c ) );
	c = pow( max( c, 0.0 ), 1.0 / uGamma );
	float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	// Saturation; the greens (grass, moss, spruces) keep more of it when uGreenKeep > 0 (grey dawn).
	float greenDom = clamp( ( c.g - max( c.r, c.b ) ) * 7.0, 0.0, 1.0 );
	c = mix( vec3( l ), c, uSat + uGreenKeep * greenDom );
	c = ( c - 0.5 ) * uContrast + 0.5;
	// Warm in the highlights, cold in the shadows.
	l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c *= mix( vec3( 1.0 ), uShadowTint, 1.0 - smoothstep( 0.04, 0.5, l ) );
	c *= mix( vec3( 1.0 ), uHighTint, smoothstep( 0.4, 0.95, l ) );
	// Slightly tinted vignette.
	vec2 q = ( vUv - 0.5 ) * vec2( aspect, 1.0 );
	float v = smoothstep( 0.38, 1.1, length( q ) );
	c = mix( c, c * uVignetteColor, v * v * ( 3.0 - 2.0 * v ) * uVignette );
	// Grain (more visible in the shadows, bigger grain in high definition).
	l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	float n = mmNoise( floor( vUv * uResolution / uGrainPx ) ) - 0.5;
	c += n * uGrain * ( 1.0 - 0.6 * l );
	gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), src.a );
}
`

class LookPass extends Pass {
	constructor({ samples, scale }) {
		super()
		this.needsSwap = true
		this.raysScale = scale
		this.raysTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
		const mask = () => ({ tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uSkyDist: { value: 300 } })
		this.raysMaterial = new THREE.ShaderMaterial({
			name: 'MinemoriesRays',
			defines: { RAY_SAMPLES: samples },
			uniforms: {
				...mask(),
				tDiffuse: { value: null },
				uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
				uAspect: { value: 16 / 9 },
				uDensity: { value: 0.85 },
				uDecay: { value: 0.965 },
			},
			vertexShader: QUAD_VERTEX,
			fragmentShader: RAYS_FRAGMENT,
			depthTest: false,
			depthWrite: false,
		})
		this.material = new THREE.ShaderMaterial({
			name: 'MinemoriesLook',
			uniforms: {
				...mask(),
				tDiffuse: { value: null },
				tRays: { value: this.raysTarget.texture },
				uCamWorld: { value: new THREE.Matrix4() },
				uBodyDir: { value: new THREE.Vector3(0, 1, 0) },
				uScatterColor: { value: new THREE.Color(0, 0, 0) },
				uScatter: { value: 0 },
				uScatterDensity: { value: 0.012 },
				uMistColor: { value: new THREE.Color(0.5, 0.5, 0.5) },
				uMist: { value: 0 },
				uGroundY: { value: -12 },
				uMistHeight: { value: 2.5 },
				uRaysColor: { value: new THREE.Color(0, 0, 0) },
				uRaysOn: { value: 0 },
				uWhite: { value: new THREE.Vector3(1, 1, 1) },
				uWaveCenter: { value: new THREE.Vector3() },
				uWave: { value: new THREE.Vector4(0, 1, 0, 8) },
				uWaveColor: { value: new THREE.Color(1, 0.9, 0.7) },
				uWaveTrail: { value: 0.04 },
				uSnow: { value: 0 },
				uSnowColor: { value: new THREE.Color(0.86, 0.92, 1) },
			},
			vertexShader: QUAD_VERTEX,
			fragmentShader: LOOK_FRAGMENT,
			depthTest: false,
			depthWrite: false,
		})
		this.quad = new FullScreenQuad(this.material)
		this.black = new THREE.Color(0, 0, 0)
	}

	setSize(width, height) {
		this.raysTarget.setSize(Math.max(1, Math.round(width / this.raysScale)), Math.max(1, Math.round(height / this.raysScale)))
		this.raysMaterial.uniforms.uAspect.value = width / Math.max(1, height)
	}

	render(renderer, writeBuffer, readBuffer) {
		// The depth is read every frame: the two targets of the composer each have their own.
		const depth = readBuffer.depthTexture
		const U = this.material.uniforms
		U.tDiffuse.value = readBuffer.texture
		U.tDepth.value = depth
		if (!depth) {
			U.uScatter.value = 0
			U.uMist.value = 0
			U.uRaysOn.value = 0
		}
		if (depth && U.uRaysOn.value > 0.001) {
			const R = this.raysMaterial.uniforms
			R.tDiffuse.value = readBuffer.texture
			R.tDepth.value = depth
			R.uProjInv.value.copy(U.uProjInv.value)
			R.uSkyDist.value = U.uSkyDist.value
			this.quad.material = this.raysMaterial
			renderer.setRenderTarget(this.raysTarget)
			this.quad.render(renderer)
		}
		this.quad.material = this.material
		renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
		if (this.clear) renderer.clear()
		this.quad.render(renderer)
	}

	dispose() {
		this.raysTarget.dispose()
		this.raysMaterial.dispose()
		this.material.dispose()
		this.quad.dispose()
	}
}

class FinishPass extends Pass {
	constructor({ pauseTaps = 14 } = {}) {
		super()
		this.needsSwap = true
		this.material = new THREE.ShaderMaterial({
			name: 'MinemoriesFinish',
			defines: { PAUSE_TAPS: pauseTaps },
			uniforms: {
				tDiffuse: { value: null },
				uLift: { value: new THREE.Vector3() },
				uGamma: { value: new THREE.Vector3(1, 1, 1) },
				uGain: { value: new THREE.Vector3(1, 1, 1) },
				uSat: { value: 1 },
				uGreenKeep: { value: 0 },
				uContrast: { value: 1 },
				uShadowTint: { value: new THREE.Vector3(1, 1, 1) },
				uHighTint: { value: new THREE.Vector3(1, 1, 1) },
				uPause: { value: 0 },
				uPauseDim: { value: 0.36 },
				uPauseBlur: { value: 0.014 },
				uGrainPx: { value: 1 },
				uVignette: { value: 0.3 },
				uVignetteColor: { value: new THREE.Vector3(0.55, 0.5, 0.58) },
				uGrain: { value: 0.03 },
				uSeed: { value: 0 },
				uResolution: { value: new THREE.Vector2(1, 1) },
			},
			vertexShader: QUAD_VERTEX,
			fragmentShader: FINISH_FRAGMENT,
			depthTest: false,
			depthWrite: false,
		})
		this.quad = new FullScreenQuad(this.material)
	}

	setSize(width, height) {
		this.material.uniforms.uResolution.value.set(width, height)
		// Bigger grain beyond 800 px of height: it stays film grain, not pixel noise.
		this.material.uniforms.uGrainPx.value = Math.max(1, Math.round(height / 800))
	}

	render(renderer, writeBuffer, readBuffer) {
		this.material.uniforms.tDiffuse.value = readBuffer.texture
		renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
		if (this.clear) renderer.clear()
		this.quad.render(renderer)
	}

	dispose() {
		this.material.dispose()
		this.quad.dispose()
	}
}

// ---------------------------------------------------------------------------
// Grading per hour (values in display space)
// ---------------------------------------------------------------------------

const GRADES = {
	day: {
		lift: [0.004, 0.004, 0.012],
		gamma: [1.0, 1.0, 0.99],
		gain: [1.03, 1.0, 0.96],
		sat: 1.12,
		contrast: 1.07,
		white: [1.04, 1.0, 0.94],
		vignette: [0.6, 0.56, 0.56],
		shadow: [0.96, 0.99, 1.04],
		high: [1.03, 1.0, 0.96],
		green: 0,
	},
	// Golden hour: cold shadows (violet-blue), amber highlights, warm facades.
	golden: {
		lift: [0.03, 0.006, 0.035],
		gamma: [1.02, 1.0, 0.97],
		gain: [1.05, 0.99, 0.9],
		sat: 1.2,
		contrast: 1.08,
		white: [1.06, 0.98, 0.88],
		vignette: [0.5, 0.36, 0.42],
		shadow: [0.9, 0.95, 1.1],
		high: [1.08, 1.0, 0.84],
		green: 0,
	},
	// Night: deep blue shadows, glows (fire, panes) warm without turning white.
	night: {
		lift: [0.006, 0.016, 0.045],
		gamma: [0.98, 1.0, 1.04],
		gain: [0.95, 0.98, 1.04],
		sat: 0.9,
		contrast: 1.07,
		white: [0.94, 0.97, 1.06],
		vignette: [0.32, 0.35, 0.5],
		shadow: [0.92, 0.98, 1.1],
		high: [1.02, 1.0, 0.975],
		green: 0.05,
	},
	// Grey dawn: soft, veiled, but not dead: the moss and the spruces keep some green.
	grey: {
		lift: [0.016, 0.02, 0.02],
		gamma: [1, 1.0, 1.0],
		gain: [0.97, 0.99, 0.98],
		sat: 0.76,
		contrast: 0.97,
		white: [0.98, 1.0, 1.0],
		vignette: [0.5, 0.53, 0.55],
		shadow: [0.96, 1.0, 1.01],
		high: [1.0, 1.0, 0.98],
		green: 0.42,
	},
}

/** Weight of the grading profiles according to the sun elevation, the night and the grey dawn (sum = 1). */
export function gradeWeights(elevation, night, grey) {
	const golden = smoothstep(-0.12, 0.03, elevation) * (1 - smoothstep(0.14, 0.38, elevation))
	let w = { day: Math.max(0, 1 - golden - night), golden: golden * (1 - night), night }
	const sum = w.day + w.golden + w.night || 1
	w = { day: w.day / sum, golden: w.golden / sum, night: w.night / sum }
	const g = clamp(grey, 0, 1)
	return { day: w.day * (1 - g), golden: w.golden * (1 - g), night: w.night * (1 - g), grey: g }
}

function blendGrade(weights) {
	const out = { lift: [0, 0, 0], gamma: [0, 0, 0], gain: [0, 0, 0], white: [0, 0, 0], vignette: [0, 0, 0], shadow: [0, 0, 0], high: [0, 0, 0], sat: 0, contrast: 0, green: 0 }
	for (const [name, k] of Object.entries(weights)) {
		if (k <= 0) continue
		const g = GRADES[name]
		for (const key of ['lift', 'gamma', 'gain', 'white', 'vignette', 'shadow', 'high']) for (let i = 0; i < 3; i++) out[key][i] += g[key][i] * k
		out.sat += g.sat * k
		out.contrast += g.contrast * k
		out.green += g.green * k
	}
	return out
}

const ABANDON_WARM = [1.02, 1.005, 0.972]
const ABANDON_COLD = [0.968, 1.0, 1.034]
/** White balance factor of the grading lived in -> abandoned (pure; [1.02; 1.005; 0.972] x strength at 0). */
export function abandonWhite(abandon, strength = 1) {
	const a = clamp(abandon, 0, 1) * strength
	return [0, 1, 2].map((i) => lerp(lerp(1, ABANDON_WARM[i], strength), ABANDON_COLD[i], a))
}

/**
 * v5: what cancels, on the coat of the dog, the cooling of the abandonment (return to the "lived in" white): ratio
 * lived-in white / abandoned white, mixed by `keep` 0..1. Exactly [1, 1, 1] at abandon = 0 (freezes). Pure.
 */
export function keepWhiteFor(abandon, strength = 1, keep = 1) {
	const home = abandonWhite(0, strength)
	const now = abandonWhite(abandon, strength)
	const k = clamp(keep, 0, 1)
	return [0, 1, 2].map((i) => (clamp(abandon, 0, 1) * strength > 0 ? lerp(1, home[i] / now[i], k) : 1))
}

/**
 * Lived in (warm) -> abandoned (cold): shifts the white balance, the saturation and the contrast of `g`
 * (mixed profile) according to `abandon` 0..1, with `strength` = params.abandonGrade. Pure, no effect at abandon = 0.
 */
export function applyAbandon(g, abandon, strength = 1) {
	const a = clamp(abandon, 0, 1) * strength
	// lived in: a breath of warmth; abandoned: cold whites, shadows leaning green-blue, less saturation.
	const coolShadow = [0.97, 1.0, 1.04]
	const white = abandonWhite(abandon, strength)
	for (let i = 0; i < 3; i++) {
		g.white[i] *= white[i]
		g.shadow[i] *= lerp(1, coolShadow[i], a)
	}
	g.sat *= lerp(1 + 0.03 * strength, 0.86, a)
	g.contrast *= lerp(1, 0.96, a)
	return g
}

// ---------------------------------------------------------------------------
// Minecraft-style ambient occlusion (computed once per root, on the CPU)
// ---------------------------------------------------------------------------

function cellCoord(c, n) {
	const nearest = Math.round(c)
	if (Math.abs(c - nearest) < 1e-4 && Math.abs(n) > 0.5) return n > 0 ? nearest - 1 : nearest
	return Math.floor(c)
}

const isOccluderMaterial = (m) => {
	const kind = classifyMaterial(m.name)
	if (kind.wind && kind.wind !== 'leaves') return false
	if (kind.emissive) return false
	const [block = '', texture = ''] = m.name.split(' / ')
	const tex = texture.split('/').pop() || ''
	if (/glass|pane|door|trapdoor|fence|torch|lantern|rail|ladder|carpet|button|pressure|sign|banner|cobweb|chain|bars|candle|flower_pot/.test(tex)) return false
	// Thin decor of the v2 captures (Twigs, Macaw curtains and shutters, planters, tableware, cushions...) and
	// Handcrafted furniture (except counters and cupboards, which are full): no corner shadow on their neighbours.
	if (/pebble|twig|curtain|shutter|flower_box|doormat|crockery|cushion|sheet|cooking_pot|kitchen_hood/.test(tex)) return false
	if (block.startsWith('handcrafted:') && !/counter|cupboard/.test(block)) return false
	return m.transparent !== true || kind.wind === 'leaves'
}

/** Adds a `mmAo` attribute (0.5..1) to the block meshes: corners and wall bases darkened like the smoothing of Minecraft. */
function bakeAo(root) {
	const meshes = []
	root.updateMatrixWorld(true)
	root.traverse((o) => {
		if (o.isMesh && o.geometry?.attributes?.position && !Array.isArray(o.material)) meshes.push(o)
	})
	const solid = new Set()
	const key = (x, y, z) => `${x},${y},${z}`
	const a = new THREE.Vector3()
	const b = new THREE.Vector3()
	const c = new THREE.Vector3()
	const n = new THREE.Vector3()
	const e = new THREE.Vector3()
	const tris = (mesh, cb) => {
		const pos = mesh.geometry.attributes.position
		const index = mesh.geometry.index
		const count = index ? index.count : pos.count
		for (let i = 0; i + 2 < count; i += 3) {
			const ia = index ? index.getX(i) : i
			const ib = index ? index.getX(i + 1) : i + 1
			const ic = index ? index.getX(i + 2) : i + 2
			a.fromBufferAttribute(pos, ia).applyMatrix4(mesh.matrixWorld)
			b.fromBufferAttribute(pos, ib).applyMatrix4(mesh.matrixWorld)
			c.fromBufferAttribute(pos, ic).applyMatrix4(mesh.matrixWorld)
			n.subVectors(b, a).cross(e.subVectors(c, a))
			const length = n.length()
			if (length < 1e-12) continue
			n.divideScalar(length)
			cb(ia, ib, ic)
		}
	}
	const occluders = meshes.filter((m) => isOccluderMaterial(m.material))
	for (const mesh of occluders) {
		const nor = mesh.geometry.attributes.normal
		tris(mesh, (ia) => {
			// Orients the geometric normal like the stored normal (double faces).
			if (nor) {
				e.fromBufferAttribute(nor, ia)
				if (e.dot(n) < 0) n.negate()
			}
			const cx = (a.x + b.x + c.x) / 3
			const cy = (a.y + b.y + c.y) / 3
			const cz = (a.z + b.z + c.z) / 3
			solid.add(key(cellCoord(cx, n.x), cellCoord(cy, n.y), cellCoord(cz, n.z)))
		})
	}
	const LEVELS = [0.4, 0.58, 0.79, 1.0]
	const has = (x, y, z) => (solid.has(key(x, y, z)) ? 1 : 0)
	let baked = 0
	for (const mesh of occluders) {
		const g = mesh.geometry
		if (g.attributes.mmAo) continue
		const pos = g.attributes.position
		const nor = g.attributes.normal
		const ao = new Float32Array(pos.count).fill(1)
		const done = new Uint8Array(pos.count)
		const p = new THREE.Vector3()
		tris(mesh, (ia, ib, ic) => {
			if (nor) {
				e.fromBufferAttribute(nor, ia)
				if (e.dot(n) < 0) n.negate()
			}
			const axis = Math.abs(n.x) > 0.99 ? 0 : Math.abs(n.y) > 0.99 ? 1 : Math.abs(n.z) > 0.99 ? 2 : -1
			if (axis < 0) return
			const cx = (a.x + b.x + c.x) / 3
			const cy = (a.y + b.y + c.y) / 3
			const cz = (a.z + b.z + c.z) / 3
			const cell = [cellCoord(cx, n.x), cellCoord(cy, n.y), cellCoord(cz, n.z)]
			const nn = [Math.round(n.x), Math.round(n.y), Math.round(n.z)]
			const front = [cell[0] + nn[0], cell[1] + nn[1], cell[2] + nn[2]]
			const t1 = (axis + 1) % 3
			const t2 = (axis + 2) % 3
			for (const v of [ia, ib, ic]) {
				if (done[v]) continue
				done[v] = 1
				p.fromBufferAttribute(pos, v).applyMatrix4(mesh.matrixWorld)
				const pv = [p.x, p.y, p.z]
				const centre = [cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5]
				const s1 = pv[t1] > centre[t1] ? 1 : -1
				const s2 = pv[t2] > centre[t2] ? 1 : -1
				const o1 = [...front]
				o1[t1] += s1
				const o2 = [...front]
				o2[t2] += s2
				const o3 = [...front]
				o3[t1] += s1
				o3[t2] += s2
				const side1 = has(...o1)
				const side2 = has(...o2)
				const corner = has(...o3)
				const level = side1 && side2 ? 0 : 3 - (side1 + side2 + corner)
				ao[v] = LEVELS[level]
			}
		})
		g.setAttribute('mmAo', new THREE.BufferAttribute(ao, 1))
		mesh.material.userData.mmAo = true
		baked++
	}
	return baked
}

const AO_VERTEX_PARS = /* glsl */ `
#ifdef MM_AO
attribute float mmAo;
varying float vMmAo;
#endif
`
const AO_VERTEX_MAIN = /* glsl */ `
#ifdef MM_AO
	vMmAo = mmAo;
#endif
`
const AO_FRAGMENT_PARS = /* glsl */ `
#ifdef MM_AO
varying float vMmAo;
#endif
`
const AO_FRAGMENT_MAIN = /* glsl */ `
#include <lights_fragment_end>
#ifdef MM_AO
	reflectedLight.indirectDiffuse *= vMmAo;
	reflectedLight.directDiffuse *= mix( 1.0, vMmAo, 0.5 );
#endif
`

// v12 (brief v12: "the states of the house must dissolve into each other, no dry cut"): the cells that APPEAR at a stage switch (ivy, grass, overgrowth: 83 to 495 cells) carry
// `mmAdd` = 1 on their vertices (scene.js markGrowth); they are drawn through an ordered dither (4 x 4 Bayer on the screen) whose threshold is `uMmGrow` (0 -> 1 over the switch,
// state.growth, pure in the film time). The cells that vanish already fall (buildFalls). No sorting, no transparency: the screen-door dissolve of a Minecraft screen.
const GROW_VERTEX_PARS = /* glsl */ `
attribute float mmAdd;
varying float vMmAdd;
`
const GROW_VERTEX_MAIN = /* glsl */ `
	vMmAdd = mmAdd;
`
const GROW_FRAGMENT_PARS = /* glsl */ `
varying float vMmAdd;
uniform float uMmGrow;
float mmBayer4( vec2 p ) {
	int x = int( mod( floor( p.x ), 4.0 ) );
	int y = int( mod( floor( p.y ), 4.0 ) );
	float m[16] = float[16]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );
	return ( m[ y * 4 + x ] + 0.5 ) / 16.0;
}
`
const GROW_FRAGMENT_MAIN = /* glsl */ `
	if ( vMmAdd > 0.5 && mmBayer4( gl_FragCoord.xy ) >= uMmGrow ) discard;
`

// ---------------------------------------------------------------------------
// v4: forgetting, rewind wave, cold light, lift of the characters (per material)
// ---------------------------------------------------------------------------
// Positions: vMm4View (view space, wind included) -> world of the SCENE through uMm4CamWorld (reference to
// camera.matrixWorld, up to date at render time). vMm4Clip: screen position (NDC after division, correct perspective).
const MM4_VERTEX_PARS = /* glsl */ `
#ifdef MM4
varying vec4 vMm4Clip;
varying vec3 vMm4View;
#endif
`
const MM4_VERTEX_MAIN = /* glsl */ `
#ifdef MM4
	vMm4Clip = gl_Position;
	vMm4View = mvPosition.xyz;
#endif
`
const MM4_FRAGMENT_PARS = /* glsl */ `
#ifdef MM4
uniform float uMm4Forget; // forgetting outside the wave (state.forgetting x params.forget)
uniform vec4 uMm4Focus; // screen focus (NDC x, y), aspect factor, 1 / distance of the farthest corner
uniform vec4 uMm4Shape; // gain, weight of the outskirts, softness, maximum
uniform vec3 uMm4Tint; // cold veil of the grey (luminance 1)
uniform vec4 uMm4Wave; // origin (scene) xyz, radius (blocks)
uniform vec4 uMm4WaveK; // strength of the front, width of the front, active, softness of the lift
uniform vec3 uMm4WaveWarm; // warm gain of the front, per channel
uniform vec2 uMm4Trail; // length of the trail (blocks), additive glow of the front (linear HDR)
uniform vec4 uMm4Cold; // colour (linear), strength
uniform vec4 uMm4Lift; // colour (linear), strength (characters)
uniform mat4 uMm4CamWorld;
uniform vec4 uMm4Warm; // v5: warm tint of the coat (linear, luminance 1), strength
uniform vec3 uMm4KeepWhite; // v5: cancellation of the cold white balance (1 outside the abandonment)
uniform vec4 uMm4Ember; // v5: ember (scene) xyz, strength of its light on the dog
uniform vec4 uMm4EmberColor; // v5: colour (linear), attenuation
uniform vec4 uMm4Rim; // v5: k x gain, glow, width (blocks), veil of the cut faces
uniform vec3 uMm4RimMin; // v5: box of the capture (scene)
uniform vec3 uMm4RimMax;
uniform vec3 uMm4RimColor; // v5: linear
varying vec4 vMm4Clip;
varying vec3 vMm4View;
#endif
`
const MM4_FRAGMENT_MAIN = /* glsl */ `
#ifdef MM4
{
	vec2 mmNdc = vMm4Clip.xy / max( vMm4Clip.w, 1e-5 );
	bool mmWaveOn = uMm4WaveK.z > 0.5;
	if ( uMm4Forget > 0.001 || mmWaveOn ) {
		vec3 mmW = ( uMm4CamWorld * vec4( vMm4View, 1.0 ) ).xyz;
		float mmD = distance( mmW, uMm4Wave.xyz );
#ifndef MM4_KEEP
		if ( uMm4Forget > 0.001 ) {
			// Forgetting front: from the edges of the image (and the outskirts of the zone) toward the ember.
			float mmR = length( ( mmNdc - uMm4Focus.xy ) * vec2( uMm4Focus.z, 1.0 ) ) * uMm4Focus.w;
			float mmE = max( smoothstep( 0.12, 0.95, mmR ), uMm4Shape.y * smoothstep( 6.0, 26.0, mmD ) );
			float mmF = uMm4Forget;
			// Rewind: behind the front of the wave, the forgetting is lifted.
			if ( mmWaveOn ) mmF *= smoothstep( uMm4Wave.w - uMm4WaveK.w, uMm4Wave.w + uMm4WaveK.w, mmD );
			float mmA = clamp( ( mmF * uMm4Shape.x - ( 1.0 - mmE ) * 0.9 ) / uMm4Shape.z, 0.0, 1.0 ) * uMm4Shape.w;
			float mmL = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
			outgoingLight = mix( outgoingLight, uMm4Tint * mmL, mmA );
		}
#endif
		if ( mmWaveOn ) {
			// Warm front and warm trail behind it: the colour comes back while warming. Multiplicative (capped) for
			// the light surfaces, plus a bounded additive glow that underlines the block edges (readable on dark).
			float mmX = ( mmD - uMm4Wave.w ) / uMm4WaveK.y;
			float mmRing = exp( - mmX * mmX );
			float mmTrail = mmD < uMm4Wave.w ? 0.3 * exp( - ( uMm4Wave.w - mmD ) / uMm4Trail.x ) : 0.0;
			vec3 mmGn = normalize( cross( dFdx( mmW ), dFdy( mmW ) ) );
			vec3 mmAn = abs( mmGn );
			vec2 mmFp = mmAn.x > mmAn.y && mmAn.x > mmAn.z ? mmW.yz : ( mmAn.y > mmAn.z ? mmW.xz : mmW.xy );
			vec2 mmEe = abs( fract( mmFp ) - 0.5 ) * 2.0;
			float mmEdge = smoothstep( 0.8, 0.95, max( mmEe.x, mmEe.y ) );
			outgoingLight *= 1.0 + uMm4WaveWarm * ( min( mmRing + mmTrail, 1.0 ) * uMm4WaveK.x );
			outgoingLight += uMm4WaveWarm * ( mmRing * uMm4WaveK.x * uMm4Trail.y * ( 0.45 + 0.55 * mmEdge ) );
		}
	}
#ifdef MM4_WARM
	// v5: the dog stays warm. It escapes the forgetting (MM4_KEEP) and the cold white balance of the abandonment; a
	// cream tint at equal luminance (without whitening, without flash) and the close light of the ember hold it.
	if ( uMm4Warm.w > 0.001 || uMm4Ember.w > 0.001 ) {
		outgoingLight *= uMm4KeepWhite;
		float mmLw = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
		outgoingLight = mix( outgoingLight, uMm4Warm.rgb * mmLw, uMm4Warm.w );
#ifdef MM4_LIT
		if ( uMm4Ember.w > 0.001 ) {
			vec3 mmWe = ( uMm4CamWorld * vec4( vMm4View, 1.0 ) ).xyz;
			vec3 mmTo = uMm4Ember.xyz - mmWe;
			float mmDe = length( mmTo );
			vec3 mmLv = normalize( ( viewMatrix * vec4( mmTo, 0.0 ) ).xyz );
			float mmNe = clamp( dot( normal, mmLv ) * 0.6 + 0.4, 0.0, 1.0 );
			outgoingLight += diffuseColor.rgb * uMm4EmberColor.rgb * ( uMm4Ember.w * mmNe / ( 1.0 + uMm4EmberColor.w * mmDe * mmDe ) );
		}
#endif
	}
#endif
#ifdef MM4_RIM
	if ( uMm4Rim.x > 0.001 ) {
		// v5: outline of the square edge of the capture. Distance to the edge of the box (planes x, z and below); line on the top
		// faces along the edge, faint veil on the cut faces. Derivatives outside any non-uniform branching.
		vec3 mmWr = ( uMm4CamWorld * vec4( vMm4View, 1.0 ) ).xyz;
		vec3 mmGr = normalize( cross( dFdx( mmWr ), dFdy( mmWr ) ) );
		float mmPx = length( fwidth( mmWr ) );
		vec3 mmLo = mmWr - uMm4RimMin;
		vec3 mmHi = uMm4RimMax - mmWr;
		float mmDb = min( min( min( mmLo.x, mmHi.x ), min( mmLo.z, mmHi.z ) ), mmLo.y );
		float mmIn = step( - 0.02, mmDb );
		float mmWd = max( uMm4Rim.z, 1.5 * mmPx );
		float mmTop = smoothstep( 0.55, 0.8, abs( mmGr.y ) ) * ( 1.0 - smoothstep( 0.0, mmWd, mmDb ) );
		float mmWall = ( 1.0 - smoothstep( 0.55, 0.8, abs( mmGr.y ) ) ) * ( 1.0 - smoothstep( 0.0, 0.06, mmDb ) );
		float mmRm = mmIn * max( mmTop, mmWall * uMm4Rim.w );
		outgoingLight += uMm4RimColor * ( uMm4Rim.x * uMm4Rim.y * mmRm );
	}
#endif
#ifdef MM4_LIT
	if ( uMm4Cold.w > 0.001 ) {
		// Cold "real life" light: it comes from the viewer, from below, stronger at the bottom of the frame.
		float mmNl = clamp( ( dot( normal, vec3( 0.0, - 0.24, 0.97 ) ) + 0.25 ) / 1.25, 0.0, 1.0 );
		float mmH = clamp( ( 0.45 - mmNdc.y ) / 1.45, 0.0, 1.0 );
		mmH = mmH * mmH * ( 3.0 - 2.0 * mmH );
		outgoingLight += diffuseColor.rgb * uMm4Cold.rgb * ( uMm4Cold.w * mmNl * ( 0.1 + 0.9 * mmH ) );
	}
#endif
#ifdef MM4_CHAR
	// Diorama: the player and the dog stay readable near the fire.
	if ( uMm4Lift.w > 0.001 ) outgoingLight += diffuseColor.rgb * uMm4Lift.rgb * uMm4Lift.w;
#endif
}
#endif
`

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {THREE.WebGLRenderer} o.renderer
 * @param {THREE.Scene} o.scene
 * @param {THREE.PerspectiveCamera} o.camera
 * @param {'high'|'low'} [o.quality]
 * @param {{ center?: number[], radius?: number }} [o.focus] tight zone of the shadows (scene)
 * @param {number} [o.groundY] ground level for the low mist (scene; -11 = top of the v1 flat at world y -61)
 * @param {number} [o.skyDistance] beyond it, a pixel counts as sky (rays, mist)
 * @param {boolean} [o.ao] occlusion of the block corners (true by default)
 */
export function createLook({ renderer, scene, camera, quality = 'high', focus = {}, groundY = -11, skyDistance = 300, ao = true } = {}) {
	const high = quality !== 'low'
	const params = { ...PARAMS }

	// --- engine ----------------------------------------------------------------
	renderer.outputColorSpace = THREE.SRGBColorSpace
	renderer.toneMapping = params.toneMapping === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping
	renderer.shadowMap.enabled = true
	renderer.shadowMap.type = THREE.PCFShadowMap

	// --- lights (constant number: it enters the key of the programs) -----------
	const center = new THREE.Vector3().fromArray(focus.center ?? [-4, -9, 0])
	let radius = focus.radius ?? 30
	const key = new THREE.DirectionalLight(0xffffff, 0)
	key.name = 'look:sun-moon'
	key.castShadow = true
	key.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024)
	key.shadow.bias = -0.0004
	key.shadow.normalBias = 0.04
	const keyTarget = new THREE.Object3D()
	key.target = keyTarget
	const fill = new THREE.DirectionalLight(0xffb98a, 0)
	fill.name = 'look:bounce'
	const fillTarget = new THREE.Object3D()
	fill.target = fillTarget
	const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x3a3326, 1)
	hemi.name = 'look:sky'
	scene.add(key, keyTarget, fill, fillTarget, hemi)

	function setFocus(c, r) {
		if (c) center.fromArray(Array.isArray(c) ? c : [c.x, c.y, c.z])
		if (Number.isFinite(r)) radius = r
		const cam = key.shadow.camera
		Object.assign(cam, { left: -radius, right: radius, top: radius, bottom: -radius, near: 1, far: radius * 2 + 140 })
		cam.updateProjectionMatrix()
		keyTarget.position.copy(center)
		fillTarget.position.copy(center)
	}
	setFocus()

	const fog = new THREE.FogExp2(0x8899aa, params.fogDensityDay)
	scene.fog = fog

	// --- composer --------------------------------------------------------------
	const size = renderer.getSize(new THREE.Vector2())
	const target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
		type: THREE.HalfFloatType,
		samples: high ? 4 : 0,
		depthTexture: new THREE.DepthTexture(Math.max(1, size.x), Math.max(1, size.y)),
	})
	const composer = new EffectComposer(renderer, target)
	const renderPass = new RenderPass(scene, camera)
	const bloom = new UnrealBloomPass(new THREE.Vector2(size.x || 1, size.y || 1), params.bloomStrengthNight, params.bloomRadius, params.bloomThreshold)
	const lookPass = new LookPass({ samples: high ? 40 : 20, scale: high ? 3 : 4 })
	const outputPass = new OutputPass()
	const finishPass = new FinishPass({ pauseTaps: high ? 14 : 7 })
	composer.addPass(renderPass)
	composer.addPass(bloom)
	composer.addPass(lookPass)
	composer.addPass(outputPass)
	composer.addPass(finishPass)

	function setSize(w, h) {
		if (!w || !h) return
		renderer.setSize(w, h, false)
		// Density ceiling: the composer works in HalfFloat (+ MSAA in high), expensive at DPR 2.
		composer.setPixelRatio(Math.min(renderer.getPixelRatio(), high ? 1.5 : 1))
		composer.setSize(w, h)
	}
	if (size.x && size.y) setSize(size.x, size.y)

	// --- wind and materials -----------------------------------------------------
	const windUniforms = {
		uMmWindTime: { value: 0 },
		uMmWindAmp: { value: 0.6 },
		uMmWindDir: { value: new THREE.Vector2(0.8, -0.6).normalize() },
		uMmAutumn: { value: 0 },
		uMmAutumnColor: { value: new THREE.Color(1, 0.72, 0.16) },
		uMmGrow: { value: 1 }, // v12: threshold of the dissolve of the cells that appear at a stage switch (1 = all drawn)
	}
	// v4: uniforms shared by all the patched materials (forgetting, wave, cold light, lift).
	const mm4Uniforms = {
		uMm4Forget: { value: 0 },
		uMm4Focus: { value: new THREE.Vector4(0, 0, 1, 0.7) },
		uMm4Shape: { value: new THREE.Vector4(1.8, 0.85, 0.5, 0.94) },
		uMm4Tint: { value: new THREE.Vector3(0.93, 1, 1.1) },
		uMm4Wave: { value: new THREE.Vector4() },
		uMm4WaveK: { value: new THREE.Vector4(0, 1.5, 0, 0.5) },
		uMm4WaveWarm: { value: new THREE.Vector3(1, 0.5, 0.14) },
		uMm4Trail: { value: new THREE.Vector2(4, 0.1) },
		uMm4Cold: { value: new THREE.Vector4(0.5, 0.7, 1, 0) },
		uMm4Lift: { value: new THREE.Vector4(1, 0.85, 0.7, 0) },
		uMm4CamWorld: { value: camera.matrixWorld }, // reference: up to date at render time
		// v5
		uMm4Warm: { value: new THREE.Vector4(1, 1, 1, 0) },
		uMm4KeepWhite: { value: new THREE.Vector3(1, 1, 1) },
		uMm4Ember: { value: new THREE.Vector4(0, 0, 0, 0) },
		uMm4EmberColor: { value: new THREE.Vector4(1, 0.42, 0.12, 0.25) },
		uMm4Rim: { value: new THREE.Vector4(0, 0.55, 0.28, 0.12) },
		uMm4RimMin: { value: new THREE.Vector3(-1e4, -1e4, -1e4) },
		uMm4RimMax: { value: new THREE.Vector3(1e4, 1e4, 1e4) },
		uMm4RimColor: { value: new THREE.Vector3(1, 0.4, 0.08) },
	}
	const mm4Done = new WeakSet()
	const mm4Color = new THREE.Color()
	let warmCount = 0 // v5: dog skin materials kept warm (MM4_WARM), read by stats()

	/** Adds the v4 code (forgetting, wave, cold light, lift) to a mesh shader. */
	function editMm4(shader) {
		const v = shader.vertexShader
		const f = shader.fragmentShader
		if (!v.includes('#include <project_vertex>') || !v.includes('void main()') || !f.includes('#include <opaque_fragment>') || !f.includes('void main()')) {
			warnOnce('mm4', 'chunks <project_vertex> or <opaque_fragment> missing: forgetting ignored for a material')
			return
		}
		Object.assign(shader.uniforms, mm4Uniforms)
		shader.vertexShader = v.replace('void main()', `${MM4_VERTEX_PARS}\nvoid main()`).replace('#include <project_vertex>', `#include <project_vertex>\n${MM4_VERTEX_MAIN}`)
		const lit = f.includes('#include <normal_fragment_begin>')
		shader.fragmentShader = `${lit ? '#define MM4_LIT\n' : ''}${f.replace('void main()', `${MM4_FRAGMENT_PARS}\nvoid main()`).replace('#include <opaque_fragment>', `${MM4_FRAGMENT_MAIN}\n#include <opaque_fragment>`)}`
	}

	const sssChunk = lightsChunkWithSss()
	if (!sssChunk) warnOnce('sss', 'directional lights loop not found: no foliage transmission')

	const WIND_CODES = { plant: 1, plantTop: 1, crop: 1, leaves: 2, vine: 3 }
	// Emissive mask per kind (1: warm and light pixels; 2: stove fire); absent = the whole texel emits.
	const EMIMASK = { fire: 1, embers: 1, lantern: 1, stove: 2 }
	const emissives = [] // { material, kind, base }
	const depthMaterials = new Map() // material → { depth, distance }
	const patched = new Set()

	function editVertex(source) {
		if (!source.includes('#include <begin_vertex>') || !source.includes('void main()')) {
			warnOnce('vertex', 'chunk <begin_vertex> missing: wind disabled for a material')
			return source
		}
		return source
			.replace('void main()', `${WIND_VERTEX_PARS}\n${AO_VERTEX_PARS}\n${GROW_VERTEX_PARS}\nvoid main()`)
			.replace('#include <begin_vertex>', `${WIND_VERTEX_MAIN}\n${AO_VERTEX_MAIN}\n${GROW_VERTEX_MAIN}`)
	}

	function editFragment(source, defines) {
		if (!source.includes('void main()')) return source
		let out = source.replace('void main()', `${FRAGMENT_PARS}\n${AO_FRAGMENT_PARS}\n${GROW_FRAGMENT_PARS}\nvoid main()`)
		out = out.replace(/void main\(\)\s*\{/, (m) => `${m}\n${GROW_FRAGMENT_MAIN}`)
		for (const { anchor, code } of FRAGMENT_EDITS) {
			if (out.includes(anchor)) out = out.replace(anchor, `${anchor}\n${code}`)
			else if (anchor !== '#include <emissivemap_fragment>' || 'MM_EMIMASK' in defines) warnOnce(anchor, `chunk ${anchor} missing: addition ignored`)
		}
		if ('MM_SSS' in defines && sssChunk && out.includes('#include <lights_fragment_begin>')) {
			out = out.replace('#include <lights_fragment_begin>', sssChunk)
		}
		if ('MM_AO' in defines && out.includes('#include <lights_fragment_end>')) {
			out = out.replace('#include <lights_fragment_end>', AO_FRAGMENT_MAIN)
		}
		return out
	}

	function installPatch(material, defines, tag) {
		const previous = material.onBeforeCompile
		const hasPrevious = previous && previous !== THREE.Material.prototype.onBeforeCompile
		const previousKey = material.customProgramCacheKey.bind(material)
		material.defines = { ...(material.defines || {}), ...defines }
		material.onBeforeCompile = (shader, r) => {
			if (hasPrevious) previous.call(material, shader, r)
			Object.assign(shader.uniforms, windUniforms)
			shader.vertexShader = editVertex(shader.vertexShader)
			shader.fragmentShader = editFragment(shader.fragmentShader, material.defines)
			if ('MM4' in material.defines) editMm4(shader)
		}
		material.customProgramCacheKey = () => `${hasPrevious ? previousKey() : ''}|mm:${tag}`
		material.needsUpdate = true
	}

	function depthFor(material, defines, tag) {
		if (depthMaterials.has(material)) return depthMaterials.get(material)
		const make = (Ctor) => {
			const m = new Ctor({ side: THREE.DoubleSide, map: material.map, alphaTest: material.alphaTest })
			m.defines = { ...(m.defines || {}), ...defines }
			m.onBeforeCompile = (shader) => {
				Object.assign(shader.uniforms, windUniforms)
				shader.vertexShader = editVertex(shader.vertexShader)
			}
			m.customProgramCacheKey = () => `mm-depth:${tag}`
			return m
		}
		const pair = { depth: make(THREE.MeshDepthMaterial), distance: make(THREE.MeshDistanceMaterial) }
		depthMaterials.set(material, pair)
		return pair
	}

	/** Classifies and patches the materials of a capture (wind, foliage, emissives, occlusion). Idempotent. */
	function patchMaterials(root) {
		if (!root) return { wind: 0, emissive: 0, ao: 0 }
		let aoCount = 0
		if (ao) {
			try {
				aoCount = bakeAo(root)
			} catch (error) {
				warnOnce('ao', `block occlusion ignored (${error.message})`)
			}
		}
		let windCount = 0
		let emissiveCount = 0
		root.traverse((mesh) => {
			if (!mesh.isMesh || Array.isArray(mesh.material)) return
			const material = mesh.material
			const kind = classifyMaterial(material.name)
			// Emissive factor of the capture (block light level) on an unclassified material: bracket of a modded
			// light fixture, etc. It would emit day and night; it is switched off and reported.
			if (!kind.emissive && material.emissiveMap && material.emissive && material.emissive.getHex() !== 0) {
				kind.emissive = 'off'
				warnOnce(`emissive:${material.name}`, `unclassified emissive switched off: ${material.name}`)
			}
			const defines = {}
			let tag = ''
			if (kind.wind) {
				defines.MM_WIND = WIND_CODES[kind.wind]
				defines.MM_BASE = kind.wind === 'plantTop' ? '1.0' : '0.0'
				defines.MM_AMP = WIND_AMP[kind.wind].toFixed(2)
				tag += `w${kind.wind}`
				if (kind.wind === 'plant' || kind.wind === 'plantTop' || kind.wind === 'crop') {
					defines.MM_UPNORMAL = ''
					defines.MM_SSS = '0.55'
				} else if (kind.wind === 'leaves') defines.MM_SSS = '0.4'
				else defines.MM_SSS = '0.3'
				if (!sssChunk) delete defines.MM_SSS
			}
			// Birch: leaves that turn yellow with state.autumn (the material keeps its wind).
			if (kind.wind === 'leaves' && /birch_leaves/.test(material.name)) {
				defines.MM_BIRCH = ''
				tag += 'birch'
			}
			if (EMIMASK[kind.emissive]) {
				defines.MM_EMIMASK = String(EMIMASK[kind.emissive])
				tag += `e${kind.emissive}`
			}
			if (material.userData.mmAo && mesh.geometry.attributes.mmAo) {
				defines.MM_AO = ''
				tag += 'ao'
			}
			// Leaves: alpha-to-coverage (MSAA) to soften the holes where the sky shows through and their flicker in the wind.
			if (kind.wind === 'leaves' && material.alphaTest > 0) material.alphaToCoverage = true
			if (kind.wind) {
				const pair = depthFor(material, { MM_WIND: defines.MM_WIND, MM_BASE: defines.MM_BASE, MM_AMP: defines.MM_AMP }, tag)
				mesh.customDepthMaterial = pair.depth
				mesh.customDistanceMaterial = pair.distance
			}
			if (patched.has(material) || material.userData.mmPatched) return
			if (kind.emissive) {
				const base = {
					fire: params.emissiveFire,
					embers: params.emissiveEmbers,
					lantern: params.emissiveLantern,
					lamp: params.emissiveLamp,
					stove: params.emissiveStove,
					candle: params.emissiveCandle,
					glass: 0,
					off: 0,
				}
				if (!emissives.some((item) => item.material === material)) emissives.push({ material, kind: kind.emissive })
				if (kind.emissive === 'off') material.emissiveIntensity = 0
				else material.emissiveIntensity = base[kind.emissive]
				// Warm tint (linear): without it, ACES whitens the flame.
				const tint = { fire: [1, 0.5, 0.2], embers: [1, 0.42, 0.14], lantern: [1, 0.7, 0.38], stove: [1, 0.5, 0.18], candle: [1, 0.72, 0.42], glass: [1, 0.45, 0.14] }[kind.emissive]
				if (tint && material.emissive) material.emissive.setRGB(tint[0], tint[1], tint[2], THREE.LinearSRGBColorSpace)
				emissiveCount++
			}
			patched.add(material)
			// v4: every capture material receives the forgetting, the wave and the cold light (except mmKeepColor: no forgetting).
			defines.MM4 = ''
			const keep = material.userData.mmKeepColor === true
			if (keep) defines.MM4_KEEP = ''
			defines.MM4_RIM = '' // v5: outline of the capture edge
			tag += keep ? 'v4k' : 'v4'
			material.userData.mmPatched = true
			mm4Done.add(material)
			if (kind.wind) windCount++
			installPatch(material, defines, tag)
		})
		return { wind: windCount, emissive: emissiveCount, ao: aoCount }
	}

	/**
	 * Hands over to look the intensity of an emissive material outside the capture.
	 * kind 'window': MeshBasicMaterial (window cards of main.js) whose colour is carried above the bloom
	 * threshold (base colour x params.window x night); the opacity stays with the caller.
	 * kind 'fire' | 'embers' | 'lantern' | 'lamp': MeshStandardMaterial driven like those of the capture.
	 */
	function registerEmissive(material, kind = 'window') {
		if (!material || emissives.some((item) => item.material === material)) return
		const base = kind === 'window' && material.color ? material.color.clone() : null
		emissives.push({ material, kind, base })
	}

	/**
	 * Contract v4: forgetting (and wave, cold light) on materials outside the capture: characters, decor, copies of the
	 * falling blocks. Light patch (no wind, no occlusion), chained to the existing onBeforeCompile (fade of characters.js).
	 * Excluded from the forgetting: material.userData.mmKeepColor === true (collar, ember). The materials "dog / ..." and
	 * "player / ..." also receive the lift of the diorama. Idempotent; returns the number of patched materials.
	 */
	function registerForgetting(root) {
		if (!root?.traverse) return 0
		let count = 0
		root.traverse((obj) => {
			if (!obj.isMesh) return
			for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) {
				if (!material || mm4Done.has(material)) continue
				if (!(material.isMeshStandardMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial || material.isMeshBasicMaterial || material.isMeshToonMaterial)) continue
				mm4Done.add(material)
				const keep = material.userData?.mmKeepColor === true
				const character = /^(dog|player) \//.test(material.name || '')
				// v5: the skin of the dog (not the collar) stays warm; the outline goes to the falling blocks, not to the decor.
				const warm = keep && /^dog \//.test(material.name || '') && material.userData?.mmRole !== 'collar' && !/collar/.test(material.name || '')
				const rim = !character && !/^backdrop\b/.test(material.name || '')
				const previous = material.onBeforeCompile
				const hasPrevious = previous && previous !== THREE.Material.prototype.onBeforeCompile
				const previousKey = material.customProgramCacheKey.bind(material)
				material.defines = {
					...(material.defines || {}),
					MM4: '',
					...(keep ? { MM4_KEEP: '' } : {}),
					...(character ? { MM4_CHAR: '' } : {}),
					...(warm ? { MM4_WARM: '' } : {}),
					...(rim ? { MM4_RIM: '' } : {}),
				}
				if (warm) warmCount++
				material.onBeforeCompile = (shader, r) => {
					if (hasPrevious) previous.call(material, shader, r)
					editMm4(shader)
				}
				material.customProgramCacheKey = () => `${hasPrevious ? previousKey() : ''}|mm4:${keep ? 'k' : ''}${character ? 'c' : ''}${warm ? 'w' : ''}${rim ? 'r' : ''}`
				material.needsUpdate = true
				count++
			}
		})
		return count
	}

	// --- state -> light ----------------------------------------------------------
	const tmp = new THREE.Vector3()
	const sunDir = new THREE.Vector3(0, 1, 0)
	const moonDir = new THREE.Vector3(0, -1, 0)
	const bodyDir = new THREE.Vector3()
	const sunScreen = { x: 0, y: 0, u: 0.5, v: 0.5, visible: false, onScreen: false, body: 'sun', strength: 0 }
	let last = null
	let lastClock = null
	let lastT = null
	let clockRate = 1

	function readDir(v, out, fallback) {
		if (v?.isVector3) return out.copy(v)
		if (Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)) return out.fromArray(v)
		return out.copy(fallback)
	}

	function update(state = {}) {
		last = state
		const L = state.lighting || {}
		// Fallback v0: lighting.dir points to the visible body (sun if elevation >= 0, otherwise moon).
		const v0Dir = Array.isArray(L.dir) ? (L.elevation >= 0 ? L.dir : L.dir.map((x) => -x)) : null
		readDir(state.sunDir ?? L.sunDir ?? v0Dir, sunDir, new THREE.Vector3(-0.8, 0.2, 0.5)).normalize()
		readDir(state.moonDir ?? L.moonDir, moonDir, tmp.copy(sunDir).negate()).normalize()
		// "Hourly" elevation of the integrator (sin 2*pi*(phase - 0.25)) if given: the course of sky.js compresses
		// the height of the sun (about 0.45 at noon), which would leave the "golden hour" grading on all day.
		const e = finite(L.elevation, sunDir.y)
		const night = finite(state.night, finite(L.night, smoothstep(0.12, -0.15, e)))
		const daylight = finite(state.daylight, 1 - night)
		const grey = clamp(finite(state.grey, 0), 0, 1)
		const fire = clamp(finite(state.fire, 1), 0, 2)
		const clock = finite(state.clock, finite(state.t, 0))
		const stageNow = finite(state.stage, 0)
		// Lived in -> abandoned: continuous field provided by the integrator; fallback on the stage (small amplitude, 4 steps).
		const abandon = clamp(finite(state.abandon, (stageNow / 4) * 0.85), 0, 1)
		// v4: the scene announces contract v4 through the presence of the `wave` field (null or object).
		const v4 = 'wave' in state
		const forgetting = clamp(finite(state.forgetting, 0), 0, 1) * params.forget
		const coldGlow = clamp(finite(state.coldGlow, 0), 0, 1)
		// Diorama: state.display if the scene gives it; otherwise deduced from mistScale (= 1 - 0.75 x display, scene.js v4).
		const display = clamp(finite(state.display, Number.isFinite(state.mistScale) ? (1 - state.mistScale) / 0.75 : 0), 0, 1)
		const presentK = display * params.present
		const gradeW = gradeWeights(e, night, grey)
		// Diorama: half of the "golden hour" goes to day (less all-orange; the fire stays the warm point).
		if (presentK > 0.001) {
			const moved = gradeW.golden * 0.5 * presentK
			gradeW.golden -= moved
			gradeW.day += moved
		}
		const golden = gradeW.golden
		// Flicker of the fire (scene clock, hence frozen in pause); frozen world: the glow breathes (+/- 8 %, 4 s).
		// v7c: same smoothed flicker as life.js (FIRE_FLICKER: 0.7 / 1.2 / 1.5 Hz, +/- 11.5 %); v7b (1.8 to 4.7 Hz, +/- 19 %) made the halo of the fire go 3 times per second from light to dark.
		const flicker = 1 + 0.05 * Math.sin(clock * 4.2) + 0.03 * Math.sin(clock * 7.3 + 1.1) // v12: the 9.6 rad/s term is gone (see life.js FIRE_FLICKER)
		const frozenNow = Boolean(state.frozen)
		const breath = frozenNow ? 1 + params.freezeBreath * Math.sin((Math.PI * 2 * finite(state.breathT, finite(state.t, 0))) / 4) : 1
		const fireFlicker = flicker * breath

		// Intensities (v0 scale), with fallback on the old fields of lightingAt.
		const sunI = finite(L.sunIntensity, L.elevation >= 0 ? finite(L.lightIntensity, NaN) : NaN)
		const moonI = finite(L.moonIntensity, L.elevation < 0 ? finite(L.lightIntensity, NaN) : NaN)
		const sunIntensity = (Number.isFinite(sunI) ? sunI : 2.4 * smoothstep(0, 0.12, e)) * params.sun
		const moonIntensity = (Number.isFinite(moonI) ? moonI : 0.6 * smoothstep(0, 0.2, moonDir.y)) * params.moon
		const sunColor = rgbOr(L.sunColor, e >= 0 ? rgbOr(L.lightColor, [1, 0.72, 0.45]) : [1, 0.72, 0.45])
		const moonRaw = rgbOr(L.moonColor, e < 0 ? rgbOr(L.lightColor, [0.66, 0.72, 1]) : [0.66, 0.72, 1])
		// Moon slightly desaturated: a bold blue turns violet on stone after ACES.
		const moonLum = 0.2126 * moonRaw[0] + 0.7152 * moonRaw[1] + 0.0722 * moonRaw[2]
		const moonColor = moonRaw.map((c) => lerp(c, moonLum, 0.4))
		const useSun = sunIntensity >= moonIntensity || e > 0
		bodyDir.copy(useSun ? sunDir : moonDir)
		const bodyColor = useSun ? sunColor : moonColor
		const keyIntensity = useSun ? sunIntensity : moonIntensity

		// Main light (the only shadow source).
		tmp.copy(bodyDir)
		tmp.y = Math.max(tmp.y, 0.06)
		tmp.normalize()
		key.position.copy(center).addScaledVector(tmp, radius + 60)
		const keyRgb = presentK > 0.001 ? bodyColor.map((c, i) => lerp(c, params.presentKey[i], 0.55 * presentK)) : bodyColor
		key.color.setRGB(keyRgb[0], keyRgb[1], keyRgb[2], THREE.SRGBColorSpace)
		key.intensity = keyIntensity
		key.shadow.intensity = clamp(finite(L.shadow, useSun ? 0.95 : 0.75) * (useSun ? 1.05 : 1), 0, 1) * (1 - 0.4 * grey)
		// Low sun: wider penumbra.
		key.shadow.radius = (high ? 2.5 : 1.5) + (high ? 3.5 : 2) * (1 - smoothstep(0.05, 0.6, Math.abs(tmp.y)))

		// Warm bounce of the ground, opposite to the body.
		fill.position.copy(center).add(tmp.set(-bodyDir.x, 0.35, -bodyDir.z).normalize().multiplyScalar(50))
		const ground = rgbOr(L.hemiGround, [0.29, 0.23, 0.16])
		fill.color.setRGB(lerp(bodyColor[0], ground[0], 0.4), lerp(bodyColor[1], ground[1], 0.4), lerp(bodyColor[2], ground[2], 0.4), THREE.SRGBColorSpace)
		let fillI = keyIntensity * params.fill * (useSun ? 1 : 0.5)
		const fillRgb = [fill.color.r, fill.color.g, fill.color.b] // linear
		// Golden hour: the bounce of the ground becomes a warm backlight that ambers the facade left in the shadow of the roof.
		if (useSun && golden > 0.001) {
			const add = keyIntensity * params.fillGolden * golden
			const warm = new THREE.Color().setRGB(1, 0.6, 0.3, THREE.SRGBColorSpace)
			const k = add / Math.max(fillI + add, 1e-4)
			fillRgb[0] = lerp(fillRgb[0], warm.r, k)
			fillRgb[1] = lerp(fillRgb[1], warm.g, k)
			fillRgb[2] = lerp(fillRgb[2], warm.b, k)
			fillI += add
		}
		// Night: the fire lights the decor on the camera side (it is between the camera and the chalet) and makes it flicker.
		// v9b: `fireBoost` (> 0 only in the celebration of the return, scene.js STORY.v9.return.fireLevel) adds to the fire's share of that fill: the tight shot leaves the flames
		// out of the frame, their warm light still has to reach the dog and Efe. 0 everywhere else: no other frame changes.
		const fireBoost = clamp(finite(state.fireBoost, 0), 0, 2)
		const fireK = (clamp(fire, 0, 1) + params.fireBoostGain * fireBoost) * smoothstep(0.35, 0.9, night) * params.fireFill
		if (fireK > 0.001) {
			const fireWarm = new THREE.Color().setRGB(1, 0.5, 0.2, THREE.SRGBColorSpace)
			const add = fireK * fireFlicker
			const k = add / Math.max(fillI + add, 1e-4)
			fillRgb[0] = lerp(fillRgb[0], fireWarm.r, k)
			fillRgb[1] = lerp(fillRgb[1], fireWarm.g, k)
			fillRgb[2] = lerp(fillRgb[2], fireWarm.b, k)
			fillI += add
			tmp.copy(camera.position).sub(center)
			tmp.y = 0
			if (tmp.lengthSq() > 1e-6) {
				tmp.normalize()
				tmp.y = 0.28
				tmp.normalize()
				fill.position.copy(center).addScaledVector(tmp, 50)
			}
		}
		fill.color.setRGB(fillRgb[0], fillRgb[1], fillRgb[2], THREE.LinearSRGBColorSpace)
		fill.intensity = fillI

		// Sky: coloured hemisphere.
		const zenith = rgbOr(L.zenith, rgbOr(L.hemiSky, rgbOr(L.sky, [0.55, 0.68, 0.85])))
		const hemiSky0 = rgbOr(L.hemiSky, zenith)
		const hemiSky = presentK > 0.001 ? hemiSky0.map((c, i) => lerp(c, params.presentSky[i], 0.5 * presentK)) : hemiSky0
		hemi.color.setRGB(hemiSky[0], hemiSky[1], hemiSky[2], THREE.SRGBColorSpace)
		hemi.groundColor.setRGB(ground[0], ground[1], ground[2], THREE.SRGBColorSpace)
		hemi.intensity = finite(L.hemiIntensity, lerp(1.3, 2.4, daylight)) * params.ambient * clamp(finite(state.ambientGain, 1), 0, 4)

		// Mist.
		const fogRgb = rgbOr(L.fog, rgbOr(L.horizon, rgbOr(L.sky, [0.6, 0.65, 0.7])))
		fog.color.setRGB(fogRgb[0], fogRgb[1], fogRgb[2], THREE.SRGBColorSpace)
		const dawn = smoothstep(-0.12, 0.02, e) * (1 - smoothstep(0.08, 0.3, e)) * (sunDir.x > 0 ? 1 : 0.15)
		fog.density = lerp(lerp(params.fogDensityDay, params.fogDensityNight, night), params.fogDensityDawn, Math.max(dawn, grey * 0.7)) * clamp(finite(state.fogScale, 1), 0, 4)

		// Exposure and tone mapping.
		renderer.toneMapping = params.toneMapping === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping
		// AFK capture: light wave (post) and small exposure pulse at the click.
		// v4: `capture` only carries the rewind wave (read in `wave`); no ring and no pulse here.
		const cap = v4 ? null : state.capture
		const capK = cap && Number.isFinite(cap.k) ? clamp(cap.k, 0, 1) : 0
		const capOn = capK > 0 && capK < 1
		const pulse = capOn ? Math.exp(-(((capK - 0.05) / 0.05) ** 2)) : 0
		renderer.toneMappingExposure = lerp(params.exposureDay, params.exposureNight, night) * lerp(1, 1.08, grey) * 2 ** (params.pulseEV * pulse + clamp(finite(state.exposure, 0) + params.presentEV * display, -3, 3))

		// Bloom.
		bloom.threshold = params.bloomThreshold
		bloom.strength = lerp(params.bloomStrengthDay, params.bloomStrengthNight, night)
		bloom.radius = params.bloomRadius

		// Emissives: fire following state.fire, lanterns stronger at night, panes and lanterns that live a little.
		let ei = 0
		for (const item of emissives) {
			const m = item.material
			const ph = ei++ * 1.913
			if (item.kind === 'fire') m.emissiveIntensity = params.emissiveFire * fire * fireFlicker
			else if (item.kind === 'embers') m.emissiveIntensity = params.emissiveEmbers * fire * (0.85 + 0.15 * flicker) * breath
			else if (item.kind === 'lantern') {
				// Lantern flame: two frequencies, out of phase per material.
				const lf = 1 + 0.035 * Math.sin(clock * 7.3 + ph) + 0.02 * Math.sin(clock * 13.1 + ph * 2.1)
				m.emissiveIntensity = params.emissiveLantern * (0.4 + params.emissiveLanternNight * night) * lf * breath
			} else if (item.kind === 'lamp') m.emissiveIntensity = params.emissiveLamp * (0.5 + 0.5 * night)
			else if (item.kind === 'stove') m.emissiveIntensity = params.emissiveStove * fire * (0.85 + 0.15 * flicker) * breath
			else if (item.kind === 'candle') {
				const cf = 1 + 0.09 * Math.sin(clock * 9.1 + ph) + 0.05 * Math.sin(clock * 21.7 + ph * 1.3)
				m.emissiveIntensity = params.emissiveCandle * fire * (0.5 + 0.5 * night) * cf * breath
			} else if (item.kind === 'glass') {
				// Someone lives behind the pane: slow pulse and furtive dip (a silhouette passing by).
				const gv = 1 + 0.035 * Math.sin(clock * 1.9 + ph) - 0.07 * smoothstep(0.82, 1, Math.sin(clock * 0.43 + ph * 1.7))
				m.emissiveIntensity = params.emissiveGlass * clamp(finite(state.windows, 0), 0, 1) * gv * breath
			} else if (item.kind === 'window') {
				if (item.base) {
					const gv = 1 + 0.03 * Math.sin(clock * 1.9 + ph) - 0.06 * smoothstep(0.82, 1, Math.sin(clock * 0.43 + ph * 1.7))
					m.color.copy(item.base).multiplyScalar(lerp(1, params.window, night) * (night > 0.05 ? gv * breath : 1))
				}
			} else m.emissiveIntensity = 0
		}

		// Wind: time = clock (frozen during the freezes), amplitude reduced when the timelapse runs away.
		const t = finite(state.t, 0)
		if (Number.isFinite(state.clockRate)) clockRate = Math.abs(state.clockRate)
		else if (lastClock !== null && Math.abs(t - lastT) > 1e-4 && Math.abs(t - lastT) < 0.5) {
			clockRate = lerp(clockRate, Math.abs((clock - lastClock) / (t - lastT)), 0.25)
		}
		lastClock = clock
		lastT = t
		const windTime = finite(state.windTime, clock)
		const fast = 1 - 0.9 * smoothstep(3, 12, clockRate)
		windUniforms.uMmWindTime.value = windTime % 3600
		windUniforms.uMmWindAmp.value = (0.25 + 0.75 * clamp(finite(state.wind, 0.5), 0, 1.5)) * fast * params.wind * (state.reducedMotion ? 0.4 : 1)
		if (Array.isArray(state.windDir)) windUniforms.uMmWindDir.value.set(state.windDir[0], state.windDir[1]).normalize()

		// Screen position of the body (sun, otherwise moon).
		camera.updateMatrixWorld()
		const raysBody = e > -0.04 ? 'sun' : 'moon'
		const rb = raysBody === 'sun' ? sunDir : moonDir
		tmp.copy(camera.position).addScaledVector(rb, 1000).project(camera)
		const forward = camera.getWorldDirection(new THREE.Vector3())
		const inFront = forward.dot(rb) > 0
		sunScreen.x = tmp.x
		sunScreen.y = tmp.y
		sunScreen.u = tmp.x * 0.5 + 0.5
		sunScreen.v = tmp.y * 0.5 + 0.5
		sunScreen.body = raysBody
		sunScreen.visible = inFront && rb.y > -0.03
		sunScreen.onScreen = sunScreen.visible && Math.abs(tmp.x) <= 1 && Math.abs(tmp.y) <= 1
		const edge = 1 - smoothstep(1.0, 1.6, Math.max(Math.abs(tmp.x), Math.abs(tmp.y)))
		const low = raysBody === 'sun' ? smoothstep(-0.04, 0.03, e) * (1 - smoothstep(0.32, 0.65, e)) : 0.25 * smoothstep(-0.02, 0.1, moonDir.y)
		sunScreen.strength = sunScreen.visible ? edge * low * (1 - grey) : 0

		// Post: rays, scattering, low mist, grading.
		const U = lookPass.material.uniforms
		U.uProjInv.value.copy(camera.projectionMatrixInverse)
		U.uCamWorld.value.copy(camera.matrixWorld)
		U.uSkyDist.value = Math.min(skyDistance, camera.far * 0.97)
		U.uBodyDir.value.copy(bodyDir)
		const lowSun = useSun ? smoothstep(-0.05, 0.05, e) * (1 - smoothstep(0.25, 0.7, e)) : 0.2 * smoothstep(0, 0.2, moonDir.y)
		const scatterRgb = useSun ? sunColor : moonColor
		U.uScatterColor.value.setRGB(scatterRgb[0], scatterRgb[1], scatterRgb[2], THREE.SRGBColorSpace)
		U.uScatter.value = params.scatter * (useSun ? params.scatterGain : 1) * lowSun * (1 - grey)
		U.uScatterDensity.value = fog.density * 1.1
		U.uMistColor.value.copy(fog.color).lerp(new THREE.Color(1, 1, 1), 0.08)
		U.uMist.value = params.mist * Math.max(dawn, 0.25 * grey, 0.12 * night, params.goldenMist * golden) * clamp(finite(state.mistScale, 1), 0, 4)
		U.uMistHeight.value = params.mistHeight
		U.uGroundY.value = groundY
		U.uRaysOn.value = params.rays * (raysBody === 'sun' ? params.raysGain : 1) * sunScreen.strength
		const raysRgb = raysBody === 'sun' ? sunColor : moonColor
		U.uRaysColor.value.setRGB(raysRgb[0], raysRgb[1], raysRgb[2], THREE.SRGBColorSpace).multiplyScalar(raysBody === 'sun' ? 2.2 : 0.8)
		lookPass.raysMaterial.uniforms.uSunUv.value.set(sunScreen.u, sunScreen.v)

		const g = applyAbandon(blendGrade(gradeW), abandon, params.abandonGrade)
		// v4, forgetting: the grey comes from the materials; the global saturation rises so that the collar and the ember
		// (excluded) stay bold instead of fading with the grey dawn and the "abandoned" grading.
		const forgetK = smoothstep(0, 0.45, forgetting)
		if (forgetK > 0) g.sat = lerp(g.sat, Math.max(g.sat, 1.02), forgetK * params.forgetKeepSat)
		// v4, cold light: switch warm -> cold of the white balance and of the highlights.
		const coldK = coldGlow * params.coldGrade
		if (coldK > 0) {
			const coldWhite = [0.93, 0.985, 1.08]
			const coldHigh = [0.97, 1.0, 1.04]
			for (let i = 0; i < 3; i++) {
				g.white[i] *= lerp(1, coldWhite[i], coldK)
				g.high[i] = lerp(g.high[i], coldHigh[i], coldK)
			}
		}
		U.uWhite.value.fromArray(g.white)
		const F = finishPass.material.uniforms
		F.uLift.value.fromArray(g.lift)
		F.uGamma.value.fromArray(g.gamma)
		F.uGain.value.fromArray(g.gain)
		F.uSat.value = g.sat
		F.uGreenKeep.value = g.green * params.greenKeep * (1 - forgetK)
		F.uContrast.value = g.contrast
		for (let i = 0; i < 3; i++) {
			F.uShadowTint.value.setComponent(i, 1 + (g.shadow[i] - 1) * params.splitTone)
			F.uHighTint.value.setComponent(i, 1 + (g.high[i] - 1) * params.splitTone)
		}
		F.uVignette.value = params.vignette
		F.uVignetteColor.value.fromArray(g.vignette)
		F.uGrain.value = params.grain * params.grainScale
		const freezeElapsed = state.freezeFrame && Number.isFinite(state.freezeFrame.at) ? state.freezeFrame.at : null
		F.uSeed.value = freezeElapsed !== null ? 37.7 + ((freezeElapsed * 7.13) % 50) : (finite(state.t, 0) * 7.13) % 100
		F.uPause.value = clamp(finite(state.pause, 0), 0, 1)
		F.uPauseDim.value = params.pauseDim
		F.uPauseBlur.value = params.pauseBlur

		// Snow and autumn (calendar of the integrator: state.snow, state.autumn).
		U.uSnow.value = clamp(finite(state.snow, 0), 0, 1)
		U.uSnowColor.value.setRGB(params.snowColor[0], params.snowColor[1], params.snowColor[2], THREE.SRGBColorSpace)
		windUniforms.uMmAutumn.value = clamp(finite(state.autumn, 0), 0, 1)
		windUniforms.uMmGrow.value = clamp(finite(state.growth, 1), 0, 1)
		windUniforms.uMmAutumnColor.value.setRGB(params.autumnColor[0], params.autumnColor[1], params.autumnColor[2], THREE.SRGBColorSpace)

		// v4: forgetting (focus = ember projected on screen), rewind wave, cold light, lift of the characters.
		const M = mm4Uniforms
		M.uMm4Forget.value = forgetting
		const sp = state.ember?.scenePos
		let fx = 0
		let fy = -0.1
		if (Array.isArray(sp) && sp.length >= 3 && sp.every(Number.isFinite)) {
			tmp.fromArray(sp).project(camera)
			if (tmp.z < 1 && Number.isFinite(tmp.x) && Number.isFinite(tmp.y)) {
				fx = clamp(tmp.x, -0.6, 0.6)
				fy = clamp(tmp.y, -0.6, 0.6)
			}
		}
		const ax = lerp(1, camera.aspect || 1, clamp(params.forgetRound, 0, 1))
		const far = Math.max(Math.hypot((1 + Math.abs(fx)) * ax, 1 + Math.abs(fy)), 1e-3)
		M.uMm4Focus.value.set(fx, fy, ax, 1 / far)
		M.uMm4Shape.value.set(params.forgetGain, params.forgetWorld, Math.max(params.forgetSoft, 0.05), clamp(params.forgetMax, 0, 1))
		const tint = params.forgetTint
		const tl = 0.2126 * tint[0] + 0.7152 * tint[1] + 0.0722 * tint[2] || 1
		M.uMm4Tint.value.set(tint[0] / tl, tint[1] / tl, tint[2] / tl)
		const wave = state.wave
		const wo = wave?.sceneOrigin ?? sp // SCENE coordinates (wave.origin is in world)
		if (wave && Array.isArray(wo) && wo.length >= 3 && Number.isFinite(wave.radius)) {
			const R = Math.max(0, wave.radius)
			const p = clamp(finite(wave.progress, 0), 0, 1)
			M.uMm4Wave.value.set(wo[0], wo[1], wo[2], R)
			// Front: strength x gain; width 1.2 -> 2.5 blocks; soft lift of the forgetting of +/- 0.4 -> 2 blocks (no jump at birth).
			M.uMm4WaveK.value.set(clamp(finite(wave.strength, 1), 0, 1) * params.waveGain, 1.2 + 1.3 * p, 1, clamp(0.4 + 0.25 * R, 0.4, 2))
			M.uMm4WaveWarm.value.fromArray(params.waveWarm)
			M.uMm4Trail.value.set(params.waveTrailLen, params.waveGlow)
		} else {
			M.uMm4WaveK.value.set(0, 1.5, 0, 0.5)
			if (Array.isArray(sp) && sp.length >= 3) M.uMm4Wave.value.set(sp[0], sp[1], sp[2], 0)
		}
		// v5: cold screen glow (variant): slow flicker barely perceptible (0.7 and 1.9 Hz, +/- 4 %: not a flash).
		const shimmer = coldGlow > 0 ? 1 + params.coldShimmer * (0.7 * Math.sin(2 * Math.PI * 0.7 * clock) + 0.3 * Math.sin(2 * Math.PI * 1.9 * clock + 1.3)) : 1
		const cc = mm4Color.setRGB(...params.coldLightColor, THREE.SRGBColorSpace)
		M.uMm4Cold.value.set(cc.r, cc.g, cc.b, params.coldLight * coldGlow * shimmer)
		const lc = cc.setRGB(...params.charLiftColor, THREE.SRGBColorSpace)
		M.uMm4Lift.value.set(lc.r, lc.g, lc.b, params.charLift * display)

		// v5: the dog stays warm during the forgetting (cream tint at equal luminance, "lived in" white balance), and the
		// ember lights it from close when the fire is dead (x2 at the memory with ember.lightGain). 0 at both freezes.
		const freezeNow = Boolean(state.freezeFrame)
		const warmK = freezeNow ? 0 : clamp(params.dogKeep, 0, 1) * Math.max(smoothstep(0, 0.4, forgetting), clamp(finite(state.dogCoat, 0), 0, 1))
		const kt = params.dogKeepTint
		const wc = mm4Color.setRGB(kt[0], kt[1], kt[2], THREE.SRGBColorSpace)
		const wl = 0.2126 * wc.r + 0.7152 * wc.g + 0.0722 * wc.b || 1
		M.uMm4Warm.value.set(wc.r / wl, wc.g / wl, wc.b / wl, warmK)
		const kw = freezeNow ? [1, 1, 1] : keepWhiteFor(abandon, params.abandonGrade, params.dogKeepWhite)
		M.uMm4KeepWhite.value.set(kw[0], kw[1], kw[2])
		const em = state.ember
		const emberOn = !freezeNow && em && Array.isArray(sp) && sp.length >= 3 && sp.every(Number.isFinite) && em.born !== false
		const deadFire = 1 - smoothstep(0, 0.5, fire)
		// Only during the forgetting: at the first morning (19.6 s in v7 time), the fallback glow of the scene is enough (coat already C* 31).
		const emberK = emberOn ? params.dogEmber * clamp(finite(em.strength, 0), 0, 1) * clamp(finite(em.lightGain, 1), 0, 3) * deadFire * smoothstep(0, 0.4, forgetting) : 0
		if (emberOn) M.uMm4Ember.value.set(sp[0], sp[1], sp[2], emberK)
		else M.uMm4Ember.value.w = 0
		M.uMm4EmberColor.value.w = Math.max(0, params.dogEmberFall)

		// v5: outline of the square edge of the capture (state.rim, box in scene coordinates).
		const rimS = state.rim
		const rimK = rimS && Array.isArray(rimS.sceneMin) && Array.isArray(rimS.sceneMax) ? clamp(finite(rimS.k, 0), 0, 1) * params.rim : 0
		if (rimK > 0.001) {
			M.uMm4RimMin.value.fromArray(rimS.sceneMin)
			M.uMm4RimMax.value.fromArray(rimS.sceneMax)
			M.uMm4Rim.value.set(rimK, params.rimGlow, params.rimWidth, params.rimWall)
			const rc = mm4Color.setRGB(...params.rimColor, THREE.SRGBColorSpace)
			M.uMm4RimColor.value.set(rc.r, rc.g, rc.b)
		} else M.uMm4Rim.value.x = 0

		// Capture wave: ring leaving the player (centre in scene coordinates), max radius about 32 blocks.
		if (capOn) {
			const R = finite(cap.radius, 32)
			const c0 = cap.center
			if (c0?.isVector3) U.uWaveCenter.value.copy(c0)
			else if (Array.isArray(c0) && c0.length >= 3) U.uWaveCenter.value.fromArray(c0)
			const env = smoothstep(0, 0.1, capK) * (1 - smoothstep(0.72, 1, capK))
			U.uWave.value.set(capK * R * 1.12, 0.8 + 1.0 * capK, params.waveStrength * env, 6 + 6 * capK)
			U.uWaveColor.value.setRGB(params.waveColor[0], params.waveColor[1], params.waveColor[2], THREE.SRGBColorSpace)
			U.uWaveTrail.value = params.waveTrail
		} else U.uWave.value.z = 0
	}

	function render(state) {
		// Always update: the integrator may reuse the same state object from one frame to the next.
		if (state) update(state)
		else if (!last) update({})
		composer.render()
	}

	function dispose() {
		scene.remove(key, keyTarget, fill, fillTarget, hemi)
		key.dispose?.()
		fill.dispose?.()
		hemi.dispose?.()
		key.shadow.map?.dispose()
		for (const pass of composer.passes) pass.dispose?.()
		composer.dispose?.()
		target.depthTexture?.dispose()
		target.dispose()
		for (const { depth, distance } of depthMaterials.values()) {
			depth.dispose()
			distance.dispose()
		}
		depthMaterials.clear()
		if (scene.fog === fog) scene.fog = null
	}

	return {
		render,
		update,
		setSize,
		setFocus,
		patchMaterials,
		registerEmissive,
		registerForgetting,
		lights: { key, sun: key, moon: key, fill, hemi },
		sunScreen,
		params,
		composer,
		bloom,
		features: new Set(['pause', 'captureWave', 'wave', 'forgetting', 'coldLight', 'charLift', 'captureRim', 'dogKeepWarm']),
		stats: () => ({ dogKeepWarm: warmCount }),
		dispose,
	}
}
