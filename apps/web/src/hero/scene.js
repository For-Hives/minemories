// Minemories, hero of the landing: the chalet scene as a Three.js component (v5, "You told him stay"; v4,
// "The kept evening").
// NOTE: the dated comments of the earlier passes (v4 to v8) quote the story times of their own version; the film times of v9 are in TIMELINE and HOST-API.md section 23.
// This module creates no text and no interface element: no button, no caption, no error banner. The host
// composes its page around it (HTML/CSS) thanks to the API of `mount()`: playback, scrub, scroll-driven progress,
// named events at the moments of the story (enter/exit in both directions), screen anchors of the subject (dog, player,
// fire, ember, chalet, free sky) and subject offset. Full contract: HOST-API.md.
//
// All the visible state is a pure function of the story time t (sceneState), which allows scrub and scroll.
// The positions of the story are in WORLD coordinates; scene space = world - capture origin (S0.json).
// Captures: ../captures-v2-light/ by default (v2 compressed with meshopt), otherwise ../captures-v2/, otherwise ../captures-v1/;
// the `captures` option ('v0' | 'v1' | 'v2' | 'v2light') forces a version.
// Modules (MODULES.md): sky.js, look.js, life.js, characters.js, backdrop.js, loaded separately: if one of them
// fails, the scene goes on without it (`warning` event).
//
// Story v4 (../hero/bible-narrative-v4.md section 6), 45 s in five parts: the evening (0 -> 11.5), the departure (-> 16.3),
// the absence (-> 31), the memory (-> 37.5), the kept world (-> 45). The witness frame (`witness` shot, exact frame of
// the instant captured at 10.5 s) comes back four times: the evening, the empty bench, the ruin, the return. The freezes of 10.5 s and
// 36.7 s give the same image (same camera, same poses, same ember, same frozen flames): it is "this moment,
// kept", neither "he came back" nor "a dream".
//
// Story v5 (../hero/brief-v5.md, "You told him stay"): three ideas, no effort. 1) We leave, the animal stays and
// waits: it raises its head toward the moon ("it is late"), "stay", a last look while leaving, then no more black:
// the dog alone, hard cut on the spot (16.3 s), the house falls asleep, the sun rises THREE times over the empty bench
// (witness frame fixed until 22 s); the dog stays SITTING the whole absence (variant dogSits). 2) Without you, a world
// dies: the seasons and the years (close tripod), the image fades, except the dog and the ember. 3) Minemories kept
// that evening: the ember brightens, the gaze of the dog points to it, its glow warms him, the wave leaves it; the
// player comes back sitting like a memory (warm silhouette that fills in); the outline of the square edge of the capture
// announces the diorama. The two freezes stay identical at the pixel (no v5 field differs there).
//
// =================================================================================================================
// CONTRACT V5 (additions to contract v4; detail, times and fallback: HOST-API.md, section "Contract v5")
// =================================================================================================================
//   state.ember.lightGain   >= 1: gain of the glow carried by the ember (life.js, option emberLight): 1; 2 from 32.0
//                           to 33.0 s (ramp 31.3 -> 32.0, back to 1 at 34.0); 1 at the freezes. Ignored: constant glow.
//   state.rim = { k, min, max, sceneMin, sceneMax }: outline of the square edge of the capture (look.js or backdrop.js,
//                           feature 'captureRim'); k 0 until 37.1 s, 0.35 at 38.0, 1 from 39.6 to 40.9 (edge entered the frame), 0.3 from 41.9;
//                           box = captureBounds of S0.json (world; scene). Ignored: no outline (no fallback).
//   state.variant.dogSits   v5, default true (v9: always true). state.coldGlow: 0 by default (variant coldGlow off since v5).
//   Pose of the dog: glow (includes the warm fallback warm x TIMELINE.dogWarm.gain, 0 at the freezes), glowTint [r, g, b]
//                           (TIMELINE.dogWarm.tint, present when the warm glow dominates; characters.js, feature
//                           'glowTint': emissive tinted instead of the colour of the texture; as long as it does not announce
//                           it, the scene sets the tint on the emissive of the skin after update()), warm (0..1, indicative),
//                           breath, sad, wait (<= 0.35), rest 0, alert, lookUp, tilt, earTwitch (existing layers).
//                           The skin of the dog is marked userData.mmKeepColor (excluded from the forgetting, like the collar).
//   Pose of the player: fade (v8b: 0 during the rewind, then 1 at once: Efe reappears on the bench as he
//                           disappeared; no more golden silhouette, memoryGlow stays 0 and glowTint absent); from the end of the rewind,
//                           sitting pose of the captured instant.
//   Moments: mornings (starred), dogWaits (starred); dogLiesDown was removed in v9
//                           (the v4 variant dogSits: false is no longer supported).
//   Dates for the host: STORY.card (browser card), STORY.lastLook, STORY.mornings,
//                           TIMELINE.lapse.mornings (sunrises), STORY.rewindLand.
//   Development: controller.debug.hideDog(bool) / hidePlayer(bool) (differential mask, shadow kept).
//
// =================================================================================================================
// CONTRACT V4 (ember, forgetting, wave, cold glow). Detail, times and examples: HOST-API.md, section "Contract v4".
// =================================================================================================================
// Pure states in t, exported (emberAt, forgettingAt, waveAt, coldGlowAt, freezeFrameAt) and gathered in
// sceneState(t, { variant }) with WORLD positions. The scene copies them into the shared `state` passed to
// update(state) of sky.js, look.js, life.js and backdrop.js, and to characters.js (actorState, same object, `t` =
// clock of the characters). Positions: `pos` / `origin` in WORLD (as requested), `scenePos` / `sceneOrigin` in
// SCENE coordinates (world - capture origin, the space of the Three.js objects).
//
//   state.ember = { pos, scenePos, strength, suspended, pulse, born }
//       pos [x,y,z] world, scenePos [x,y,z] scene: the ember suspended above the fire (TIMELINE.world.ember).
//       strength 0..1: brightness; 0 before the freeze of the capture, 1 at the freeze (10.5 s), 0.7 "discreet" during the absence,
//                       1 at the memory and until the final freeze, then absorbed into the fire during the diorama.
//       suspended bool: motionless in the air (from its birth to its absorption); the other sparks rise.
//       pulse 0..1    : brightening envelope (memory 31 -> 31.5 s; start of the wave 32.5 s).
//       born bool     : t >= captured instant.
//   state.forgetting = 0..1 (0 if the `forgetting` variant is off)
//       Global forgetting: the colour withdraws from the image through the edges. 0 until 19.5 s, 0.40 at 24 s, 0.45 at 25.5 s,
//       0.75 from 28 to 32.5 s, then back to 0 at the pace of the wave (35.5 s). Keep their colour: the materials
//       marked `material.userData.mmKeepColor === true` (collar of the dog, ember; the scene marks them).
//       To be applied PER MATERIAL (uniform injected by look.patchMaterials for the captures; look.registerForgetting
//       (root), optional, which the scene calls for the characters and the decor), never as a full-screen post effect.
//   state.wave = { origin, sceneOrigin, radius, maxRadius, progress, strength } | null
//       The warm wave of the rewind (32.5 -> 35.5 s), born from the ember (origin = state.ember.pos, world; sceneOrigin =
//       state.ember.scenePos). radius in blocks
//       (0 -> maxRadius = 34, slow start); behind the front (distance to origin < radius) the world is restored:
//       advised local forgetting = forgetting x smoothstep(radius - 2, radius + 2, distance).
//   The sky (dome of sky.js and mist) is desaturated by the scene itself (state.lighting.zenith, horizon, sky, fog),
//   at equal luminance, at the rate of state.forgetting: sky.js has nothing to do.
//   state.coldGlow = 0..1 (0 if the `coldGlow` variant is off)
//       Cold "real life" glow rising from the bottom of the image (11.6 -> 14.3 s, goes out with the pause). The
//       scene draws it itself (VeilPass); given for a module that would like to cool the light.
//   state.freezeFrame = { k, at } | null: freeze of the capture (10.5 -> 10.9 s) and final freeze (36.7 s ->); at = seconds since
//       the start of the freeze. The scene sets +0.1 EV there (state.exposure) and the breathing of the fire (state.breath, breathT).
//   state.variant = { coldGlow, forgetting, afk, dawnSwish, walkOut, dawnHead, dogSits }: options of mount() and setVariant() (decisions to
//       make). The settings of the modules to decide go through the option `tune: { look, life, sky }`.
//   state.display = 0..1: presentation of the diorama (look.js: presentation light, lift of the characters).
//   state.particleClock: clock of the particles of life.js = clock of the band (goes backward at the rewind).
//   Pose of the dog (characters.js): `gaze` = 'player' | 'seat' | 'door' | 'ember' | 'visitor' | null (direction of the gaze, indicative),
//       and the layers v4 of characters.js: lookUp, wagAmp, tailBeat, eager, obey, restless, swish, headUp, glow.
//   Pose of the player: clip 'stay' ("stay", 13.05 -> 13.6 s), glow.
//
// A single owner per effect (`features` of the modules): life.js 'ember' turns off the fallback ember; look.js 'wave'
// turns off the fallback wave of VeilPass; look.js 'charLift' turns off the `glow` of the characters; look.js 'coldLight' lights
// the world in cold, the scene keeps the screen gradient (VeilPass, uCold). The scene itself desaturates the sky, the
// mist, the sun, its halo, the twilight glow and the clouds at the forgetting (equal luminance).
//
// Backward compatibility: a module that ignores these fields breaks nothing. The scene draws a fallback ember (sprite
// HDR at constant screen size, readable without bloom) as long as life.js does not announce `features` containing 'ember';
// the wave also goes through the old channel `state.capture` ({ k, center, radius }, the "captureWave" wave of look.js v3),
// centred on the ember, during the rewind only. The v3 stylisations of the capture (camera icon,
// cell bar, flash, capture wave) are removed.

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { ConvexHull } from 'three/addons/math/ConvexHull.js'
// v11 (animation pass): pure curve tools (named eases, key tracks, closed-form springs). No state: the film stays a pure function of time.
import { EASE, track, springKick, springStep, window4, smooth as smoothQuintic } from './anim/curves.js'

// ---------------------------------------------------------------------------
// TIMELINE: all the dates (seconds) and all the settings of the story.
// The moments of the story (BEATS) are derived from `story` further down, after the computation of the scroll (LAPSE).
// ---------------------------------------------------------------------------

export const TIMELINE = {
	duration: 45,
	originFallback: [99, -51, 99],

	// World landmarks common to all versions: ground, fire, bench, door, reference camera (and, further down, the
	// paths of the characters). What follows the captured chalet is in `landmarks`.
	world: {
		surfaceY: -60, // top of the ground of the clearing
		fire: [91.5, -60, 105.5],
		// Suspended ember (contract v4): above the west edge of the fire, 2 blocks above the ground, next to the column
		// of sparks (which the wind pushes toward the right of the frame) to stand out from it at the freeze; in front of the dark hedge.
		// Same world position in all the shots (witness frame about 0.52 x 0.45 of the image, tripod, diorama).
		ember: [90.85, -57.95, 105.7],
		// Place of the lying dog (v4 `dogLiesDown`, no longer used): the place of the player, at the foot of the bench, facing the fire like his master
		// (toward its north side: >= 60 deg from the camera in the tripod as in the witness frame). The bible said "muzzle
		// toward the bench": the ember would then be behind its back at the memory (impossible gaze).
		dogRest: { at: [89.35, 106.45], face: [91.4, 104.4] }, // [x, z] world
		// Bench handcrafted:spruce_bench measured in captures-v2/S0.glb: x 87.9..89, z 105..107, cushion at y -59.25
		// (0.75 above the ground), backrest on the west side (it looks east, +x). `seat` = ground position of the sitting
		// player (clip 'sit' of characters.js, seat `seatHeight`), `front` = where he stands in front of the bench.
		bench: { seat: [88.5, -60, 106.3], seatHeight: 0.75, front: [89.4, 106.4], yaw: Math.PI / 2, head: [88.55, -58.25, 106.3] },
		// Front door (mcwdoors, x 93..94, z 97.8..98): what the dog looks at while waiting.
		door: [93.5, -58.2, 97.9],
		// Reference camera (wide shot): it also serves as the reference of the course of the sun and the moon (skyBasis).
		camera: { eye: [105.5, -57.4, 114.5], target: [93, -54.5, 99], fov: 50 },
		// Shots (world). `wide`: the opening poster (first frame); `hearth`: tight on the fire when the player feeds it;
		// `witness`: the WITNESS FRAME, exact frame of the captured instant (10.5 s), seen four times (the evening, the empty
		// bench, the ruin, the return); `witnessWide`: the same, pulled back by 9 % (slow pushes toward the witness);
		// `witnessGaze`: the witness whose aim follows the gaze of the dog toward the ember (memory); `tripod`: the whole chalet
		// during the scroll; `diorama`: back crane outside the captured zone (the capture becomes an object).
		// A shot may carry its `portrait` variant ({ eye, target, fov }), used under `portrait.below` instead of
		// the aim pulled generically.
		// Witness frame chosen by computation (renders-v4/recit): 7.5 blocks from the bench (13.8 for `couple` in v3), the player
		// sitting about 30 % of the image height (projected box), the sitting dog about 22 %, lying about 14 %; the fire, the ember,
		// the door and the porch in the frame; the roof leaves it (accepted). The gaze of the dog lying toward the ember makes
		// about 67 deg with the direction of the camera (rule: >= 60 deg).
		shots: {
			wide: { eye: [105.5, -57.4, 114.5], target: [93, -54.5, 99] },
			hearth: { eye: [97.05, -57.6, 111.0], target: [91.3, -58.5, 106.1] },
			couple: { eye: [101.0, -57.8, 112.1], target: [91.6, -56.2, 101.6] },
			witness: {
				eye: [95.02, -57.9, 110.95],
				target: [90.2, -58.35, 105.2],
				// Portrait: the bench, fire and dog column, the roof in the sky zone (boxes: player about 17 %, sitting dog
				// about 11 %, lying about 8 %). Eye pulled back into the clear corridor (rays toward the head, the dog, the fire, the ember
				// and the door free in S0 and S4; at [94, -57.4, 114.4], the eye was inside a spruce).
				portrait: { eye: [97.3, -57.3, 113.6], target: [90.2, -57.0, 105.9], fov: 60 },
			},
			witnessWide: {
				eye: [95.45, -57.86, 111.47],
				target: [90.2, -58.35, 105.2],
				portrait: { eye: [97.94, -57.33, 114.29], target: [90.2, -57.0, 105.9], fov: 60 },
			},
			witnessGaze: {
				eye: [95.02, -57.9, 110.95],
				target: [90.66, -58.2, 105.3],
				portrait: { eye: [97.3, -57.3, 113.6], target: [90.45, -56.95, 105.82], fov: 60 },
			},
			// v5 (brief b3): CLOSER tripod. In v4 ([104.3; -57.3; 113.8] -> [91.8; -55.2; 100.2]), the dog only
			// covered 0.09 to 0.21 % of the image ("a white spot on the left"). The eye advances along the eye -> dog axis and
			// aims between the bench and the porch; the roof may leave the frame from S0 to S2, the fall S3 -> S4 must stay in it.
			// `tripodV4` keeps the old frame (comparison, fallback). Chosen by projection (../renders-v5/recit/outils/
			// frame.mjs): eye advanced by 40 % toward the dog, on the path of the arrival (clear), field of 54 deg; box of the dog
			// x1.64 in width and x2.6 in area compared to v4, 88 % of the blocks of the fall S3 -> S4 and 99 % of those of the
			// roof in the frame (16:9).
			// Portrait: the dog and the chalet are side by side (>= 30 deg apart seen from the south-east, the horizontal field of the
			// phone only has about 30 deg); the portrait keeps the whole dog (dog, bench, ember column, like the portrait
			// witness, pulled back by 1.6 blocks on the path, clear; at 116 the eye was inside a spruce): without it, the dog left the frame
			// on the left (render 22.5 and 26.5 s).
			// v12b (independent control, P1-1): the portrait variant of the tripod is now HOUSE FIRST. The v8 portrait frame (dog, bench, ember, eye [97.3, -57.3, 113.6], 60 deg) showed 3 % of the chalet at
			// 390 x 844 and 24 % at 820 x 1180 (renders-v12/tests/portrait-fall-v12b.mjs), so the house falling of 31.4 to 39.4 s was out of the image on a phone. The phone horizontal field (about 30 deg at 60 deg
			// vertical) cannot hold the dog and the chalet, which are >= 30 deg apart: a clear eye further back and to the east (checked by rays, renders-v12/tests/clear-eye12b.cjs: dog, bench and house seen through no
			// tree) with a wider field (76 deg vertical, about 40 deg horizontal at 390 x 844) holds 96 to 100 % of the chalet; the dog leaves the image from the cut of 26.1 s to the push of 40.83 s, which
			// brings it back (witnessGaze, portrait variant unchanged). Candidate that keeps the dog (eye [108, -56, 120], aim [95, -57, 102], 84 deg: dog 4 % of the height, house small): not chosen.
			// The 820 x 1180 canvas blends the two frames (aspect 0.85 -> 0.6, see `portrait.below`); 1440 x 900 and wider keep the tripod above.
			// v8 (control pass): the portrait eye goes from [97.9; -57.4; 115.0] to [97.3; -57.3; 113.6] (that of the portrait witness frame, also clear in S1 to S3): at 390 x 844 from 28.8 to 35 s, a spruce passed in front of the camera
			// and a block of black foliage ate the top left corner, under "Without you..." and "You told him stay". Only the portrait framing (< 0.85) changes: 820 x 1180 feels it
			// by half (mix of the two eyes), the 16:9 and the freezes (witness frame) not at all.
			tripod: { eye: [98.44, -58.18, 111.4], target: [90.5, -57.0, 101.5], fov: 54, portrait: { eye: [105, -56, 117], target: [95, -55, 99], fov: 76 } },
			tripodV4: { eye: [104.3, -57.3, 113.8], target: [91.8, -55.2, 100.2] },
			// Higher crane (about 30 deg above the horizon): the capture is seen as a block of world set on the page
			// (top, south slice of earth), the clearing and the chalet above the trees of the south-east corner.
			diorama: { eye: [127, -30, 137], target: [95.5, -57.5, 101] },
		},
		// Portrait framing (width/height ratio < `below`): widened vertical field and aim pulled toward the couple
		// (dog, fire, bench). Not checked by capture at 390 x 844.
		// The aim only slides toward the couple from `sit`: during the arrival, the portrait frames the house (pullRamp,
		// story seconds); it comes back to the centre during the diorama (pullRelease, relative to the start of `diorama`).
		// The shots that have their `portrait` variant (witness frame) do not receive this pulled aim.
		portrait: { below: 0.85, fov: 60, pull: 0.75, back: 0.12, focus: [89.9, -58.6, 106.5], pullRamp: [4.6, 6.6], pullRelease: [0.3, 2.6] },
	},

	// Landmarks that follow the captured chalet, per version of the captures (landmarksFor: v0 and v1 have the same chalet,
	// at the same world coordinates; v2 is the alpine chalet of datapack-v2, see its README, "Landmarks for the page").
	// - windows: glow cards placed just behind the pane, interior side; `at` = centre (world), `normal` =
	//   exterior side ('+x', '-x', '+z', '-z'), `size` = [width, height]. Lit at night, in S0 only, and
	//   switched off one by one after the departure (story.windowsOff), relit one by one in act III.
	// - v1: lanterns = KHR lights of S0 other than the fire, the `lanternMax` closest to `lanternCentre` (fallback: `lanterns`).
	// - v2: `lights` = sources per role (settings in TIMELINE.lights.roles); each KHR light of S0 is attached
	//   to the nearest landmark within `snap` block, a landmark without a KHR light keeps its position (see placeLights).
	// - chimneys: tops of the flues (world), where the smoke of life.js starts in S0.
	// - shadowFocus: tight zone of the shadow map (look.js).
	// - chaletBox: world box of the chalet (walls, roof, chimney) for the `chalet` screen anchor (getAnchors).
	landmarks: {
		v1: {
			windows: [
				{ at: [95.96, -58, 95.5], normal: '+x', size: [1, 2] },
				{ at: [95.96, -58, 98.5], normal: '+x', size: [1, 2] },
				{ at: [91.04, -58, 96.5], normal: '-x', size: [1, 2] },
			],
			lanterns: [
				[94.5, -57.6, 95.5],
				[94.5, -57.6, 98.5],
				[93.5, -57.6, 101.5],
			],
			lanternCentre: [93.5, -58, 96.5],
			lanternMax: 5,
			chimneys: [[97.5, -50, 97.5]],
			shadowFocus: { center: [94, -58, 104], radius: 24 },
			chaletBox: [
				[89.5, -60, 92.5],
				[97, -50, 101.5],
			],
		},
		v2: {
			// Panes measured in captures-v2/S0.glb: plane z=97.5 (south), 0.75 x 1.94 block; curtains at 96.9..97.
			// Cards at 97.45, just behind the pane. The east panes (ground floor z=95, skylight z=94) are seen at about 66 deg: no
			// card. Order of switching off: the gable first, the south-west ground floor last (story.windowsOff).
			windows: [
				{ at: [91.5, -57, 97.45], normal: '+z', size: [0.8, 1.95], name: 'ground floor southwest' },
				{ at: [95.5, -57, 97.45], normal: '+z', size: [0.8, 1.95], name: 'ground floor southeast' },
				{ at: [93.5, -54, 97.45], normal: '+z', size: [0.8, 1.95], name: 'gable French door' },
			],
			snap: 0.8,
			lights: [
				{ role: 'lantern', at: [93.5, -56.5, 99.5], name: 'porch' },
				{ role: 'lantern', at: [88.5, -57.5, 99.5], name: 'west wall' },
				{ role: 'lantern', at: [98.5, -57.5, 99.5], name: 'east wall' },
				{ role: 'interior', at: [93.5, -56.5, 92.5], name: 'north tie beam' },
				{ role: 'interior', at: [93.5, -56.5, 95.5], name: 'south tie beam' },
				{ role: 'interior', at: [92.5, -53.5, 95.5], name: 'attic' },
				{ role: 'stove', at: [96.5, -58.5, 91.5], name: 'stove' },
			],
			chimneys: [
				[98.5, -50, 90.5],
				[98.5, -50, 91.5],
			],
			shadowFocus: { center: [94, -57, 102], radius: 24 },
			windowGlow: { color: '#ff8a3a', opacity: 1, hdr: 0.6, blending: 'normal' },
			chimneySmoke: { tone: 0.7, alpha: 0.55, rise: [1.0, 1.4], life: [5, 7], size: [0.38, 0.8], drift: 0.4 },
			look: { emissiveLanternNight: -0.1 },
			fireflies: { bright: 0.7, size: 0.08 },
			// Measured in S0.glb (mcwroofs roofs x 87.9..100, z 87.9..100.1, y up to -50.4; flues at -50).
			chaletBox: [
				[87.9, -60, 87.9],
				[100, -50, 100.2],
			],
		},
	},

	// Course of the sun and the moon set on the reference camera (same formula as sky.js: sunDirAt).
	skyPath: { spread: 23.5, peak: 29, starPole: 38, yaw: 6.5, lift: 0.6 },
	paletteGamma: 1.6,

	// No more opening black: the first frame is the poster (golden wide shot). The fade in is only used when a loop
	// resumes (loop: true), after the fade out.
	fadeIn: [0, 0.8],
	fadeOut: [44.2, 45], // only with loop: true (otherwise the scene settles on the diorama)

	// Act I: golden late afternoon; the sun dives into the spruces during the arrival, slows down during the hold
	// (7.5 -> 10.5 s) and passes the horizon just before the captured instant (10.5 s, phase 0.7525: pink twilight). As
	// the sky of the final act comes back to this phase (skyPhaseAt), the reconstruction and the diorama are at twilight.
	// The night falls fast during `lateHour` (11.5 -> 13 s, the moon rises), then during the pause and the black.
	// Keys [t, phase], interpolated with a monotone cubic (continuous speed).
	actI: {
		keys: [
			[0, 0.64],
			[2, 0.6508],
			[4, 0.6727],
			[6, 0.7026],
			[7.5, 0.7295],
			[10.5, 0.7525],
			[11.5, 0.759],
			[13.0, 0.786],
			[14.3, 0.797],
			[16.3, 0.805],
			[19.5, 0.815],
		],
		// v5 (brief c): hard cut on the spot at 16.3 s, "later in the night": the moon is higher. After the
		// cut, the phase follows these keys (real story time, without the offset of the freeze), until the scroll (19.0 s), which
		// starts again from the same phase (lapse.phase0): no cut at 19.0 s, the witness frame stays fixed until 22.0 s.
		after: {
			at: 16.3,
			keys: [
				[16.3, 0.9],
				[19.0, 1.0],
			],
		},
	},

	// Act II: "strobe-free" scroll. Cut at 19.5 s onto the dawn of the next day (phase 1.21: the sun rises
	// 0.1 s later), a first slow day (0.8 cycle/s, about 1.4 cycle until the plateau of 21.5 s; the bible wanted
	// four, which do not fit before the cut of 24 s), then faster (1.6; 1.8 cycle/s at most, anti-flash rule:
	// < 3 flashes/s, measured by ../renders-v4/checks/flash.cjs). Stage switches under a comparable afternoon light (phase = 0.60 to 0.66), with a
	// slow-down of 0.5 to 0.8 s around each (plateau <= 0.08 cycle/s); stop on the grey dawn at 28 s (= 0.27).
	// `rates`: keys [t, cycles/s], soft transition (smoothstep) from one key to the next; phase = phase0 + integral of rate.
	// The switches S1->S2 (24 s) and S2->S3 (25.5 s) fall on the cuts to and from the witness frame (the additions without
	// fall, ivy or grass, do not appear on screen).
	// v5 (brief a3, "the three mornings"): the scroll starts at 19.0 s INSIDE the witness frame, without a cut, at midnight
	// (phase 1.0, continuation of act I); the sun rises three times over the empty bench (phase = 0.25 at `mornings`), with a
	// plateau of 0.25 s at 0.08 cycle/s on each sunrise; at most 1.18 cycle/s between two sunrises (rule of the brief: <= 1.2).
	// The switch S0 -> S1 falls on the plateau of the third morning (21.8 s); cut to the closer tripod at 22.0 s.
	// After 23.85 s, the keys are those of v4 and the phase keeps the same fractional part there: the switches of
	// 24.0, 25.5 and 27.15 s stay under an afternoon light (= 0.596 / 0.656 / 0.626) and the grey dawn of 28 s at
	// = 0.27 (solved by ../renders-v5/recit/outils/lapse.mjs).
	lapse: {
		start: 19.0,
		end: 28.0,
		phase0: 1.0,
		mornings: [19.45, 20.625, 21.8], // sunrises (phase = 0.25), centres of the plateaus
		rates: [
			[19.0, 0.04],
			[19.1, 1.04],
			[19.225, 1.04],
			[19.325, 0.08],
			[19.575, 0.08],
			[19.675, 1.178],
			[20.4, 1.178],
			[20.5, 0.08],
			[20.75, 0.08],
			[20.85, 1.178],
			[21.575, 1.178],
			[21.675, 0.08],
			[21.925, 0.08],
			[22.1, 1.373],
			[23.55, 1.373],
			[23.85, 0.04],
			[25.5, 0.04],
			[25.6, 0.04],
			[25.95, 1.8],
			[26.75, 1.8],
			[26.95, 0.08],
			[27.35, 0.08],
			[27.55, 1.38],
			[27.8, 1.38],
			[28.0, 0],
		],
		// Anti-flash (measured, ../renders-v4/checks/flash.md). Beyond about 1 cycle/s, the sun and the moon cross the
		// same region of the sky once per cycle each: at 1.6 cycle/s, a point of the sky pulsed about 3 times per second
		// (3 flashes in a tile of 1/16 of the image at 22.3 s). The disc and the halo of the moon therefore fade with the
		// speed (story cycles/s): uMoonVis x (1 - amount x smoothstep(from, to, cycleRate)); 0 at the freezes.
		moonCut: { from: 0.1, to: 0.45, amount: 1.0 }, // v12b: 0.1 to 0.45 (was 0.2 to 0.5: the moon was still a clear square on the brightening sky at 28.9 - 29.0 s, now gone by 29.0 s; the fade lasts about 0.45 s on the smoothed rate). v12: from 0.2 cycle/s on the smoothed rate (the moon rising at 37.5 s was a white square) (was 0.9 to 1.2, amount 0.85; final pass: 1.0 to 1.4)
		// Final pass (D12): the sun's disc and halo follow the same rule. In 1/256 tiles the bright squares of the sun and of the moon crossing the dome made 3 flashes a second
		// (luminance 0.01 to 0.8), at 1.18 cycle/s; the rhythm of the days is kept, the squares are less white.
		sunCut: { from: 0.3, to: 0.8, amount: 1.0 }, // v12: was 0.9 to 1.2, amount 0.7
		// Scroll mode: one wheel notch crossed dozens of days in a second (strobe). During the
		// scroll, the story time advances at most by `scrollMaxCycles` day/night cycles per REAL second
		// (scrollStep); playback (time mode), seek() and reduced motion are not affected.
		scrollMaxCycles: 1.0,
		// v7 (fix C1): hard catch-up cut, only on FAST scrolling (the host says so: setScrollSpeed).
		// The ceiling above holds the film back (1 day/s): at 800 px/s, the visitor reaches the bottom of the track when the film
		// is only at t = 23.8 s, and the echo and the return play out off screen. When the target is beyond the end of the
		// timelapse (28.0 s) and the displayed time is in the timelapse with more than `maxLag` s of film behind, the time
		// jumps to `end` (a hard cut, like those of 16.3 and 22 s; symmetric when going back, toward `start`). One cut
		// at most per `cutCooldown` s of wall time (a single luminance jump per second). `fastScroll` / `fastScrollOff`: entry
		// and exit thresholds (px/s, hysteresis) of setScrollSpeed. Below (300 px/s), nothing changes: otherwise p2
		// ("Without you, a world dies.") would go from 4.5 s to 1.2 s.
		maxLag: 1.5,
		cutCooldown: 1.0,
		fastScroll: 600,
		fastScrollOff: 450,
	},
	// v7 (fix B, the click of the capture): the three instants where the host sets its HTML signal (selection frame,
	// cell around the ember, notification). The scene draws nothing: it emits the `signal` event at each
	// crossing (HOST-API.md section 16). `capture` = story.capture. `holdWall`: advised hold (wall seconds, signal of
	// 0.6 s included); `holdAt`: film date where the host holds the image (the three images are identical to those of the final
	// freeze at the same `at`); `eps`: crossing tolerance (film seconds, for a target reached by the damping);
	// `active`: duration (film seconds) during which `probe.signalActive` stays on after the instant.
	signals: {
		echo: 31.4,
		keep: 36.8,
		holdAt: { capture: 10.6, echo: 31.4, keep: 36.8 },
		holdWall: { capture: 3.6, echo: 3.4, keep: 3.2 },
		eps: 0.005,
		active: 0.6,
	},
	dayClock: 240, // world clock seconds per day during the timelapse (fast clouds)
	// Switches S0->S1->S2->S3->S4, in story SECONDS (v3: in phases). Tripod, cut to the witness frame, cut to the
	// tripod, tripod.
	// v5: S0 -> S1 on the plateau of the third morning (21.8 s, witness frame: the flowers wither); the others unchanged.
	swaps: [21.8, 24.0, 25.5, 27.15],
	// Elapsed duration per stage, as data for the host (the old labels of the counter, removed from the scene).
	elapsed: ['a few minutes', '2 weeks', '4 months', '1 year', '4 years', '9 years'],

	// Choreography (story seconds; paths in world [x, z]). See `story` for the moments.
	actors: {
		player: {
			// Enters from the bottom of the frame following the S-shaped path, stops in front of the fire (south side) to feed it,
			// then goes to sit on the bench.
			routeA: [
				[98.2, 115.8],
				[97.9, 113.4],
				[97.5, 111.4],
				[96.4, 109.9],
				[95.7, 108.3],
				[94.7, 107.3],
				[93.2, 107.0],
				[91.75, 106.95],
			],
			routeB: [
				[91.75, 106.95],
				[90.6, 106.95],
				[89.4, 106.4],
			],
			start: 0.25,
			speed: 3.4, // blocks/s (calm walk; vanilla 4.317)
			decel: 0.7,
			speedB: 2.8,
			decelB: 0.5,
			turn: 0.25,
			// Departure (second pass v4, variant `walkOut`, removed in v8): he leaves the way he came, toward the bottom right of the witness frame
			// (where the cold glow rises from). Projection (p2/proj-leave.js): his head reaches the right edge at about 5.6 blocks
			// (16:9) and about 4.5 blocks (portrait 0.46); he leaves during the fade to black. Not in a hurry, a bit livelier than
			// the arrival (4.6 blocks/s; vanilla 4.3).
			routeC: [
				[89.4, 106.4],
				[90.6, 106.95],
				[91.75, 106.95],
				[93.2, 107.0],
				[94.7, 107.3],
				[95.7, 108.3],
				[96.4, 109.9],
				[97.5, 111.4],
				[97.9, 113.4],
				[98.2, 115.8],
			],
			speedC: 4.6,
			decelC: 0.7,
			// v5 (brief a2, last look): he stops once on the path, turns toward the dog, then leaves again.
			// First leg: from `story.leaveWalk` to `story.lastLook[0]` (speed speedC, braking `decelC1`); second: from
			// `story.lastLook[1]`, start in `accelC2` s, at `speedC2` (no decision: he leaves the frame around 16.05 s).
			decelC1: 0.35,
			speedC2: 5.3,
			accelC2: 0.15,
			// Rotation of the body toward the dog during the stop (starts from the gap; the head does the rest, <= 74 deg).
			lastLookBody: 0.5,
		},
		dog: {
			// Follows its master, waits for him standing on his left (on screen) while he feeds the fire, then leaves first
			// toward the bench (it knows the place) and sits at his feet, in front of the north half of the bench, in profile for the
			// camera (muzzle toward the master: about 110 deg from the camera axis). Placed on his right, it hid his legs.
			routeA: [
				[98.2, 115.8],
				[97.9, 113.4],
				[97.5, 111.4],
				[96.6, 109.7],
				[95.6, 108.4],
				[94.3, 107.95],
				[92.6, 107.95],
				[90.86, 107.75],
			],
			// Place (v3 finisher): south-east of the bench, in front of the south end, 1.3 blocks from the sitting player. Before
			// ([89.67; 105.36]), the dog was 4 deg from the fire seen from the camera: it disappeared in the halo of the flames
			// (t 8.6, 15, 34.8). Here it is about 0.17 of a screen width from the fire, to the left of the player, without covering his feet.
			// Path B in an arc (about 1.7 blocks) so that the departure "first, toward the bench" stays readable.
			routeB: [
				[90.86, 107.75],
				[90.3, 108.4],
				[89.65, 107.8],
			],
			start: 0.9,
			speed: 3.4,
			decel: 0.6,
			speedB: 3.0,
			decelB: 0.6,
			turn: 0.5,
		},
	},

	// Dates of the story (seconds), shooting plan of the bible v4 (section 6). STORY (further down) derives the intervals from them.
	story: {
		// I. The evening (0 -> 11.5)
		tend: [4.55, 5.45], // the player feeds the fire: two arm gestures (spray, fire +40 %)
		swings: [
			[4.6, 4.95],
			[4.97, 5.32],
		],
		bStart: { player: 5.75, dog: 5.5 }, // departures toward the bench (the dog first)
		sit: 0.8, // the player sits down (seconds, clip sit_down)
		together: [7.5, 10.5], // hold of 3 s: the dog raises its head toward him, its tail wags; he lowers his head toward the dog
		dogLooksUp: [8.0, 10.5],
		windowsLit: [9.6, 8.4, 9.0], // the house lights up one by one during the hold (order of landmarks.windows)
		// AFK capture (variant `afk`, default): the player no longer moves (breathing and glances frozen), then the world freezes.
		still: [9.0, 10.2],
		capture: 10.5, // the captured instant: this pose comes back, frozen, at 36.7 s (nothing changes in the poses from 10.4 to 11.6)
		freezeFrameDuration: 0.4, // freeze of the capture: flames, smoke, tail; an ember stays suspended when everything starts again
		freezeFrameEV: 0.1, // exposure breathing during each freeze
		captureEnd: 11.5,
		// II. The departure (11.5 -> 16.3)
		lateHour: [11.5, 13.0], // the night falls; he raises his head toward the moon ("it is late") and gets up
		// v5 (brief a1): he raises his head toward the moon (about 25 deg above the horizon), no longer toward the bottom of the frame. With the
		// `coldGlow` variant (off by default since v5), he looks at the cold glow as in v4 (same time window).
		moonLook: [11.7, 12.2],
		coldLook: [11.7, 12.2], // `coldGlow` variant: the player turns his head toward the cold glow
		standUp: [12.25, 12.75], // clip stand_up
		stay: [13.0, 13.9], // "stay": the dog gets up to follow him, he points at it with his arm, the dog sits back down
		dogRises: [12.8, 13.2], // the dog gets up (stand_up)
		turnToDog: [12.95, 13.2],
		point: [13.05, 13.6], // a single arm gesture toward the dog (the right click that makes a wolf sit)
		dogSits: [13.4, 13.9], // the dog sits back down (sit_down)
		goodbye: [13.9, 14.3], // a single crouch: "see you tomorrow" (removed in v8)
		crouches: [[13.92, 14.26]],
		// `walkOut` variant (default, removed in v8): he turns away and leaves along the path of the arrival; the dog, sitting, follows him with its
		// eyes. v5 (brief a2): LAST LOOK, he stops once near the fire and turns toward the dog (14.8 ->
		// 15.2 s), then leaves again and passes the edge of the frame around 16.05 s. v5 (brief c): no more black or freeze, the dog alone
		// looks at the edge of the frame (saved), then a hard cut on the spot at 16.3 s. Without `walkOut`: the blurred pause of v4
		// on the spot (menuOpen), the fade to black (quit) and the black (saved), at the v5 times.
		leave: [14.3, 16.1], // he turns away and walks (leaveWalk), stops (lastLook), leaves again and exits the frame
		leaveWalk: 14.28,
		lastLook: [14.8, 15.2], // stop: he turns toward the dog (body lastLookBody, head <= 74 deg)
		menuOpen: [14.3, 15.8], // walkOut: he leaves (no effect); otherwise pause: the world blurred and desaturated, without a button
		quit: [15.8, 16.1], // walkOut: he passes the edge of the frame; otherwise fade to black
		saved: [16.1, 16.3], // walkOut: the dog alone looks at the edge of the frame, without freeze or black; otherwise brief black
		// III. The absence (16.3 -> 31)
		away: [16.3, 17.5], // hard cut on the spot, later in the night (higher moon, lower fire); empty bench
		unveil: 0.45, // without walkOut only: exit from the black
		fireLow: [11.8, 13.0], // the fire lowers with the night (campfireAt), down to fireLowLevel
		fireLowLevel: 0.7,
		fireAfterCut: 0.45, // level of the fire after the cut of 16.3 s ("lower fire"), until fireOut (0.65: 3 flashes/s in the fire tile, 17 -> 18 s)
		lightsOut: [17.5, 19.0], // the house falls asleep
		windowsOff: [18.3, 17.95, 17.6], // per window (order of landmarks.windows): the gable first
		lanternsOff: [18.45, 18.6, 18.75], // per lantern
		fireOut: [18.4, 19.0], // the fire dies; the ember stays
		chimneyOut: [18.3, 19.4],
		// v5 (brief a3): three mornings on the empty bench, fixed witness frame (sunrises: TIMELINE.lapse.mornings), cut to the
		// closer tripod at `lapseCut`.
		mornings: [19.0, 22.0],
		lapseCut: 22.0,
		dogWaits: [24.0, 25.5], // witness frame in winter: the dog sitting in the snow, head toward the door
		dawn: [28.0, 31.0], // grey dawn, hold of 3 s on the witness frame (slow advance)
		// IV. The memory (31 -> 37.5)
		memory: [31.0, 32.5], // the ember brightens (0.5 s pulse), the dog turns its head toward it, its glow warms him
		rewind: [32.5, 35.5], // rewind in 3 s: the warm wave leaves the ember
		// v5 (brief e2): the stages go back up and the sky joins the pink of the evening of 10.5 s from `rewindLand` (S0, light
		// of the captured evening from 34.8 to 35.5 s); in v4, S1 (withered flowers) and a golden light stayed until 35.5 s.
		rewindLand: 34.8,
		// Final pass v5 (blind test v5 scene, 08-07/08: "the glow grows then the porch collapses at once; one may
		// believe the glow breaks the house"): the rises of the falls waited for the birth of the wave (32.5 s) and
		// first showed the blocks fallen in a heap on the porch (32.57 -> 32.82 s), still grey, before the colour left
		// the hearth. They now start when the front of the wave passes the porch (radius about 6 blocks): from 32.5 to
		// 33.45 s, S4 stays displayed without a fall; the four rises fit in [rewindRise, rewindLand] (0.34 s each).
		rewindRise: 33.45,
		// v8b (24/10/2026, request of Andy): the player no longer comes back as a golden silhouette that fills in (v5: `memoryReturn`, removed); he reappears at once on
		// the bench, in the pose of the captured instant, at the end of the rewind (STORY.rewind[1]), as a rhyme with his disappearance at 21.4 s (v9).
		restore: [35.5, 36.7], // the fire relights from the ember; the band replays 9.3 -> 10.5 s down to the captured pose (`restore[0]` is shifted a second time in v9: the joy scene lies between)
		freeze: 36.7, // final freeze: the same image as the freeze of 10.5 s
		windowsOn: [0.25, 0.45, 0.65], // offset since the start of `restore`, per window
		lanternsOn: [0.05, 0.12, 0.19],
		// V. The kept world (37.5 -> 45)
		// v5 (brief f): on the host side, the browser card forms from the end of the final freeze (`card`, relative to `freeze`:
		// 37.1 -> 39.5 s), before the crane pulls back. The scene does not draw the card; it publishes these dates (STORY.card).
		card: [0.4, 2.8],
		// Outline of the square edge of the capture (state.rim, look.js / backdrop.js): 0 until the end of the final freeze (identical
		// freezes at the pixel), then [t, k] in monotone cubic: it appears first, brightens while the decor
		// fades beyond (38.1 -> 39.3 s), and stays as the outline of the diorama (0.3 at rest).
		// Wiring pass v5: the peak follows the entry of the edge into the frame during the crane (look.js: the edge of the box enters
		// around 39.8 s, whole at 40.3 s; in v5 story, the peak 38.1 -> 39.3 fell before, 60 px touched).
		rim: [
			[37.1, 0],
			[38.0, 0.35],
			[39.6, 1],
			[40.9, 1],
			[41.9, 0.3],
			[45, 0.3],
		],
		diorama: [37.5, 41.5], // back crane: the decor fades, the capture settles on the page colour
		turntable: [41.5, 45], // the diorama slowly turns (+/-20 deg) then comes back
		backdropFade: [0.6, 1.8], // relative to the start of `diorama`: the decor fades before the camera passes the edge (about +2 s)
		pageBlend: [1.4, 3.0], // the background reaches the page colour (option `background`)
		displayRamp: [0.8, 3.0], // presentation of the diorama (TIMELINE.display)
		emberAbsorb: [0.25, 2.1], // the ember goes down into the fire, slowly (relative to the start of `diorama`)
		// Dog, act II (story seconds).
		dog: {
			// v5 (variant `dogSits`, default, brief b1): it stays SITTING the whole absence, at its place (DOG_SPOT), never lying (v9: it lies down for the night, as a sphinx).
			// - from the cut (16.3 s) to the first morning, the body turned toward the bench, it looks at the empty place;
			// - at the first morning, it turns toward the door (`toDoorV5`, in profile for the camera: about 95 deg from its axis);
			// - at each sunrise (TIMELINE.lapse.mornings), it turns its head toward the closed door (`morningLook`, relative to the
			//   sunrise: [entry, full, return, end]), then lowers it a bit more (`sadSteps`, ramp `sadRamp` after the sunrise);
			// - after the third morning and in the snow (dogWaits), the head toward the door; at dawn, the head low toward the
			//   empty place (sad 0.35), an ear twitch (`earFlick`); at the memory, the head toward the ember (`wake`).
			// Breathing x`breath` during the wait. Never the head on the paws, never toward the camera (>= 60 deg) except in the v9 window of the departure.
			sits: {
				seatFrom: 16.3,
				toDoorV5: [19.3, 19.7],
				morningLook: [-0.15, 0.1, 0.45, 0.75],
				sadSteps: [0.1, 0.2, 0.3],
				sadRamp: [0.35, 0.75],
				doorFrom: 21.8, // last morning: it no longer comes back to the empty place before the dawn
				dawnSad: 0.35,
				dawnSeat: 28.0, // at dawn (after the cut of 28 s): head low toward the empty place
				earFlick: [29.3, 29.75], // [start, end] of an ear twitch (brief `alert` layer)
				breath: 1.5,
				waitMax: 0.35, // characters.js: sad = max(sad, 0.85*f(wait)); beyond about 0.38, the head drops ("dead")
				// Rewind: it keeps its eyes on the ember, then turns its head toward the bench where the player re-forms.
				rewindGaze: [34.0, 34.4],
				rewindBody: [34.0, 34.6],
			},
			seatGaze: [16.6, 20.8], // looks at the empty place
			toDoor: [20.6, 21.0], // turns toward the door (in profile for the camera)
			doorGaze: [20.8, 22.6],
			toSeat: [22.7, 23.0], // turns back toward the bench
			sad: [19.5, 23.6],
			rise: [24.05, 24.4], // gets up...
			walk: [24.4, 24.85], // ... takes two steps...
			lie: [24.85, 25.45], // ... and lies down at the place of the player (v4 variant, removed in v9)
			wake: [31.15, 31.6], // memory (v5: after the peak of the ember, 31.15 s): the head toward it, ears up
			// Calm dawn (story time): no automatic head lift of characters.js (`restless` 0) crosses the
			// cut of 28 s; before 26.9 s none is running (seed 1: lifts at 19.6 and 27 s, sweeps at 21.3 and 28 s).
			dawnQuiet: [26.9, 31.05],
			// A single tail sweep in the middle of the dawn (variant `dawnSwish`): "it waits, it is not dead" (blind
			// test v3) against "only the grass moves" (bible section 6). Duration = DOG_SWISH_DURATION of characters.js.
			dawnSwish: 29.3,
			swishDuration: 1.2,
			// Second pass v4 (blind tests v3 and v4: "I thought it was dead", "the red is blood"): during
			// the grey dawn, it does not sleep, it waits: head a little detached from the paws, chest a little raised, the collar read
			// as a band at the neck. Layer in STORY time (dogStoryLayersAt): the replayed band of the rewind shows nothing of it
			// (v4 lying look only, removed in v9; the data stays for the census).
			dawnHead: { from: 28.0, headUp: 0.68, rest: 0 }, // 0.42 tested: head barely higher at 640 px
		},
		// Seasons, in story seconds [rise, full, full, fall]: an autumn then the first winter (the snow still falls
		// on the back of the dog when it lies down), then two brief winters (>= 0.6 s) during the years.
		seasons: {
			// v5: the first autumn starts with the cut of 22.0 s (no longer during the three mornings of the witness frame).
			// v12 (brief v12, point 1: "too many flashes"): the ground went white, dark, white, dark again in 0.4 s steps (snow in 0.45 s, out in 0.4 s, two more winters of 0.6 to 0.9 s):
			// ONE long winter, rising over 1.6 s and leaving over 1.7 s, and two slow autumns (about 0.9 s in and out). The dog waits in full snow (33.8 to 35.3 s in film time).
			autumn: [
				[22.0, 22.9, 23.1, 24.0],
				[26.0, 26.9, 27.1, 28.0],
			],
			snow: [[22.8, 24.4, 25.5, 27.2]], // 32.6 -> 34.2 in, out 35.3 -> 37.0 (film time)
		},
	},

	// The ember (contract v4): brightness and screen size of the fallback ember drawn by the scene.
	ember: {
		birth: 0.08, // rise at the start of the freeze of the capture
		// Second pass v4 (blind test: "the orange ball appears without a cause"): the ember is a spark of the fire.
		// It leaves the flames `rise` s before the captured instant, rises toward its place and stops dead there at the freeze (10.5 s):
		// when everything starts again, the other sparks rise, it stays. `riseFrom`: start above the hearth (world,
		// offset from TIMELINE.world.fire); `riseK`: brightness during the rise.
		rise: 0.55,
		riseFrom: [0, 0.55, 0],
		riseK: 0.75,
		settle: [10.95, 11.6], // from 1 (freeze) to `idle` when everything starts again
		idle: 0.7, // "discreet" during the absence, the only warm point of the image
		wake: [31.0, 31.5], // memory: goes back up to 1
		pulses: [
			[31.0, 31.15, 31.5],
			[32.4, 32.55, 32.95],
		], // [start, peak, end] of the brightenings (memory, birth of the wave)
		absorb: 1, // share of the absorption during `emberAbsorb` (goes down into the fire, goes out)
		// Fallback (sprite): diameter of the halo as a fraction of the image WIDTH (3 %: 19 px at 640, 33 px at 1100), with a
		// floor of 22 px (phone portrait); the visible glow is about two thirds of it. Pixel core: 0.9 %, >= 5 px.
		halo: 0.03,
		core: 0.009,
		minHaloPx: 22, // floors in CSS px (phone portrait: 390 px wide -> 22 px instead of 12)
		minCorePx: 5,
		color: [6.0, 2.1, 0.45], // linear HDR (above the bloom threshold of look.js)
		// v5: tint of the ember (normalised linear RGB) for the warm glows of the characters (pose.glowTint).
		tint: [1.0, 0.42, 0.12],
		// v5 (brief d): gain of the glow the ember carries around it (state.ember.lightGain, life.js emberLight):
		// 1; x2 during the memory (31.3 -> 32.0 s): the face of the dog warms up, it is the visible link ember -> dog;
		// back to 1 during the rewind. 1 at both freezes.
		lightGain: [
			[31.3, 1],
			[32.0, 2],
			[33.0, 2],
			[34.0, 1],
		],
	},
	// v5 (brief b2, fallback): slight warm glow on the skin of the dog during the wait (pose.glow, tint pose.glowTint),
	// when the ember is the only warm point: "everything fades, except the dog and the ember". Envelope `warm` 0..1 in
	// monotone cubic ([t, k]); glow = warm x `gain` (characters.js: emissive = glow x CHAR_GLOW_MAX, i.e. about 0.12 to 0.2).
	// 0 at both freezes. `gain` 0 turns off the fallback (option tune.scene.dogWarm of mount(), ?dogWarm= of the page).
	keepDogColor: true, // v5 (brief b2): the skin of the dog is excluded from the forgetting (mmKeepColor), like the collar
	// Measured (../renders-v5/recit/chaleur-*, differential mask, tint fallback of the scene): at gain 0.45, the coat
	// went from C* 8 to 18 at night (20 s) but stayed at 3.7 at the grey dawn (29.5 s, light coat L* 66 under a grey
	// day): the envelope therefore rises at dawn, and the tint is creamier (brief: hue 50 to 80 deg).
	dogWarm: {
		gain: 0.85,
		// Wiring pass v5: creamier (was [1.0; 0.5; 0.18]): under the pink light of the sunrises, the coat fell to
		// a hue of 26-29 deg (19.6 s), that of the collar ("blood" risk); measured: 46 deg at 19.6 s, 81 deg at 29.5 s.
		tint: [1.0, 0.7, 0.35],
		keys: [
			[18.6, 0],
			[19.4, 0.5],
			[27.8, 0.55],
			[28.4, 0.8],
			[31.3, 0.8],
			[32.0, 1],
			[33.0, 1],
			[34.0, 0],
		],
	},
	// The forgetting (contract v4): [t, forgetting] in monotone cubic; it undoes itself at the pace of the wave during the rewind.
	forgetting: {
		sky: 0.9, // share of grey of the sun, its halo, the twilight glow and the clouds of sky.js at the held forgetting (0.75)
		// v5: the forgetting starts with the switch S0 -> S1 (21.8 s): the three mornings stay in colour (days, not
		// years).
		keys: [
			[21.8, 0],
			[24.0, 0.4],
			[25.5, 0.45],
			[28.0, 0.75],
			[32.5, 0.75],
		],
	},
	// The wave of the rewind (contract v4): maximum radius (about the AFK capture of 32 blocks) and slow start (exponent).
	wave: { maxRadius: 34, ease: 1.5 },
	// Cold glow (contract v4): [rise], [fade] and tint (sRGB) of the "real life" at the bottom of the image.
	coldGlow: { rise: [11.6, 12.4], fade: [15.0, 15.7], color: [0.78, 0.88, 1.0], strength: 0.3, height: 0.5 },
	// Diorama: automatic orbit around the aim of `diorama`, +/-amplitude in degrees over `turntable`, then back.
	turntable: { amplitude: 20 },
	// v7c: diorama AT REST (film come to its end, never in reduced motion or in pause): permanent slow orbit of +/- `amplitude` degrees (period
	// `period` s, progressive start over `ramp` s from the last frame: no jump), and the clock of the world (flames, ember, wind, clouds,
	// particles) keeps going (restLife). The characters stay frozen (the kept instant). In v9 the site phase replaces it (createSiteView).
	rest: { amplitude: 6, period: 30, ramp: 3 },

	// Final pass v5: `reverseSpan`, fall time replayed at the rewind (fallsAt): the blocks start again from the bottom of their
	// trajectory, in the air, and no longer from the heap on the ground (1.8 s, read as a collapse).
	// v12 (brief v12, "the last collapses readable for at least 2.5 s"): forward falls last 2.8 s (was 1.8): the pieces leave over 1.0 s (`maxDelay`, was 0.35), fall slower (`gravity` 14, was 24),
	// stay on the heap and fade over 2.0 to 2.7 s. The REWIND keeps the v5 values (`reverse`: it replays only the first 0.8 s of the fall, with the old delay and gravity).
	fall: { duration: 2.8, maxDelay: 1.0, gravity: 14, spin: 2.2, drift: 0.7, sink: 0.35, fade: [2.0, 2.7], reverseSpan: 0.8, reverse: { maxDelay: 0.35, gravity: 24 } },

	// Diorama of act III: colour toward which the background tends (option `background` of mount, null = keep the sky).
	pageBackground: '#0f1a19',
	// Presentation of the diorama (displayAt, 0..1): the capture keeps its twilight (fire, windows), but it is
	// lit like an object under a warm lamp: low sun light (phase), exposure (EV), ambience, mist.
	// The sky sees none of it: it has already reached the page colour.
	display: { phase: 0.722, ambient: 1.55, fog: 0.25 }, // v7c: the exposure of the diorama (+1.6 EV) is in look.js (params.presentEV), not here

	// Sky and lights, sampled according to the hourly elevation e = sin 2*pi*(phase - 0.25) in [-1, 1].
	sky: {
		// Dome (same keys as the palette of sky.js).
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
		hemiSky: [
			[-0.35, '#5a6c9a'],
			[-0.05, '#7d6f8a'],
			[0.08, '#d29a72'],
			[0.4, '#c9d8e6'],
		],
		hemiGround: [
			[-0.3, '#1d2230'],
			[0.1, '#4a3a2a'],
			[0.4, '#4b4632'],
		],
		hemiIntensity: [
			// Physical units of three: the hemisphere is divided by pi in the Lambert, hence these values.
			[-0.35, 1.3],
			[-0.08, 1.5],
			[0.02, 2.0],
			[0.45, 2.4],
		],
		sunColor: [
			[0.0, '#ff9145'],
			[0.25, '#ffc583'],
			[0.6, '#fff3e0'],
		],
		sunIntensity: 2.4,
		moonColor: '#a8b8ff',
		moonIntensity: 0.6,
		// Grey dawn at the end of act II.
		// Raised light (lightScale 0.5 -> 0.8, hemisphere 2.0 -> 2.4, ground a bit greener): in S4, the young
		// spruce, the ivy and the grassy roof must stay readable in the grey.
		grey: {
			zenith: '#8c949b',
			horizon: '#a6abae',
			hemiSky: '#b3b7ba',
			hemiGround: '#46513d',
			light: '#d6dade',
			hemiIntensity: 2.4,
			lightScale: 0.8,
			// Floor of the main light (before lightScale): at the end of the scroll, the sun has barely
			// risen (about 0.5) and the facade of S4 was no more than a dark mass.
			lightMin: 1.0,
		},
		// Compression of the day/night gap when the scroll speeds up (anti-flash, WCAG 2.3.1).
		// amount: [at the start of the scroll, at the fastest]; it follows the number of cycles per second.
		compress: {
			amount: [0.9, 0.97], // v12: was [0.45, 0.92] (final pass: [0.35, 0.75] before): the day/night gap is 0.9 compressed from 0.15 cycle/s and 0.97 from 0.5 (brief v12: amplitude of the light reduced)
			rate: [0.15, 0.5], // corresponding cycles/s (v12: was [0.55, 1.6])
			skyShare: 0.92, // share of the compression applied to the dome (the sun and the moon stay sharp)
			zenith: '#2d3a5e',
			horizon: '#5d6684',
			hemiSky: '#9aa6b8',
			hemiIntensity: 2.2,
			lightIntensity: 0.8,
			nightLight: 0.75,
		},
		// Anti-flash (2): during the timelapse, the light is the average of lightingAt over a PHASE window (in
		// cycles, 9 samples, triangle weights) that opens with the speed: almost nil at the plateaus of the switches
		// (the afternoon light is true there), 0.5 cycle at 0.8 cycle/s (readable days and nights, sunrises and sunsets in
		// about 0.6 s), 1.2 cycle at the fastest (stable band of light while the sun and the moon streak by). Pure in t.
		smooth: { amount: [[0.1, 0.03], [0.2, 0.55], [0.35, 0.9], [0.8, 1.0], [1.3, 1.1], [1.8, 1.2]] }, // v12: a full cycle averaged from 0.35 cycle/s (was 0.9 at 1.0 cycle/s) // final pass: 0.9 cycle already from 1.0 cycle/s (was 0.77 at 1.18): the timelapse of 29.3 to 32 s flashed 3 times a second in tiles of 1/64 (technical control D12)
		// Anti-flash (3): during the whole scroll, the halo of the sun, the scattering and the rays are attenuated (otherwise
		// every passage of the sun in the frame whitens the image); the disc stays sharp. v4: constant cut over the whole
		// scroll, plateaus included (a cut that followed the speed relit the halo at each switch, in 0.2 s).
		glare: { cut: 0.8 },
	},
	// Moon phases shown (sky.js: 0 full ... 4 new): the thin crescents (3, 4, 5) read
	// as a vertical bar of light.
	moonPhases: [0, 1, 2, 6, 7],

	// Light cheat: the course of the sun is in front of the camera (backlight). The main light
	// keeps the side (left/right) and the height of the body but comes from behind the camera.
	// During the timelapse and the grey dawn (keyLightLapseAt), the noon sun passes almost at the zenith: the
	// light fell flat on the south facade (N.L about 0.08), which was only lit by the hemisphere.
	// `lapse`: the light comes more from behind the camera (behind 0.5) and its elevation is capped
	// (component y <= maxY after normalisation, i.e. about 30 deg). Act I and act III keep the base settings.
	// greyBehind: in the grey dawn, the low sun on the right lit the south facade at a grazing angle (N.L about 0.04); the
	// light (overcast sky) then comes mostly from behind the camera.
	keyLight: { behind: 0.12, lift: 1.0, lapse: { behind: 0.5, maxY: 0.5, greyBehind: 1.6 } }, // 0.12: grazing light, long shadows visible from the camera

	sunDisc: 0.2, // factor on the luminance of the sun disc of sky.js
	sunHalo: 0.45, // factor on the halo (Mie scattering) around the sun in sky.js

	// lantern / lanternColor: v0-v1 lanterns (range 10). roles: v2 sources (intensity, range, colour).
	// The PointLights have no shadow: the interior sources have a short range so as not to light the
	// outside through the walls.
	// enabled: false: the landmark attaches its KHR light, but no PointLight is created.
	lights: {
		lantern: 3.5,
		lanternColor: '#ffc27a',
		windowGlow: 0.85,
		roles: {
			// 2.5 (3.5 before): the white curtain, one block from the porch lantern, turned white.
			lantern: { intensity: 2.5, distance: 10, color: '#ffc27a' },
			interior: { enabled: false, intensity: 2.4, distance: 5.5, color: '#ffc27a' },
			stove: { enabled: false, intensity: 2.2, distance: 4.5, color: '#ff7a30', flicker: true },
		},
	},
}

// =================================================================================================================
// v9 retiming by shifting (decisions-v9 section 2). `TIMELINE` above stays written in v7 time (readable, comparable).
// Two insertions:
//   INSERT   after the dog sits (13.9 s, v7 time): `shiftTimeline` adds INSERT.delta (9.8 s) to every date STRICTLY after
//            INSERT.at listed in PATHS. Nothing moves on [0, 13.9[.
//   INSERT2  the joy scene at the end of the rewind (v7 35.5 s, film 45.3 s): the dates listed in PATHS2 are shifted a
//            second time by INSERT2.delta (5.2 s), so they move by 15.0 s in total. They cannot be told apart by value
//            (rewind[1] and restore[0] are both 35.5 s in v7), hence a second list of paths.
// A census (tests T1) requires every number of ]13.9, 45] to be in PATHS (shifted), KEEP (justified) or REMOVED (dropped).
// =================================================================================================================
export const INSERT = Object.freeze({ at: 13.9, delta: 9.8, cut: 26.1 }) // cut = 16.3 + delta: the v9 "away" cut
// Film time of the joy scene: [from, to[ = the world is held and the dog and Efe act (from = rewind[1], to = restore[0]).
export const INSERT2 = Object.freeze({ at: 35.5, delta: 5.2, from: 45.3, to: 50.5 })

// Path patterns: segments separated by dots, `*` = any segment (array index included).
export const PATHS = Object.freeze([
	'duration',
	'fadeOut.*',
	'actI.after.at',
	'actI.after.keys.*.0',
	'lapse.start',
	'lapse.end',
	'lapse.mornings.*',
	'lapse.rates.*.0',
	'signals.echo',
	'signals.keep',
	'signals.holdAt.keep',
	'swaps.*',
	'story.away.*',
	'story.lightsOut.*',
	'story.windowsOff.*',
	'story.lanternsOff.*',
	'story.fireOut.*',
	'story.chimneyOut.*',
	'story.mornings.*',
	'story.lapseCut',
	'story.dogWaits.*',
	'story.dawn.*',
	'story.memory.*',
	'story.rewind.*',
	'story.rewindLand',
	'story.rewindRise',
	'story.restore.*',
	'story.freeze',
	'story.rim.*.0',
	'story.diorama.*',
	'story.turntable.*',
	'story.seasons.autumn.*.*',
	'story.seasons.snow.*.*',
	'story.dog.sits.seatFrom',
	'story.dog.sits.toDoorV5.*',
	'story.dog.sits.doorFrom',
	'story.dog.sits.dawnSeat',
	'story.dog.sits.earFlick.*',
	'story.dog.sits.rewindGaze.*',
	'story.dog.sits.rewindBody.*',
	'story.dog.seatGaze.*',
	'story.dog.toDoor.*',
	'story.dog.doorGaze.*',
	'story.dog.toSeat.*',
	'story.dog.sad.*',
	'story.dog.rise.*',
	'story.dog.walk.*',
	'story.dog.lie.*',
	'story.dog.wake.*',
	'story.dog.dawnQuiet.*',
	'story.dog.dawnSwish',
	'story.dog.dawnHead.from',
	'ember.wake.*',
	'ember.pulses.*.*',
	'ember.lightGain.*.0',
	'dogWarm.keys.*.0',
	'forgetting.keys.*.0',
	'coldGlow.fade.*',
])

// Paths shifted a second time by INSERT2.delta (they must also be in PATHS): the dates at or after the start of the replayed
// band and the end of the film. Everything else after the rewind keeps the first shift only.
export const PATHS2 = Object.freeze([
	'duration',
	'fadeOut.*',
	'signals.keep',
	'signals.holdAt.keep',
	'story.restore.*',
	'story.freeze',
	'story.rim.*.0',
	'story.diorama.*',
	'story.turntable.*',
])

// Numbers of ]13.9, 45] that are NOT shifted film dates: path -> reason.
export const KEEP = Object.freeze({
	'actI.keys.*.0': 'exception: act I sky curve, never shifted; phaseAt stretches it over the insertion (otherwise the sky would change from 11.5 s)',
	'skyPath.*': 'angles and pole in degrees (sun and moon path), not dates',
	'wave.maxRadius': 'maximum wave radius in blocks',
	'turntable.amplitude': 'diorama amplitude in degrees',
	'rest.period': 'period in seconds of the resting orbit (a duration, not a date)',
	'fall.gravity': 'gravity of the falling blocks (blocks/s²)',
	'fall.reverse.gravity': 'v12: gravity of the pieces that rise back at the rewind (the v5 value, blocks/s²)',
	'fall.reverse.maxDelay': 'v12: spread of the start of the rising pieces at the rewind (the v5 value, a duration)',
	'landmarks.*.shadowFocus.radius': 'shadow map radius in blocks',
	'ember.minHaloPx': 'ember halo floor in CSS pixels',
})

// Removed from the story since v8: the walk away, the "see you tomorrow" crouch, the pause and the black (replaced by
// `story.v8`), and the second hold of the signal (the echo no longer stops the film).
export const REMOVED = Object.freeze([
	'story.goodbye',
	'story.crouches',
	'story.leave',
	'story.leaveWalk',
	'story.lastLook',
	'story.menuOpen',
	'story.quit',
	'story.saved',
	'actors.player.routeC',
	'actors.player.speedC',
	'actors.player.decelC',
	'actors.player.decelC1',
	'actors.player.speedC2',
	'actors.player.accelC2',
	'actors.player.lastLookBody',
	'signals.holdAt.echo',
	'signals.holdWall.echo',
])

// Values rewritten in v9 (host hold durations, decisions-v9 section 2.2): capture 1.2 s, return 2.2 s (T5 is three times longer).
export const OVERRIDES = Object.freeze({ 'signals.holdWall.capture': 1.2, 'signals.holdWall.keep': 2.2 })

const pathMatch = (pattern, trail) => {
	const a = pattern.split('.')
	return a.length === trail.length && a.every((seg, i) => seg === '*' || seg === String(trail[i]))
}
const round6 = (x) => Math.round(x * 1e6) / 1e6

// Frozen deep copy of TIMELINE as written (v7 time): reference of the census and of the "v7" clocks.
function deepFreeze(o) {
	if (o && typeof o === 'object') for (const v of Object.values(o)) deepFreeze(v)
	return Object.freeze(o)
}
export const TIMELINE_V7 = deepFreeze(structuredClone(TIMELINE))

/**
 * Shifts in place the dates of `tl` (strict comparison: a date <= ins.at does not move), removes the paths of
 * `removed` and applies `overrides`. Pure function on the given object; to be called once, before deriving STORY.
 */
export function shiftTimeline(tl, ins = INSERT, paths = PATHS, removed = REMOVED, overrides = OVERRIDES) {
	const visit = (node, trail) => {
		for (const key of Object.keys(node)) {
			const v = node[key]
			const here = [...trail, key]
			if (typeof v === 'number') {
				if (v > ins.at && paths.some((p) => pathMatch(p, here))) node[key] = round6(v + ins.delta)
			} else if (v && typeof v === 'object') visit(v, here)
		}
	}
	visit(tl, [])
	for (const p of removed) {
		const trail = p.split('.')
		const leaf = trail.pop()
		let node = tl
		for (const seg of trail) node = node?.[seg]
		if (node && typeof node === 'object') delete node[leaf]
	}
	for (const [p, value] of Object.entries(overrides)) {
		const trail = p.split('.')
		const leaf = trail.pop()
		let node = tl
		for (const seg of trail) node = node?.[seg]
		if (node && typeof node === 'object') node[leaf] = value
	}
	return tl
}
shiftTimeline(TIMELINE)
// Second shift: only the PATHS2 dates move again, whatever their value (`at: -Infinity`), without removals or overrides.
shiftTimeline(TIMELINE, { at: -Infinity, delta: INSERT2.delta }, PATHS2, [], {})

// "v7" time of an instant of the v8/v9 film: the ambient clocks (fire, smoke, clouds, breaths), the `t` of the modules and the
// grain seed follow this time, so that the image after the cut is that of v7c shifted earlier (decisions section 2).
// Before the cut (insertion included), the clocks flow without a jump; at the hard cut they go back by delta.
// v9: f before the cut; f - 9.8 until the end of the rewind; held at 35.5 during the joy scene (the world is held); f - 15.0 after.
export const legacyT = (f) => (f < INSERT.cut ? f : f < INSERT2.from ? f - INSERT.delta : f < INSERT2.to ? INSERT2.at : f - INSERT.delta - INSERT2.delta)

// v8 partition of the insertion, IN FILM TIME (not shifted): decisions-v8 section 3.1. Efe crouches near the dog sitting again,
// types "stay, I will be back soon...", gets up, holds the screen of the menu (v9: straight to "Save and
// Quit to Title"), disappears on the spot; the dog stays alone until the cut (INSERT.cut). No date is invented
// elsewhere: the cues (STORY.cues) derive from them, the page draws its chat lines, its titles and its screen from them.
TIMELINE.story.v8 = Object.freeze({
	crouch: Object.freeze([13.9, 14.15]), // he crouches facing the dog (clip `sneak` held, layer sneakK)
	crouchHold: Object.freeze([14.15, 17.8]), // crouch held
	rise: Object.freeze([17.8, 18.1]), // he gets up
	typeSay: Object.freeze([14.4, 17.8]), // same for "stay, I will be back soon..."
	coucous: Object.freeze([]), // no wave of the hand (empty: `waveK` stays a layer of characters.js)
	turn: Object.freeze([17.95, 18.25]), // he turns toward the free side (menuYaw)
	menuYaw: 0.55, // rad; 0 = facing +Z (the dog), 0.89 = facing the camera of the witness frame: three quarters
	menu: Object.freeze([18.15, 21.4]), // `gui` layer (hands raised)
	leave: 21.4, // disappears on the spot, no fade
	alone: Object.freeze([21.4, 26.1]), // the dog alone, until the cut
	dog: Object.freeze({ watch: [13.9, 14.15], sad: 0.1, lookEmpty: [21.45, 21.85] }),
})

// v9 partition (film time, not shifted): decisions-v9 sections 7 to 9. The menu goes straight to "Save and Quit"; the dog
// turns to the visitor, looks sad, lies down as a sphinx; the camera pushes in; at the return the dog stands up and celebrates.
TIMELINE.story.v9 = Object.freeze({
	menu: Object.freeze({ open: 18.3, idle: Object.freeze([18.3, 19.1]), glide: Object.freeze([19.1, 20.1]), hover: Object.freeze([19.7, 21.15]), press: Object.freeze([21.15, 21.3]), close: 21.4 }),
	dog: Object.freeze({
		lookEmpty: Object.freeze([21.45, 21.85]), // head toward the empty place
		toCamera: Object.freeze([22.2, 22.9]), // turns to the visitor (body follows the head)
		turnSteps: Object.freeze([22.25, 22.45, 22.65]), // the body turns in three short notches (0.12 s each), like a sitting wolf of the game: no blended leg poses in between
		turnNotch: 0.12,
		headLead: Object.freeze([22.2, 22.55]), // the head reaches the camera before the body
		gazeHold: Object.freeze([22.9, 24.7]), // sad gaze held
		sad: Object.freeze([22.9, 23.7]), // sad ramp
		sadLevel: Object.freeze([0.1, 0.75]),
		lieDown: Object.freeze([24.7, 25.4]), // sit -> lie (sphinx)
		gazeOff: Object.freeze([26.1, 26.2]), // the eyes stay on the camera until the cut (a head turned away while lying read as dead)
		lying: Object.freeze([25.4, 28.8]), // lying through the night (the cut at 26.1 is inside)
		// v9c (blind test: "at 28.98 s it lies on its side, in the dark, right under 'a world dies': for a second you think it dies"). The sit-up is now THREE gestures, none of them
		// flat: the sphinx lifts its head and chest higher (`riseHead`, still lying, rest 0), the body turns toward the bench side and slides back while it is still a sphinx
		// (`sitUp`, 0.7 s: the 80 degree swing the old 0.4 s blend made while it was already folded is gone), and only then the fold of the legs (`sitBlend`, 0.3 s) with the
		// head held high. It never lies flat, never on the flank, during the lapse's first light (29.05 s).
		sitUp: Object.freeze([28.8, 29.5]), // turns and slides back (yaw and place)
		riseHead: Object.freeze([28.8, 29.0]), // the head and chest lift
		riseHeadUp: 1, // headUp of the raised sphinx
		sitBlend: Object.freeze([29.0, 29.3]), // sphinx -> sitting
		noCameraRule: Object.freeze([22.2, 26.1]), // the only window where the dog may look at the camera
		turn: 0.4, // rad: the body faces the camera with this offset (three-quarter view)
		lieHeadUp: 0.8, // sphinx, head up
		lieRest: 0.2, // never the head on the paws
		nightTurn: -Math.PI / 2, // after the cut it lies in profile to the camera, head toward the fire and the frame (final pass: +90 degrees sent the head out of the frame on a phone, a grey heap read as dead)
		nightHeadUp: 0.6, // after the cut
		nightRest: 0.3,
		nightSad: 0.5,
		breath: 1.15,
	}),
	// eye 60 % of the way to the dog head, aim 90 % (final pass, artistic control correction 9: at 25 % the head was 7 to 9 % of the image height, too small for the
	// sad look to read; now about 15 % at 390, 19 % at 820 and 30 % at 1440). Slower (2 s) and held until the cut. Head measured at 48-52 % of the width, 55-60 % of the height.
	camera: Object.freeze({ pushIn: Object.freeze({ at: Object.freeze([22.0, 24.0]), amount: 0.6, aim: 0.9 }) }),
	fireDim: Object.freeze({ at: Object.freeze([22.4, 24.0]), amount: 0.45 }),
	return: Object.freeze({
		// v9d (Andy: "show the return"): the cut to the tight shot, the fire and the dog stay at 45.3 s, but the bench is EMPTY for 0.5 s (the dog alone, looking at the place where he sat),
		// and Efe appears on it at 45.8 s, exactly when the game's line "joined the game" shows (the `return` cue): a 0.2 s fade (the pixel fade of characters.js, short enough not to read as a ghost),
		// the rhyme of his disappearance at 21.4 s. The dog sees him as he appears; the calm sitting beat is 0.5 s shorter (the wag starts later), everything from the stand-up on is unchanged.
		appear: 45.8, // Efe appears on the bench, sitting, in the pose of the band at 9.3 s
		appearFade: 0.2, // seconds of the pixel fade-in (45.8 -> 46.0)
		perk: Object.freeze([45.8, 46.1]), // the dog sees him: ears up
		wagSoft: Object.freeze([46.9, 47.8]),
		standUp: Object.freeze([47.8, 48.15]),
		party: Object.freeze([48.2, 49.75]), // full wag, eager
		hops: Object.freeze([Object.freeze([48.25, 48.55]), Object.freeze([48.65, 48.95])]), // +0.25 block, 0.3 block toward Efe, and back
		hopHeight: 0.25,
		faceOffset: 0.6, // rad off the camera axis (three quarters)
		faceWeight: 0.8, // how far toward that heading the body goes while it is up
		faceSitWeight: 0.85, // and while it sits and sees him (45.3 to 47.8). v9b: 0.55 left it in profile (88 degrees off the camera) for 2 s, then a back-and-side view; 0.85 shows it three quarters (about 52 degrees)
		// v9b: the fire and the lanterns are lit from the first frame of the celebration (the warm light of the witness frame), not at 50.5 s: the party was played in a dusk
		// without a light, small, at the left edge, with 2.5 s in which nothing showed. The windows keep their own relight at 50.5 s (they are not in the shot).
		relight: Object.freeze([45.3, 45.45]),
		ev: 0, // exposure added on the celebration (EV). v11b: 0 (v9c: 0.3; v9b: 0.8, which made 11 tiles (41 600 px²) flash 3 times a second at 820 on the hops and the spin of a light dog on dark grass). With the gestures of the pass the party flashed more than the v10b at 390 and 820 px with 0.3 (9 000 and 18 898 px² against 7 715 and 7 559, canvas, window 45.8-50.5 s) and not with 0 (5 143, 7 559, 0): the cheapest lever, a third of a stop of light on the party
		fireLevel: 2.2, // the fire's level during the celebration (1 = the witness frame): the tight shot leaves the flames out of the frame, only their light reaches the two of them; back to 1 at the cut of 50.5
		// A cut to a closer shot for the whole celebration; back on the v8b frame at 50.5. `portrait` and `wide` are two framings, blended by the canvas aspect between
		// `aspects` (width / height): `amount` = share of the way of the eye toward the aim point, `aim` = same for the target, `dog` = where the aim point lies between Efe (0)
		// and the dog (1), `lift` = its height above the ground (blocks), `fire` = how far the point is pulled toward the campfire (0 to 1): the lit fire is in the shot, at its edge,
		// so that the warm light that falls on the two of them has a visible source (a tight shot without it read as a dark one: the fire is 3 blocks from the bench).
		camera: Object.freeze({
			at: Object.freeze([45.3, 50.5]),
			// v9c: `lift` 1 -> 1.25 (the aim point 0.25 block higher: the two of them sit about 3 % of the height lower in a portrait frame). The film bar now holds T4 under it (hero.js controlsBottom),
			// and on a short phone (375 x 667, 768 x 1024) T4's last line then lay over Efe's head (t7-title-heads.cjs: 1 322 px2 at 375 x 667, 3 197 px2 at 768 x 1024, both failing).
			portrait: Object.freeze({ amount: 0.6, aim: 1, dog: 0.65, lift: 1.25, fire: 0 }),
			wide: Object.freeze({ amount: 0.5, aim: 1, dog: 0.6, lift: 0.9, fire: 0.08 }),
			aspects: Object.freeze([0.8, 1.3]),
		}),
		hopReach: 0.3,
		spin: Object.freeze([49.05, 49.65]), // one full turn on the spot
		backToSpot: Object.freeze([49.75, 50.05]),
		// v11b (blind test: "the dog turns 90 to 180 degrees from one image to the next, then lies down in one step"): with the pass the turn lasts 0.9 s instead of 0.6 (a speed
		// of 360 / 0.7 = 514 deg/s at most, 64 degrees per image of an 8 images/s sheet instead of 109), the way back to the sitting heading takes 0.45 s instead of 0.3 (it pivots on its paws,
		// `trot`), and the sit starts when the heading is almost back. Same total: everything ends at 50.4 s.
		spinNat: Object.freeze([49.05, 49.95]),
		backNat: Object.freeze([49.8, 50.25]),
		sitDown: Object.freeze([50.05, 50.4]),
		settle: Object.freeze([50.4, 50.5]), // fade to the v8b pose at 41.0
		playerHeadFollow: Object.freeze([47.8, 50.4]), // Efe's head follows the dog (weight 0.8 at most), back to the band pose at 50.4
		playerHeadWeight: 0.8,
		// v9c (blind test: "nothing shows that Efe comes back, he is already sitting"): his arrival gesture. He appears at 45.3 s (and the chat says "joined the game"), then turns
		// his head, and a little of his body, toward the dog that has just seen him (45.45 to 46.15 s), and keeps looking at it until the party: "the world is as you left it", and
		// he finds his dog. Back to the band pose at 50.4 s, as before.
		// v9d: once he has fully appeared (46.0 s) he turns his head and a part of his body toward the dog: 0.5 rad (28.6 degrees; v9c: 0.4 rad = 22.9 degrees, "hard to see at 390").
		playerArrive: Object.freeze([46.0, 46.7]),
		playerArriveWeight: 0.85,
		// v11b (blind test: "he stays frozen on the bench"): once he has turned toward the dog he reaches toward it with the right hand and pats twice ("come here"), nodding, then lowers the
		// hand just before the dog stands up (47.8 s); everything is exactly 0 outside this window.
		greet: Object.freeze([46.3, 47.8]),
		playerArriveTurn: 0.5, // radians of body yaw toward the dog at most
		band: Object.freeze([50.5, 51.7]), // the replayed band, untouched
	}),
})

// Table of the cues (decisions-v8 section 6.1), film time, deeply frozen. The texts are in the page.
function deepFreezeCopy(o) {
	if (o && typeof o === 'object') for (const v of Object.values(o)) deepFreezeCopy(v)
	return Object.freeze(o)
}
const CUES = deepFreezeCopy([
	{ id: 'join', kind: 'line', tone: 'join', at: 0.2 },
	{ id: 'mod', kind: 'line', tone: 'mod', at: 10.5, option: 'modchat' },
	{
		id: 'say',
		kind: 'say',
		arms: [14.4, 17.8],
		open: 14.55,
		send: 17.65,
		keys: [14.65, 14.74, 14.83, 14.92, 15.01, 15.1, 15.4, 15.48, 15.56, 15.64, 15.72, 15.8, 15.88, 15.96, 16.04, 16.12, 16.2, 16.3, 16.39, 16.48, 16.57, 16.66, 16.75, 16.9, 16.99, 17.15, 17.3, 17.45],
	},
	{
		id: 'menu',
		kind: 'gui',
		hands: [18.15, 21.4],
		open: 18.3,
		close: 21.4,
		// `idle` is not a button: a point just below the panel, on the right (u right, v down; v > 1 is outside the panel), so that the waiting cursor never sits on a
		// label. `quit` is aimed at the right end of its button, past the label (a long label wraps on two rows on a phone: the centre would hide it).
		items: { idle: [0.55, 1.14], resume: [0, -0.6], options: [0, 0], quit: [0.72, 0.6] },
		panels: [[18.3, 'pause']],
		// The cursor rests on `idle` (18.3 to 19.1), glides to the quit button (19.1 to 20.1), hovers it (19.7 to 21.15), presses it
		// (21.15 to 21.3); the menu closes and Efe disappears at 21.4.
		path: [
			[18.3, 'idle'],
			[19.1, 'idle'],
			[20.1, 'quit'],
			[21.4, 'quit'],
		],
		hover: [[19.7, 21.15, 'quit']],
		press: [[21.15, 21.3, 'quit']],
	},
	{ id: 'quit', kind: 'line', tone: 'quit', at: 21.4 },
	// Story cues (no on-screen element): announcements and tests only.
	{ id: 'gaze', kind: 'story', event: 'dog.gaze', at: 22.2 },
	{ id: 'lie', kind: 'story', event: 'dog.lie', at: 24.7 },
	{ id: 'return', kind: 'story', event: 'player.return', at: 45.8 }, // v9d: 0.5 s after the cut (45.3 s): the bench is empty until then
	{ id: 'joy', kind: 'story', event: 'dog.joy', at: 47.8 },
])


// Landmarks of the loaded version of the captures (v0 -> those of v1, same chalet; unknown version -> v1).
export const landmarksFor = (version) => TIMELINE.landmarks[version === 'v0' ? 'v1' : version === 'v2light' ? 'v2' : version] ?? TIMELINE.landmarks.v1

// Attaches the KHR lights of S0 (world positions, fire already removed) to the sources of a version.
// v2 (`lights`): each landmark takes the nearest KHR light within `snap` block; the remaining KHR
// lights are returned in `unknown` (no PointLight). v0-v1: the `lanternMax` KHR lights nearest
// to `lanternCentre` (fallback: `lanterns`), completed with empty slots (constant number of lights).
// Returns { plan: [{ role, name, at, source: 'capture'|'landmark'|null, used }], unknown: [[x, y, z]] }.
export function placeLights(khr, marks) {
	const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
	if (marks.lights) {
		const free = khr.slice()
		const plan = marks.lights.map((mark) => {
			let best = -1
			let bestD = marks.snap ?? 0.8
			free.forEach((p, i) => {
				const d = dist(p, mark.at)
				if (d <= bestD) {
					best = i
					bestD = d
				}
			})
			const at = best >= 0 ? free.splice(best, 1)[0] : mark.at
			return { role: mark.role, name: mark.name, at, source: best >= 0 ? 'capture' : 'landmark', used: true }
		})
		return { plan, unknown: free }
	}
	const source = khr.length ? 'capture' : 'landmark'
	const list = (khr.length ? khr : marks.lanterns).slice().sort((a, b) => dist(a, marks.lanternCentre) - dist(b, marks.lanternCentre))
	const plan = []
	for (let i = 0; i < marks.lanternMax; i++) {
		plan.push({ role: 'lantern', name: `lanterne ${i + 1}`, at: list[i] ?? null, source: list[i] ? source : null, used: i < list.length })
	}
	return { plan, unknown: list.slice(marks.lanternMax) }
}

// ---------------------------------------------------------------------------
// Pure tools
// ---------------------------------------------------------------------------

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
export const lerp = (a, b, k) => a + (b - a) * k

export function smoothstep(e0, e1, x) {
	if (e0 === e1) return x < e0 ? 0 : 1
	const k = clamp((x - e0) / (e1 - e0), 0, 1)
	return k * k * (3 - 2 * k)
}

// Opacity of a window [a, b] with fade in and fade out.
export function windowed(t, a, b, fade = 0.3) {
	if (t < a || t >= b) return 0
	return smoothstep(a, a + fade, t) * (1 - smoothstep(b - fade, b, t))
}

export function hexToRgb(hex) {
	const n = Number.parseInt(hex.slice(1), 16)
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const mixRgb = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]

function normalize(v) {
	const l = Math.hypot(v[0], v[1], v[2]) || 1
	return [v[0] / l, v[1] / l, v[2] / l]
}

export const toScene = (p, origin) => [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]]

// keys: [[x, value], ...] sorted; value = number or '#rrggbb'.
export function sampleKeys(keys, x) {
	const value = (v) => (typeof v === 'string' ? hexToRgb(v) : v)
	if (x <= keys[0][0]) return value(keys[0][1])
	for (let i = 1; i < keys.length; i++) {
		if (x <= keys[i][0]) {
			const k = (x - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])
			const a = value(keys[i - 1][1])
			const b = value(keys[i][1])
			return typeof a === 'number' ? lerp(a, b, k) : mixRgb(a, b, k)
		}
	}
	return value(keys[keys.length - 1][1])
}

// Integer hash -> [0, 1), stable: the same cell always falls the same way.
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

// Shortest angular gap a -> b.
const angleDelta = (a, b) => {
	let d = (b - a) % (2 * Math.PI)
	if (d > Math.PI) d -= 2 * Math.PI
	if (d < -Math.PI) d += 2 * Math.PI
	return d
}
const lerpAngle = (a, b, k) => a + angleDelta(a, b) * k
// ---------------------------------------------------------------------------
// Time: day/night scroll, clocks, stages
// ---------------------------------------------------------------------------

// Speed of the scroll (day/night cycles per second): keys TIMELINE.lapse.rates, soft transition from one key to
// the next. The phase is its integral, tabulated once (trapezoids, 2 ms step); the inverse is done by bisection.
const rateAtKeys = (keys, t) => {
	if (t <= keys[0][0]) return keys[0][1]
	for (let i = 0; i < keys.length - 1; i++) if (t < keys[i + 1][0]) return lerp(keys[i][1], keys[i + 1][1], smoothstep(keys[i][0], keys[i + 1][0], t))
	return keys.at(-1)[1]
}
export function lapseRateAt(t) {
	return rateAtKeys(TIMELINE.lapse.rates, t)
}

// Phase table of the scroll for a `lapse` configuration (v8: LAPSE in film time, LAPSE_V7 in v7 time for the clocks).
function makeLapse({ start, end, phase0, rates }) {
	const step = 0.002
	const n = Math.ceil((end - start) / step - 1e-9)
	const table = new Float64Array(n + 1)
	table[0] = phase0
	for (let i = 1; i <= n; i++) {
		const a = start + (i - 1) * step
		const b = Math.min(end, start + i * step)
		table[i] = table[i - 1] + ((rateAtKeys(rates, a) + rateAtKeys(rates, b)) / 2) * (b - a)
	}
	const phaseEnd = table[n]
	return { start, end, duration: end - start, phase0, phaseEnd, U: phaseEnd - phase0, step, table, n }
}
export const LAPSE = makeLapse(TIMELINE.lapse)
const LAPSE_V7 = makeLapse(TIMELINE_V7.lapse)

export function lapsePhaseOfTime(t, L = LAPSE) {
	const x = clamp(t - L.start, 0, L.duration) / L.step
	const i = Math.min(L.n - 1, Math.floor(x))
	return lerp(L.table[i], L.table[i + 1], clamp(x - i, 0, 1))
}

// Scroll mode (anti-flash): one step of the damping of the time toward the target, capped during the scroll of the days at
// TIMELINE.lapse.scrollMaxCycles cycles per real second. Pure: (t, target, real dt in s, tau) -> next t.
// v7: `opts` (all optional; without them, the result is that of v6):
//   - fast    : fast scroll (> TIMELINE.lapse.fastScroll px/s, told by the host). Enables the catch-up cut C1;
//   - maxLag  : lag (film s) beyond which the cut triggers (default TIMELINE.lapse.maxLag);
//   - cutOk   : false during the rest time between two cuts (the scene host computes it);
//   - maxRate : maximum speed of the film in film s per wall s (catch-up after the last hold of the host), 0 = none.
// scrollAdvance returns { t, cut }; scrollStep only returns t.
export function scrollAdvance(t, target, dt, damping = 0.25, opts = {}) {
	const { fast = false, maxLag = TIMELINE.lapse.maxLag, cutOk = true, maxRate = 0 } = opts
	let next = t + (target - t) * (1 - Math.exp(-dt / Math.max(1e-3, damping)))
	if (Math.abs(target - next) < 1e-3) next = target
	if (maxRate > 0 && Math.abs(next - t) > maxRate * dt) next = t + Math.sign(next - t) * maxRate * dt
	const cap = Math.max(0, TIMELINE.lapse.scrollMaxCycles) * dt
	const p0 = lapsePhaseOfTime(t)
	const p1 = lapsePhaseOfTime(next)
	if (Math.abs(p1 - p0) > cap) next = lapseTimeOfPhase(p0 + Math.sign(p1 - p0) * cap)
	// C1: hard catch-up cut, a single one, from inside the timelapse to its edge on the side of the target.
	if (fast && cutOk && next > LAPSE.start && next < LAPSE.end) {
		if (target >= LAPSE.end && target - next > maxLag) return { t: LAPSE.end, cut: true }
		if (target <= LAPSE.start && next - target > maxLag) return { t: LAPSE.start, cut: true }
	}
	return { t: next, cut: false }
}
export function scrollStep(t, target, dt, damping = 0.25, opts = {}) {
	return scrollAdvance(t, target, dt, damping, opts).t
}

// Time (s) where the scroll reaches the phase phi (first time; bounded to the scroll).
export function lapseTimeOfPhase(phi) {
	const T = LAPSE.table
	if (phi <= T[0]) return LAPSE.start
	if (phi >= LAPSE.phaseEnd) return LAPSE.end
	let lo = 0
	let hi = LAPSE.n
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1
		if (T[mid] < phi) lo = mid
		else hi = mid
	}
	const k = T[hi] > T[lo] ? (phi - T[lo]) / (T[hi] - T[lo]) : 0
	return LAPSE.start + (lo + k) * LAPSE.step
}

// Phase of the story (number of days); frozen after the grey dawn. Used for the stages and the counter. v5: it jumps at the
// hard cut of 16.3 s (same frame, later in the night: TIMELINE.actI.after), then joins the scroll at
// 19.0 s without a jump (lapse.phase0 = the phase of act I at that instant). (v9: the cut is at 26.1 s and the scroll starts at 28.8 s.)
// During the freeze of the capture, the sky stops too (the rest of act I is shifted by as much): the final freeze, which
// comes back to the phase of the captured instant, gives the same light.
export function phaseAt(t) {
	if (t < LAPSE.start) {
		const after = TIMELINE.actI.after
		if (after && t >= after.at) return ACT_I_AFTER(t)
		const [g0, g1] = TIMELINE.story.capture !== undefined ? [TIMELINE.story.capture, TIMELINE.story.capture + TIMELINE.story.freezeFrameDuration] : [Infinity, Infinity]
		// v8: in the insertion [INSERT.at, INSERT.cut[, the v7 curve of [at, at + (cut - delta - at)] (13.9 -> 16.3) is stretched over
		// [at, cut]: the time is remapped BEFORE removing the freeze. At the cut, ACT_I_AFTER takes over, as in v7 at 16.3 s.
		if (t > INSERT.at && t < INSERT.cut) t = INSERT.at + (t - INSERT.at) * ((INSERT.cut - INSERT.delta - INSERT.at) / (INSERT.cut - INSERT.at))
		return ACT_I_PHASE(t < g0 ? t : t < g1 ? g0 : t - (g1 - g0))
	}
	return lapsePhaseOfTime(t)
}

// Monotone cubic interpolation (Fritsch-Butland): passes through the keys [x, y] without overshoot, continuous speed.
export function monotoneKeys(keys) {
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
const ACT_I_PHASE = monotoneKeys(TIMELINE.actI.keys)
const ACT_I_AFTER = TIMELINE.actI.after ? monotoneKeys(TIMELINE.actI.after.keys) : null


// ---------------------------------------------------------------------------
// Story: computed dates (STORY), freezes, named moments (BEATS)
// ---------------------------------------------------------------------------

// Intervals of the story, in order (TIMELINE.story), and derived dates.
export const STORY = (() => {
	const S = TIMELINE.story
	const d0 = S.diorama[0]
	const f = S.freeze
	return {
		...S,
		// v8: Efe disappears on the spot at the `quit` cue (== STORY.cues "quit": tested); the dog alone stays until the cut (away[0]).
		playerGone: CUES.find((c) => c.id === 'quit').at,
		// v9: Efe reappears at once at the end of the rewind (the "return" story cue); invisible on [playerGone, playerBack[.
		playerBack: CUES.find((c) => c.id === 'return').at,
		// v9: the film hands over to the website here: the crane is done and the background has reached the page colour.
		site: { start: +(d0 + S.pageBlend[1]).toFixed(6) },
		// Hard cut (away[0]): the dog then moves to the absence (dogSitsAbsence). The player is no longer drawn from playerGone.
		playerOut: S.away[0],
		// v8: cues of the interface of the film (frozen table, film time) and their pure function cuesAt (further down).
		cues: CUES,
		card: [f + S.card[0], f + S.card[1]], // browser card of the host (37.1 -> 39.5 s in v7 time)
		freezeFrameSpan: [S.capture, S.capture + S.freezeFrameDuration], // freeze of the capture
		replay: S.restore[1] - S.restore[0], // the band replays the pre-capture (9.3 -> 10.5 s) during `restore`
		rest: [S.turntable[0], TIMELINE.duration],
		backdropFadeAt: [d0 + S.backdropFade[0], d0 + S.backdropFade[1]],
		pageBlendAt: [d0 + S.pageBlend[0], d0 + S.pageBlend[1]],
		displayAt: [d0 + S.displayRamp[0], d0 + S.displayRamp[1]],
		emberAbsorbAt: [d0 + S.emberAbsorb[0], d0 + S.emberAbsorb[1]],
		// Still image (reduced motion, poster of the host): the witness frame during the freeze of the capture, the suspended
		// ember, the same image as at the final freeze.
		poster: S.capture + 0.25,
		// v6: instant where the host stops the film (`controller.hold()`), inside the freeze of the capture [10.5, 10.9[:
		// the ember is born (0.08 s) and the image is that of the final freeze at the same `at`. The scene changes no date.
		hold: S.capture + 0.1,
		// v6: advised wall duration of the hold (s), so that a page has no magic number.
		holdWall: 2.6,
		// v7: the three instants of the capture signal, in the order of the film (`signal` event, HOST-API.md section 16).
		signals: [
			{ id: 'capture', t: S.capture },
			{ id: 'echo', t: TIMELINE.signals.echo },
			{ id: 'keep', t: TIMELINE.signals.keep },
		].map((g, index) => ({ ...g, index, hold: TIMELINE.signals.holdAt[g.id], wall: TIMELINE.signals.holdWall[g.id] })),
	}
})()

// Active signal at the instant t (pure function): the id of the last instant of the signal crossed less than
// TIMELINE.signals.active film s ago, otherwise null.
export function signalAt(t) {
	const { eps, active } = TIMELINE.signals
	for (const g of STORY.signals) if (t >= g.t - eps && t < g.t + active) return g.id
	return null
}

// The game is frozen: the freeze of the capture, the pause and the black of the departure, the rewind (band running back), then the
// final freeze. The scene clock (wind, fire, particles, breathing) stops; the sky and the camera follow t.
// Second pass v4: the world only freezes in the black (saved), not while the player leaves on foot nor
// during the fade (variant without `walkOut`: the blurred pause therefore shows a fire that still moves, without consequence).
// v5 (brief c): no more freeze at the departure (the freeze is reserved for the capture): [saved, away] is removed for all the
// variants (without walkOut, the black hid it; the fire therefore still moves there, without visible consequence).
// v9: the world stays held from the start of the rewind to the start of the replayed band (the joy scene is inside).
TIMELINE.freezes = [STORY.freezeFrameSpan.slice(), [STORY.rewind[0], STORY.restore[0]], [STORY.freeze, Infinity]]
// Light of the final act: the sky rewinds to the evening of the captured instant. v5: it is there from `rewindLand`.
TIMELINE.actIII = { light: [STORY.rewind[0], STORY.rewindLand] }

export function sceneClock(t) {
	let c = t
	for (const [a, b] of TIMELINE.freezes) c -= Math.max(0, Math.min(t, b) - a)
	return c
}

// "v7" clocks (decisions-v8 section 2): same formulas as v7c, on the v7 constants (TIMELINE_V7: freezes, scroll),
// evaluated at the v7 time of an instant of the film (legacyT). This is what makes the image after the cut identical,
// to that of v7c: flames, smoke, clouds, breaths and random events. Mistake to avoid: sceneClock(legacyT(f))
// with the SHIFTED freezes (at f = 46, 33.8 instead of 32.1). v9: the joy scene holds legacyT at 35.5, so these clocks stand still.
const V7 = (() => {
	const S7 = TIMELINE_V7.story
	const L = LAPSE_V7
	const frz = [
		[S7.capture, S7.capture + S7.freezeFrameDuration],
		[S7.rewind[0], S7.rewind[1]],
		[S7.freeze, Infinity],
	]
	const replay = S7.restore[1] - S7.restore[0]
	const from = S7.capture - replay
	const sceneClock7 = (t) => {
		let c = t
		for (const [a, b] of frz) c -= Math.max(0, Math.min(t, b) - a)
		return c
	}
	const actorTimeAt7 = (t) => {
		const [r0, r1] = S7.rewind
		if (t >= S7.capture && t < S7.capture + S7.freezeFrameDuration) return S7.capture
		if (t < r0) return t
		if (t < r1) return lerp(r0, from, smoothstep(r0, r1, t))
		if (t < S7.freeze) return lerp(from, S7.capture, (t - r1) / (S7.freeze - r1))
		return S7.capture
	}
	const worldClockRaw7 = (t) => {
		const c0 = sceneClock7(L.start)
		if (t < L.start) return sceneClock7(t)
		const days = lapsePhaseOfTime(t, L) - L.phase0
		const extra = t > L.end ? sceneClock7(t) - sceneClock7(L.end) : 0
		return c0 + days * TIMELINE.dayClock + extra
	}
	const worldClock7 = (t) => {
		const [r0, r1] = S7.rewind
		if (t >= r1) return worldClockRaw7(actorTimeAt7(t))
		if (t >= r0) return lerp(worldClockRaw7(r0), worldClockRaw7(from), smoothstep(r0, r1, t))
		return worldClockRaw7(t)
	}
	return { frz, sceneClock: sceneClock7, actorTimeAt: actorTimeAt7, worldClock: worldClock7, rewind: S7.rewind, replayStart: S7.restore[1] }
})()
export const FREEZES_V7 = V7.frz.map((x) => x.slice())

// Clocks of the modules, pure (decisions-v8 section 2.2; tested in T2 because built in mount/apply): `t` (the one the
// modules receive: sky.js uTime, life.js, look.js uSeed), `breathT` (breathing of the fire: relative to the freeze during the freezes,
// otherwise the v7 time) and `seedT`. `state` is a result of sceneState; the ambience of the host (ambient, holdBreath) is added to it.
export function moduleClocks(state) {
	const t = legacyT(state.t)
	return { t, breathT: state.freezeFrame ? state.freezeFrame.at : t, seedT: t }
}

export const isFrozen = (t) => TIMELINE.freezes.some(([a, b]) => t >= a && t < b)

// Current freeze (contract v4, state.freezeFrame): that of the capture (10.5 -> 10.9 s) or the final freeze (36.7 s ->, v7 time). `at`:
// seconds since the start of the freeze; both freezes give the same image at equal `at`.
export function freezeFrameAt(t) {
	const [g0, g1] = STORY.freezeFrameSpan
	const start = t >= STORY.freeze ? STORY.freeze : t >= g0 && t < g1 ? g0 : null
	if (start === null) return null
	const at = t - start
	return { at, k: clamp(at / STORY.freezeFrameDuration, 0, 1) }
}

// Time of the characters (and of the band): t; the captured instant during its freeze; the band running back during the
// rewind (from the memory to 9.3 s), then replaying 9.3 -> 10.5 s during `restore`, down to the captured pose.
export function actorTimeAt(t) {
	const S = STORY
	const [r0, r1] = S.rewind
	const from = S.capture - S.replay
	if (t >= S.freezeFrameSpan[0] && t < S.freezeFrameSpan[1]) return S.capture
	if (t < r0) return t
	// v8: r0 serves as the time VALUE of the band (it starts from the v7 instant of the end of the memory: 32.5 s, not 39.5 s);
	// otherwise it crosses REWIND_HOLD at k = 0.930 instead of 0.909 and the pose of the dog diverges at the end of the rewind.
	if (t < r1) return lerp(r0 - INSERT.delta, from, smoothstep(r0, r1, t))
	// v9: the band waits at its start while the joy scene plays (r1 to restore[0]); it then replays 9.3 -> 10.5 s.
	if (t < S.restore[0]) return from
	if (t < S.freeze) return lerp(from, S.capture, (t - S.restore[0]) / (S.freeze - S.restore[0]))
	return S.capture
}

// Phase of the sky: like phaseAt; during the rewind, the sky goes from the grey dawn to the evening before the capture, then
// follows the replayed band down to the captured evening. Second pass v4: it goes there THROUGH THE DAY (the sun rises, passes and
// goes down again in about 0.47 cycle over 3 s, at most about 0.24 cycle/s) and no longer backward through the night: the blue night of
// 34 -> 35.2 s masked the return of the colours (blind test v4: "night then pink, evening or dawn?"). The blocks, the
// snow and the band always run back; only the sky warms up to the pink.
// v5 (brief e2, "the pink of the evening of 10.5 s from 34.8 s"): it reaches the phase of the captured instant from `rewindLand`
// and holds it during `restore` (in v4, it followed the band replayed from 9.3 s: sun still up, orange light on
// the foliage from 34.8 to 36.7 s; measured: +17 deg of hue on the planter at 35 s). At the final freeze, the same phase.
export function skyPhaseAt(t) {
	const r0 = STORY.rewind[0]
	if (t < r0) return phaseAt(t)
	if (t >= STORY.freeze) return phaseAt(actorTimeAt(t))
	const evening = phaseAt(STORY.capture)
	const ahead = LAPSE.phaseEnd + ((((evening - LAPSE.phaseEnd) % 1) + 1) % 1)
	if (t >= STORY.rewindLand) return ahead
	return lerp(LAPSE.phaseEnd, ahead, smoothstep(r0, STORY.rewindLand, t))
}

// Day/night cycles per second at the instant t (anti-flash rule; speed of the fades of life.js and sky.js).
export function cycleRateAt(t) {
	if (t >= LAPSE.start && t < LAPSE.end) return lapseRateAt(t)
	const h = 1e-3
	return Math.abs(phaseAt(t + h) - phaseAt(t)) / h
}

// Raw "world" clock: accelerated during the timelapse (streaking clouds), frozen with the freezes.

// Clock of the clouds: the clouds go back with the sky during the rewind, then follow the replayed band; at the
// final freeze, the same value as at the freeze of the capture.
export function worldClock(t) {
	return V7.worldClock(legacyT(t)) // v8: v7 time, see V7 above
}

export function worldClockRate(t) {
	if (isFrozen(t)) return 0
	if (t >= LAPSE.start && t < LAPSE.end) return TIMELINE.dayClock * cycleRateAt(t)
	return 1
}

// Stage switches (story seconds).
export const SWAP_TIMES = TIMELINE.swaps.slice()

// Displayed stage. During the rewind, each transition k (stage k -> k+1) is replayed backward: stage k+1
// stays displayed while the vanished blocks rise back to their place (fallsAt), then stage k comes back. v5 (brief
// e2): the four rises fit in [rewind[0], rewindLand]: S0 is back from 34.8 s (v4: S1 until 35.5 s).
// Final pass v5: in [rewindRise, rewindLand] (33.45 -> 34.8 s); before, S4 stays displayed without a fall.
export function stageAt(t) {
	const r0 = STORY.rewindRise ?? STORY.rewind[0] // final pass v5: the rises wait for the front of the wave
	const r1 = STORY.rewindLand
	if (t >= r1) return 0
	if (t >= r0) {
		const n = SWAP_TIMES.length
		const j = Math.min(n - 1, Math.floor(((t - r0) / (r1 - r0)) * n))
		return n - j // sub-window j: transition k = n-1-j in progress, stage k+1 displayed
	}
	let stage = 0
	for (const ts of SWAP_TIMES) if (t >= ts) stage++
	return stage
}

// Active falls: transition k (stage k -> k+1), local time tau since the switch. At the rewind, tau decreases from
// fall.duration to 0 (the blocks rise back, sped up), one transition after the other.
export function fallsAt(t) {
	const r0 = STORY.rewindRise ?? STORY.rewind[0]
	const r1 = STORY.rewindLand
	if (t >= r1) return []
	if (t >= r0) {
		const n = SWAP_TIMES.length
		const x = ((t - r0) / (r1 - r0)) * n
		const j = Math.min(n - 1, Math.floor(x))
		const u = x - j
		return [{ k: n - 1 - j, tau: (1 - u) * (TIMELINE.fall.reverseSpan ?? TIMELINE.fall.duration), reverse: true }]
	}
	const out = []
	SWAP_TIMES.forEach((ts, k) => {
		const tau = t - ts
		if (tau >= 0 && tau < TIMELINE.fall.duration) out.push({ k, tau })
	})
	return out
}

// Pose of a falling cell (offset, axis and angle of rotation), pure in tau.
export function fallPose(tau, drop, seed, reverse = false) {
	const F = reverse ? { ...TIMELINE.fall, ...TIMELINE.fall.reverse } : TIMELINE.fall
	const s = Math.max(0, tau - seed[0] * F.maxDelay)
	const tLand = Math.sqrt((2 * drop) / F.gravity)
	const airborne = Math.min(s, tLand)
	const sink = F.sink * smoothstep(tLand, tLand + 0.8, s) * (s > 0 ? 1 : 0)
	const theta = 2 * Math.PI * seed[4]
	return {
		dx: (seed[2] - 0.5) * F.drift * airborne,
		dy: -Math.min(drop, 0.5 * F.gravity * s * s) - sink,
		dz: (seed[3] - 0.5) * F.drift * airborne,
		axis: [Math.cos(theta), 0, Math.sin(theta)],
		angle: (seed[1] - 0.5) * F.spin * (airborne + 0.15 * Math.min(1, s)),
	}
}

// Second pass v4: at the rewind (reverse), the blocks that rise are opaque almost at once (fade over 0.16 s
// instead of 0.7): translucent and warm in the wave, they read as "bug" or "construction plan".
// Final pass v5: at the rewind, the fade in applies to the start of `reverseSpan` (the blocks appear in the air,
// already on their way up).
export const fallOpacity = (tau, reverse = false) => {
	const F = TIMELINE.fall
	const R = F.reverseSpan ?? F.duration
	return reverse ? 1 - smoothstep(R - 0.22, R - 0.02, tau) : 1 - smoothstep(F.fade[0], F.fade[1], tau)
}

// v12: progress (0..1) of the dissolve-in of the cells that appear at the last stage switch (look.js `uMmGrow`): 0 at the switch, 1 after GROW_SPAN s. 1 outside the absence and during the
// rewind (the stages there rise back, nothing dissolves). Pure in t.
export const GROW_SPAN = 1.6
export function growthAt(t) {
	if (t >= (STORY.rewindRise ?? STORY.rewind[0])) return 1
	const stage = stageAt(t)
	if (stage < 1) return 1
	return smoothstep(0, 1, (t - SWAP_TIMES[stage - 1]) / GROW_SPAN)
}

// ---------------------------------------------------------------------------
// Sun, moon, light
// ---------------------------------------------------------------------------

// Horizontal frame of the reference camera (f aim, r right), turned by yawDeg to the right.
export function skyBasis(eye = TIMELINE.world.camera.eye, target = TIMELINE.world.camera.target, yawDeg = 0) {
	let fx = target[0] - eye[0]
	let fz = target[2] - eye[2]
	const l = Math.hypot(fx, fz) || 1
	fx /= l
	fz /= l
	const a = (yawDeg * Math.PI) / 180
	const c = Math.cos(a)
	const s = Math.sin(a)
	const gx = c * fx - s * fz
	const gz = c * fz + s * fx
	return { f: [gx, 0, gz], r: [-gz, 0, gx] }
}

const BASIS = skyBasis(undefined, undefined, TIMELINE.skyPath.yaw)

// Direction scene -> sun (same formula as sky.js sunDirAt): rise on the right at 0.25, set on the left at 0.75.
export function sunDirAt(phase) {
	const deg = Math.PI / 180
	const { f, r } = BASIS
	const theta = 2 * Math.PI * (phase - 0.25)
	const c = Math.tan(TIMELINE.skyPath.spread * deg) * Math.cos(theta)
	const sn = Math.sin(theta)
	const s = Math.tan(TIMELINE.skyPath.peak * deg) * Math.sign(sn) * Math.abs(sn) ** TIMELINE.skyPath.lift
	return normalize([f[0] + c * r[0], s, f[2] + c * r[2]])
}

// The moon follows the same course half a day later (otherwise it would be behind the camera).
export const moonDirAt = (phase) => sunDirAt(phase + 0.5)
export const elevationAt = (phase) => Math.sin(2 * Math.PI * (phase - 0.25))
export const dayIndexAt = (phase) => Math.floor(phase + 0.5)

export function skyAt(phi) {
	const S = TIMELINE.sky
	const raw = elevationAt(phi)
	const e = raw > 0 ? raw ** TIMELINE.paletteGamma : raw
	const up = e >= 0
	const sunK = smoothstep(0, 0.12, e)
	const moonK = smoothstep(0, 0.2, -e)
	const zenith = sampleKeys(S.zenith, e)
	const horizon = sampleKeys(S.horizon, e)
	return {
		elevation: e,
		zenith,
		horizon,
		sky: horizon,
		sunColor: sampleKeys(S.sunColor, Math.max(e, 0)),
		moonColor: hexToRgb(S.moonColor),
		sunIntensity: S.sunIntensity * sunK,
		moonIntensity: S.moonIntensity * moonK,
		shadow: up ? 0.85 * sunK : 0.45 * moonK,
		hemiSky: sampleKeys(S.hemiSky, e),
		hemiGround: sampleKeys(S.hemiGround, e),
		hemiIntensity: sampleKeys(S.hemiIntensity, e),
		night: smoothstep(0.12, -0.15, e),
	}
}

function dress(L, grey, compress) {
	const G = TIMELINE.sky.grey
	const C = TIMELINE.sky.compress
	const out = { ...L }
	if (compress > 0) {
		const k = compress * C.skyShare
		out.zenith = mixRgb(out.zenith, hexToRgb(C.zenith), k)
		out.horizon = mixRgb(out.horizon, hexToRgb(C.horizon), k)
		out.hemiSky = mixRgb(out.hemiSky, hexToRgb(C.hemiSky), compress)
		out.hemiIntensity = lerp(out.hemiIntensity, C.hemiIntensity, compress)
		out.sunIntensity = lerp(out.sunIntensity, L.elevation >= 0 ? C.lightIntensity : 0, compress)
		out.moonIntensity = lerp(out.moonIntensity, L.elevation < 0 ? C.lightIntensity * C.nightLight : 0, compress)
	}
	if (grey > 0) {
		out.zenith = mixRgb(out.zenith, hexToRgb(G.zenith), grey)
		out.horizon = mixRgb(out.horizon, hexToRgb(G.horizon), grey)
		out.hemiSky = mixRgb(out.hemiSky, hexToRgb(G.hemiSky), grey)
		out.hemiGround = mixRgb(out.hemiGround, hexToRgb(G.hemiGround), grey)
		out.hemiIntensity = lerp(out.hemiIntensity, G.hemiIntensity, grey)
		out.sunColor = mixRgb(out.sunColor, hexToRgb(G.light), grey)
		out.sunIntensity = lerp(out.sunIntensity, Math.max(out.sunIntensity, G.lightMin) * G.lightScale, grey)
		out.shadow = lerp(out.shadow, out.shadow * 0.5, grey)
	}
	out.sky = out.horizon
	// The mist takes the colour of the horizon, slightly pulled toward the zenith (the distance turns blue).
	out.fog = mixRgb(out.horizon, out.zenith, 0.12)
	return out
}

export const greyAt = (t) => {
	const [l0, l1] = TIMELINE.actIII.light
	const g = smoothstep(LAPSE.end - 1.6, LAPSE.end + 1.6, t) // v12: 3.2 s (was 1.2 s), starting 0.7 s before the last collapse (36.95 s): the grey light rises WITH the collapse, so that it is seen, and the luminance no longer jumps by 70 % at the end of the timelapse
	return t < l0 ? g : g * (1 - smoothstep(l0, l1, t))
}

// v5: the scroll starts without a cut (witness frame fixed, 19.0 s): the compression, the smoothing and the cut of
// the glare open over `LAPSE_OPEN` s instead of jumping to their value (a jump would show in the sky).
const LAPSE_OPEN = 1.2 // v12: was 0.5 (the compression, the smoothing and the cut of the glare open over 1.2 s: no jump of the light at the first morning)
// v12b (control P1-2): the compression and the averaging of the light open over 1.8 s STARTING 0.8 s BEFORE the scroll (28.0 -> 29.8 s), not 1.2 s after its start: the sun crosses the horizon
// of the first morning at 29.0 - 29.2 s (the phase goes from midnight to dawn in 0.35 s) while the gate was still at 7 - 15 %, so night became dawn in 3 images (+10 L* at 390). The light now
// rises with the gate over 1.8 s whatever the sun does (the light is averaged over the whole cycle from the first morning on; the sun and the moon stay hidden by the cuts below).
export const LIGHT_OPEN = Object.freeze([LAPSE.start - 0.9, LAPSE.start + 0.5])
const lapseOpenAt = (t) => smoothstep(LIGHT_OPEN[0], LIGHT_OPEN[1], t)

// v12: a quantity of the timelapse seen through a triangular window of +/- `half` s (7 samples), so that no light parameter changes faster than the window (a plateau of
// 0.25 s at the sunrise of one of the three mornings no longer brings the true light back for 0.2 s: a pulse of x2 to x3 of the mean luminance, measured at 60 images/s).
// v12b (control P1-2): 25 samples (triangle, one every 0.083 s at half = 1 s) instead of 7 (one every 0.33 s): a ramp of 0.1 s of the raw rate (0.04 -> 1.04 cycle/s at the start of the scroll) went through the
// coarse comb as steps of 0.25 within 0.1 s, so that the moon and its halo went out in ONE image (28.83 - 28.87 s at 390). The steps are now 0.077 at most.
const BLUR_HALF = 12
const BLUR_W = Array.from({ length: 2 * BLUR_HALF + 1 }, (_, i) => BLUR_HALF + 1 - Math.abs(i - BLUR_HALF))
const BLUR_N = BLUR_W.reduce((a, b) => a + b, 0)
export const LIGHT_BLUR = 1.0
export const blurT = (fn, t, half = LIGHT_BLUR) => BLUR_W.reduce((acc, w, i) => acc + w * fn(t + ((i - BLUR_HALF) / BLUR_HALF) * half), 0) / BLUR_N

export function compressAt(t) {
	const C = TIMELINE.sky.compress
	// v12: the amount follows the smoothed rate (cycleRateSeenAt), not the raw one: the plateau of 0.25 s of each sunrise no longer brings the true light back.
	const amount = lerp(C.amount[0], C.amount[1], smoothstep(C.rate[0], C.rate[1], cycleRateSeenAt(t)))
	return t < LIGHT_OPEN[0] ? 0 : amount * lapseOpenAt(t) * (1 - smoothstep(LAPSE.end - 1.6, LAPSE.end + 1.6, t)) // v12: released over 3.2 s with the grey dawn (was 1 s)
}
// v12: the rate the sky and the discs react to (state.cycleRate): the same window, so that the disc of the sun or of the moon, the trails and the strobe of the stars follow the days
// over 1.4 s instead of appearing for 0.25 s at each sunrise plateau (the sun crossing the top of a phone frame doubled the mean luminance every 1.1 s, measured at 60 images/s).
export function cycleRateSeenAt(t) {
	if (t < LAPSE.start - LIGHT_BLUR || t > LAPSE.end + LIGHT_BLUR) return cycleRateAt(t)
	return blurT(cycleRateAt, t)
}

export function lightingAt(t) {
	const phi = skyPhaseAt(t)
	const d = displayAt(t)
	return dress(skyAt(d > 0 ? lerp(phi, TIMELINE.display.phase, d) : phi), greyAt(t), compressAt(t))
}

// v12b (control P1-2): 25 samples across the phase window (triangle) instead of 9: with 9 samples, one every 0.11 cycle at the width of the first days, each sample crossing the horizon was a step of the
// light (the `night` weight moved by 4 per second at the first sunrise). The steps are now at most 1/169 of the swing each.
const SMOOTH_HALF = 12
const SMOOTH_WEIGHTS = Array.from({ length: 2 * SMOOTH_HALF + 1 }, (_, i) => SMOOTH_HALF + 1 - Math.abs(i - SMOOTH_HALF))
// Light smoothed during the timelapse (anti-flash): weighted average of the light over a PHASE window around
// the current phase (grey and compression of the instant t), wider when the scroll goes fast. Outside the
// scroll, the window closes (act I, grey dawn and rewind intact).
// Width (in cycles) of the window, 0 outside the timelapse. v12: also given to the sky (state.skySmooth: its twilight glow was averaged over only 0.5 cycle, so a pink haze of
// x2 of the mean luminance crossed a phone frame at every sunset).
export function smoothAmountAt(t) {
	const open = t < LIGHT_OPEN[0] ? 0 : lapseOpenAt(t) * (1 - smoothstep(LAPSE.end - 1.6, LAPSE.end + 1.6, t)) // v12: released over 3.2 s with the dawn (was 0.8 s)
	if (open <= 0) return 0
	return sampleKeys(TIMELINE.sky.smooth.amount, cycleRateSeenAt(clamp(t, LAPSE.start, LAPSE.end - 1e-3))) * open
}
export function lightingSmoothAt(t) {
	const base = lightingAt(t)
	const amount = smoothAmountAt(t)
	if (amount <= 1e-4) return base
	const phi = skyPhaseAt(t)
	const grey = greyAt(t)
	const compress = compressAt(t)
	const n = SMOOTH_WEIGHTS.length
	const total = SMOOTH_WEIGHTS.reduce((a, b) => a + b, 0)
	const samples = SMOOTH_WEIGHTS.map((_, i) => (i === (n - 1) / 2 ? base : dress(skyAt(phi + (i / (n - 1) - 0.5) * amount), grey, compress)))
	const out = { ...base }
	for (const key of Object.keys(base)) {
		const v = base[key]
		if (typeof v === 'number') out[key] = samples.reduce((acc, L, i) => acc + L[key] * SMOOTH_WEIGHTS[i], 0) / total
		else if (Array.isArray(v)) out[key] = v.map((_, j) => samples.reduce((acc, L, i) => acc + L[key][j] * SMOOTH_WEIGHTS[i], 0) / total)
	}
	return out
}

// Share of the solar glare cut during the scroll (0 = intact), constant from end to end.
export function glareCutAt(t) {
	// v12: the cut is already total when the first day starts (opens over 0.8 s BEFORE 28.8 s: the first sunrise halo was a pulse of x2 with a 1.2 s opening) and is released only after the
	// end of the timelapse, over 1.6 s (it was released 1.6 s BEFORE the end, which brought the halos back while the days still went by at 1.4 cycle/s: the pulse of 37.2 s)
	const open = smoothstep(LAPSE.start - 0.8, LAPSE.start, t) * (1 - smoothstep(LAPSE.end, LAPSE.end + 1.6, t))
	// v12: total cut while the days go by (smoothed rate above 0.3 to 0.8 cycle/s): the rays and the halo of the sun in the frame were a pulse of x2 to x3 at every passage.
	const cut = lerp(Math.max(TIMELINE.sky.glare.cut, 0.93), 1, smoothstep(0.3, 0.8, cycleRateSeenAt(t)))
	return cut * open
}

// Share of the `keyLight.lapse` settings (main light brought in front of the facade): 1 from the start of the scroll
// to the end of the grey dawn, then back to the base settings during the light of act III.
export function keyLightLapseAt(t) {
	const [l0, l1] = TIMELINE.actIII.light
	return smoothstep(LAPSE.start, LAPSE.start + 1, t) * (1 - smoothstep(l0, l1, t))
}

// ---------------------------------------------------------------------------
// The house: fire, windows, lanterns, chimney (pure functions of t)
// ---------------------------------------------------------------------------

// Bump 0 -> 1 -> 0: rise [a, b], hold, fall [c, d].
export const bump = (x, a, b, c, d) => smoothstep(a, b, x) * (1 - smoothstep(c, d, x))

// Campfire lit (0..1): it dies when the house falls asleep, stays off during the scroll, relights at the
// start of `restore` (from the ember). The scene also applies the rule "S0 only".
// v5: "lower fire" after the hard cut (STORY.fireAfterCut), then it dies (fireOut).
export function campfireAt(t) {
	const [r0] = STORY.restore
	// v9b: the fire is lit from the first frame of the celebration (the warm light of the witness frame); from 50.5 s on it stays at 1 instead of rising from the ember.
	const [rl0, rl1] = STORY.v9.return.relight
	if (t >= r0) return 1
	if (t >= rl0) return smoothstep(rl0, rl1, t) * STORY.v9.return.fireLevel
	const [f0, f1] = STORY.fireOut
	// v5: the fire lowers while the night falls (lateHour: "it is late"), without touching the captured instant or the
	// freezes; it is also the anti-flash of the fire tile (flicker of life.js: 3 flashes/s in 1/16 of the image from
	// 13.4 to 14.9 s at level 1, the frozen v4 included).
	const [l0, l1] = STORY.fireLow ?? [Infinity, Infinity]
	const low = lerp(1, STORY.fireLowLevel ?? 1, smoothstep(l0, l1, t))
	const level = t >= STORY.away[0] ? STORY.fireAfterCut ?? 1 : low
	// v9 final pass: the fire softens by 45 % while the camera pushes in on the dog (the eye goes to the dog, not to the flames; and the fire leaves the frame of a
	// phone dimmer, so that its light does not drop in one step). Back to the v8b value at the cut.
	const [d0, d1] = STORY.v9.fireDim.at
	const dim = t < STORY.away[0] ? 1 - STORY.v9.fireDim.amount * smoothstep(d0, d1, t) : 1
	return level * dim * (1 - smoothstep(f0, f1, t))
}

// Spray of the fire (0..1): when the player feeds it (two gestures) and when it relights; off before the final freeze
// (the fire there is the same as at the freeze of the capture).
export function fireFlareAt(t) {
	let f = 0
	for (const [, b] of STORY.swings) {
		const hit = b - 0.12
		if (t >= hit) f = Math.max(f, Math.exp(-(t - hit) / 0.35) * smoothstep(hit, hit + 0.06, t))
	}
	const r0 = STORY.restore[0] + 0.05
	if (t >= r0 && t < STORY.freeze) {
		const relight = Math.exp(-(t - r0) / 0.35) * smoothstep(r0, r0 + 0.08, t) * (1 - smoothstep(STORY.freeze - 0.5, STORY.freeze - 0.1, t))
		f = Math.max(f, relight)
	}
	return t >= STORY.freeze || f < 1e-3 ? 0 : clamp(f, 0, 1)
}

// Window i (0..1): it lights up during the hold of act I (one by one), goes out after the departure, relights in
// the final act. The real glow = level x windowNightAt(t).
export function windowLevelAt(i, t) {
	const pick = (list) => list[i] ?? list.at(-1)
	if (t >= STORY.restore[0]) {
		const on = STORY.restore[0] + pick(STORY.windowsOn)
		return smoothstep(on, on + 0.2, t)
	}
	const lit = pick(STORY.windowsLit)
	const off = pick(STORY.windowsOff)
	return smoothstep(lit, lit + 0.25, t) * (1 - smoothstep(off, off + 0.18, t))
}

// "Night" share of the glow of the windows: bold from the hold of act I (the sky turns pink, the house lights up) and in
// the final act (the kept evening); elsewhere, the night alone.
export function windowNightAt(t, night) {
	const lit = (t >= STORY.together[0] && t < LAPSE.start) || t >= STORY.restore[0]
	return lit ? Math.max(night, 0.8) : night
}

export function lanternLevelAt(i, t) {
	const off = STORY.lanternsOff[i] ?? STORY.lanternsOff.at(-1)
	const on = STORY.restore[0] + (STORY.lanternsOn[i] ?? STORY.lanternsOn.at(-1))
	// v9b: the lanterns come on one after the other from the first frame of the celebration; from 50.5 s on they stay at 1.
	const [l0, l1] = STORY.v9.return.relight
	if (t >= l0) return smoothstep(l0 + 0.05 * i, l1 + 0.05 * i, t)
	if (t >= STORY.restore[0]) return smoothstep(on, on + 0.15, t)
	return 1 - smoothstep(off, off + 0.22, t)
}

export function chimneyAt(t) {
	const [r0] = STORY.restore
	if (t >= r0) return smoothstep(r0, r0 + 0.4, t)
	return 1 - smoothstep(STORY.chimneyOut[0], STORY.chimneyOut[1], t)
}

// Seasons (0..1), in story seconds (STORY.seasons); nothing during the grey dawn and the final act.
export function seasonAt(t) {
	if (t < LAPSE.start || t >= STORY.dawn[0] + 0.3) return { snow: 0, autumn: 0 }
	const S = STORY.seasons
	const of = (list) => list.reduce((m, [a, b, c, d]) => Math.max(m, bump(t, a, b, c, d)), 0)
	return { snow: of(S.snow), autumn: of(S.autumn) }
}

// Label of the elapsed duration (data for the host, never drawn): according to the stage, then "9 years" at the grey dawn.
export function elapsedAt(t) {
	if (t < STORY.playerGone || t >= STORY.rewind[1]) return null
	if (t >= STORY.dawn[0]) return TIMELINE.elapsed.at(-1)
	return TIMELINE.elapsed[stageAt(t)]
}
// Moon phase displayed for the night `day` (only the readable phases of TIMELINE.moonPhases).
export const moonPhaseOf = (day) => TIMELINE.moonPhases[((Math.floor(day) % TIMELINE.moonPhases.length) + TIMELINE.moonPhases.length) % TIMELINE.moonPhases.length]

export function windAt(t) {
	const lapse = smoothstep(LAPSE.start, LAPSE.start + 2, t) * (1 - smoothstep(LAPSE.end - 1, LAPSE.end + 1, t))
	return 0.55 + 0.15 * lapse - 0.1 * greyAt(t)
}

// ---------------------------------------------------------------------------
// Choreography: paths (Catmull-Rom on the ground, parametrised by length), pure poses in t
// ---------------------------------------------------------------------------

function makeRoute(points) {
	const curve = new THREE.CatmullRomCurve3(
		points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
		false,
		'centripetal',
	)
	curve.arcLengthDivisions = 400
	return { curve, length: curve.getLength() }
}

// Walking profile: cruising speed then linear braking over `decel` seconds.
export function walkProfile(tau, length, speed, decel) {
	const dd = (speed * decel) / 2
	const cruise = Math.max(0, (length - dd) / speed)
	if (tau <= 0) return { s: 0, v: speed, done: false }
	if (tau < cruise) return { s: speed * tau, v: speed, done: false }
	const u = Math.min(tau - cruise, decel)
	const s = Math.min(length, length - dd + speed * u - (speed * u * u) / (2 * decel))
	return { s, v: speed * (1 - u / decel), done: tau >= cruise + decel }
}

export const walkDuration = (length, speed, decel) => Math.max(0, (length - (speed * decel) / 2) / speed) + decel

function makeLeg(points, start, speed, decel) {
	const route = makeRoute(points)
	return { ...route, start, speed, decel, end: start + walkDuration(route.length, speed, decel) }
}

// Paths: the arrival (A), then toward the bench (B). v8: no more walk away (path C); Efe disappears on the spot.
export const LEGS = (() => {
	const P = TIMELINE.actors.player
	const D = TIMELINE.actors.dog
	const S = TIMELINE.story
	return {
		player: [makeLeg(P.routeA, P.start, P.speed, P.decel), makeLeg(P.routeB, S.bStart.player, P.speedB, P.decelB)],
		dog: [makeLeg(D.routeA, D.start, D.speed, D.decel), makeLeg(D.routeB, S.bStart.dog, D.speedB, D.decelB)],
	}
})()

const _p = new THREE.Vector3()
const _d = new THREE.Vector3()
function legAt(leg, t) {
	const w = walkProfile(t - leg.start, leg.length, leg.speed, leg.decel)
	const u = clamp(w.s / leg.length, 0, 1)
	leg.curve.getPointAt(u, _p)
	leg.curve.getTangentAt(Math.min(u, 0.999), _d)
	return { x: _p.x, z: _p.z, yaw: Math.atan2(_d.x, _d.z), s: w.s, v: w.v }
}

// v11 (fix): envelope (0..1) of the stride over the first (walks that start from rest) and the last half step of a leg: the legs leave and reach the stop closed.
// Before, the stride jumped from 0 to full in one frame at the start of the second legs (dog 5.50 s, Efe 5.75 s) and from the speed of the walk to the speed of the next clip at every stop.
export const HALF_STEP = 0.55 // blocks (a little more than half a step: the stride rises over 0.17 s at 3.2 blocks/s)
const gaitOf = (leg, s, withStart) => (withStart ? EASE.inOut(clamp(s / HALF_STEP, 0, 1)) : 1) * EASE.inOut(clamp((leg.length - s) / HALF_STEP, 0, 1))
// v11 (fix): a gaze that moves from one target to another used to move its POINT in a straight line; near the head that sweeps a huge angle in a few frames (the head of Efe whipped
// by 1.5 rad in 0.03 s at 13.2 s when the moon target gave way to the dog). Mixing the DIRECTIONS (yaw and pitch, as seen from the head) makes the angle itself ease.
function gazeMix(origin, a, b, k) {
	const dir = (p) => {
		const dx = p[0] - origin[0]
		const dy = p[1] - origin[1]
		const dz = p[2] - origin[2]
		return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)), dist: Math.hypot(dx, dy, dz) }
	}
	const da = dir(a)
	const db = dir(b)
	const yaw = da.yaw + angleDelta(da.yaw, db.yaw) * k
	const pitch = lerp(da.pitch, db.pitch, k)
	const dist = lerp(da.dist, db.dist, k)
	return [origin[0] + dist * Math.cos(pitch) * Math.sin(yaw), origin[1] + dist * Math.sin(pitch), origin[2] + dist * Math.cos(pitch) * Math.cos(yaw)]
}
// A gaze blend for a pose: through directions (v11 fix) or the straight line of v10b. `pose.position` is the feet of the character; the eye is taken 0.9 block above for the dog, 1.3 for Efe.
const gazeOf = (pose, a, b, k, aw, h = 0.9) => (aw.fix > 0 ? gazeMix([pose.position[0], pose.position[1] + h, pose.position[2]], a, b, k) : lerp3(a, b, k))
const yawTo = (from, to) => Math.atan2(to[0] - from[0], to[to.length - 1] - from[from.length - 1])
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]

// Place of the dog (sitting, then lying): in front of the north half of the bench, at the feet of its master.
export const DOG_SPOT = TIMELINE.actors.dog.routeB.at(-1)
const DOG_SEAT_YAW = yawTo(DOG_SPOT, [TIMELINE.world.bench.head[0], TIMELINE.world.bench.head[2]])
const DOG_DOOR_YAW = yawTo(DOG_SPOT, [TIMELINE.world.door[0], TIMELINE.world.door[2]])
const dogHeadAt = (yaw) => [DOG_SPOT[0] + 0.45 * Math.sin(yaw), TIMELINE.world.surfaceY + 0.95, DOG_SPOT[1] + 0.45 * Math.cos(yaw)]

// Variants of the story (contract v4): decisions for Andy and Breval, options of mount() and setVariant().
// coldGlow: cold "real life" glow at the departure; forgetting: the ruin is the forgetting (desaturation through the
// edges); afk: AFK capture (the player no longer moves, then the world freezes); false = M key (no gesture added:
// the captured instant does not move, only the host changes its text; `capture.data.trigger` is then 'manual').
// dawnSwish: at the grey dawn, the lying dog sweeps the ground with its tail once (29.3 s); false = motionless, only the
// breathing and the ears move (bible: "only the grass moves").
// Second pass v4: walkOut (the player leaves on foot along the path, instead of the blurred pause on the spot); dawnHead
// (at the grey dawn, the lying dog keeps its head a little raised: it waits, it is not dead).
// v5 (brief section 4): coldGlow off by default (the cold glow read as moonlight); dogSits (new,
// default): the dog stays SITTING the whole absence (false: the v4, it lies at the place of the player, `dogLiesDown`);
// dawnHead only acts on the lying dog (dogSits = false). v5, wiring pass (brief section 4, line `dawn`: "ear
// twitch at 29.3, instead of the sweep `dawnSwish`, kept as an option"): dawnSwish off by default; the complete v4
// is compared with dogSits = false AND dawnSwish = true (?dogSits=0&dawnSwish=1). v9: dogSits is accepted and ignored (always true).
// v8: `walkOut` no longer exists (no more walk away; the comparison is made against web-v7c-frozen/): an unknown key is ignored.
export const VARIANT_DEFAULTS = Object.freeze({ coldGlow: false, forgetting: true, afk: true, dawnSwish: false, dawnHead: true, dogSits: true })
export const VARIANT_KEYS = Object.keys(VARIANT_DEFAULTS)

// Arm gesture (vanilla attack): progress 0..1 during each gesture (the care of the fire; the "stay"), 0 otherwise.
export function swingAt(t) {
	for (const [a, b] of [...STORY.swings, STORY.point]) if (t >= a && t < b) return (t - a) / (b - a)
	return 0
}

// Crouch (0..1): v8, Efe crouches facing the dog (13.9 -> 14.15), stays crouched during the two typings, gets up (17.8 -> 18.1 in v9).
export const crouchAt = (t) => {
	const V = STORY.v8
	return bump(t, V.crouch[0], V.crouch[1], V.rise[0], V.rise[1])
}

// Sitting on the bench (0..1): from the end of path B until he gets up (lateHour).
export function sitAt(t) {
	const B = LEGS.player[1]
	return smoothstep(B.end, B.end + STORY.sit, t) * (1 - smoothstep(STORY.standUp[0], STORY.standUp[1], t))
}

// What the player looks at when "real life" calls him: toward the bottom of the witness frame, camera side (the cold glow
// rises from the bottom of the image). `coldGlow` variant only (v4).
// ---------------------------------------------------------------------------
// v8: cues of the interface of the film (STORY.cues), pure functions of t
// ---------------------------------------------------------------------------
const cueOf = (id) => CUES.find((c) => c.id === id)
const countKeys = (keys, t) => keys.reduce((n, k) => n + (k <= t ? 1 : 0), 0)
// Instantaneous rate of a typing: 1 / interval of the last two keys while the last one is recent
// (max(0.25 s; 2 intervals)), otherwise 0; before the 2nd key, 0 (no interval). wild: 0 (< 8 c/s), 1 (8 to 12), 2 (>= 12).
function typingOf(c, t) {
	if (!(t >= c.open && t < c.send)) return null
	const n = countKeys(c.keys, t)
	let rate = 0
	if (n >= 2) {
		const iv = c.keys[n - 1] - c.keys[n - 2]
		if (t - c.keys[n - 1] <= Math.max(0.25, 2 * iv)) rate = 1 / iv
	}
	return { id: c.id, n, rate, wild: rate >= 12 ? 2 : rate >= 8 ? 1 : 0 }
}
// v11: how far the glide of the cursor between two items has gone, times its length (0 outside a glide; peaks in the middle): the hand bulges by this much.
function menuArcAt(c, t) {
	const path = c.path
	for (let i = 0; i < path.length - 1; i++) {
		const [at, name] = path[i]
		const next = path[i + 1]
		if (t >= at && t < next[0] && name !== next[1]) {
			const a = c.items[name]
			const b = c.items[next[1]]
			return Math.sin(Math.PI * smoothstep(at, next[0], t)) * Math.hypot(b[0] - a[0], b[1] - a[1])
		}
	}
	return 0
}
function menuOf(c, t) {
	if (!(t >= c.open && t < c.close)) return null
	let panel = c.panels[0][1]
	for (const [at, name] of c.panels) if (t >= at) panel = name
	const path = c.path
	let item = path[0][1]
	let pos = c.items[item]
	for (let i = 0; i < path.length; i++) {
		const [at, name] = path[i]
		if (t >= at) {
			item = name
			pos = c.items[name]
			const next = path[i + 1]
			if (next && t < next[0]) {
				const k = smoothstep(at, next[0], t)
				const q = c.items[next[1]]
				pos = [lerp(pos[0], q[0], k), lerp(pos[1], q[1], k)]
				item = k >= 0.5 ? next[1] : name
			}
		}
	}
	const inWin = (list) => list.find(([a, b]) => t >= a && t < b)?.[2] ?? null
	return { panel, item, u: pos[0], v: pos[1], hover: inWin(c.hover), pressed: inWin(c.press) }
}
/**
 * Active cues at the instant t of the film (pure): { lines: [{ id, tone, at }] (lines sent <= t, in order),
 * typing: { id, n, rate, wild } | null, menu: { panel, item, u, v, hover, pressed } | null, gone }. `opts.modchat === false`
 * removes the mod line (cue `option: 'modchat'`). v9: `gone` is true from the departure of Efe until his return (45.3 s).
 */
export function cuesAt(t, opts = {}) {
	const lines = []
	let typing = null
	let menu = null
	for (const c of CUES) {
		if (c.option === 'modchat' && opts.modchat === false) continue
		if (c.kind === 'line' && t >= c.at) lines.push({ id: c.id, tone: c.tone, at: c.at })
		else if (c.kind === 'say') {
			if (t >= c.send) lines.push({ id: c.id, tone: 'player', at: c.send })
			typing ??= typingOf(c, t)
		} else if (c.kind === 'gui') menu = menuOf(c, t)
	}
	lines.sort((a, b) => a.at - b.at)
	return { lines, typing, menu, gone: t >= STORY.playerGone && t < STORY.playerBack }
}

// `cue` events: a sorted table of the crossings, derived from STORY.cues (decisions-v8 section 6.2).
const CUE_EVENTS = (() => {
	const ev = []
	const push = (at, name, id, data = {}, option = null) => ev.push({ at, name, id, data, option })
	for (const c of CUES) {
		if (c.kind === 'line') push(c.at, 'chat.line', c.id, { tone: c.tone }, c.option ?? null)
		else if (c.kind === 'say') {
			push(c.open, 'typing.start', c.id, { keys: c.keys.length, send: c.send })
			push(c.send, 'typing.end', c.id, { sent: true })
			push(c.send, 'chat.line', c.id, { tone: 'player' })
		} else if (c.kind === 'gui') {
			push(c.open, 'menu.open', c.id, { panel: c.panels[0][1], items: Object.keys(c.items).length })
			for (const [at, panel] of c.panels.slice(1)) push(at, 'menu.panel', c.id, { panel })
			for (const [a, , item] of c.hover) push(a, 'menu.hover', c.id, { item })
			for (const [a, , item] of c.press) push(a, 'menu.click', c.id, { item })
			push(c.close, 'menu.close', c.id, {})
		} else if (c.kind === 'story') push(c.at, c.event, c.id, {})
	}
	push(cueOf('quit').at, 'player.leave', 'quit', { who: 'player' })
	return ev.map((e, i) => ({ ...e, i })).sort((a, b) => a.at - b.at || a.i - b.i)
})()
/**
 * Crossings between two instants (pure). Going forward (t1 > t0): the cues of ]t0, t1], phase 'enter', in order.
 * Going backward (t1 < t0): those of ]t1, t0], phase 'exit', in reverse order. Additive: (a, c) = (a, b) then (b, c).
 */
export function cueEventsBetween(t0, t1, opts = {}) {
	const keep = (e) => !(e.option === 'modchat' && opts.modchat === false)
	const mk = (e, phase) => ({ type: 'cue', name: e.name, id: e.id, phase, at: e.at, data: e.data })
	if (t1 > t0) return CUE_EVENTS.filter((e) => keep(e) && e.at > t0 && e.at <= t1).map((e) => mk(e, 'enter'))
	if (t1 < t0)
		return CUE_EVENTS.filter((e) => keep(e) && e.at > t1 && e.at <= t0)
			.reverse()
			.map((e) => mk(e, 'exit'))
	return []
}

const COLD_LOOK = (() => {
	const h = TIMELINE.world.bench.head
	const e = TIMELINE.world.shots.witness.eye
	return [lerp(h[0], e[0], 0.55), TIMELINE.world.surfaceY + 0.25, lerp(h[2], e[2], 0.55)]
})()
// v5 (brief a1): he raises his head toward the moon, "it is late". The moon (about 5 deg above the horizon, in the north at 12 s)
// is out of reach of his head (sitting facing east, <= 74 deg): he looks 50 deg to his left, moon side, 25 deg above
// the horizon. Seen from the witness frame (camera in the south-east), it is a profile, chin raised.
const MOON_LOOK = (() => {
	const h = TIMELINE.world.bench.head
	const yaw = TIMELINE.world.bench.yaw + (50 * Math.PI) / 180
	const pitch = (25 * Math.PI) / 180
	return [h[0] + 10 * Math.sin(yaw) * Math.cos(pitch), h[1] + 10 * Math.sin(pitch), h[2] + 10 * Math.cos(yaw) * Math.cos(pitch)]
})()

// Pose of the player (world coordinates; the integrator converts). Generic fields passed to characters.js:
// `sit` (0..1), `crouch` (0..1), `swing` (0..1, arm gesture), `still` (0..1, AFK); a module that does not know them
// ignores them and the scene applies a fallback on the pieces (see applyPlayerFallback).
// No pose changes between 10.4 and 11.6 s: the freeze of the capture and the final freeze give the same image.
// v11: swing of the legs while a pivot lasts (-1..1): over a window [a, b], sin(pi u)^2 x sin(2 pi cycles u), u = progress. Two or more windows add up. 0 outside: the legs are the legs of the clip.
function pivotSwing(t, windows) {
	let s = 0
	for (const [a, b, cycles = 1] of windows) {
		if (t > a && t < b) {
			const u = (t - a) / (b - a)
			s += Math.sin(Math.PI * u) ** 2 * Math.sin(2 * Math.PI * cycles * u) // sin^2 envelope: smooth (C-infinity) at both ends, the swing starts and stops at rest
		}
	}
	return s
}
export function playerPoseAt(t, variant = VARIANT_DEFAULTS, aw = ZERO_W) {
	const pose = playerPoseBase(t, variant, aw)
	if (aw.nat > 0) {
		const A = LEGS.player[0]
		const B = LEGS.player[1]
		const sw = pivotSwing(t, [
			[A.end, A.end + TIMELINE.actors.player.turn],
			[B.start - 0.5, B.start - 0.2],
			[STORY.turnToDog[0], STORY.turnToDog[1]],
			[STORY.v8.turn[0], STORY.v8.turn[1]],
		])
		if (sw !== 0) pose.stepSwing = sw
	}
	return pose
}
// v11b: the entrance offset (blocks in the world plane) of the first leg of Efe, as a function of the distance walked. LEFT is the screen-left axis of the opening shot (world.camera: it looks
// toward (-0.64, -0.76) and the horizontal axis of the screen is (0.765, -0.644)): the path of the arrival is shifted `aside` blocks to the left until `hold`, then returns to the original
// path by `len`; the depth does not change. The feet are in the frame from about 7.7 blocks from the eye; the original path rose along the bottom-left corner (lateral -4 to -2.4 blocks),
// which showed the head alone; shifted, it leaves the frame by the left edge until it is deep enough, then walks in from that edge.
const STAND_UP_NAT = Object.freeze([12.15, 12.85])
const SIT_NAT = 1.1
const PLAYER_FADE_OUT = 0.25 // v11b: pixel fade-out of Efe at the quit cue (seconds)
const ENTRY = Object.freeze({ left: [-0.765, 0.644], aside: 2.2, hold: 5, len: 11 })
function entryOffset(s) {
	const k = s <= ENTRY.hold ? 1 : 1 - smoothQuintic((s - ENTRY.hold) / (ENTRY.len - ENTRY.hold))
	return [k * ENTRY.aside * ENTRY.left[0], k * ENTRY.aside * ENTRY.left[1]]
}
function playerPoseBase(t, variant = VARIANT_DEFAULTS, aw = ZERO_W) {
	const W = TIMELINE.world
	const S = STORY
	const y = W.surfaceY
	const [A, B] = LEGS.player
	const visible = t >= A.start && t < S.playerGone
	const flame = [W.fire[0], y + 0.6, W.fire[2]]
	if (t < A.end) {
		const w = legAt(A, t)
		const walkA = { clip: 'walk', speed: Math.max(0.6, w.v), distance: w.s, position: [w.x, y, w.z], yaw: w.yaw, visible }
		if (aw.fix > 0) walkA.gait = gaitOf(A, w.s, false)
		if (aw.nat > 0 && visible) {
			// v11b (blind test: "the head of Efe enters alone by the corner at 1.3 s"): the camera is low, so a figure that rises from the bottom of the frame shows its head first. The path of the
			// arrival is the same from 6.5 blocks on; before, it is pushed deeper into the frame and out of it on the left, so that he walks in from the left edge, body and head together.
			const o = entryOffset(w.s)
			const o2 = entryOffset(w.s + 0.05)
			walkA.position = [w.x + o[0], y, w.z + o[1]]
			walkA.yaw = Math.atan2(Math.sin(w.yaw) + (o2[0] - o[0]) / 0.05, Math.cos(w.yaw) + (o2[1] - o[1]) / 0.05)
		}
		return walkA
	}
	if (t < B.start) {
		// In front of the fire: half turn toward the flames, two arm gestures (he feeds it).
		const w = legAt(A, A.end)
		const faceFire = Math.atan2(W.fire[0] - w.x, W.fire[2] - w.z)
		const pose = {
			clip: 'idle',
			from: 'walk',
			blend: smoothstep(A.end, A.end + 0.35, t),
			fromSpeed: 0,
			distance: w.s,
			position: [w.x, y, w.z],
			yaw: lerpAngle(w.yaw, faceFire, smoothstep(A.end, A.end + TIMELINE.actors.player.turn, t)),
			lookAt: flame,
			lookWeight: smoothstep(A.end, A.end + 0.3, t) * (1 - smoothstep(B.start - 0.2, B.start, t)),
			swing: swingAt(t),
			visible,
		}
		if (aw.fix > 0) {
			pose.gait = 0 // v11: the legs of the walk that ends here are closed (gaitOf is 0 at the end of the leg)
			// v11 (fix): the heading used to snap by 80 degrees in one frame when leg B started (5.75 s). He now turns toward the path between 5.25 and 5.55 s, before leaving ("turn, then go").
			pose.yaw = lerpAngle(pose.yaw, legAt(B, B.start).yaw, EASE.inOut((t - (B.start - 0.5)) / 0.3))
		}
		if (pose.blend >= 1) {
			delete pose.from
			delete pose.blend
		}
		const s0 = S.swings[0][0]
		const s1 = S.swings.at(-1)[1]
		if (t >= s0 && t < s1) {
			delete pose.from
			delete pose.blend
			Object.assign(pose, { clip: 'swing', time: t - s0, swings: S.swings.length, swingDuration: (s1 - s0) / S.swings.length })
		}
		return pose
	}
	if (t < B.end) {
		const w = legAt(B, t)
		const walkB = { clip: 'walk', speed: Math.max(0.6, w.v), distance: A.length + w.s, position: [w.x, y, w.z], yaw: w.yaw, visible }
		if (aw.fix > 0) walkB.gait = gaitOf(B, w.s, true)
		return walkB
	}
	// On the bench (he looks at his dog, then no longer moves: AFK); the late hour: he turns his head toward the cold
	// glow and gets up; "stay": he turns toward the dog and points at it with his arm; a single crouch, "see you tomorrow".
	// v11b: with the pass he takes 0.7 s to get up (0.5 s: "all at once"); the window starts a tenth earlier and ends 0.1 later (the same final pose at 12.85 s: the dog rises at 12.8 s)
	const SU = aw.nat > 0 ? STAND_UP_NAT : S.standUp
	const SIT = aw.nat > 0 ? SIT_NAT : S.sit // v11b: he sits down over 1.1 s (0.8 s: the weight went onto the bench between 7.0 and 7.45 s, "all at once")
	const sit = smoothstep(B.end, B.end + SIT, t) * (1 - smoothstep(SU[0], SU[1], t))
	const front = [W.bench.front[0], y, W.bench.front[1]]
	const wB = legAt(B, B.end)
	let yaw = lerpAngle(wB.yaw, W.bench.yaw, smoothstep(B.end, B.end + SIT, t))
	yaw = lerpAngle(yaw, yawTo(W.bench.front, DOG_SPOT), smoothstep(S.turnToDog[0], S.turnToDog[1], t))
	const dogHead = dogHeadAt(DOG_SEAT_YAW)
	const standK = smoothstep(SU[0], SU[1], t)
	const dogTarget = [dogHead[0], dogHead[1] - 0.15 * standK, dogHead[2]]
	const look = variant?.coldGlow === true ? S.coldLook : S.moonLook
	const cold = smoothstep(look[0], look[1], t) * (1 - smoothstep(S.turnToDog[0], S.turnToDog[1], t))
	const lookFar = variant?.coldGlow === true ? COLD_LOOK : MOON_LOOK
	const seatPos = lerp3(front, W.bench.seat, sit)
	// v11 (fix): the dog -> moon blend of the gaze goes through the directions seen from his head (see gazeMix)
	const lookTarget = aw.fix > 0 ? gazeMix([seatPos[0], seatPos[1] + 1.3, seatPos[2]], dogTarget, lookFar, cold) : lerp3(dogTarget, lookFar, cold)
	const pose = {
		clip: 'idle',
		position: seatPos,
		yaw,
		seat: W.bench.seatHeight,
		lookAt: lookTarget,
		lookWeight: smoothstep(B.end + 0.1, B.end + 0.6, t),
		sit,
		crouch: crouchAt(t),
		swing: swingAt(t),
		visible,
	}
	if (variant?.afk !== false) pose.still = smoothstep(S.still[0], S.still[1], t) * (1 - smoothstep(S.captureEnd + 0.1, S.captureEnd + 0.3, t))
	if (t >= S.v8.crouch[0]) return playerV8Pose(t, pose, yaw, aw)
	if (t < B.end + SIT) Object.assign(pose, { clip: 'sit_down', blend: clamp((t - B.end) / SIT, 0, 1) })
	else if (t < SU[0]) pose.clip = 'sit'
	else if (t < SU[1]) Object.assign(pose, { clip: 'stand_up', blend: clamp((t - SU[0]) / (SU[1] - SU[0]), 0, 1) })
	else if (t >= S.point[0] && t < S.point[1]) Object.assign(pose, { clip: 'stay', time: t - S.point[0], stayDuration: S.point[1] - S.point[0], swing: 0 })
	return pose
}

// ---------------------------------------------------------------------------
// v8: Efe near the dog (13.9 -> 21.4 s in v9): crouch held, two typings, getting up, menu screen, disappearance on the spot
// ---------------------------------------------------------------------------
// Point of the plane of the screen / of the bubble in front of his chest (world), `forward` blocks in front of him and `height` above the feet.
const aheadOf = (pose, forward, height, lateral = 0) => {
	const s = Math.sin(pose.yaw)
	const c = Math.cos(pose.yaw)
	return [pose.position[0] + s * forward + c * lateral, pose.position[1] + height, pose.position[2] + c * forward - s * lateral]
}
// Direction (+/-1) in which the local lateral axis of the character (that of characters.js armAim) goes toward the right of the screen, for the camera of the witness frame.
const guiScreenSign = (yaw) => {
	const sh = TIMELINE.world.shots.witness
	const fx = sh.target[0] - sh.eye[0]
	const fz = sh.target[2] - sh.eye[2]
	const right = [-fz, fx] // right of the camera in the plane (x, z)
	return Math.cos(yaw) * right[0] - Math.sin(yaw) * right[1] >= 0 ? 1 : -1
}
/** "In front of the chest" point of Efe (world) for a pose of the player: 0.6 block in front, at the height of the hands. */
export const playerFrontWorld = (pose) => aheadOf(pose, 0.6, 1.0 - 0.3 * (pose.sneakK ?? 0))
// v11 (fix): typing as continuous functions of the key times. Before, the bounce of a key started at full value (a 22 degree jump of one arm in one frame at every key), the arm that bounced
// changed with the last key (the previous bounce vanished), and the oscillation of the arms took its phase from `rate x T`: it jumped whenever the rate changed.
//   typeHitR / typeHitL  sum of the bounces of the last three keys of the right / left hand (rise 0.06 s, fall 0.12 s, both quintic)
//   typeN, typeU         fractional index of the key (n = keys hit, u = progress to the next one): the oscillation is sin(pi (n + u)), continuous when the rate changes
//   typeAmp              0..1, a continuous count of the recent keys (the rate used to jump at every key and to fall to 0 at once after 0.25 s)
export const TYPE_ATTACK = 0.06
export const TYPE_DECAY = 0.12
// One bounce: a quintic rise then a quintic fall (C2 at the junction: the acceleration of a 0.2 rad bounce stays under 360 rad/s2, the "C1 break" threshold of the tests).
const typePulse = (dt) => EASE.inOut(dt / TYPE_ATTACK) * (1 - EASE.inOut((dt - TYPE_ATTACK) / TYPE_DECAY))
function typingFix(t) {
	const out = { typeHitR: 0, typeHitL: 0, typeN: 0, typeU: 0, typeAmp: 0 }
	for (const c of CUES) {
		if (c.kind !== 'say' || !(t >= c.keys[0] && t < c.send + 0.2)) continue
		const n = countKeys(c.keys, t)
		for (let j = Math.max(0, n - 3); j < n; j++) {
			const dt = t - c.keys[j]
			const h = typePulse(dt)
			if (j % 2 === 0) out.typeHitR += h
			else out.typeHitL += h
		}
		const last = c.keys[n - 1]
		const nextKey = c.keys[n]
		const interval = n >= 2 ? last - c.keys[n - 2] : 0.12
		out.typeN = n
		out.typeU = nextKey !== undefined ? (t - last) / (nextKey - last) : Math.min(1, (t - last) / Math.max(0.05, interval))
		// amplitude: a continuous count of the recent keys (each key rises over 0.05 s and fades over 0.35 s); 3 keys in the window = full
		let sum = 0
		for (let j = Math.max(0, n - 6); j < n; j++) {
			const tau = t - c.keys[j]
			sum += EASE.inOut(tau / 0.05) * (1 - EASE.inOut((tau - 0.05) / 0.35))
		}
		out.typeAmp = clamp(sum / 3, 0, 1)
		break
	}
	return out
}
function playerV8Pose(t, pose, yawToDog, aw = ZERO_W) {
	const S = STORY
	const V = S.v8
	const k = crouchAt(t)
	const yaw = lerpAngle(yawToDog, V.menuYaw, smoothstep(V.turn[0], V.turn[1], t))
	pose.yaw = yaw
	pose.crouch = k
	pose.swing = 0
	Object.assign(pose, { clip: 'sneak', time: t - V.crouch[0], sneakBeats: 0, sneakK: k })
	// Typing (layer `type`): forearms raised during each message, bounce of the hands at each key (same `keys` as the bubble).
	let type = 0
	let hit = 0
	let side = 0
	let rate = 0
	for (const c of CUES) {
		if (c.kind !== 'say') continue
		type = Math.max(type, bump(t, c.arms[0], c.arms[0] + 0.15, c.send, c.arms[1]))
		const n = countKeys(c.keys, t)
		if (n > 0 && t < c.send + 0.2) {
			const dt = t - c.keys[n - 1]
			const h = Math.exp(-dt / 0.06)
			if (h > hit) {
				hit = h
				side = (n - 1) % 2
				const ty = typingOf(c, c.keys[n - 1] + 1e-6)
				rate = ty?.rate ?? 0
			}
		}
	}
	if (type > 0) Object.assign(pose, { type, typeHit: hit, typeSide: side, typeRate: rate })
	if (aw.fix > 0 && type > 0) Object.assign(pose, typingFix(t))
	if (aw.nat > 0) {
		// v11: bursts of keys (the shoulders rise, the head leans in), the pauses between them (the hands drift, the head lifts to reread), the "enter" at the sending.
		let burst = 0
		for (const [a, b] of TYPING_BURSTS) burst = Math.max(burst, window4(t, a - 0.04, a + 0.05, b + 0.05, b + 0.2))
		const send = cueOf('say').send
		pose.typeBurst = burst
		pose.typePause = clamp(1 - burst, 0, 1) * clamp(type, 0, 1) // 0 when no message is being typed
		pose.typeSend = window4(t, send - 0.05, send + 0.04, send + 0.08, send + 0.28)
	}
	// Two waves of the hand, crouching ("hellos", removed in v8: empty list).
	const wave = V.coucous.reduce((m, [a, b]) => (t >= a && t < b ? Math.max(m, Math.sin((Math.PI * (t - a)) / (b - a))) : m), 0)
	if (wave > 0) pose.waveK = wave
	// Screen of the menu (layer `gui`): the right hand follows the cursor, which reads the same table (cuesAt).
	const menu = cueOf('menu')
	const gui = smoothstep(menu.hands[0], menu.hands[0] + 0.15, t) * (t < menu.hands[1] ? 1 : 0)
	if (gui > 0) {
		const m = cuesAt(t).menu
		const first = menu.items[menu.path[0][1]]
		const u = m ? m.u : first[0]
		const v = m ? m.v : first[1]
		const press = menu.press.reduce((best, [a, b]) => (t >= a && t < b ? Math.max(best, Math.sin((Math.PI * (t - a)) / (b - a))) : best), 0)
		pose.gui = gui
		pose.guiCursor = [guiScreenSign(yaw) * u, v]
		pose.guiClick = press
		if (aw.nat > 0) {
			// v11: the hand goes round (an arc: it rises by a quarter of the distance in the middle of the glide instead of a straight line), the click is a net press then a slow release,
			// the hand hesitates over the button, the shoulders rise with the breath before the click and fall after it.
			pose.guiCursor = [pose.guiCursor[0], v - 0.25 * menuArcAt(menu, t)]
			pose.guiClick = menu.press.reduce((best, [a, b]) => {
				if (!(t >= a && t < b)) return best
				const x = (t - a) / (b - a)
				return Math.max(best, x < 0.27 ? EASE.inOut(x / 0.27) : 1 - EASE.inOut((x - 0.27) / 0.73))
			}, 0)
			pose.guiHover = menu.hover.reduce((best, [a, b]) => Math.max(best, window4(t, a, a + 0.25, b - 0.1, b)), 0)
			pose.guiBreath = window4(t, 21.0, 21.08, 21.12, 21.16) - 0.5 * window4(t, 21.15, 21.19, 21.25, 21.35)
		}
		pose.lookAt = gazeOf(pose, pose.lookAt, playerFrontWorld({ ...pose, sneakK: 0 }), gui, aw, 1.3)
	}
	if (t >= S.playerGone) pose.visible = false
	return pose
}

// Place of the lying dog (act II, v4) and orientations.
export const DOG_REST = TIMELINE.world.dogRest.at
const DOG_REST_YAW = yawTo(DOG_REST, TIMELINE.world.dogRest.face)
const DOG_WALK_YAW = yawTo(DOG_SPOT, DOG_REST)
const DOG_STEP = Math.hypot(DOG_REST[0] - DOG_SPOT[0], DOG_REST[1] - DOG_SPOT[1])
const DOG_TO_MASTER_YAW = yawTo(DOG_SPOT, TIMELINE.world.bench.front)

// Typing bursts: groups of keys at most 0.12 s apart ("the head tilted at every burst").
const TYPING_BURSTS = (() => {
	const out = []
	for (const c of CUES) {
		if (c.kind !== 'say') continue
		let g = [c.keys[0], c.keys[0]]
		for (const k of c.keys.slice(1)) {
			if (k - g[1] <= 0.12) g[1] = k
			else {
				out.push(g)
				g = [k, k]
			}
		}
		out.push(g)
	}
	return out
})()
function dogInsertion(pose, t, eye, aw = ZERO_W) {
	const S = STORY
	const V = S.v8
	const W = TIMELINE.world
	const y = W.surfaceY
	const front = [W.bench.front[0], y, W.bench.front[1]]
	const say = cueOf('say')
	const menu = cueOf('menu')
	// It draws nothing at random during the insertion: its reactions are written (dogStoryLayersAt sets restless 0).
	const burstTilt = TYPING_BURSTS.reduce((m, [a, b]) => Math.max(m, 0.45 * bump(t, a - 0.05, a + 0.1, b + 0.15, b + 0.35)), 0)
	// v11 (fix): a max has a corner where two values cross; the 4-norm (a^4 + b^4)^(1/4) has none and equals the max when one of them is 0 (the bursts of a message overlap).
	if (aw.fix > 0) {
		let sum4 = (0.25 * pose.lookWeight) ** 4
		for (const [a, b] of TYPING_BURSTS) sum4 += (0.45 * bump(t, a - 0.05, a + 0.1, b + 0.15, b + 0.35)) ** 4
		pose.tilt = Math.sqrt(Math.sqrt(sum4))
	} else pose.tilt = Math.max(0.25 * pose.lookWeight, burstTilt)
	// Tail: still during the whole insertion (it only wags at the return of the evening, v7c; v9: during the joy scene and the replayed band).
	pose.tail = 'still'
	pose.wagAmp = 0
	pose.eager = 0
	pose.obey = pose.obey ?? 0
	pose.gaze = 'player'
	// Ears: up at the sending of "stay..." (17.65) and as long as he looks at the screen.
	pose.alert = lerp(0.4, 1, smoothstep(say.send - 0.05, say.send + 0.05, t))
	// v11 (fix): it used to jump from 0 to 0.4 in one frame at 13.9 s (the head rose by half a pixel); it now notices Efe crouching over 0.25 s
	if (aw.fix > 0) pose.alert *= EASE.inOut((t - V.crouch[0]) / 0.25)
	// He looks at the screen (18.3 -> 21.4), then at the empty place.
	// v11 (fix): its gaze leaves the screen over 0.3 s instead of 0.1 s (a cubic ramp: the head turned at over 7 rad/s with a kink at the end)
	const screen = smoothstep(menu.open - 0.15, menu.open + 0.1, t) * (1 - (aw.fix > 0 ? EASE.inOut((t - (S.playerGone - 0.3)) / 0.3) : smoothstep(S.playerGone - 0.1, S.playerGone, t)))
	if (screen > 0) {
		const p = playerFrontWorld({ position: front, yaw: V.menuYaw, sneakK: 0 })
		pose.lookAt = gazeOf(pose, pose.lookAt, p, screen, aw)
		pose.lookWeight = 1
	}
	if (t >= S.playerGone) dogAfterLeave(pose, t, eye, front, aw)
	// The only window of the film where the dog may look at the camera (decisions-v9 section 8.2).
	const [n0, n1] = S.v9.dog.noCameraRule
	pose.avoidCamera = t >= n0 && t < n1 ? 0 : 60
}

// v11: the explicit steps of a dog that turns in notches while it sits: notch i lifts the front paw of the side it turns toward (even: right, odd: left), a bump of 0.2 s.
// `pawR` / `pawL` (0..1) for characters.js.
function pawSteps(t, starts, len) {
	const out = { pawR: 0, pawL: 0 }
	starts.forEach((at, i) => {
		const w = window4(t, at - 0.03, at + len * 0.5, at + len * 0.6, at + len + 0.05)
		if (i % 2 === 0) out.pawR = Math.max(out.pawR, w)
		else out.pawL = Math.max(out.pawL, w)
	})
	return out
}

// v9: Efe has left (21.4 s). The dog looks at the empty place, turns to the visitor (head first, then the body), looks at
// them sadly, lies down as a sphinx (head up, never on the paws), and the camera pushes in (cameraAt). `eye` is the camera eye
// (world) of the frame being shown, so that the look and the heading follow the framing of each aspect ratio.
function dogAfterLeave(pose, t, eye, front, aw = ZERO_W) {
	const S = STORY
	const V = S.v9.dog
	const y = TIMELINE.world.surfaceY
	const [e0, e1] = V.lookEmpty
	const empty = [front[0], y + 0.85, front[2]]
	const k = smoothstep(e0, e1, t)
	const cam = eye ?? TIMELINE.world.shots.witness.eye
	// Head: the empty place first, then the camera (the head leads), then back to the empty place while lying.
	const toCam = smoothstep(V.headLead[0], V.headLead[1], t) * (1 - smoothstep(V.gazeOff[0], V.gazeOff[1], t))
	pose.lookAt = aw.fix > 0 ? gazeOf(pose, gazeOf(pose, [front[0], y + 1.6, front[2]], empty, k, aw), cam, toCam, aw) : lerp3(lerp3([front[0], y + 1.6, front[2]], empty, k), cam, toCam)
	pose.lookWeight = 1
	pose.lookUp = 0.6 * (1 - k)
	pose.alert = lerp(1, 0.6, k)
	// No head tilt while it looks at the visitor (a tilt reads as curious, not sad).
	pose.tilt = 0.2 * k * (1 - smoothstep(V.toCamera[0], V.toCamera[1], t))
	pose.sad = lerp(S.v8.dog.sad * k, V.sadLevel[1], smoothstep(V.sad[0], V.sad[1], t))
	pose.sadFace = smoothstep(V.sad[0], V.sad[1], t) // the close-up look: ears drooping outward, head dipped (characters.js)
	pose.gaze = toCam > 0.5 ? 'visitor' : null
	// Body: faces the camera in three quarters, the bench side set back (the heading is restored at the cut, in dogSitsAbsence).
	const camYaw = Math.atan2(cam[0] - DOG_SPOT[0], cam[2] - DOG_SPOT[1]) + V.turn
	// v11: each notch is a step (a front paw lifts: `pawR` / `pawL`) with a 6 % overshoot of the heading that settles, over 0.2 s (the three notches of 22.25, 22.45, 22.65 s fill the gap).
	const notch = aw.nat > 0 ? (at) => OVER06(clamp((t - at) / (V.turnNotch + 0.08), 0, 1)) : (at) => smoothstep(at, at + V.turnNotch, t)
	const turned = V.turnSteps.reduce((sum, at) => sum + notch(at), 0) / V.turnSteps.length
	pose.yaw = lerpAngle(pose.yaw, camYaw, turned)
	if (aw.nat > 0) Object.assign(pose, pawSteps(t, V.turnSteps, V.turnNotch + 0.08))
	// Lying down as a sphinx: sit -> lie with the head up, ears half back, the flanks breathing.
	const [l0, l1] = V.lieDown
	if (t >= l0) {
		const lk = smoothstep(l0, l1, t)
		if (t < l1) Object.assign(pose, { clip: 'lie_down', from: 'sit', blend: (t - l0) / (l1 - l0) })
		else {
			pose.clip = 'lie'
			delete pose.from
			delete pose.blend
		}
		pose.headUp = V.lieHeadUp * lk
		pose.rest = V.lieRest * lk
		pose.sad = lerp(pose.sad, V.nightSad, lk)
		pose.restless = 0
		pose.breath = lerp(1, V.breath, lk)
		pose.tail = 'low'
		pose.tilt = 0
	}
}

// Pose of the dog (story seconds, world coordinates). `gaze`: direction of the gaze, indicative (contract v4).
export function dogPoseAt(t, variant = VARIANT_DEFAULTS, ctx = {}) {
	const pose = dogPoseBase(t, variant, ctx)
	const aw = ctx.w ?? ZERO_W
	if (aw.nat > 0) {
		const [LA, LB] = LEGS.dog
		const tr = pivotSwing(t, [
			[LA.end, LA.end + TIMELINE.actors.dog.turn],
			[LB.start - 0.3, LB.start],
		])
		if (tr !== 0) pose.trot = tr
	}
	return pose
}
function dogPoseBase(t, variant = VARIANT_DEFAULTS, ctx = {}) {
	const aw = ctx.w ?? ZERO_W
	const W = TIMELINE.world
	const S = STORY
	const y = W.surfaceY
	const A = TIMELINE.actors.dog
	const G = S.dog
	const [LA, LB] = LEGS.dog
	if (t < LA.end) {
		const w = legAt(LA, t)
		const walkA = { clip: 'walk', speed: Math.max(0.6, w.v), distance: w.s, position: [w.x, y, w.z], yaw: w.yaw, tail: 'wag', visible: t >= LA.start }
		if (aw.fix > 0) walkA.gait = gaitOf(LA, w.s, false)
		return walkA
	}
	const playerAtFire = LEGS.player[0].curve.getPointAt(1, new THREE.Vector3())
	if (t < LB.start) {
		// Waits standing near its master while he feeds the fire.
		const w = legAt(LA, LA.end)
		const face = Math.atan2(playerAtFire.x - w.x, playerAtFire.z - w.z)
		const pose = {
			clip: 'stand',
			from: 'walk',
			blend: smoothstep(LA.end, LA.end + 0.4, t),
			speed: A.speed,
			distance: w.s,
			position: [w.x, y, w.z],
			yaw: lerpAngle(w.yaw, face, smoothstep(LA.end, LA.end + A.turn, t)),
			lookAt: [playerAtFire.x, y + 1.55, playerAtFire.z],
			lookWeight: 0.7 * smoothstep(LA.end, LA.end + 0.5, t),
			tail: 'wag',
			gaze: 'player',
			visible: true,
		}
		if (aw.fix > 0) {
			// v11 (fix): the heading used to snap by 173 degrees in one frame when leg B started (5.50 s); the head pitch by 24 degrees. It turns toward the path in the 0.3 s before leaving, its gaze lets go.
			const pre = EASE.inOut((t - (LB.start - 0.3)) / 0.3)
			// Two turns that overlap (toward Efe until 5.49 s, toward the path from 5.2 s): summed on the unwrapped angle, the shortest-path interpolation flipped sides in between.
			const y1 = w.yaw + angleDelta(w.yaw, face)
			const y2 = y1 + angleDelta(y1, legAt(LB, LB.start).yaw)
			const yaw = w.yaw + (y1 - w.yaw) * smoothstep(LA.end, LA.end + A.turn, t) + (y2 - y1) * pre
			pose.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw))
			pose.lookWeight *= 1 - EASE.inOut((t - (LB.start - 0.3)) / 0.12) // the gaze lets go while the body is only starting to turn (the head would otherwise counter-turn at the speed of the body)
		}
		if (aw.fix > 0) pose.gait = 0 // v11: it stopped with its legs closed (gaitOf is 0 at the end of the leg); the blend 'walk' -> 'stand' was replayed at the speed of A.speed (3.4), the walk ended at 0.6
		if (pose.blend >= 1) {
			delete pose.from
			delete pose.blend
		}
		return pose
	}
	if (t < LB.end) {
		const w = legAt(LB, t)
		const walkB = { clip: 'walk', speed: Math.max(0.6, w.v), distance: LA.length + w.s, position: [w.x, y, w.z], yaw: w.yaw, tail: 'wag', visible: true }
		if (aw.fix > 0) walkB.gait = gaitOf(LB, w.s, true)
		return walkB
	}
	const end = legAt(LB, LB.end)
	const pose = {
		position: [DOG_SPOT[0], y, DOG_SPOT[1]],
		yaw: lerpAngle(end.yaw, DOG_SEAT_YAW, smoothstep(LB.end, LB.end + A.turn, t)),
		avoidCamera: 60, // characters.js: the head is pushed away from the camera (rule of the brief)
		visible: true,
	}
	const sitTime = t - LB.end - 0.05
	if (sitTime < 2 * 0.6) Object.assign(pose, { clip: 'sit_down', from: 'walk', time: Math.max(0, sitTime), speed: A.speedB, distance: LA.length + LB.length, ...(aw.fix > 0 ? { gait: 0 } : {}) })
	else pose.clip = 'sit'

	// The evening and the departure: it raises its head toward its master (sitting, then standing), the tail wags.
	const seatHead = W.bench.head
	const standHead = [W.bench.front[0], y + 1.6 - 0.35 * crouchAt(t), W.bench.front[1]]
	pose.lookAt = lerp3(seatHead, standHead, aw.nat > 0 ? smoothstep(STAND_UP_NAT[0], STAND_UP_NAT[1], t) : smoothstep(S.standUp[0], S.standUp[1], t)) // v11b: the gaze follows the longer stand
	pose.lookWeight = smoothstep(S.dogLooksUp[0], S.dogLooksUp[0] + 0.4, t)
	pose.tilt = 0.25 * pose.lookWeight
	pose.tail = 'wag'
	pose.gaze = pose.lookWeight > 0.5 ? 'player' : null
	pose.lookUp = pose.lookWeight
	// The tail wags during the hold, calms down (9.0 -> 9.35 s), then ONE beat from 9.6 to 10.5 s: the band replayed
	// at the return (9.3 -> 10.5 s) only shows that beat, and the freeze takes it at its end (tail in the
	// centre) at both freezes.
	// v11b (blind test: "its poses change in jumps around 13 s"): with the pass it gets up over 0.55 s (0.4) and sits back down over 0.65 s (0.5): at the 8 images/s of a sheet a hind leg
	// moved by 66 degrees from one image to the next.
	const r0 = S.dogRises[0]
	const r1 = aw.nat > 0 ? r0 + 0.55 : S.dogRises[1]
	const s0 = S.dogSits[0]
	const s1 = aw.nat > 0 ? s0 + 0.65 : S.dogSits[1]
	const eager = smoothstep(r0, r1, t) * (1 - smoothstep(s0 - 0.1, s0 + 0.05, t))
	pose.wagAmp = Math.max(1 - smoothstep(9.0, 9.35, t), eager)
	pose.tailBeat = S.capture - 0.9
	if (t >= r0 && t < S.playerOut) {
		pose.eager = eager
		pose.obey = smoothstep(s0 - 0.1, s0 + 0.1, t) * (1 - smoothstep(s1, s1 + 0.4, t))
	}
	if (t >= r0 && t < s1) {
		if (t < r1) Object.assign(pose, { clip: 'stand_up', blend: (t - r0) / (r1 - r0) })
		else if (t < s0) pose.clip = 'stand'
		else Object.assign(pose, { clip: 'sit_down', from: 'stand', blend: (t - s0) / (s1 - s0) })
	}
	// Standing, it turns toward its master (it wants to follow him); it stays turned toward him until the cut.
	if (t >= r0 && t < S.playerOut) pose.yaw = lerpAngle(pose.yaw, DOG_TO_MASTER_YAW, smoothstep(r0, r1, t))
	// v8: the insertion (13.9 -> cut). Written reactions, in film time: it watches Efe crouch, tilts its head at every
	// burst of typing, raises its ears at the sending of "stay...", lifts its head when
	// Efe gets up, looks at the screen, then at the empty place when he has disappeared (v9: then at the visitor, sad, then lying down).
	if (t >= S.v8.crouch[0] && t < S.playerOut) dogInsertion(pose, t, ctx.eye, aw)
	// v11 (fix): the dog used to react in the very frame where Efe disappears (its head jumped by 9 degrees and lost its tilt). It now needs 0.12 s to see, then the gaze, the ears and
	// the tilt move over 0.25 s from what they were while it watched the screen.
	if (aw.fix > 0 && t >= S.playerGone && t < S.playerGone + 0.5) {
		const pre = dogPoseAt(S.playerGone - 1e-3, variant, ctx)
		const k = EASE.inOut((t - S.playerGone - 0.12) / 0.25)
		if (k < 1) {
			for (const key of ['lookAt', 'lookWeight', 'lookUp', 'alert', 'tilt', 'sad', 'sadFace']) {
				if (Array.isArray(pose[key])) pose[key] = gazeOf(pose, pre[key] ?? pose[key], pose[key], k, aw)
				else if (pose[key] !== undefined || pre[key] !== undefined) pose[key] = lerp(pre[key] ?? 0, pose[key] ?? 0, k)
			}
		}
	}

	// The absence: the dog stays at its place (dogSitsAbsence), lying through the night and sitting up at the first morning.
	// The v4 variant `dogSits: false` (the dog lies down at the player's place) is no longer supported (decisions-v9 section 8.2).
	if (t >= S.playerOut && t < S.rewind[1]) return dogNightLayer(dogSitsAbsence(pose, t, aw), t)

	return pose
}

// The v5 absence (variant `dogSits`, brief b1): sitting at its place the whole absence. The body turned toward the
// bench at night, then toward the door from the first morning (in profile for the witness frame); the head goes from the empty place to
// the closed door at each sunrise, and lowers a bit more after each; in the snow, toward the door; at dawn, low,
// toward the empty place; at the memory, toward the ember. Fuller breathing, ear twitches, low tail.
const DOG_SEAT_HEAD = TIMELINE.world.bench.head
function morningGazeAt(t) {
	const G = TIMELINE.story.dog.sits
	const [a, b, c, d] = G.morningLook
	return TIMELINE.lapse.mornings.reduce((m, s) => Math.max(m, bump(t, s + a, s + b, s + c, s + d)), 0)
}
function dogSadAt(t) {
	const G = TIMELINE.story.dog.sits
	let sad = 0
	TIMELINE.lapse.mornings.forEach((s, i) => {
		const prev = i ? G.sadSteps[i - 1] : 0
		sad = Math.max(sad, lerp(prev, G.sadSteps[i], smoothstep(s + G.sadRamp[0], s + G.sadRamp[1], t)))
	})
	if (t >= G.dawnSeat) sad = G.dawnSad
	return sad
}
function dogSitsAbsence(pose, t, aw = ZERO_W) {
	const S = STORY
	const G = S.dog.sits
	const W = TIMELINE.world
	const a0 = S.away[0]
	pose.clip = 'sit'
	delete pose.from
	delete pose.blend
	delete pose.eager
	delete pose.obey
	pose.position = [DOG_SPOT[0], W.surfaceY, DOG_SPOT[1]]
	pose.yaw = lerpAngle(DOG_SEAT_YAW, DOG_DOOR_YAW, smoothstep(G.toDoorV5[0], G.toDoorV5[1], t))
	// Gaze: the empty place, the door at each sunrise (then continuously after the last morning), the empty place at dawn.
	const morning = morningGazeAt(t)
	const doorHold = t >= G.doorFrom && t < G.dawnSeat ? smoothstep(G.doorFrom, G.doorFrom + 0.3, t) : 0
	const door = Math.max(morning, doorHold)
	const seatHead = [DOG_SEAT_HEAD[0], DOG_SEAT_HEAD[1] - 0.4, DOG_SEAT_HEAD[2]]
	pose.lookAt = gazeOf(pose, seatHead, W.door, door, aw)
	pose.lookWeight = 0.9 * smoothstep(a0, a0 + 0.2, t)
	pose.gaze = door > 0.5 ? 'door' : 'seat'
	pose.lookUp = 0.5 * (1 - door) * (1 - smoothstep(G.dawnSeat - 0.1, G.dawnSeat, t))
	pose.tilt = 0.12 * (1 - door)
	const sad = dogSadAt(t)
	pose.sad = sad
	// characters.js: sad = max(sad, 0.85*f(wait)) and rest (head on the paws) deduced from wait: wait capped, rest 0.
	pose.wait = lerp(0.1, G.waitMax, smoothstep(a0, S.dawn[0], t))
	pose.rest = 0
	pose.alert = lerp(0.6, 0.15, smoothstep(a0, a0 + 2.5, t)) + 0.55 * bump(t, G.earFlick[0], G.earFlick[0] + 0.12, G.earFlick[1] - 0.2, G.earFlick[1])
	pose.breath = lerp(1, G.breath, smoothstep(S.lightsOut[0], S.lightsOut[1], t))
	pose.earTwitch = 1
	pose.tail = sad > 0.25 ? 'low' : 'still'
	// v11 (fix): the regime was switched by a threshold (32.154 s: the tail fell by 16 degrees in one frame). The weight of the low tail now rises with `sad` (characters.js mixes the two regimes).
	if (aw.fix > 0) pose.tailLow = smoothQuintic((sad - 0.15) / 0.2)
	pose.wagAmp = 0
	// The memory: the ember brightens (peak 31.15 s in v7 time); it turns its head from the empty place toward it, ears up.
	const [m0, m1] = S.dog.wake
	if (t >= m0) {
		const k = smoothstep(m0, m1, t)
		pose.lookAt = gazeOf(pose, pose.lookAt, W.ember, k, aw)
		pose.lookWeight = lerp(pose.lookWeight, 0.95, k)
		if (k > 0.5) pose.gaze = 'ember'
		pose.sad = lerp(sad, 0.12, k)
		pose.lookUp = 0
		pose.alert = lerp(pose.alert, 0.85, k)
		pose.tilt = 0.12 * k
		pose.earTwitch = 1 - k
		pose.wait = lerp(pose.wait, 0.1, k)
		pose.breath = lerp(pose.breath, 1, k)
	}
	pose.avoidCamera = 60
	pose.visible = true
	return pose
}

// v9: the dog lies through the night (as a sphinx, head up) after the cut and sits up again at the first morning. `pose` is the
// result of dogSitsAbsence (sitting, heading toward the bench, head toward the empty place). Nothing of this layer is left in the
// pose from 29.2 s on: the dog is then exactly the v8b dog, so that v9(f) = v8b(f - 4.3) holds again.
// Final pass: while it lies through the night the dog is moved 0.9 block toward the right of the frame of the witness shot (the cut keeps that frame): at 390 px its head
// was cut by the left edge and the grey heap read as dead. `dog.*` is exempt from the v8b equivalence on [26.1, 29.4], and the shift fades out while it sits up.
const NIGHT_SHIFT = (() => {
	const w = TIMELINE.world.shots.witness
	const fx = w.target[0] - w.eye[0]
	const fz = w.target[2] - w.eye[2]
	const l = Math.hypot(fx, fz) || 1
	return [(-fz / l) * 0.9, (fx / l) * 0.9] // screen-right (x, z), as the course of the sky is described (SKY_PATH basis)
})()
function dogNightLayer(pose, t) {
	const V = STORY.v9.dog
	if (t >= V.sitUp[1]) return pose
	const settle = smoothstep(V.sitUp[0], V.sitUp[1], t) // 0 lying in profile, 1 back on the heading and the place of the band
	const lying = 1 - settle
	pose.yaw = lerpAngle(pose.yaw + V.nightTurn, pose.yaw, settle)
	if (pose.position) pose.position = [pose.position[0] + NIGHT_SHIFT[0] * lying, pose.position[1], pose.position[2] + NIGHT_SHIFT[1] * lying]
	pose.restless = 0 // nothing is drawn at random while it lies
	const rise = smoothstep(V.riseHead[0], V.riseHead[1], t) // the head and chest lift, still lying
	const fold = smoothstep(V.sitBlend[0], V.sitBlend[1], t) // 0 sphinx, 1 sitting
	const night = 1 - rise
	pose.headUp = lerp(V.nightHeadUp, V.riseHeadUp, rise) * (1 - fold)
	pose.rest = lerp(pose.rest ?? 0, V.nightRest, night) * (1 - fold) + (pose.rest ?? 0) * fold
	pose.sad = lerp(pose.sad, V.nightSad, 1 - fold)
	pose.breath = lerp(pose.breath ?? 1, Math.max(V.breath, pose.breath ?? 1), 1 - fold)
	if (t < V.sitBlend[0]) {
		pose.clip = 'lie'
	} else {
		pose.clip = 'sit'
		pose.from = 'lie'
		pose.blend = fold
		if (fold >= 1) {
			delete pose.from
			delete pose.blend
		}
	}
	return pose
}

// Layers of the dog that follow the STORY time (not the band): the calm dawn (no automatic head lift nor sweep,
// a forced sweep if the `dawnSwish` variant is active) and the rewind (the band runs back about 8x:
// no head lifts nor stomping, which would read as jerks). Null at both freezes.
export function dogStoryLayersAt(t, variant = VARIANT_DEFAULTS) {
	const G = STORY.dog
	const [q0, q1] = G.dawnQuiet
	const [r0, r1] = STORY.rewind
	const out = {}
	const quiet = t >= q0 && t < q1
	const rewinding = t >= r0 && t < r1
	const inserted = t >= STORY.v8.crouch[0] && t < STORY.playerOut // v8: written reactions, nothing drawn at random
	if (quiet || rewinding || inserted) out.restless = 0
	if (rewinding) out.eager = 0
	if (quiet && variant?.dawnSwish !== false) out.swish = clamp((t - G.dawnSwish) / G.swishDuration, 0, 1)
	return out
}

// v8b: return of the player to the memory. During the rewind he is not on the bench; at the end of the rewind (the fire relights,
// the tail of the dog wags once) he reappears AT ONCE, sitting, in the pose of the captured instant: same gesture, in reverse, as his disappearance at
// 21.4 s (v5 to v8 showed a golden silhouette that filled in texel by texel: the blind test read a ghost in it). `fade` only takes
// the values 0 and 1; the glow (`memoryGlow`) and the tint (`glowTint`) are no longer used. In STORY time.
// v9d: the bench stays empty after the end of the rewind (45.3 s) for 0.5 s: he appears with the `return` cue (45.8 s), through a 0.2 s pixel fade.
export function playerFadeAt(t) {
	const r0 = STORY.rewind[0]
	const R = STORY.v9.return
	if (t < r0 || t >= R.appear + R.appearFade) return 1
	return t < R.appear ? 0 : smoothstep(R.appear, R.appear + R.appearFade, t)
}
// Pose of the player during the rewind: that of the captured instant (sitting on the bench, before the look at the moon),
// as long as the band is above it; then the band (pre-capture) as in v4. Pure in (story t, band t).
export const REWIND_HOLD = STORY.capture + 0.9 // no pose changes from 10.4 to 11.6 s
export const rewindActorTime = (actorT) => Math.min(actorT, REWIND_HOLD)

// ---------------------------------------------------------------------------
// v9: the return (45.3 to 50.5 s). The world is held (the end of the rewind), Efe is back on the bench in the pose of the band
// at 9.3 s, and the dog, written on its own film clock (state.charClock), sees him, stands up, jumps twice, spins once, sits down and
// joins the pose of the band exactly at 50.5 s (decisions-v9 section 9).
// ---------------------------------------------------------------------------
const EFE_SEAT = TIMELINE.world.bench.seat
// Unit vector (x, z) from the dog's place to Efe's seat: the direction of the hops.
const DOG_TO_EFE = (() => {
	const dx = EFE_SEAT[0] - DOG_SPOT[0]
	const dz = EFE_SEAT[2] - DOG_SPOT[1]
	const l = Math.hypot(dx, dz) || 1
	return [dx / l, dz / l]
})()
/** World position of the dog head for a dog pose (sitting 0.85 block above the ground, standing 1.25), used by Efe's gaze. */
export function dogHeadWorld(pose) {
	const stand = pose.clip === 'stand' ? 1 : pose.clip === 'stand_up' ? smoothstep(0, 1, pose.blend ?? 0) : pose.clip === 'sit_down' ? 1 - smoothstep(0, 1, pose.blend ?? 0) : 0
	const yaw = pose.yaw ?? 0
	return [pose.position[0] + 0.2 * Math.sin(yaw), pose.position[1] + lerp(0.85, 1.25, stand), pose.position[2] + 0.2 * Math.cos(yaw)]
}
const OVER04 = EASE.outBack(0.04, 0.8)
// v11b: position (0..1) of a turn at a steady speed with quintic ramps over a fifth of its length each: velocity = 1 / (1 - a) in the middle, 0 at both ends (peak 1.25 times the mean, the cubic smoothstep: 1.5).
const SPIN_PROFILE = (() => {
	const a = 0.2
	const c = 1 / (1 - a)
	return track([[0, 0], [a, (c * a) / 2, 'in'], [1 - a, 1 - (c * a) / 2, 'linear'], [1, 1, 'out']])
})()
const OVER06 = EASE.outBack(0.06)
const hopWave = (t, [a, b]) => (t > a && t < b ? Math.sin((Math.PI * (t - a)) / (b - a)) : 0)
/**
 * The dog during the return, from its band pose `base` (the pose at 9.3 s: sitting, looking up at Efe). Pure in the film time
 * `t` in [45.3, 50.5[; the fade back to `base` is complete at 50.4 s, so the pose at 50.5 s is the v8b pose at 41.0 s.
 */
export function dogJoyAt(base, t, camEye = null, aw = ZERO_W) {
	const R = STORY.v9.return
	const out = { ...base }
	const ramp = (a, b) => smoothstep(a, b, t)
	// He sees Efe: ears up (alert), head toward him (the band already looks at his head).
	out.alert = lerp(base.alert ?? 0, 1, ramp(R.perk[0], R.perk[1]))
	// Tail: a soft wag from 46.6 s, the full wag from 48.2 s, back to the band wag while it sits down.
	const soft = ramp(R.wagSoft[0], R.wagSoft[0] + 0.2)
	const full = ramp(R.standUp[0], R.party[0])
	const settle = ramp(R.sitDown[0], R.sitDown[1])
	out.tail = 'wag'
	out.wagAmp = lerp(lerp(lerp(base.wagAmp ?? 0, 0.3, soft), 1, full), base.wagAmp ?? 0, settle)
	if (t < R.wagSoft[0]) out.wagAmp = base.wagAmp ?? 0
	// Stand up, party (eager: weight forward, a paw stomping), sit down.
	if (t >= R.standUp[0] && t < R.standUp[1]) Object.assign(out, { clip: 'stand_up', from: 'sit', blend: (t - R.standUp[0]) / (R.standUp[1] - R.standUp[0]) })
	else if (t >= R.standUp[1] && t < R.sitDown[0]) {
		out.clip = 'stand'
		delete out.from
		delete out.blend
	} else if (t >= R.sitDown[0] && t < R.sitDown[1]) Object.assign(out, { clip: 'sit_down', from: 'stand', blend: (t - R.sitDown[0]) / (R.sitDown[1] - R.sitDown[0]) })
	const awSpin = aw.nat > 0
	const spin = awSpin ? R.spinNat : R.spin // v11b: slower turn, longer way back (see STORY.v9.return)
	const back = awSpin ? R.backNat : R.backToSpot
	out.eager = ramp(R.standUp[0], R.party[0]) * (1 - ramp(back[0], R.sitDown[0]))
	// Two hops (+0.25 block, 0.3 block toward Efe, and back), one full turn on the spot (raw yaw: +2 pi, dropped after the turn).
	let up = 0
	let reach = 0
	for (const w of R.hops) {
		const h = hopWave(t, w)
		up = Math.max(up, h)
		reach = Math.max(reach, h)
	}
	out.position = [base.position[0] + DOG_TO_EFE[0] * R.hopReach * reach, base.position[1] + R.hopHeight * up, base.position[2] + DOG_TO_EFE[1] * R.hopReach * reach]
	// Final pass (artistic control correction 11): while it is up, the body turns three quarters toward the visitor (about 35 degrees off the camera axis), so that
	// the head, the wagging tail and the hops are seen, not a back. The gaze stays on Efe (lookAt), so the rule "never looks at the camera" is untouched.
	if (camEye) {
		const camYaw = Math.atan2(camEye[0] - base.position[0], camEye[2] - base.position[2]) + R.faceOffset
		// v11: the 98 degree pivot of the return is three notches of about 33 degrees (a front paw lifts at each: `pawR` / `pawL`), over the same window 45.83 -> 46.28 s.
		const turnW =
			aw.nat > 0
				? (() => {
						const starts = [R.perk[0] + 0.03, R.perk[0] + 0.18, R.perk[0] + 0.33]
						Object.assign(out, pawSteps(t, starts, 0.26))
						return starts.reduce((sum, at) => sum + OVER06(clamp((t - at) / 0.26, 0, 1)), 0) / 3
					})()
				: ramp(R.perk[0], R.perk[1] + 0.2)
		const sitting = R.faceSitWeight * turnW // sitting, it already half turns to show its face while it looks at Efe
		const standing = R.faceWeight * ramp(R.standUp[0] - 0.1, R.standUp[1] + 0.2)
		const backK = awSpin ? smoothQuintic((t - back[0]) / (back[1] - back[0])) : ramp(R.backToSpot[0], R.sitDown[0])
		out.yaw = lerpAngle(base.yaw, camYaw, Math.max(sitting, standing) * (1 - backK))
	}
	if (t >= (aw.nat > 0 ? spin[0] - 0.2 : spin[0]) && t < (aw.nat > 0 ? spin[1] + 0.35 : spin[1])) {
		// v11b: a trapezoid of speed (quintic ramps over 0.2 of the turn, then a steady spin) instead of the cubic smoothstep, whose peak speed is 1.5 times the mean.
		if (t < spin[1]) out.yaw = (out.yaw ?? base.yaw) + 2 * Math.PI * (awSpin ? SPIN_PROFILE((t - spin[0]) / (spin[1] - spin[0])) : ramp(spin[0], spin[1]))
		// The head looks ahead while the body spins (a target that goes round the body makes the head flip sides).
		out.lookWeight = lerp(base.lookWeight ?? 1, 0.15, aw.nat > 0 ? window4(t, spin[0] - 0.2, spin[0] + 0.2, spin[1] - 0.3, spin[1] + 0.35) : aw.fix > 0 ? hopWave(t, spin) ** 2 : hopWave(t, spin)) // v11: squared, it starts and ends with a zero slope; v11b: it looks back at Efe over 0.65 s (the head swung by 60 degrees in 0.125 s)
	}
	if (aw.nat > 0) {
		// v11: the legs trot while it spins on its feet (two strides for the turn); v11b: still two strides (2.2 Hz instead of 3.3: three over the 0.9 s turn made a sixth tile flash at 820 px), and one stride over the way back
		const tr = pivotSwing(t, [[spin[0], spin[1], 2], [back[0], back[1], 1]])
		if (tr !== 0) out.trot = tr
		// v11b: no lead of the head, no false spine while it whirls and turns back (characters.js `leadMute`; the flash at 820 px)
		const mute = window4(t, spin[0] - 0.12, spin[0] - 0.02, back[1], back[1] + 0.15)
		if (mute > 0) out.leadMute = mute
	}
	// v11: the hops, as a gesture: a crouch before the take-off, the extension, the legs tucked in flight, the reach for the landing, then the squash of a spring. Five envelopes
	// (0..1) for characters.js; the height and the reach of the hops (hopHeight, hopReach) do not change. All of them are exactly 0 from 49.2 s on.
	if (aw.nat > 0) {
		let pre = 0
		let ext = 0
		let fold = 0
		let reach = 0
		let land = 0
		for (const [a, b] of R.hops) {
			pre = Math.max(pre, window4(t, a - 0.22, a - 0.06, a, a + 0.14))
			ext = Math.max(ext, window4(t, a - 0.02, a + 0.1, a + 0.16, a + 0.3))
			fold = Math.max(fold, window4(t, a + 0.1, a + 0.24, b - 0.2, b - 0.05))
			reach = Math.max(reach, window4(t, b - 0.24, b - 0.1, b - 0.02, b + 0.08))
			land += springKick(t - b, 3.5, 0.3, 0.7)
		}
		Object.assign(out, { hopPre: pre, hopExt: ext, hopFold: fold, hopReach: reach, hopLand: land })
	}
	// v11 (fix): the push of the head away from the camera (avoidCamera) flipped the head by 125 degrees in one frame when the spinning body faced the camera (49.50 s). It is lifted during the spin.
	if (aw.fix > 0) out.avoidCamera = lerp(base.avoidCamera ?? 60, 0, window4(t, spin[0] - 0.1, spin[0], spin[1], spin[1] + 0.4))
	// The tail beat of the band is relative to the dog clock and must not play during the party.
	delete out.tailBeat
	// Fade back to the band layers over [50.4, 50.5]: every joy layer ends at the value of the band (absent = 0).
	const joy = 1 - ramp(R.settle[0], R.settle[1])
	for (const key of ['alert', 'wagAmp', 'eager']) {
		const v = lerp(base[key] ?? 0, out[key] ?? 0, joy)
		if (base[key] === undefined && Math.abs(v) < 1e-9) delete out[key]
		else out[key] = v
	}
	if (base.tailBeat !== undefined && t >= R.settle[0]) out.tailBeat = base.tailBeat
	return out
}
/**
 * Efe during the return: the head follows the dog (weight 0.8 at most) from the stand-up to 50.4 s, then it is exactly the
 * pose of the band. `dogPose` is the dog pose of the same instant. Only `lookAt` changes (and only inside the window).
 */
export function playerJoyAt(pose, dogPose, t, aw = ZERO_W) {
	const R = STORY.v9.return
	const [a, b] = R.playerHeadFollow
	const [g0, g1] = R.playerArrive
	if (!(t >= g0 && t < b)) return pose
	// v11: the turn arrives with a 4 % overshoot and settles (the head leads it through the generic lead of characters.js)
	const arrive = aw.nat > 0 ? OVER04(clamp((t - g0) / (g1 - g0), 0, 1)) : smoothstep(g0, g1, t) // 0 -> 1: he turns toward the dog
	const out = 1 - smoothstep(b - 0.35, b, t) // back to the band pose
	const w = Math.max(R.playerArriveWeight * arrive, R.playerHeadWeight * smoothstep(a, a + 0.4, t)) * out
	if (!(w > 0)) return pose
	const result = { ...pose }
	// v11: he laughs with his shoulders when the dog hops (two small bumps), until 0.25 s after each hop; exactly 0 from 49.2 s on.
	if (aw.nat > 0) result.laugh = STORY.v9.return.hops.reduce((m, [a, b]) => Math.max(m, window4(t, a + 0.02, a + 0.12, b, b + 0.25)), 0)
	if (aw.nat > 0) {
		// v11b: the greeting (see greetLayer in characters.js): the hand rises over 0.35 s, pats twice (a sin^2 of two periods over 0.6 s), nods, lowers over 0.4 s.
		const G = R.greet
		result.greet = window4(t, G[0], G[0] + 0.35, G[1] - 0.4, G[1])
		const pu = (t - (G[0] + 0.4)) / 0.6
		result.greetPat = pu > 0 && pu < 1 ? Math.sin(2 * Math.PI * pu) ** 2 : 0
		const nu = (t - (G[0] - 0.1)) / 0.45
		result.greetNod = nu > 0 && nu < 1 ? Math.sin(Math.PI * nu) ** 2 : 0
	}
	if (pose.lookAt) result.lookAt = lerp3(pose.lookAt, dogHeadWorld(dogPose), w)
	// The body turns a little toward the dog (the seat is not left: a few degrees on the bench) while the head leads.
	if (Number.isFinite(pose.yaw) && pose.position && dogPose.position) {
		const toDog = Math.atan2(dogPose.position[0] - pose.position[0], dogPose.position[2] - pose.position[2])
		const delta = clamp(angleDelta(pose.yaw, toDog), -R.playerArriveTurn, R.playerArriveTurn)
		result.yaw = pose.yaw + delta * arrive * out
	}
	return result
}

// v5 (brief b2, fallback): warmth of the ember on the dog (0..1, TIMELINE.dogWarm.keys), 0 at both freezes.
const DOG_WARM = monotoneKeys(TIMELINE.dogWarm.keys)
// v11b (blind test: "the dog goes from white to blue-grey then beige"): weight (0..1) of the white of its coat (look.js `dogKeepTint`): 0 until 19.5 s (the evening and the departure keep their
// light, the dog is already white at 13 and 19 s), 1 from 21 s to 50.2 s (night, dawn, forgetting, memory, party), 0 again at the cut of 50.5 s: exactly 0 at both freezes.
export function dogCoatAt(t) {
	return smoothQuintic((t - 19.5) / 1.5) * (1 - smoothQuintic((t - 50.2) / 0.3))
}
export function dogWarmAt(t) {
	const K = TIMELINE.dogWarm.keys
	if (t <= K[0][0] || t >= K.at(-1)[0]) return 0
	return clamp(DOG_WARM(t), 0, 1)
}
// v5 (brief d): gain of the glow of the ember (state.ember.lightGain); 1 outside the memory.
const EMBER_LIGHT = monotoneKeys(TIMELINE.ember.lightGain)
export function emberLightGainAt(t) {
	const K = TIMELINE.ember.lightGain
	if (t <= K[0][0] || t >= K.at(-1)[0]) return 1
	return EMBER_LIGHT(t)
}
// v5 (brief f): outline of the square edge of the capture (state.rim.k), 0 until the end of the final freeze.
const RIM = monotoneKeys(STORY.rim)
export function rimAt(t) {
	if (t <= STORY.rim[0][0]) return 0
	return clamp(RIM(t), 0, 1)
}

// Lift of the characters during the diorama (characters.js `glow`), if look.js does not do it (feature 'charLift').
export const charGlowAt = (t) => smoothstep(STORY.diorama[0] + 0.3, STORY.diorama[0] + 2.5, t)

// Direction (degrees) between the gaze of the dog and the direction of the camera, seen from the dog (horizontal plane).
// Gaze = toward lookAt if lookWeight >= 0.5, otherwise the axis of the body. Rule of the brief: never under 60 deg in act II (v9: except while it looks at the visitor).
export function dogGazeAngle(pose, eye) {
	const p = pose.position
	const gaze = pose.lookAt && (pose.lookWeight ?? 0) >= 0.5 ? Math.atan2(pose.lookAt[0] - p[0], pose.lookAt[2] - p[2]) : pose.yaw
	const cam = Math.atan2(eye[0] - p[0], eye[2] - p[2])
	return (Math.abs(angleDelta(gaze, cam)) * 180) / Math.PI
}

// ---------------------------------------------------------------------------
// Camera, veil (fades, pause, capture wave, save bar), named moments, full state
// ---------------------------------------------------------------------------

const smoother = (e0, e1, x) => {
	const k = clamp((x - e0) / (e1 - e0 || 1), 0, 1)
	return k * k * k * (k * (k * 6 - 15) + 10)
}

// Camera keys: { t, shot, ease }. Between two keys, soft blend; two keys at the same instant = hard cut (on the
// black or on a stage switch). The witness frame comes back four times: the evening (7.5 -> 19.5 s in v7 time, the night of the departure
// and the empty bench included), the dog lying down (24 -> 25.5 s), the grey dawn and the memory (28 -> 32.5 s), the
// rewind, the return and the freeze (32.5 -> 37.5 s).
export const CAMERA_KEYS = (() => {
	const S = STORY
	return [
		{ t: 0, shot: 'wide' }, // the poster: first frame of the film
		{ t: S.tend[0], shot: 'hearth' }, // travelling set on their walk, to the fire
		{ t: S.tend[1], shot: 'hearth' }, // tight on the fire while he feeds it
		{ t: S.together[0], shot: 'witnessWide' }, // toward the bench: the dog leaves first
		{ t: S.capture, shot: 'witness' }, // hold "barely pushed" up to the witness frame
		// v5: fixed on the captured instant until the cut of lapseCut: the night, the departure and the last look, the hard cut on the spot
		// (16.3 s in v7 time), the house falling asleep, the three mornings on the empty bench (brief a3, b3: no more wide shot before the cut).
		// v12 (brief v12, point 1: "too many flashes and reframings, the house falling is hard to see"): ONE fixed frame for the whole absence, from the hard cut of 26.1 s (`away`,
		// already a cut on the spot) to the end of the grey dawn: the closer tripod. The witness frame (kept for the gels) shows only 6 to 26 % of the blocks of the last collapse
		// (S3 -> S4: 179 pieces, projected by renders-v12/tests/fall12.cjs: 6 % at 390, 13 % at 820, 23 % at 1440, 26 % at 1920), the tripod 88 % at 16:9. No cut to the witness at the
		// stage switches, no cut back, no slow advance of the dawn (witnessWide). After the dawn the camera goes to the gaze frame of the memory with ONE slow push (40.8 to 42.3 s: the same 1.5 s as the witness -> gaze blend of v11b).
		{ t: S.away[0], shot: 'witness' },
		{ t: S.away[0], shot: 'tripod' }, // the hard cut of 26.1 s: same instant as the cut of the light, the fire at 45 %
		// v12b: `portraitT`: on a portrait canvas the push starts earlier (39.7 s, once the last collapse has faded: its fall lasts to 39.65 s) so that the dolly of the house-first phone frame to the gaze frame
		// (8.5 blocks, field 76 -> 60 deg) is a slow push of 2.6 s (0.049 block per 10 ms) and not a 1.5 s dolly (0.085); the landscape push is unchanged. Weighted by the portrait weight `w` of `cameraAt`.
		{ t: S.dawn[1], shot: 'tripod', portraitT: 39.7 },
		{ t: S.memory[1], shot: 'witnessGaze' }, // the aim follows the gaze of the dog toward the ember
		{ t: S.rewind[1], shot: 'witness' }, // the rewind brings back the exact frame of the captured instant
		{ t: S.diorama[0], shot: 'witness' }, // return and freeze: fixed shot
		{ t: S.diorama[1], shot: 'diorama', ease: 'smoother' }, // back crane outside the captured zone
		{ t: TIMELINE.duration, shot: 'diorama' }, // the diorama turns (turntableAt) then comes to rest
	]
})()

// Where the camera pushes in (world): the head of the sitting dog at its place.
// Point between the dog's place and Efe's seat, at the height of their heads: where the camera of the celebration looks.
export const PARTY_AIM = [(TIMELINE.world.bench.seat[0] + DOG_SPOT[0]) / 2, TIMELINE.world.surfaceY + 1.0, (TIMELINE.world.bench.seat[2] + DOG_SPOT[1]) / 2]
// v9b: the framing of the celebration for a canvas aspect (width / height): the portrait and the wide framings of STORY.v9.return.camera, blended between its `aspects`.
export function partyFraming(aspect) {
	const C = STORY.v9.return.camera
	const k = smoothstep(C.aspects[0], C.aspects[1], aspect)
	const P = C.portrait
	const Wd = C.wide
	return { amount: lerp(P.amount, Wd.amount, k), aim: lerp(P.aim, Wd.aim, k), dog: lerp(P.dog, Wd.dog, k), lift: lerp(P.lift, Wd.lift, k), fire: lerp(P.fire ?? 0, Wd.fire ?? 0, k) }
}
// The point the celebration's camera looks toward: between Efe's seat and the dog's place (`dog` 0 to 1), `lift` blocks above the ground.
export function partyPoint({ dog, lift, fire = 0 }) {
	const seat = TIMELINE.world.bench.seat
	const F = TIMELINE.world.fire
	const x = seat[0] + dog * (DOG_SPOT[0] - seat[0])
	const z = seat[2] + dog * (DOG_SPOT[1] - seat[2])
	return [x + fire * (F[0] - x), TIMELINE.world.surfaceY + lift, z + fire * (F[2] - z)]
}
export const DOG_PUSH_AIM = [DOG_SPOT[0], TIMELINE.world.surfaceY + 0.8, DOG_SPOT[1]]

// Orbit of the diorama (radians, around the vertical of the aim of `diorama`): +amplitude, -amplitude, back to
// 0 over `turntable` (3.5 s), soft start and arrival; the last frame is that of the diorama at rest.
export function turntableAt(t) {
	const [a, b] = STORY.turntable
	if (t <= a || t >= b) return 0
	const u = (t - a) / (b - a)
	const env = smoothstep(0, 0.12, u) * (1 - smoothstep(0.88, 1, u))
	return ((TIMELINE.turntable.amplitude * Math.PI) / 180) * Math.sin(2 * Math.PI * u) * env
}

// v7c: slow orbit of the diorama at rest (radians), pure function of the rest seconds `restT` (0 at the last frame of the film). Sinusoid of
// period TIMELINE.rest.period, amplitude TIMELINE.rest.amplitude, soft start envelope (no jump with the last frame of the turntable).
export function restSpinAt(restT) {
	const R = TIMELINE.rest
	if (!(restT > 0)) return 0
	return ((R.amplitude * Math.PI) / 180) * Math.sin((2 * Math.PI * restT) / R.period) * smoothstep(0, R.ramp, restT)
}

// Camera in world coordinates. aspect: width/height of the canvas (portrait framing below portrait.below).
export function cameraAt(t, aspect = 16 / 9) {
	const W = TIMELINE.world
	const P = W.portrait
	// Portrait: variant specific to the shot (witness frame), otherwise aim pulled toward the couple (further down).
	const w = aspect < P.below ? smoothstep(P.below, P.below - 0.25, aspect) : 0
	const keys = CAMERA_KEYS
	const kt = (key) => (key.portraitT === undefined ? key.t : lerp(key.t, key.portraitT, w)) // v12b: time of a key on this canvas
	let a = keys[0]
	let b = keys[0]
	let k = 0
	if (t >= kt(keys.at(-1))) a = b = keys.at(-1)
	else {
		for (let i = 0; i < keys.length - 1; i++) {
			if (t >= kt(keys[i]) && t < kt(keys[i + 1])) {
				a = keys[i]
				b = keys[i + 1]
				k = b.cut ? 0 : b.ease === 'smoother' ? smoother(kt(a), kt(b), t) : smoothstep(kt(a), kt(b), t)
				break
			}
		}
	}
	const pose = (name) => {
		const s = W.shots[name]
		const fov = s.fov ?? W.camera.fov // v5: a shot may carry its vertical field (degrees)
		if (!s.portrait || w <= 0) return { eye: s.eye, target: s.target, fov, own: 0 }
		return { eye: lerp3(s.eye, s.portrait.eye, w), target: lerp3(s.target, s.portrait.target, w), fov: lerp(fov, s.portrait.fov ?? P.fov, w), own: 1 }
	}
	const A = pose(a.shot)
	const B = pose(b.shot)
	let eye = lerp3(A.eye, B.eye, k)
	let target = lerp3(A.target, B.target, k)
	let fov = lerp(A.fov, B.fov, k)
	const own = lerp(A.own, B.own, k)
	const spin = turntableAt(t)
	if (spin !== 0) {
		const dx = eye[0] - target[0]
		const dz = eye[2] - target[2]
		const c = Math.cos(spin)
		const sn = Math.sin(spin)
		eye = [target[0] + c * dx + sn * dz, eye[1], target[2] - sn * dx + c * dz]
	}
	const g = w * (1 - own)
	if (g > 0) {
		// The horizontal field collapses (about 24 deg at 50 deg vertical): we widen it and aim at the couple, from `sit`
		// (during the arrival, the house stays at the centre) and until the diorama (recentred on the capture).
		const d0 = STORY.diorama[0]
		const pullK = smoothstep(P.pullRamp[0], P.pullRamp[1], t) * (1 - smoothstep(d0 + P.pullRelease[0], d0 + P.pullRelease[1], t))
		fov = lerp(fov, P.fov, g)
		target = lerp3(target, P.focus, P.pull * g * pullK)
		eye = eye.map((v, i) => v + (v - target[i]) * P.back * g)
	}
	// v9: after Efe leaves, the camera pushes in toward the dog head (25 % of the distance for the eye, 50 % for the aim, same
	// field of view) from 22.0 to 23.4 s, held until the cut at 26.1 s, where it is back on the v8b frame.
	const push = STORY.v9.camera.pushIn
	const pk = t < STORY.away[0] ? smoothstep(push.at[0], push.at[1], t) : 0
	if (pk > 0) {
		eye = eye.map((v, i) => v + push.amount * pk * (DOG_PUSH_AIM[i] - v))
		target = target.map((v, i) => v + push.aim * pk * (DOG_PUSH_AIM[i] - v))
	}
	// v9 final pass: the celebration (45.3 to 50.5 s) is seen from a closer shot, a cut at both ends (Efe appears at once at 45.3, the fire relights at 50.5): the dog and
	// Efe fill the middle of the frame instead of a sixth of its width in the dark. Outside this window the camera is untouched, so v9(f) = v8b(f - 9.5) from 50.5.
	const party = STORY.v9.return.camera
	if (t >= party.at[0] && t < party.at[1]) {
		const p = partyFraming(aspect)
		const point = partyPoint(p)
		eye = eye.map((v, i) => v + p.amount * (point[i] - v))
		target = target.map((v, i) => v + p.aim * (point[i] - v))
	}
	return { eye, target, fov, shot: k < 0.5 ? a.shot : b.shot, spin }
}

// The ember (contract v4), pure in t: world position, brightness, suspension, brightenings.
export function emberAt(t) {
	const S = STORY
	const E = TIMELINE.ember
	const W = TIMELINE.world
	const c = S.capture
	if (t < c - E.rise) return { pos: W.ember.slice(), strength: 0, suspended: false, pulse: 0, born: false }
	if (t < c) {
		// It rises from the fire (almost constant speed, slightly slowed at the top) and stops dead at the freeze.
		const u = (t - (c - E.rise)) / E.rise
		const from = [W.fire[0] + E.riseFrom[0], W.fire[1] + E.riseFrom[1], W.fire[2] + E.riseFrom[2]]
		const k = 1 - (1 - u) ** 1.35
		return { pos: lerp3(from, W.ember, k), strength: E.riseK * smoothstep(0, 0.25, u), suspended: false, pulse: 0, born: false }
	}
	// At the freeze, the stopped spark brightens from riseK to 1 (0.08 s).
	const birth = lerp(E.riseK, 1, smoothstep(c, c + E.birth, t))
	let strength = 1
	if (t < S.restore[0]) strength = birth * lerp(lerp(1, E.idle, smoothstep(E.settle[0], E.settle[1], t)), 1, smoothstep(E.wake[0], E.wake[1], t))
	const [a0, a1] = S.emberAbsorbAt
	const absorb = smoothstep(a0, a1, t) * E.absorb
	strength *= 1 - absorb
	const pulse = E.pulses.reduce((m, [p0, peak, p1]) => Math.max(m, smoothstep(p0, peak, t) * (1 - smoothstep(peak, p1, t))), 0)
	const pos = lerp3(W.ember, [W.fire[0], W.fire[1] + 0.45, W.fire[2]], absorb)
	return { pos, strength, suspended: absorb < 1, pulse, born: true }
}

// The warm wave of the rewind (contract v4), born from the ember: radius (blocks) with a slow start, strength, progress.
export function waveAt(t) {
	const [r0, r1] = STORY.rewind
	if (t < r0 || t >= r1) return null
	const u = (t - r0) / (r1 - r0)
	const W = TIMELINE.wave
	// v5 (brief e2): the strength of the wave (warmth of the front and its trail in look.js) goes out before `rewindLand`: at
	// 35 s (v7 time), the captured evening must no longer carry the orange tint of the wave (measured in v5 before the fix: +18 deg on the
	// foliage of the planter compared with 10.75 s).
	const land = (STORY.rewindLand - r0) / (r1 - r0)
	return { origin: TIMELINE.world.ember.slice(), radius: W.maxRadius * u ** W.ease, maxRadius: W.maxRadius, progress: u, strength: smoothstep(0, 0.06, u) * (1 - smoothstep(land - 0.17, land, u)) }
}

// Old channel of look.js (v3 "captureWave" wave, state.capture.k in 0..1): nothing at the capture (removed in v4),
// the wave of the rewind, leaving the ember, during `rewind`.
export function captureWaveAt(t) {
	const w = waveAt(t)
	return w ? { k: w.radius / w.maxRadius, back: false } : null
}

const FORGET = monotoneKeys(TIMELINE.forgetting.keys)
// The global forgetting (contract v4), 0..1: rises during the absence, held at dawn and at the memory, undone by the wave.
export function forgettingAt(t, variant = VARIANT_DEFAULTS) {
	if (variant?.forgetting === false) return 0
	const k0 = TIMELINE.forgetting.keys[0][0]
	const [r0, r1] = STORY.rewind
	if (t < k0 || t >= r1) return 0
	const f = FORGET(t)
	if (t < r0) return f
	const w = waveAt(t)
	// v5: undone at the pace of the wave, then entirely in the last half second before `rewindLand` (34.8 s: the captured
	// evening is back; the front stays readable until 34.3 s).
	const land = STORY.rewindLand
	return f * (1 - smoothstep(0, 1, w.radius / w.maxRadius)) * (1 - smoothstep(land - 0.5, land, t))
}

// Cold "real life" glow (contract v4), 0..1: rises with the late hour, goes out with the pause.
export function coldGlowAt(t, variant = VARIANT_DEFAULTS) {
	if (variant?.coldGlow === false) return 0
	const C = TIMELINE.coldGlow
	return smoothstep(C.rise[0], C.rise[1], t) * (1 - smoothstep(C.fade[0], C.fade[1], t))
}

// Veil applied after the grading (VeilPass): black, blurred pause, cold glow, fallback wave, page background of the
// diorama. Pure function of t. No more opening black: the fade in is only used after a loop resumes
// (opts.fadeIn), the fade out only in a loop (opts.loop).
export function veilAt(t, { loop = false, fadeIn = false, variant = VARIANT_DEFAULTS } = {}) {
	const S = STORY
	let black = fadeIn ? 1 - smoothstep(TIMELINE.fadeIn[0], TIMELINE.fadeIn[1], t) : 0
	if (loop) black = Math.max(black, smoothstep(TIMELINE.fadeOut[0], TIMELINE.fadeOut[1], t))
	// v8: neither black nor blurred pause at the departure (Efe disappears on the spot); `pause` stays 0 (the field exists for the hosts).
	const pause = 0
	const w = waveAt(t)
	return {
		black,
		pause,
		cold: coldGlowAt(t, variant),
		wave: w ? { radius: w.radius, strength: w.strength } : { radius: 0, strength: 0 },
		backdrop: 1 - smoothstep(S.backdropFadeAt[0], S.backdropFadeAt[1], t),
		page: smoothstep(S.pageBlendAt[0], S.pageBlendAt[1], t),
	}
}

// Grading "lived in" (0, warm) -> "abandoned" (1, cold) for look.js, continuous (no step at the switches):
// the house falls asleep, then the days pass; the warmth comes back during the memory, before the blocks rise back.
export function abandonAt(t) {
	if (t < STORY.playerGone || t >= STORY.restore[0]) return 0
	let a = lerp(0.12, 0.85, smoothstep(LAPSE.start, LAPSE.end, t)) * smoothstep(STORY.away[0], STORY.lightsOut[1], t)
	a *= 1 - 0.6 * smoothstep(STORY.memory[0], STORY.memory[1], t)
	a *= 1 - smoothstep(STORY.rewind[0], STORY.rewindLand, t) // v5: the captured evening is back from 34.8 s (v7 time)
	return a
}

// Presentation of the diorama (0..1): the capture becomes an object set on the page; look.js raises the exposure
// and the ambience and reduces the mist (TIMELINE.display), so that the kept evening reads instead of a dark mass.
export function displayAt(t) {
	return smoothstep(STORY.displayAt[0], STORY.displayAt[1], t)
}

// Added exposure (EV): breathing of +0.1 EV at the start of each freeze (the presentation of the diorama, +1.6 EV, is in look.js since v7c).
export function exposureAt(t) {
	const g = freezeFrameAt(t)
	const breath = g ? STORY.freezeFrameEV * Math.sin(Math.PI * clamp(g.at / STORY.freezeFrameDuration, 0, 1)) : 0
	// v9b: the celebration of the return is shot with a lifted exposure (STORY.v9.return.ev, cut in and out with the closer shot): its light is the dusk of the kept evening, a
	// tight frame of two figures on dark grass read as night with the fire out of the picture.
	const R = STORY.v9.return
	const party = t >= R.camera.at[0] && t < R.camera.at[1] ? R.ev : 0 // v9c: the exploration hooks of the v9b celebration are gone from production
	return breath + party // v7c: the presentation exposure (+1.6 EV x display) is added by look.js (params.presentEV)
}

// The forgetting also takes the sky (contract v4): the dome of sky.js and the mist take their colours from `lighting`
// (zenith, horizon, sky, fog), desaturated here at equal luminance (no effect on the anti-flash rule). 0 at the freezes.
export function forgetSky(L, forgetting) {
	if (!(forgetting > 0)) return L
	const k = clamp(forgetting, 0, 1)
	const grey = (c) => {
		const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
		return [lerp(c[0], y, k), lerp(c[1], y, k), lerp(c[2], y, k)]
	}
	return { ...L, zenith: grey(L.zenith), horizon: grey(L.horizon), sky: grey(L.sky), fog: grey(L.fog) }
}

// Named moments of the story (intervals [start, end[; the host receives enter/exit at each crossing, in
// both directions). `data.calm`: calm zone suggested for text of the host during this moment.
export const BEATS = (() => {
	const S = STORY
	const range = (name, [start, end], data) => ({ name, start, end, data })
	const list = [
		range('arrive', [0, S.tend[0]], { calm: 'sky-right' }),
		range('tend', S.tend, { calm: 'sky-right' }),
		range('sit', [Math.min(S.bStart.player, S.bStart.dog), S.together[0]], { calm: 'sky-right' }),
		range('together', S.together, { calm: 'sky-right' }),
		range('capture', [S.capture, S.captureEnd], { radius: 32, freezeFrameDuration: S.freezeFrameDuration, ember: true, trigger: 'afk', stylized: false, calm: 'sky-right' }),
		range('lateHour', S.lateHour, { calm: 'sky-right' }),
		range('stay', S.stay, { calm: 'sky-right' }),
		// v8: near the dog (film time, not shifted); replace goodbye, leave (v7), menuOpen, quit and saved. v9: gaze, lieDown, return, joy.
		range('crouch', S.v8.crouch, { calm: 'sky-right' }),
		range('typeSay', S.v8.typeSay, { calm: 'sky-right', cue: 'say' }),
		range('menu', S.v8.menu, { calm: 'sky-right', cue: 'menu' }),
		range('leave', [S.v8.leave, S.v8.leave + 0.1], { calm: 'sky-right', cue: 'quit' }),
		range('alone', S.v8.alone, { calm: 'left' }),
		range('gaze', [S.v9.dog.toCamera[0], S.v9.dog.lieDown[0]], { calm: 'left', cue: 'gaze' }),
		range('lieDown', [S.v9.dog.lieDown[0], S.away[0]], { calm: 'left', cue: 'lie' }),
		range('return', [INSERT2.from, INSERT2.to], { calm: null, cue: 'return' }),
		range('joy', [S.v9.return.standUp[0], S.v9.return.playerHeadFollow[1]], { calm: null, cue: 'joy' }),
		range('away', S.away, { calm: 'left', cut: true }),
		range('lightsOut', S.lightsOut, { calm: 'left' }),
		range('fireOut', S.fireOut, { calm: 'left' }),
		// v5 (starred): three sunrises on the empty bench, fixed witness frame (instants of the sunrises in `sunrises`).
		range('mornings', S.mornings, { sunrises: TIMELINE.lapse.mornings.slice(), cut: S.lapseCut, calm: 'left' }),
		range('lapse', [LAPSE.start, LAPSE.end], { days: +LAPSE.U.toFixed(2), calm: 'left' }),
		...SWAP_TIMES.map((ts, k) => range('stageChange', [ts, ts + 0.6], { from: k, to: k + 1, stage: `S${k + 1}`, elapsed: TIMELINE.elapsed[k + 1], calm: null })),
		...S.seasons.snow.map(([a, , , d], index) => range('winter', [a, d], { index })),
		// v5 (starred): the dog sitting in the snow. (v9: the v4 moment `dogLiesDown` and the variant that selected it are removed;
		// `data.variant` still exists as a mechanism, but no moment uses it.)
		range('dogWaits', S.dogWaits, { calm: 'left' }),
		range('dawn', S.dawn, { elapsed: TIMELINE.elapsed.at(-1), calm: 'top' }),
		range('memory', S.memory, { calm: 'top' }),
		range('rewind', S.rewind),
		range('restore', S.restore),
		range('freeze', [S.freeze, TIMELINE.duration]),
		range('diorama', S.diorama, { calm: 'left' }),
		range('turntable', S.turntable, { degrees: TIMELINE.turntable.amplitude, calm: 'left' }),
		range('rest', S.rest, { calm: 'left' }),
	]
	return list
		.map((b) => ({ ...b, data: b.data ?? {} }))
		.sort((x, y) => x.start - y.start || x.end - y.end)
		.map((b, id) => Object.freeze({ id, ...b }))
})()

// A moment only takes place if the variants it asks for (`data.variant`) are the ones in progress. Without `variant`,
// all the moments of BEATS (static list).
export const beatFits = (b, variant) => !variant || !b.data?.variant || Object.entries(b.data.variant).every(([k, v]) => (variant[k] ?? VARIANT_DEFAULTS[k]) === v)
export const beatsAt = (t, variant = null) => BEATS.filter((b) => t >= b.start && t < b.end && beatFits(b, variant))

// The dog during the rewind (v5): no longer the band that replayed the absence backward. It keeps its eyes on the
// ember, then turns its head toward the bench while the player re-forms there (rewindGaze) and turns toward him
// (rewindBody); then the pose of the captured instant, then the band of the pre-capture (restore), as in v4.
const DOG_BLEND_KEYS = [
	['sad', 0],
	['alert', 0],
	['tilt', 0],
	['lookUp', 0],
	['wait', 0],
	['breath', 1],
	['earTwitch', 1],
	['wagAmp', 0],
]
export function dogRewindPoseAt(t, actorT, variant = VARIANT_DEFAULTS, aw = ZERO_W) {
	const G = STORY.dog.sits
	const band = dogPoseAt(rewindActorTime(actorT), variant, { w: aw })
	const kg = smoothstep(G.rewindGaze[0], G.rewindGaze[1], t)
	const kb = smoothstep(G.rewindBody[0], G.rewindBody[1], t)
	if (kg >= 1 && kb >= 1) return band
	const M = dogPoseAt(STORY.rewind[0] - 1e-3, variant) // end of the memory: sitting, the head toward the ember
	const out = { ...band }
	out.yaw = lerpAngle(M.yaw, band.yaw, kb)
	out.lookAt = lerp3(M.lookAt ?? TIMELINE.world.ember, band.lookAt ?? M.lookAt ?? TIMELINE.world.ember, kg)
	out.lookWeight = lerp(M.lookWeight ?? 0, band.lookWeight ?? 0, kg)
	for (const [key, d] of DOG_BLEND_KEYS) out[key] = lerp(M[key] ?? d, band[key] ?? d, kg)
	out.rest = 0
	out.gaze = kg < 0.5 ? 'ember' : band.gaze
	out.tail = kg < 0.5 ? M.tail : band.tail
	return out
}

// ---------------------------------------------------------------------------
// v11: the "natural" animation pass (decisions-animation-v11.md section 3). Two weights, `fix` (one-frame jumps) and `nat` (the rest),
// share one mask. Every change of a pose lives in a branch `if (w.x > 0)`; at 0 the code is the v10b expression, untouched.
// ---------------------------------------------------------------------------
export const ANIM = Object.freeze({
	// Actor time: both weights fall to 0 on [10.0, 10.4] (the band replayed at 50.5 -> 51.7 goes through the same actor times), stay 0 on [10.4, 11.6]
	// (the freeze of the capture, the final freeze, the end of the replayed band) and come back on [11.6, 12.0]. Film time: they fall on [32.5, 32.8] (the
	// tripod shot 31.8 -> 33.8, no cut) and stay 0 to 45.3 (the dawn, the memory and the rewind of the band at about 8x), back to 1 at the cut of 45.3.
	gel: Object.freeze({ ramp: Object.freeze([10.0, 10.4]), rise: Object.freeze([11.6, 12.0]) }),
	rewind: Object.freeze({ fade: Object.freeze([32.5, 32.8]), until: 45.3 }),
	// Offset (s) of the two extra poses (behind and ahead) given to the characters for the overlap: a part that follows a motion reads the pose of t - lag, a part that
	// leads reads t + lag. Capped at the cuts (a delayed pose never crosses one).
	lag: 0.08,
	cuts: Object.freeze([26.1, 31.8, 33.8, 35.3, 37.8, 45.3, 50.5]),
})
export const ZERO_W = Object.freeze({ fix: 0, nat: 0 })
/** The mask of the pass (0..1) at the film time t (actor time `actorT`). Pure, C2 (quintic ramps), exactly 0 on [10.4, 11.6] of the actor time and on [32.8, 45.3[ of the film. */
export function animMaskAt(t, actorT = actorTimeAt(t)) {
	const g = ANIM.gel
	const r = ANIM.rewind
	let m = 1
	if (actorT >= g.ramp[0] && actorT < g.rise[0]) m = actorT < g.ramp[1] ? 1 - smoothQuintic((actorT - g.ramp[0]) / (g.ramp[1] - g.ramp[0])) : 0
	else if (actorT >= g.rise[0] && actorT < g.rise[1]) m = smoothQuintic((actorT - g.rise[0]) / (g.rise[1] - g.rise[0]))
	if (t >= r.fade[0] && t < r.until) m *= t < r.fade[1] ? 1 - smoothQuintic((t - r.fade[0]) / (r.fade[1] - r.fade[0])) : 0
	return m
}
export function animWeightsAt(t, actorT = actorTimeAt(t)) {
	const m = animMaskAt(t, actorT)
	return { fix: m, nat: m }
}
/** Film time of the pose lagged by `d` seconds (d > 0: behind, d < 0: ahead), never across a cut: the first instant after the cut, or the last one before it. */
export function lagTimeAt(t, d) {
	let u = t - d
	for (const c of ANIM.cuts) {
		if (d > 0 && t >= c && u < c) u = c
		else if (d < 0 && t < c && u >= c) u = c - 1e-6
	}
	return Math.min(Math.max(u, 0), TIMELINE.duration - 1e-4)
}
/** The poses of both characters at the film time t (raw: the v10b functions with the weights `w`). */
function actorPosesAt(t, variant, eye, w) {
	const actorT = actorTimeAt(t)
	const rewinding = t >= STORY.rewind[0] && t < STORY.rewind[1]
	const playerT = rewinding ? rewindActorTime(actorT) : actorT
	let dogPose = rewinding ? dogRewindPoseAt(t, actorT, variant, w) : dogPoseAt(actorT, variant, { eye, w })
	const joyScene = t >= INSERT2.from && t < INSERT2.to
	if (joyScene) dogPose = dogJoyAt(dogPose, t, eye, w)
	let playerPose = playerPoseAt(playerT, variant, w)
	// v11b (blind test: "he disappears without a transition at 21.5 s"): with the pass he fades out in pixels over 0.25 s from the cue (the mirror of his return: 0.2 s), still in the pose of the
	// last instant of the menu; the cue itself (the chat line, `gone`) does not move.
	if (w.nat > 0 && !rewinding && playerT >= STORY.playerGone && playerT < STORY.playerGone + PLAYER_FADE_OUT) {
		playerPose = { ...playerPoseAt(STORY.playerGone - 1e-3, variant, w), visible: true, fade: 1 - smoothQuintic((playerT - STORY.playerGone) / PLAYER_FADE_OUT) }
	}
	if (joyScene) playerPose = playerJoyAt(playerPose, dogPose, t, w)
	return { dogPose, playerPose, actorT, rewinding }
}
/** What characters.js needs from a pose to follow or lead a motion: the fields that move the parts, nothing else. */
const lagPoseOf = (pose) => ({ ...pose })
/**
 * The animation extras of the state: the weights and the two lagged poses of each character (only while the pass is active; at 0 the characters get exactly the v10b pose).
 * `anim.player.behind/ahead` and `anim.dog.behind/ahead` are poses in world coordinates.
 */
function animExtras(t, variant, eye, w) {
	const out = { fix: w.fix, nat: w.nat }
	if (!(w.fix > 0 || w.nat > 0)) return out
	const d = ANIM.lag
	const mk = (dt) => {
		const u = lagTimeAt(t, dt)
		const x = actorPosesAt(u, variant, eye, animWeightsAt(u))
		return { player: lagPoseOf(x.playerPose), dog: lagPoseOf(x.dogPose), t: u }
	}
	const behind = mk(d)
	const ahead = mk(-d)
	out.player = { behind: behind.player, ahead: ahead.player, dtBehind: t - behind.t, dtAhead: ahead.t - t }
	out.dog = { behind: behind.dog, ahead: ahead.dog, dtBehind: t - behind.t, dtAhead: ahead.t - t }
	return out
}
/**
 * The pose handed to characters.js for `who` ('player' | 'dog'): the pose of the state plus the weights and the lagged poses of `state.anim` (the identical object when the pass is
 * inactive). `shift(p)` maps world positions to scene positions (the renderer subtracts the capture origin); the probes pass none.
 */
export function actorPoseOf(state, who, shift = null) {
	const a = state.anim
	const pose = state[who]
	if (!a || !(a.fix > 0 || a.nat > 0)) return pose
	const x = a[who] ?? {}
	const sh = (p) => (p && shift ? { ...p, position: p.position && shift(p.position), lookAt: p.lookAt && shift(p.lookAt) } : p)
	return { ...pose, fix: a.fix, nat: a.nat, lag: { behind: sh(x.behind), ahead: sh(x.ahead), dtBehind: x.dtBehind, dtAhead: x.dtAhead } }
}

// Full state of the scene at the instant t (pure function; directions in arrays, positions in world).
// opts : { loop, fadeIn, aspect, variant }.
// From the end of the rewind, clocks and poses follow the replayed band (actorTimeAt): at the final freeze, they
// are exactly those of the freeze of the capture. v9: the band waits at its start during the joy scene.
export function sceneState(time, opts = {}) {
	// `dogSits: false` (the v4 dog lying at the player's place) is no longer supported: the key is accepted and ignored.
	const variant = { ...VARIANT_DEFAULTS, ...(opts.variant ?? {}), dogSits: true }
	const D = TIMELINE.duration
	const t = clamp(time, 0, D - 1e-4)
	const skyPhase = skyPhaseAt(t)
	const lighting = forgetSky(lightingSmoothAt(t), forgettingAt(t, variant))
	const actIII = t >= TIMELINE.actIII.light[0]
	const actorT = actorTimeAt(t)
	const replay = t >= STORY.rewind[1]
	const day = actIII ? dayIndexAt(phaseAt(STORY.capture)) : dayIndexAt(skyPhase)
	const season = seasonAt(t)
	const frozen = isFrozen(t)
	// v5: during the rewind, the poses no longer follow the band above the captured instant (it replayed the
	// departure and the absence backward): the player comes back sitting, like a memory (playerFadeAt: step, v8b).
	const rewinding = t >= STORY.rewind[0] && t < STORY.rewind[1]
	const playerT = rewinding ? rewindActorTime(actorT) : actorT
	// v9d: the player is held out of the scene (fade 0) on [rewind[0], appear[: the rewind, then 0.5 s of empty bench in the tight shot; he then fades in over `appearFade`.
	const benchEmpty = t >= STORY.rewind[0] && t < STORY.v9.return.appear
	const warm = dogWarmAt(t)
	const tint = TIMELINE.ember.tint
	const camera = cameraAt(t, opts.aspect)
	// v11: weights of the animation pass (`opts.anim = { fix, nat }` forces them: the equivalence test sets both to 0).
	const w = opts.anim ? { fix: opts.anim.fix ?? 0, nat: opts.anim.nat ?? 0 } : animWeightsAt(t, actorT)
	// The return: the dog celebrates on top of the held band pose; Efe's head follows it.
	const joyScene = t >= INSERT2.from && t < INSERT2.to
	const { dogPose, playerPose } = actorPosesAt(t, variant, camera.eye, w)
	// Clock of the characters (breath, ears, tail wag): the actor clock, except during the joy scene where the world is held but
	// the dog lives on film time, anchored so that it joins the actor clock exactly at 50.5 s (the jump is at 45.3 s, a cut).
	const actorClock = V7.sceneClock(V7.actorTimeAt(legacyT(t)))
	const ember = emberAt(t)
	ember.lightGain = emberLightGainAt(t)
	return {
		t,
		phase: skyPhase,
		storyPhase: phaseAt(t),
		day,
		moonPhase: moonPhaseOf(day),
		sunDir: sunDirAt(skyPhase),
		moonDir: moonDirAt(skyPhase),
		night: lighting.night,
		daylight: 1 - lighting.night,
		grey: greyAt(t),
		stage: stageAt(t),
		falls: fallsAt(t),
		lighting,
		veil: veilAt(t, { ...opts, variant }),
		camera,
		clock: replay ? V7.sceneClock(V7.actorTimeAt(legacyT(t))) : V7.sceneClock(legacyT(t)), // v8: clocks in v7 time (legacyT)
		clockRate: frozen ? 0 : 1,
		cloudClock: worldClock(t), // temps v7
		cloudRate: worldClockRate(t),
		glareCut: glareCutAt(t),
		keyLapse: keyLightLapseAt(t),
		campfire: campfireAt(t),
		fireFlare: fireFlareAt(t),
		chimney: chimneyAt(t),
		windowLevels: STORY.windowsOff.map((_, i) => windowLevelAt(i, t)),
		windowNight: windowNightAt(t, lighting.night),
		lanternLevels: STORY.lanternsOff.map((_, i) => lanternLevelAt(i, t)),
		snow: season.snow,
		autumn: season.autumn,
		capture: captureWaveAt(t),
		ember,
		rim: rimAt(t), // v5: outline of the square edge of the capture, 0..1 (the scene adds the box in `state.rim`)
		forgetting: forgettingAt(t, variant),
		wave: waveAt(t),
		coldGlow: coldGlowAt(t, variant),
		freezeFrame: freezeFrameAt(t),
		variant,
		exposure: exposureAt(t),
		abandon: abandonAt(t),
		display: displayAt(t),
		cycleRate: frozen ? 0 : cycleRateSeenAt(t),
		growth: growthAt(t), // v12: dissolve-in of the cells that appear at a stage switch (look.js)
		skySmooth: t >= LAPSE.start - 1 && t < LAPSE.end + 2 ? smoothAmountAt(t) : undefined, // v12: width of the sky's own averaging (sky.js) inside the timelapse
		frozen,
		wind: windAt(t),
		actorT,
		playerVisible: rewinding || benchEmpty ? playerFadeAt(t) > 0 : (actorT < STORY.playerGone && actorT >= LEGS.player[0].start) || playerPose.fade !== undefined,
		// glow: lift of the diorama (charGlowAt); v5: memoryGlow / warm, warm glows tinted glowTint (the scene
		// merges them in `glow` at render time, see apply()).
		anim: animExtras(t, variant, camera.eye, w), // v11: weights and lagged poses (actorPoseOf merges them into the pose of each character)
		player: { ...playerPose, glow: charGlowAt(t), fade: playerPose.fade ?? playerFadeAt(t), memoryGlow: 0 },
		dogCoat: dogCoatAt(t),
		dog: { ...dogPose, ...dogStoryLayersAt(t, variant), glow: charGlowAt(t), warm, ...(warm > 0 ? { glowTint: TIMELINE.dogWarm.tint ?? tint } : {}) },
		// Clock of the characters: that of the band (it goes back at the rewind, replays the pre-capture, then freezes). v9: `charClock` below.
		actorClock, // v7 time: flames, smoke, breaths, random glances
		charClock: joyScene ? actorClock - (INSERT2.to - t) : actorClock,
		elapsed: elapsedAt(t),
	}
}
// ---------------------------------------------------------------------------
// Cells: same rule as e1_compare.py (cell = floor of the centroid, except for a
// face lying on a cell plane, where the normal chooses the side).
// ---------------------------------------------------------------------------

export function cellCoord(c, n) {
	const nearest = Math.round(c)
	if (Math.abs(c - nearest) < 1e-4 && Math.abs(n) > 0.5) return n > 0 ? nearest - 1 : nearest
	return Math.floor(c)
}

export const cellKey = (c) => `${c[0]},${c[1]},${c[2]}`

// Walks through the triangles of a mesh in scene coordinates; cb(cell, ia, ib, ic).
export function forEachTriangleCell(mesh, cb) {
	const g = mesh.geometry
	const pos = g.attributes.position
	const nor = g.attributes.normal
	const index = g.index
	const m = mesh.matrixWorld
	const linear = new THREE.Matrix3().setFromMatrix4(m)
	const a = new THREE.Vector3()
	const b = new THREE.Vector3()
	const c = new THREE.Vector3()
	const n = new THREE.Vector3()
	const e = new THREE.Vector3()
	const s = new THREE.Vector3()
	const tmp = new THREE.Vector3()
	const count = index ? index.count : pos.count
	for (let i = 0; i + 2 < count; i += 3) {
		const ia = index ? index.getX(i) : i
		const ib = index ? index.getX(i + 1) : i + 1
		const ic = index ? index.getX(i + 2) : i + 2
		a.fromBufferAttribute(pos, ia).applyMatrix4(m)
		b.fromBufferAttribute(pos, ib).applyMatrix4(m)
		c.fromBufferAttribute(pos, ic).applyMatrix4(m)
		n.subVectors(b, a).cross(e.subVectors(c, a))
		const length = n.length()
		if (length < 1e-12) continue
		n.divideScalar(length)
		if (nor) {
			s.set(0, 0, 0)
			for (const v of [ia, ib, ic]) s.add(tmp.fromBufferAttribute(nor, v).applyMatrix3(linear))
			if (s.dot(n) < 0) n.negate()
		}
		const cx = (a.x + b.x + c.x) / 3
		const cy = (a.y + b.y + c.y) / 3
		const cz = (a.z + b.z + c.z) / 3
		cb([cellCoord(cx, n.x), cellCoord(cy, n.y), cellCoord(cz, n.z)], ia, ib, ic)
	}
}

function meshesOf(root) {
	const out = []
	root.updateMatrixWorld(true)
	root.traverse((o) => {
		if (o.isMesh && o.geometry?.attributes?.position) out.push(o)
	})
	return out
}

export function collectCells(root) {
	const cells = new Set()
	for (const mesh of meshesOf(root)) forEachTriangleCell(mesh, (cell) => cells.add(cellKey(cell)))
	return cells
}

export function vanishedCells(before, after) {
	const out = new Set()
	for (const key of before) if (!after.has(key)) out.add(key)
	return out
}

// Landing height: top of the highest cell of the next stage under the cell.
export function landingDrop(cell, nextCells, ground) {
	let land = ground
	for (let y = cell[1] - 1; y >= ground - 4; y--) {
		if (nextCells.has(cellKey([cell[0], y, cell[2]]))) {
			land = y + 1
			break
		}
	}
	return Math.max(0, cell[1] - land)
}

// Classification of a material by its name "block / texture" (see e1_compare.py).
export function materialKind(name = '') {
	const [block, texture = ''] = name.split(' / ')
	if (block.startsWith('minecraft:wolf') || texture.includes('textures/entity/wolf/')) return 'wolf'
	if (block.startsWith('minecraft:player') || texture.includes('skins/') || texture.includes('textures/entity/player/')) return 'player'
	if (texture.includes('textures/entity/')) return 'entity'
	return 'block'
}

// Extracts the triangles of the cells that vanished from stage k into one pivot per cell.
export function buildFalls(stageRoot, gone, nextCells, k, ground) {
	const group = new THREE.Group()
	group.name = `chutes S${k}→S${k + 1}`
	const buckets = new Map() // cellKey → Map(material → { attrs })
	const clones = new Map()
	const p = new THREE.Vector3()
	for (const mesh of meshesOf(stageRoot)) {
		const attrs = mesh.geometry.attributes
		const linear = new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld)
		forEachTriangleCell(mesh, (cell, ia, ib, ic) => {
			const key = cellKey(cell)
			if (!gone.has(key)) return
			if (!buckets.has(key)) buckets.set(key, { cell, byMaterial: new Map() })
			const byMaterial = buckets.get(key).byMaterial
			if (!byMaterial.has(mesh.material)) byMaterial.set(mesh.material, {})
			const out = byMaterial.get(mesh.material)
			for (const name of Object.keys(attrs)) {
				if (name === 'mmAo') continue // occlusion attribute of look.js, useless on the copies
				const attr = attrs[name]
				if (!out[name]) out[name] = { size: attr.itemSize, data: [] }
				for (const v of [ia, ib, ic]) {
					if (name === 'position') {
						p.fromBufferAttribute(attr, v).applyMatrix4(mesh.matrixWorld)
						out[name].data.push(p.x - cell[0] - 0.5, p.y - cell[1] - 0.5, p.z - cell[2] - 0.5)
					} else if (name === 'normal') {
						p.fromBufferAttribute(attr, v).applyMatrix3(linear).normalize()
						out[name].data.push(p.x, p.y, p.z)
					} else {
						for (let j = 0; j < attr.itemSize; j++) out[name].data.push(attr.getComponent(v, j))
					}
				}
			}
		})
	}
	for (const { cell, byMaterial } of buckets.values()) {
		const pivot = new THREE.Group()
		pivot.position.set(cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5)
		pivot.userData = {
			home: pivot.position.clone(),
			drop: landingDrop(cell, nextCells, ground),
			seed: [0, 1, 2, 3, 4].map((salt) => hash01(cell[0], cell[1], cell[2], k, salt)),
		}
		for (const [material, attrs] of byMaterial) {
			const geometry = new THREE.BufferGeometry()
			for (const [name, { size, data }] of Object.entries(attrs)) {
				geometry.setAttribute(name, new THREE.Float32BufferAttribute(data, size))
			}
			if (!clones.has(material)) {
				const clone = material.clone()
				clone.transparent = true
				// The copies are not driven by look.js: they would keep the emission of the moment of the copy
				// (lit lanterns falling in broad daylight). What falls no longer emits.
				if ('emissiveIntensity' in clone) clone.emissiveIntensity = 0
				clone.userData = { baseOpacity: material.opacity }
				clones.set(material, clone)
			}
			const piece = new THREE.Mesh(geometry, clones.get(material))
			piece.receiveShadow = true
			pivot.add(piece)
		}
		group.add(pivot)
	}
	group.userData = { k, materials: [...clones.values()], cells: buckets.size }
	group.visible = false
	return group
}

// v12: marks (attribute `mmAdd` = 1) the vertices of the cells of the stage `root` that the previous stage does not have (ivy, grass, overgrowth that APPEAR at a switch):
// look.js draws them through a dither dissolve driven by state.growth (growthAt), so that the stages dissolve into each other instead of changing in one image.
// A vertex shared with a cell that already existed stays at 0. Returns the number of marked vertices.
export function markGrowth(root, added) {
	let marked = 0
	for (const mesh of meshesOf(root)) {
		const n = mesh.geometry.attributes.position.count
		const yes = new Uint8Array(n)
		const no = new Uint8Array(n)
		forEachTriangleCell(mesh, (cell, ia, ib, ic) => {
			const list = added.has(cellKey(cell)) ? yes : no
			list[ia] = 1
			list[ib] = 1
			list[ic] = 1
		})
		const attr = new Float32Array(n)
		for (let v = 0; v < n; v++) {
			if (yes[v] && !no[v]) {
				attr[v] = 1
				marked++
			}
		}
		mesh.geometry.setAttribute('mmAdd', new THREE.BufferAttribute(attr, 1))
	}
	return marked
}

// ---------------------------------------------------------------------------
// Veil: final pass added to the composer of look.js (without modifying look.js)
// ---------------------------------------------------------------------------

const VEIL_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

// Copies the depth of the scene right after RenderPass, as a linear distance along the aim (sky: 60000).
// The targets of the composer are rewritten by the following passes (OutputPass empties their depth): the original depth
// cannot be read back at the end. Serves the capture wave and the page background of the diorama.
class DepthTap extends Pass {
	constructor(camera) {
		super()
		this.needsSwap = false
		this.camera = camera
		this.ok = false
		this.target = new THREE.WebGLRenderTarget(1, 1, {
			type: THREE.HalfFloatType,
			format: THREE.RedFormat,
			depthBuffer: false,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
		})
		this.material = new THREE.ShaderMaterial({
			name: 'mm:depth',
			uniforms: { tDepth: { value: null }, uNear: { value: 0.2 }, uFar: { value: 900 } },
			vertexShader: VEIL_VERTEX,
			fragmentShader: /* glsl */ `
				uniform sampler2D tDepth;
				uniform float uNear;
				uniform float uFar;
				varying vec2 vUv;
				void main() {
					float d = texture2D(tDepth, vUv).x;
					float lin = d >= 0.999999 ? 60000.0 : (uNear * uFar) / (uFar - (uFar - uNear) * d);
					gl_FragColor = vec4(lin, 0.0, 0.0, 1.0);
				}`,
			depthTest: false,
			depthWrite: false,
		})
		this.fsQuad = new FullScreenQuad(this.material)
	}
	setSize(w, h) {
		this.target.setSize(Math.max(1, w), Math.max(1, h))
	}
	render(renderer, writeBuffer, readBuffer) {
		const depth = readBuffer.depthTexture
		this.ok = Boolean(depth)
		if (!depth) return
		const u = this.material.uniforms
		u.tDepth.value = depth
		u.uNear.value = this.camera.near
		u.uFar.value = this.camera.far
		renderer.setRenderTarget(this.target)
		this.fsQuad.render(renderer)
	}
	dispose() {
		this.target.dispose()
		this.material.dispose()
		this.fsQuad.dispose()
	}
}

// Display space (after OutputPass and FinishPass): blur and darkening of the pause, cold glow rising from the
// bottom of the image (the "real life", v4), fallback wave of the rewind (warm band running through the blocks from the
// ember, only if look.js does not do it), page background, black. The flash, the capture wave and the cell bar
// of v3 are removed.
const VEIL_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform float uHasDepth;
uniform vec2 uResolution;
uniform float uBlack;
uniform float uPause;
uniform float uCold;
uniform vec3 uColdColor;
uniform float uColdHeight;
uniform vec4 uWave;
uniform float uWaveK;
uniform float uWaveWidth;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform vec3 uBg;
uniform float uBgK;
varying vec2 vUv;

// World position from the linear distance along the aim (DepthTap).
vec3 worldAt(vec2 uv, float lin) {
	vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, -1.0, 1.0);
	vec3 ray = v.xyz / v.w;
	ray /= -ray.z;
	return (uCamWorld * vec4(ray * lin, 1.0)).xyz;
}

void main() {
	vec2 px = 1.0 / uResolution;
	vec3 col = texture2D(tDiffuse, vUv).rgb;
	if (uPause > 0.001) {
		// Background of the Pause menu: light blur (13 taps), desaturated, darkened. No interface element.
		float r = 1.0 + 5.0 * uPause * (uResolution.y / 720.0);
		vec3 acc = col * 0.2;
		acc += texture2D(tDiffuse, vUv + vec2(r, 0.0) * px).rgb * 0.1;
		acc += texture2D(tDiffuse, vUv - vec2(r, 0.0) * px).rgb * 0.1;
		acc += texture2D(tDiffuse, vUv + vec2(0.0, r) * px).rgb * 0.1;
		acc += texture2D(tDiffuse, vUv - vec2(0.0, r) * px).rgb * 0.1;
		acc += texture2D(tDiffuse, vUv + vec2(r, r) * 0.7 * px).rgb * 0.05;
		acc += texture2D(tDiffuse, vUv + vec2(-r, r) * 0.7 * px).rgb * 0.05;
		acc += texture2D(tDiffuse, vUv + vec2(r, -r) * 0.7 * px).rgb * 0.05;
		acc += texture2D(tDiffuse, vUv - vec2(r, r) * 0.7 * px).rgb * 0.05;
		acc += texture2D(tDiffuse, vUv + vec2(2.0 * r, 0.0) * px).rgb * 0.05;
		acc += texture2D(tDiffuse, vUv - vec2(2.0 * r, 0.0) * px).rgb * 0.05;
		acc += texture2D(tDiffuse, vUv + vec2(0.0, 2.0 * r) * px).rgb * 0.05;
		acc += texture2D(tDiffuse, vUv - vec2(0.0, 2.0 * r) * px).rgb * 0.05;
		col = mix(col, acc, clamp(uPause * 1.5, 0.0, 1.0));
		float l = dot(col, vec3(0.299, 0.587, 0.114));
		col = mix(col, vec3(l), 0.35 * uPause) * (1.0 - 0.4 * uPause);
	}
	float lin = 60000.0;
	if (uHasDepth > 0.5) lin = texture2D(tDepth, vUv).x;
	bool sky = lin > 50000.0;
	if (uWaveK > 0.001 && uHasDepth > 0.5 && !sky) {
		vec3 wp = worldAt(vUv, lin);
		float d = distance(wp, uWave.xyz);
		float band = exp(-pow((d - uWave.w) / uWaveWidth, 2.0));
		float inside = d < uWave.w ? 0.06 * exp(-(uWave.w - d) / 4.0) : 0.0;
		vec3 n = normalize(cross(dFdx(wp), dFdy(wp)));
		vec3 an = abs(n);
		vec2 fp = an.x > an.y && an.x > an.z ? wp.yz : (an.y > an.z ? wp.xz : wp.xy);
		vec2 e = abs(fract(fp) - 0.5) * 2.0;
		float edge = smoothstep(0.84, 0.96, max(e.x, e.y));
		col += vec3(1.0, 0.82, 0.55) * uWaveK * (band * (0.45 + 0.55 * edge) + inside);
	}
	if (uCold > 0.001) {
		// Cold screen glow (real life): it rises from the bottom edge, lights in screen space (without burning), without blinking.
		float h = clamp(1.0 - vUv.y / uColdHeight, 0.0, 1.0);
		float g = h * h * (3.0 - 2.0 * h);
		col = 1.0 - (1.0 - col) * (1.0 - uColdColor * g * uCold);
	}
	if (uBgK > 0.001 && uHasDepth > 0.5) {
		// Share of sky around the pixel (3 x 3): at the edge of the foliage, the (multisampled) colour mixes leaf and
		// sky while the depth says "leaf"; these pixels also go to the page colour (otherwise: a light grain
		// outline around the trees of the diorama).
		float skyN = 0.0;
		for (int j = -1; j <= 1; j++) {
			for (int i = -1; i <= 1; i++) skyN += step(50000.0, texture2D(tDepth, vUv + vec2(float(i), float(j)) * px).x);
		}
		float k = sky ? 1.0 : smoothstep(0.0, 4.0, skyN);
		col = mix(col, uBg, uBgK * k);
	}
	col = mix(col, vec3(0.0), clamp(uBlack, 0.0, 1.0));
	gl_FragColor = vec4(col, 1.0);
}`

class VeilPass extends Pass {
	constructor(tap) {
		super()
		this.tap = tap
		this.material = new THREE.ShaderMaterial({
			name: 'mm:veil',
			uniforms: {
				tDiffuse: { value: null },
				tDepth: { value: null },
				uHasDepth: { value: 0 },
				uResolution: { value: new THREE.Vector2(1, 1) },
				uBlack: { value: 0 },
				uPause: { value: 0 },
				uCold: { value: 0 },
				uColdColor: { value: new THREE.Vector3(0.78, 0.88, 1.0) },
				uColdHeight: { value: 0.42 },
				uWave: { value: new THREE.Vector4() },
				uWaveK: { value: 0 },
				uWaveWidth: { value: 1.0 },
				uProjInv: { value: new THREE.Matrix4() },
				uCamWorld: { value: new THREE.Matrix4() },
				uBg: { value: new THREE.Color() },
				uBgK: { value: 0 },
			},
			vertexShader: VEIL_VERTEX,
			fragmentShader: VEIL_FRAGMENT,
			depthTest: false,
			depthWrite: false,
		})
		this.fsQuad = new FullScreenQuad(this.material)
	}
	render(renderer, writeBuffer, readBuffer) {
		const u = this.material.uniforms
		u.tDiffuse.value = readBuffer.texture
		const depthOk = Boolean(this.tap?.ok)
		u.tDepth.value = depthOk ? this.tap.target.texture : null
		u.uHasDepth.value = depthOk ? 1 : 0
		u.uResolution.value.set(readBuffer.width, readBuffer.height)
		renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
		this.fsQuad.render(renderer)
	}
	dispose() {
		this.material.dispose()
		this.fsQuad.dispose()
	}
}

// Fallback ember (contract v4): drawn by the scene as long as life.js does not announce `features` with 'ember'.
// Two additive sprites at constant SCREEN SIZE (sizeAttenuation: false, scale recomputed at every frame as a
// fraction of the canvas width): a square core (Minecraft pixel, HDR above the bloom threshold) and a soft
// halo, readable without bloom (low quality, phones). Halo: 3 % of the width (TIMELINE.ember.halo).
function createEmber() {
	const group = new THREE.Group()
	group.name = 'ember'
	const halo = (() => {
		const c = document.createElement('canvas')
		c.width = c.height = 64
		const ctx = c.getContext('2d')
		const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
		g.addColorStop(0, 'rgba(255,255,255,1)')
		g.addColorStop(0.22, 'rgba(255,255,255,0.7)')
		g.addColorStop(0.5, 'rgba(255,255,255,0.24)')
		g.addColorStop(0.78, 'rgba(255,255,255,0.06)')
		g.addColorStop(1, 'rgba(255,255,255,0)')
		ctx.fillStyle = g
		ctx.fillRect(0, 0, 64, 64)
		const texture = new THREE.CanvasTexture(c)
		texture.colorSpace = THREE.SRGBColorSpace
		return texture
	})()
	const make = (map, name) => {
		const material = new THREE.SpriteMaterial({ map, color: 0xffffff, transparent: true, depthWrite: false, depthTest: true, fog: false, sizeAttenuation: false, blending: THREE.AdditiveBlending, toneMapped: true })
		material.userData.mmKeepColor = true // contract v4: the forgetting does not touch it
		const sprite = new THREE.Sprite(material)
		sprite.name = name
		sprite.renderOrder = 21
		sprite.frustumCulled = false
		return sprite
	}
	const coreTex = (() => {
		const data = new Uint8Array([255, 255, 255, 255])
		const t = new THREE.DataTexture(data, 1, 1)
		t.needsUpdate = true
		return t
	})()
	const glow = make(halo, 'ember halo')
	const core = make(coreTex, 'ember core')
	group.add(glow, core)
	group.visible = false
	return { group, glow, core }
}

// Pose fallbacks of the player when characters.js does not know `sit`, `crouch` or `swing` yet (PLAYER_FEATURES):
// vanilla rotations applied to the pieces after update (HumanoidModel: riding, crouching, setupAttackAnimation).
// The pieces follow the convention of characters.js (ZYX rotation in Minecraft model space, positions in pixels/16).
function applyPlayerFallback(player, pose, features) {
	const parts = player?.parts
	if (!parts?.rightLeg?.group || !parts?.body?.group) return
	const g = (name) => parts[name]?.group
	const sit = features.has('sit') ? 0 : clamp(pose.sit ?? 0, 0, 1)
	if (sit > 0) {
		// Feet on the ground in the pose: the hips (0.704 above the feet) rest on the seat (thigh 0.117).
		player.object3d.position.y += ((pose.seat ?? 0.75) + 0.117 - 0.704) * sit
		const legs = [
			[g('rightLeg'), 0.31415927, 0.07853982],
			[g('leftLeg'), -0.31415927, -0.07853982],
		]
		for (const [leg, ry, rz] of legs) {
			if (!leg) continue
			leg.rotation.set(lerp(leg.rotation.x, -1.4137167, sit), lerp(leg.rotation.y, ry, sit), lerp(leg.rotation.z, rz, sit), 'ZYX')
		}
		for (const arm of [g('rightArm'), g('leftArm')]) if (arm) arm.rotation.x += -0.62831855 * sit
	}
	const crouch = features.has('crouch') ? 0 : clamp(pose.crouch ?? 0, 0, 1)
	if (crouch > 0) {
		const body = g('body')
		body.rotation.x += 0.5 * crouch
		body.position.y += (3.2 / 16) * crouch
		const head = g('head')
		if (head) head.position.y += (4.2 / 16) * crouch
		for (const arm of [g('rightArm'), g('leftArm')]) {
			if (!arm) continue
			arm.rotation.x += 0.4 * crouch
			arm.position.y = lerp(arm.position.y, 5.2 / 16, crouch)
		}
		for (const leg of [g('rightLeg'), g('leftLeg')]) {
			if (!leg) continue
			leg.position.z += (4 / 16) * crouch
			leg.position.y = lerp(leg.position.y, 12.2 / 16, crouch)
		}
		player.object3d.position.y -= 0.125 * crouch // PlayerRenderer.getRenderOffset
	}
	const swing = features.has('swing') ? 0 : clamp(pose.swing ?? 0, 0, 1)
	if (swing > 0) {
		const body = g('body')
		const yRot = Math.sin(Math.sqrt(swing) * Math.PI * 2) * 0.2
		body.rotation.y += yRot
		const arm = g('rightArm')
		if (arm) {
			const f = 1 - (1 - swing) ** 4
			arm.rotation.x -= Math.sin(f * Math.PI) * 1.2 + Math.sin(swing * Math.PI) * 0.7 * 0.75
			arm.rotation.y += yRot * 2
			arm.rotation.z += Math.sin(swing * Math.PI) * -0.4
		}
	}
}
// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

const STAGE_NAMES = ['S0', 'S1', 'S2', 'S3', 'S4']

class AssetError extends Error {
	constructor(file, url, reason) {
		super(`${file} : ${reason}`)
		this.file = file
		this.url = url
		this.reason = reason
	}
}

// Download only (off the main thread): allows fetching a GLB early and preparing it later.
async function fetchGlb(base, name) {
	const url = new URL(`${name}.glb`, base)
	let response
	try {
		response = await fetch(url)
	} catch (error) {
		throw new AssetError(`${name}.glb`, url.href, `network (${error.message})`)
	}
	if (!response.ok) throw new AssetError(`${name}.glb`, url.href, `HTTP ${response.status}`)
	return { buffer: await response.arrayBuffer(), url }
}

async function parseGlb(loader, base, name, { buffer, url }) {
	try {
		return await loader.parseAsync(buffer, base.href)
	} catch (error) {
		throw new AssetError(`${name}.glb`, url.href, `GLB illisible (${error.message})`)
	}
}

async function loadGlb(loader, base, name) {
	return parseGlb(loader, base, name, await fetchGlb(base, name))
}

async function loadMeta(base, name) {
	try {
		const response = await fetch(new URL(`${name}.json`, base))
		if (!response.ok) return null
		const json = await response.json()
		const o = json.captureOrigin
		return {
			origin: o && ['x', 'y', 'z'].every((a) => Number.isFinite(o[a])) ? [o.x, o.y, o.z] : null,
			bounds: json.captureBounds ?? null,
		}
	} catch {
		return null
	}
}

const triangleCount = (mesh) => (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3

// Fixed tints of BlockColors 1.21.1, without the alpha byte: FoliageColor.getEvergreenColor(), getBirchColor(), and the
// placed lily pad (-14647248 = 0xFF208030). Key: texture of the material name.
const FIXED_TINTS = {
	'minecraft:block/spruce_leaves': 0x619961,
	'minecraft:block/birch_leaves': 0x80a755,
	'minecraft:block/lily_pad': 0x208030,
}

// Cleans a GLB: removes the KHR lights (their positions are kept), sets the materials,
// and splits the meshes by kind (block, wolf, player, other entity).
function prepareCapture(root) {
	const lights = []
	const byKind = { block: [], wolf: [], player: [], entity: [] }
	root.updateMatrixWorld(true)
	root.traverse((o) => {
		if (o.isLight) lights.push(o)
		if (!o.isMesh) return
		const material = o.material
		// The mod writes the biome tint in sRGB in baseColorFactor, which glTF reads as linear:
		// without conversion, grass and foliage come out washed out.
		if (!material.userData.tintLinear) {
			// Bug of the mod (0.14.0): the fixed tints 1.21.1 are negative ARGB, written as white.
			const fixed = FIXED_TINTS[material.name.split(' / ')[1]]
			if (fixed && material.color.getHex() === 0xffffff) material.color.setHex(fixed, THREE.LinearSRGBColorSpace)
			material.userData.rawColor = material.color.getHex(THREE.LinearSRGBColorSpace)
			// Cobweb: white cross texture (normals upward), which stood out as a luminous spot at night and in the
			// grey dawn. It is brought back to a web grey.
			if (/cobweb/.test(material.name)) material.color.multiplyScalar(0.55)
			material.color.convertSRGBToLinear()
			material.userData.tintLinear = true
		}
		material.side = THREE.DoubleSide
		o.castShadow = !material.transparent
		o.receiveShadow = true
		byKind[materialKind(material.name)].push(o)
	})
	const lightPositions = lights.map((l) => l.getWorldPosition(new THREE.Vector3()))
	for (const l of lights) l.removeFromParent()
	return { lightPositions, byKind }
}

// Plants (block of the material name): grasses, ferns, flowers, bushes.
const PLANT_BLOCK =
	/^minecraft:(short_grass|tall_grass|grass|fern|large_fern|poppy|dandelion|cornflower|oxeye_daisy|azure_bluet|allium|lily_of_the_valley|[a-z]+_tulip|blue_orchid|sweet_berry_bush|bush|dead_bush|[a-z]+_sapling)$/

// Flattened grass: removes the plants from the place of the dog and from a narrow corridor toward the camera (scene).
// Without it, the lying dog of S3-S4 disappears in the tall grass seen from the low camera.
// Returns { removed } (triangles removed).
export function trample(root, dog, eye, { radius = 1.3, lane = 0.7, laneLength = 11, height = 2.5 } = {}) {
	const dx = eye[0] - dog[0]
	const dz = eye[2] - dog[2]
	const len = Math.hypot(dx, dz) || 1
	const ux = dx / len
	const uz = dz / len
	const hit = (cell) => {
		const cx = cell[0] + 0.5 - dog[0]
		const cz = cell[2] + 0.5 - dog[2]
		if (cell[1] < Math.floor(dog[1]) - 1 || cell[1] > dog[1] + height) return false
		if (Math.hypot(cx, cz) <= radius) return true
		const along = cx * ux + cz * uz
		const across = Math.abs(-cx * uz + cz * ux)
		return along > 0 && along < laneLength && across <= lane + along * 0.03
	}
	let removed = 0
	for (const mesh of meshesOf(root)) {
		const block = (mesh.material?.name ?? '').split(' / ')[0]
		if (!PLANT_BLOCK.test(block)) continue
		const keep = []
		forEachTriangleCell(mesh, (cell, ia, ib, ic) => {
			if (hit(cell)) removed++
			else keep.push(ia, ib, ic)
		})
		const total = mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count
		if (keep.length === total) continue
		mesh.geometry.setIndex(keep)
		if (!keep.length) mesh.visible = false
	}
	return { removed }
}

function removeMeshes(meshes) {
	let triangles = 0
	for (const mesh of meshes) {
		triangles += triangleCount(mesh)
		mesh.removeFromParent()
		mesh.geometry.dispose()
	}
	return triangles
}

// Loads a module without breaking the page if it is missing or crashes. `load` is a LITERAL dynamic import
// (`() => import('./look.js')`): a bundler (Vite, webpack, Turbopack) follows it and makes a separate chunk of it.
async function importModule(name, load, warn) {
	try {
		return await load()
	} catch (error) {
		console.error(error)
		warn(`module ${name} unavailable (${error.message})`)
		return null
	}
}

// Decorative systems of life.js turned off by default (option `decor`). The butterflies, small yellow arches on the
// facade, read as "M": the scene must not show any letter.
// The low mist of the grey dawn made a blurry mosaic of about 60 px in front of the door of S4: turned off too.
export const DECOR_DEFAULTS = { butterflies: false, mist: false }

function guarded(name, fn, warn) {
	try {
		return fn()
	} catch (error) {
		console.error(error)
		warn(`${name} disabled (${error.message})`)
		return null
	}
}
function autoQuality(renderer) {
	let gpu = ''
	try {
		const gl = renderer.getContext()
		const ext = gl.getExtension('WEBGL_debug_renderer_info')
		gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
	} catch {}
	const software = /swiftshader|llvmpipe|software|softpipe/i.test(gpu)
	const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820)
	const weak = (navigator.hardwareConcurrency || 8) <= 2
	return { quality: software || mobile || weak ? 'low' : 'high', gpu }
}

// ---------------------------------------------------------------------------
// mount(): the component
// ---------------------------------------------------------------------------

export const CAPTURE_DIRS = { v0: '../captures/', v1: '../captures-v1/', v2: '../captures-v2/', v2light: '../captures-v2-light/' }
const CAPTURE_ORDER = ['v2light', 'v2', 'v1'] // automatic choice: the first one whose S0.json answers

// Scroll progress (0..1) -> story time (v4, 45 s; kept for the scroll mode, in v9 the film is read in time). No more opening black: progress 0 is the
// first frame (the poster). The absence gets more travel than its duration (the days and the switches stay readable),
// the memory a bit more (3 s rewind), the kept world its duration. Pairs [p, t], linearly interpolated.
//   the evening and the departure: 0 -> 0.25 (0 -> away[0], 36 % of the time); the absence: 0.25 -> 0.66 (-> memory[0], 33 %);
//   the memory: 0.66 -> 0.82 (-> diorama[0], 14 %); the kept world: 0.82 -> 1 (-> end, 17 %).
export const SCROLL_MAP = [
	[0, 0],
	[0.25, STORY.away[0]],
	[0.66, STORY.memory[0]],
	[0.82, STORY.diorama[0]],
	[1, TIMELINE.duration - 1e-3],
]

export function progressToTime(p, map = SCROLL_MAP) {
	const x = clamp(Number(p) || 0, 0, 1)
	for (let i = 1; i < map.length; i++) {
		if (x <= map[i][0]) return lerp(map[i - 1][1], map[i][1], (x - map[i - 1][0]) / (map[i][0] - map[i - 1][0] || 1))
	}
	return map.at(-1)[1]
}

export function timeToProgress(t, map = SCROLL_MAP) {
	for (let i = 1; i < map.length; i++) {
		if (t <= map[i][1]) return lerp(map[i - 1][0], map[i][0], (t - map[i - 1][1]) / (map[i][1] - map[i - 1][1] || 1))
	}
	return 1
}

// Sky theme for the host (text colour, veil): 'day' | 'dusk' | 'night' | 'grey' | 'page'.
function themeOf(state) {
	const L = state.lighting
	const sky = mixRgb(L.horizon, L.zenith, 0.5)
	const luma = 0.2126 * sky[0] + 0.7152 * sky[1] + 0.0722 * sky[2]
	let name = 'day'
	if (state.veil.page > 0.5) name = 'page'
	else if (state.grey > 0.5) name = 'grey'
	else if (state.night > 0.6) name = 'night'
	else if (L.elevation < 0.25) name = 'dusk'
	const hex = `#${sky.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('')}`
	return { sky: name, luma: +luma.toFixed(3), color: hex }
}

// =================================================================================================================
// v9: the site phase (decisions-v9 sections 10.2, 11.3 to 11.5). After the film the diorama keeps living on the side of the page:
// slow auto-rotation, 1:1 dragging without inertia, a view per section. Everything below is pure (no WebGL, no DOM) so that it can
// be tested in Node; `mount` wires it to the camera, the subject offset and the render loop.
// =================================================================================================================

/** CSS-like cubic Bezier easing (x1, y1, x2, y2) -> f(x) in [0, 1], solved with a few Newton steps and a bisection fallback. */
export function cubicBezier(x1, y1, x2, y2) {
	const cx = 3 * x1
	const bx = 3 * (x2 - x1) - cx
	const ax = 1 - cx - bx
	const cy = 3 * y1
	const by = 3 * (y2 - y1) - cy
	const ay = 1 - cy - by
	const sx = (u) => ((ax * u + bx) * u + cx) * u
	const sy = (u) => ((ay * u + by) * u + cy) * u
	const dx = (u) => (3 * ax * u + 2 * bx) * u + cx
	return (x) => {
		if (x <= 0) return 0
		if (x >= 1) return 1
		let u = x
		for (let i = 0; i < 8; i++) {
			const err = sx(u) - x
			if (Math.abs(err) < 1e-7) return sy(u)
			const d = dx(u)
			if (Math.abs(d) < 1e-6) break
			u -= err / d
		}
		let lo = 0
		let hi = 1
		u = x
		for (let i = 0; i < 40; i++) {
			const v = sx(u)
			if (Math.abs(v - x) < 1e-7) break
			if (v < x) lo = u
			else hi = u
			u = (lo + hi) / 2
		}
		return sy(u)
	}
}
/** The standard easing of the hand-over to the site (0.8 s) and of the view changes: cubic-bezier(0.4, 0, 0.2, 1). */
export const STANDARD_EASE = cubicBezier(0.4, 0, 0.2, 1)
/** Symmetric ease of the hand-over glide (final pass): slow start, slow arrival, the whole path visible: cubic-bezier(0.65, 0, 0.35, 1). The default of frameSubject stays 'standard'. */
export const GLIDE_EASE = cubicBezier(0.65, 0, 0.35, 1)
export const EASES = Object.freeze({ standard: STANDARD_EASE, glide: GLIDE_EASE, linear: (u) => u })

/**
 * Tween between two plain numeric records (the subject offset { x, y, scale } for instance). `at(elapsed)` is the record at
 * `elapsed` seconds; it is exactly `to` from `duration` on (and immediately when `duration` is 0).
 */
export function frameTween(from, to, duration, ease = STANDARD_EASE) {
	const keys = Object.keys(to)
	return {
		duration,
		at(elapsed) {
			const u = duration > 0 ? clamp(elapsed / duration, 0, 1) : 1
			if (u >= 1) return { ...to }
			const e = ease(u)
			return Object.fromEntries(keys.map((k) => [k, lerp(from[k] ?? to[k], to[k], e)]))
		},
	}
}

/** Frame limiter (setMaxFps): `tick(nowMs)` is true when a frame may be rendered. `null` / 0 renders every frame. */
export function createFrameLimiter(maxFps = null) {
	let interval = maxFps > 0 ? 1000 / maxFps : 0
	let last = -Infinity
	return {
		set(fps) {
			interval = fps > 0 ? 1000 / fps : 0
		},
		get interval() {
			return interval
		},
		tick(now) {
			if (interval <= 0) return true
			// 1.5 ms of tolerance: a 60 Hz display delivers frames every 16.67 ms and 33.33 ms must be accepted at the second one.
			if (now - last < interval - 1.5) return false
			last = now
			return true
		},
	}
}

// Views of the site, one per section (elevation in degrees above the horizon, zoom = dolly factor). `faq` is the hero view.
const HERO_VIEW = Object.freeze({ pitch: 28, zoom: 1 })
export const SITE_VIEWS = Object.freeze({
	hero: HERO_VIEW,
	steps: Object.freeze({ pitch: 34, zoom: 1.15 }),
	share: Object.freeze({ pitch: 22, zoom: 1 }),
	limits: Object.freeze({ pitch: 40, zoom: 0.9 }),
	faq: HERO_VIEW,
})
export const SITE_LIMITS = Object.freeze({ pitch: Object.freeze([10, 55]), zoom: Object.freeze([0.8, 1.6]), autoRotateDegPerSec: 3, autoRampSec: 1, resumeAfterSec: 4, zoomSec: 0.2, viewSec: 0.9 })

const DEG = Math.PI / 180

/** Elevation (degrees above the horizon) of the eye seen from the target. */
export const elevationOf = (eye, target) => Math.atan2(eye[1] - target[1], Math.hypot(eye[0] - target[0], eye[2] - target[2])) / DEG

/**
 * The orbit of the site phase around `base.target`: the eye of `base` (the camera of the film's last frame) turned by `yaw`
 * degrees around the vertical axis, raised to `pitch` degrees of elevation, and brought closer by `zoom` (distance / zoom).
 * With yaw 0, zoom 1 and the pitch of `base`, the result is `base` itself (no jump at the hand-over).
 */
export function siteCameraFrom(base, { yaw = 0, pitch, zoom = 1 }) {
	const dx = base.eye[0] - base.target[0]
	const dy = base.eye[1] - base.target[1]
	const dz = base.eye[2] - base.target[2]
	const r = Math.hypot(dx, dy, dz) / zoom
	const az = Math.atan2(dx, dz) + yaw * DEG
	const e = (pitch ?? elevationOf(base.eye, base.target)) * DEG
	const eye = [base.target[0] + r * Math.cos(e) * Math.sin(az), base.target[1] + r * Math.sin(e), base.target[2] + r * Math.cos(e) * Math.cos(az)]
	return { eye, target: base.target.slice(), fov: base.fov }
}

/**
 * Pure model of the diorama view (decisions-v9 section 10.2). Angles in degrees. `step(dt)` advances its own clock; nothing here
 * reads the DOM. `getView()` -> { yaw, pitch, zoom, view, autoRotate } (the controller adds `rect` and `panel`).
 */
export function createSiteView({ basePitch = elevationOf(TIMELINE.world.shots.diorama.eye, TIMELINE.world.shots.diorama.target), reducedMotion = false } = {}) {
	const L = SITE_LIMITS
	let reduced = reducedMotion
	let active = false
	let now = 0
	let yaw = 0
	let pitch = basePitch
	let zoom = 1
	let zoomTarget = 1
	let zoomAnim = null // { from, to, t0 }
	let viewName = 'hero'
	let viewCaps = { bandSafe: false, maxZoom: Infinity } // v9c: caps put on the section views by the host (setView)
	const cappedView = (v) => ({ pitch: viewCaps.bandSafe ? Math.min(v.pitch, HERO_VIEW.pitch) : v.pitch, zoom: Math.min(v.zoom, viewCaps.maxZoom) })
	let viewAnim = null // { from: { pitch, zoom, yaw }, to, t0, duration }
	let auto = false
	let autoK = 0 // 0..1 ramp of the auto-rotation speed
	let resumeAt = 0 // clock value after which the auto-rotation may run again
	const ease = STANDARD_EASE
	const interact = () => {
		// A drag stops everything at once (no inertia, no recall): the view transition, the zoom animation and the rotation.
		viewAnim = null
		autoK = 0
		resumeAt = now + L.resumeAfterSec
	}
	const model = {
		setSitePhase(on, opts = {}) {
			active = Boolean(on)
			if (opts.reducedMotion !== undefined) reduced = Boolean(opts.reducedMotion)
			if (!active) {
				viewAnim = null
				zoomAnim = null
				autoK = 0
			}
		},
		get active() {
			return active
		},
		setReducedMotion(on) {
			reduced = Boolean(on)
			if (reduced) autoK = 0
		},
		setAutoRotate(on) {
			auto = Boolean(on) && !reduced
			if (!auto) return
			resumeAt = Math.max(resumeAt, now)
		},
		orbitBy(dYaw = 0, dPitch = 0) {
			interact()
			yaw += Number(dYaw) || 0
			pitch = clamp(pitch + (Number(dPitch) || 0), L.pitch[0], L.pitch[1])
		},
		zoomBy(factor = 1) {
			const f = Number(factor)
			if (!(f > 0)) return
			zoomTarget = clamp(zoomTarget * f, L.zoom[0], L.zoom[1])
			if (reduced) {
				zoom = zoomTarget
				zoomAnim = null
			} else zoomAnim = { from: zoom, to: zoomTarget, t0: now }
		},
		setView(name, { duration = L.viewSec, bandSafe = false, maxZoom = Infinity } = {}) {
			const base = SITE_VIEWS[name]
			if (!base) return false
			// v9c: the model is framed to fill its panel at every angle (`fit: 'tight'`), so a section view must not zoom in on it: `maxZoom` (the page passes 1) caps the zoom, and in the
			// portrait strip (`bandSafe`) the elevation is capped at the hero's too: a close-up of 1.15 or a steeper look made the model run out of a 160 to 320 px strip, under the two
			// corner buttons, and out of the wide panel into the text (measured: renders-v9c/tests/model-box.cjs).
			viewCaps = { bandSafe: Boolean(bandSafe), maxZoom: Number(maxZoom) > 0 ? Number(maxZoom) : Infinity }
			const v = cappedView(base)
			viewName = name
			zoomTarget = v.zoom
			zoomAnim = null
			if (reduced || !(duration > 0)) {
				pitch = v.pitch
				zoom = v.zoom
				viewAnim = null
			} else viewAnim = { from: { pitch, zoom }, to: { pitch: v.pitch, zoom: v.zoom }, t0: now, duration }
			return true
		},
		resetView() {
			// The yaw comes back to 0 by the short way; the elevation and the zoom go back to the preset of the current view.
			yaw = ((((yaw + 180) % 360) + 360) % 360) - 180
			const v = cappedView(SITE_VIEWS[viewName])
			zoomTarget = v.zoom
			zoomAnim = null
			if (reduced) {
				yaw = 0
				pitch = v.pitch
				zoom = v.zoom
				viewAnim = null
			} else viewAnim = { from: { pitch, zoom, yaw }, to: { pitch: v.pitch, zoom: v.zoom, yaw: 0 }, t0: now, duration: L.viewSec }
		},
		/** Advances the clock by `dt` seconds (in sub-steps of at most 10 ms, so the ramps stay exact); true when the view changed. */
		step(dt) {
			if (!(dt > 0)) return false
			const before = yaw * 1e3 + pitch * 1e3 + zoom * 1e6
			const n = Math.max(1, Math.ceil(dt / 0.01))
			for (let i = 0; i < n; i++) advance(dt / n)
			return before !== yaw * 1e3 + pitch * 1e3 + zoom * 1e6
		},
		get autoRotating() {
			return autoK > 0
		},
		getView() {
			return { yaw, pitch, zoom, view: viewName, autoRotate: auto }
		},
	}
	function advance(dt) {
		{
			now += dt
			if (viewAnim) {
				const u = clamp((now - viewAnim.t0) / viewAnim.duration, 0, 1)
				const e = ease(u)
				pitch = lerp(viewAnim.from.pitch, viewAnim.to.pitch, e)
				zoom = lerp(viewAnim.from.zoom, viewAnim.to.zoom, e)
				if (viewAnim.to.yaw !== undefined) yaw = lerp(viewAnim.from.yaw, viewAnim.to.yaw, e)
				if (u >= 1) viewAnim = null
			}
			if (zoomAnim) {
				const u = clamp((now - zoomAnim.t0) / L.zoomSec, 0, 1)
				zoom = lerp(zoomAnim.from, zoomAnim.to, smoothstep(0, 1, u))
				if (u >= 1) zoomAnim = null
			}
			// Auto-rotation: 3 deg/s, linear ramps of 1 s up and down; stopped for 4 s after any interaction.
			const wantAuto = active && auto && !reduced && now >= resumeAt && !viewAnim
			autoK = clamp(autoK + (wantAuto ? dt : -dt) / L.autoRampSec, 0, 1)
			if (autoK > 0) yaw += L.autoRotateDegPerSec * autoK * dt
		}
	}
	return model
}

/**
 * Mounts the scene in a canvas (or creates a canvas in a container). Creates no other DOM element.
 * Returns a controller at once; `controller.ready` resolves when the first frame is ready.
 * See HOST-API.md for the options, the methods and the events.
 */
// v10: pure framing of the model in its panel (decisions-v10 section 4.3), so that it can be tested in Node.
//   boxes   : the projected box { l, t, r, b } (fractions of the canvas) of the model at each of the angles of a turn;
//   live    : the box at the CURRENT angle;
//   rect    : the panel { l, t, r, b } in canvas fractions (margin already removed).
// The scale is that of the union of the boxes of a whole turn (the size does not change while the model turns). With `centre: 'live'` the horizontal centre is that of the box at the
// current angle (the perspective of a square slab turning round its middle makes the box swing by +-8 % of the panel's width, which read as "off to the right") and the vertical centre
// is the mean of the boxes' centres, bounded so that the union stays in the panel. With `centre: 'union'` (v9) the union's centre is put at the panel's centre.
// Returns { union: { l, t, r, b, cxMean, cyMean }, U: the box the offset is computed from, cx, cy (screen fractions where U's centre lands), scale }.
export function siteFrameFor({ boxes, live = null, rect, fill = 1, centre = 'union' }) {
	let U = null
	let sx = 0
	let sy = 0
	for (const B of boxes) {
		U = U ? { l: Math.min(U.l, B.l), t: Math.min(U.t, B.t), r: Math.max(U.r, B.r), b: Math.max(U.b, B.b) } : { ...B }
		sx += (B.l + B.r) / 2
		sy += (B.t + B.b) / 2
	}
	if (!U) return null
	const union = { ...U, cxMean: sx / boxes.length, cyMean: sy / boxes.length }
	const w = U.r - U.l
	const h = U.b - U.t
	let scale = Math.min((rect.r - rect.l) / w, (rect.b - rect.t) / h) * (Number(fill) > 0 ? Number(fill) : 1)
	const cx = (rect.l + rect.r) / 2
	let cy = (rect.t + rect.b) / 2
	if (centre !== 'live') return { union, U, cx, cy, scale }
	// v10 (L1, decisions-v10 section 4.3): the model's mean centre must stay within 1.5 % of the panel's height of the panel's centre. The union is not symmetric round its mean (the tuft of trees above,
	// the slab's tip below): in a panel that is tall for its width (the portrait tablet's strip) the margin would push the mean off the centre by more than 2 %. The scale then gives up the few per cent
	// that are needed, never more.
	const slack = 0.015 * (rect.b - rect.t)
	const up = union.cyMean - U.t
	const down = U.b - union.cyMean
	if (up > 1e-9) scale = Math.min(scale, (cy + slack - rect.t) / up)
	if (down > 1e-9) scale = Math.min(scale, (rect.b - cy + slack) / down)
	const bc = live ? (live.l + live.r) / 2 : (U.l + U.r) / 2
	const Ue = { l: bc - w / 2, r: bc + w / 2, t: union.cyMean - h / 2, b: union.cyMean + h / 2 }
	// With the mean centre at cy, the union spans [cy + scale (U.t - cyMean) ; cy + scale (U.b - cyMean)]: keep it inside the panel.
	const lo = rect.t - scale * (U.t - union.cyMean)
	const hi = rect.b - scale * (U.b - union.cyMean)
	cy = lo <= hi ? Math.min(hi, Math.max(lo, cy)) : cy
	return { union, U: Ue, cx, cy, scale }
}

const wrapDeg = (a) => ((((a + 180) % 360) + 360) % 360) - 180

// v6: settings of the "marked" ember (option `emberCore`), merged into LIFE.ember (sizes as a fraction of the
// canvas width, linear colours). To be tuned at render time.
export const EMBER_CORE = { core: 0.0135, halo: 0.05, haloGain: 1.5, hot: [8, 5.5, 3.2] }

export function mount(target, opts = {}) {
	const o = {
		captures: null, // 'v0' | 'v1' | 'v2' | 'v2light' ; null = automatic (v2light, then v2, then v1)
		mode: 'time', // 'time': automatic playback; 'scroll': the host drives setProgress()
		autoplay: true,
		loop: false,
		quality: 'auto', // 'auto' | 'high' | 'low'
		reducedMotion: 'auto', // 'auto' (prefers-reduced-motion) | true | false
		// Story variants (contract v4 and v5, decisions for Andy and Breval; also setVariant()). A missing key takes
		// the value of VARIANT_DEFAULTS (v5: coldGlow false, dogSits true, the others true):
		// coldGlow (cold "real life" glow at the departure), forgetting (the ruin is the forgetting), afk (AFK capture; false:
		// M key), dawnSwish (a tail sweep at dawn), walkOut (removed in v8), dawnHead (removed in v9),
		// dogSits (accepted and ignored since v9: the dog always stays at its place).
		// Settings of the modules to decide (decisions, see HOST-API.md "Variants"): { look: { coldLight, waveGlow,
		// forgetMax, ... } (merged into look.params), life: { emberRing, emberLight, ... } (options of createLife),
		// sky: { meteors, meteorsWithEmber, ... } (options of createSky), scene: { dogWarm } (v5: gain of the warm fallback
		// glow on the dog, TIMELINE.dogWarm.gain; 0 = off) }.
		tune: null,
		// v8: the line of the mod ("Minemories: world capture done.", cue `mod`) is displayed by default;
		// `modchat: false` removes it from the cues (cuesAt, `cue` events).
		modchat: true,
		// v6: "marked" ember (bigger and whiter core, wider halo) so that it stands out from the neighbouring
		// sparks (direction v6, D4 / S5). False by default: the default image is that of v5. Same value at both
		// freezes (pure in state.ember). Equivalent to tune.life.emberLook = EMBER_CORE.
		emberCore: false,
		// `signals` (v3: camera icon, cell bar) is removed: the option is accepted and ignored.
		preload: 'auto', // S1..S4: 'auto' (after 2.5 s or from t >= 4 s), 'lazy' (from the captured instant), 'all' (at once)
		ambient: true, // ambient life (fire, fireflies, breath, clouds) when the story time is stopped (scroll, end)
		decor: null, // { butterflies, 'bats', mist, ...: boolean } decorative systems of life.js (DECOR_DEFAULTS)
		assetsUrl: null, // folder of the textures (assets/) if they are not served next to scene.js
		capturesUrl: null, // explicit captures folder (URL), takes priority over `captures`
		background: TIMELINE.pageBackground, // page colour toward which the background of the diorama tends; null = sky
		subjectOffset: null, // { x, y, scale }: offset of the subject (fractions of the canvas)
		anchorsTarget: null, // element that receives the CSS variables --mm-* of the anchors (px)
		scrollMap: SCROLL_MAP,
		damping: 0.25, // seconds: damping of the time toward the target of the scroll
		pauseOffscreen: true,
		maxPixelRatio: 2, // number, or function (width, height) -> ceiling, re-evaluated at every resize
		...opts,
	}
	let variant = Object.fromEntries(VARIANT_KEYS.map((key) => [key, typeof o[key] === 'boolean' ? o[key] : VARIANT_DEFAULTS[key]]))
	const tune = { look: { ...(o.tune?.look ?? {}) }, life: { ...(o.tune?.life ?? {}) }, sky: { ...(o.tune?.sky ?? {}) }, scene: { ...(o.tune?.scene ?? {}) } }
	if (o.emberCore) tune.life.emberLook = { ...EMBER_CORE, ...(tune.life.emberLook ?? {}) }
	const dogWarmGain = Number.isFinite(tune.scene.dogWarm) ? Math.max(0, tune.scene.dogWarm) : TIMELINE.dogWarm.gain
	const beatData = (b) => (b.name === 'capture' ? { ...b.data, trigger: variant.afk ? 'afk' : 'manual' } : { ...b.data })
	let decor = { ...DECOR_DEFAULTS, ...(o.decor ?? {}) }
	const decorVisible = new Map()

	// --- events -----------------------------------------------------------------
	const listeners = new Map()
	const probe = {
		frames: 0,
		renderedT: Number.NaN,
		ready: false,
		allLoaded: false,
		loadSteps: [],
		quality: null,
		warnings: [],
		version: null,
		stage: null,
		lights: [],
		events: [],
		beats: [],
		anchors: null,
		hold: null,
		// v7: last capture signal emitted ({ id, phase, t, wall }), signal active at the rendered frame (id or null), log
		// of the last 12, catch-up cuts (C1) and settings of the fast scroll.
		signal: null,
		signalActive: null,
		signals: [],
		// v8: last `cue` events (12) and cues active at the rendered frame ({ lines, typing, menu, gone } of cuesAt, abridged).
		cues: [],
		cueActive: null,
		cuts: 0,
		scroll: { fast: false, speed: 0, catchUp: 0, cutAt: null },
		dogGaze: { now: null, minActII: null },
		error: null,
	}
	const on = (type, fn) => {
		if (!listeners.has(type)) listeners.set(type, new Set())
		listeners.get(type).add(fn)
		return () => off(type, fn)
	}
	const off = (type, fn) => listeners.get(type)?.delete(fn)
	const emit = (type, detail = {}) => {
		const event = { type, ...detail }
		if (type !== 'progress' && type !== 'anchors') {
			probe.events.push({ type, name: detail.name ?? detail.id, phase: detail.phase, direction: detail.direction, t: detail.t !== undefined ? +detail.t.toFixed(3) : undefined })
			if (probe.events.length > 400) probe.events.splice(0, probe.events.length - 400)
		}
		for (const set of [listeners.get(type), listeners.get('*')]) {
			if (!set) continue
			for (const fn of [...set]) {
				try {
					fn(event)
				} catch (error) {
					console.error(error)
				}
			}
		}
		if (o.dispatchTarget) {
			try {
				o.dispatchTarget.dispatchEvent(new CustomEvent(`mm:${type}`, { detail: event }))
			} catch {}
		}
	}
	const warn = (text) => {
		probe.warnings.push(text)
		console.warn(`[scene] ${text}`)
		emit('warning', { message: text })
	}

	let resolveReady
	let rejectReady
	const ready = new Promise((resolve, reject) => {
		resolveReady = resolve
		rejectReady = reject
	})
	ready.catch(() => {})
	let failed = false
	const fail = (code, message, error) => {
		if (failed) return
		failed = true
		probe.error = { code, message }
		console.error(`[scene] ${message}`, error ?? '')
		// Deferred: the host can plug on('error') right after mount().
		queueMicrotask(() => {
			emit('error', { code, message, fatal: true, error })
			rejectReady(Object.assign(new Error(message), { code }))
		})
	}

	// --- canvas -----------------------------------------------------------------------
	let canvas = null
	let createdCanvas = false
	if (typeof HTMLCanvasElement !== 'undefined' && target instanceof HTMLCanvasElement) canvas = target
	else if (typeof Element !== 'undefined' && target instanceof Element) {
		canvas = document.createElement('canvas')
		canvas.style.cssText = 'display:block;width:100%;height:100%'
		target.appendChild(canvas)
		createdCanvas = true
	} else throw new TypeError('mount(target): a canvas or a container element is expected')

	const D = TIMELINE.duration
	let mode = o.mode === 'scroll' ? 'scroll' : o.mode === 'external' ? 'external' : 'time'
	// In scroll mode, without setProgress() from the host, the scene starts from progress 0 (after the fade in).
	let t = mode === 'scroll' ? progressToTime(0, o.scrollMap) : 0
	let tTarget = t
	let prevT = t
	let playing = false
	let wantPlay = mode === 'time' && o.autoplay !== false
	let autoPaused = false
	let offscreen = false
	let contextLost = false
	let isReady = false
	let disposed = false
	let dirty = true
	// v9b: a host that must hide a cut (the hand-over to the site by a jump) asks for the frame that is on screen: it is copied into a 2D canvas right after the render of
	// the next frame, in the same task (a WebGL canvas is cleared once presented, a later drawImage would read nothing).
	let snapReq = null
	let frameWaiters = [] // v9c: promises of nextFrame(), resolved after the next render
	function serveFrameWaiters() {
		if (!frameWaiters.length) return
		const list = frameWaiters
		frameWaiters = []
		for (const resolve of list) resolve(true)
	}
	function serveSnapshot() {
		serveFrameWaiters()
		if (!snapReq) return
		const { target, resolve } = snapReq
		snapReq = null
		try {
			target.width = canvas.width
			target.height = canvas.height
			target.getContext('2d').drawImage(canvas, 0, 0)
			resolve(true)
		} catch {
			resolve(false)
		}
	}
	let seeked = true
	let freeCam = false
	let stageOverride = null
	let ambient = 0 // seconds of ambient life added to the clocks (the story time t does not move)
	// v9 site phase: the film is over, the diorama lives beside the page (pure model: createSiteView). `siteBlend` is the hand-over
	// (0 to 1, STANDARD_EASE) from the camera and the rim of the film frame at which it started to the site camera.
	let sitePhase = false
	let siteView = null
	let siteEnterT = 0
	let siteBlendAt = 0 // seconds since the hand-over started
	let siteBlendDuration = 0.8
	let siteBlendEase = STANDARD_EASE
	let frameAnim = null // { duration, ease, at, e, resolve } : running frameSubject
	// v10 (decisions-v10 section 7.2): the host owns the film time (`mode: 'external'`, setTime) and the hand-over to the site is a position, `blend.g` (0 to 1), set by setSiteBlend.
	let autoRotatePref = false // v10: the last setAutoRotate asked by the host, applied to a site view created later
	let blend = null // { g } while the hand-over is driven by setSiteBlend (null otherwise)
	let blendFilmT = 0 // film time at which the hand-over starts (the camera and the rim blend from there)
	let filmSubject = { x: 0, y: 0, scale: 1 } // the film's framing of the subject (setSubjectOffset): what g = 0 shows
	let frameShift = { x: 0, y: 0 } // setFrameShift: a pure translation of the model on screen, CSS px
	let siteFrame = null // { rect, margin, fit, fill, centre }: the last framing request (frameSubject or setSiteBlend)
	let frameFrom = { x: 0, y: 0, scale: 1 } // the subject offset the framing is measured from
	let frameUnion = null // { key, U }: the boxes of a whole turn, kept until the panel, the size or the site view changes
	let lastTimeChangeAt = 0 // performance.now() of the last setTime that moved t (the loading of the next stages waits for a film at rest)
	let siteRectPx = null // on-screen box of the diorama in CSS px (getView().rect), updated at every framing step
	let sitePanelPx = null // the rectangle given to the last frameSubject (getView().panel)
	const limiter = createFrameLimiter(null)
	let restT = 0 // v7c: seconds of rest of the diorama (film come to its end, ambience on): slow orbit and clock of the world (restSpinAt)
	let ambientOn = o.ambient !== false
	let hostPaused = false
	// v6: hold of the film requested by the host (controller.hold): t does not move during `holdTotal` wall seconds; `holdAt`: elapsed
	// duration of the hold (s), which only counts while playing, tab visible, outside an explicit pause.
	let holdTotal = 0
	let holdAt = 0
	// v7: fast scroll (catch-up cut C1), speed ceiling of the film after the last hold of the host (film s per
	// wall s; 0 = none) and arrival of the damping on the target (`arrive` event).
	let scrollFast = false
	let catchUp = 0
	let lastCutAt = -Infinity
	let arrived = true
	let arriveAt = null // instant (rAF) of the arrival, emitted after the render
	const reducedQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
	const reduced = () => (o.reducedMotion === 'auto' ? Boolean(reducedQuery?.matches) : Boolean(o.reducedMotion))

	const controller = {
		ready,
		probe,
		on,
		off,
		once(type, fn) {
			const stop = on(type, (event) => {
				stop()
				fn(event)
			})
			return stop
		},
		get duration() {
			return D
		},
		get time() {
			return t
		},
		get progress() {
			return timeToProgress(t, o.scrollMap)
		},
		get playing() {
			return playing
		},
		get mode() {
			return mode
		},
		get reducedMotion() {
			return reduced()
		},
		// Story variants in progress (contract v4); defined here and not in Object.assign (which would freeze the value).
		get variant() {
			return { ...variant }
		},
		// v5: only the moments of the variants in progress.
		getBeats: () => BEATS.filter((b) => beatFits(b, variant)).map((b) => ({ ...b, data: beatData(b) })),
		beatsAt: (time = t) => beatsAt(clamp(time, 0, D - 1e-4), variant).map((b) => b.name),
		get holding() {
			return holdTotal > 0
		},
		hold: () => false,
		cancelHold: () => false,
		setScrollSpeed: () => false,
		setScrollFast: () => false,
		setCatchUp: () => 0,
		getSignals: () => STORY.signals.map((g) => ({ ...g })),
		signalAt: () => null,
		play: () => false,
		pause: () => false,
		toggle: () => false,
		seek: () => {},
		setProgress: () => {},
		setMode: () => {},
		setQuality: () => {},
		setSubjectOffset: () => {},
		getAnchors: () => null,
		resize: () => {},
		setPixelRatio: () => {},
		setAmbient: () => {},
		setDecor: () => {},
		fitSubject: () => null,
		// v9 site phase (inert until the scene is ready; the stub is what a host gets when WebGL is not available)
		frameSubject: () => Promise.resolve(null),
		nextFrame: () => Promise.resolve(false),
		setTime: () => {},
		setSiteBlend: () => {},
		setFrameShift: () => {},
		setSitePhase: () => {},
		setAutoRotate: () => {},
		orbitBy: () => {},
		zoomBy: () => {},
		setView: () => false,
		resetView: () => {},
		getView: () => ({ yaw: 0, pitch: 0, zoom: 1, view: 'hero', autoRotate: false, rect: null }),
		setMaxFps: () => {},
		dispose: () => {},
		debug: {},
	}

	if (typeof location !== 'undefined' && location.protocol === 'file:') {
		fail('protocol', 'The scene must be served over HTTP (ES modules and GLB loading), not file://.')
		return controller
	}

	let renderer
	try {
		renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
	} catch (error) {
		fail('webgl', `WebGL 2 unavailable (${error.message})`, error)
		return controller
	}
	const pixelCap = (w, h) => {
		const v = typeof o.maxPixelRatio === 'function' ? o.maxPixelRatio(w, h) : o.maxPixelRatio
		return Number.isFinite(v) && v > 0 ? v : 2
	}
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelCap(innerWidth, innerHeight)))
	renderer.outputColorSpace = THREE.SRGBColorSpace
	renderer.toneMapping = THREE.ACESFilmicToneMapping
	renderer.toneMappingExposure = 1.2
	renderer.shadowMap.enabled = true
	renderer.shadowMap.type = THREE.PCFShadowMap

	let choice = ['high', 'low', 'auto'].includes(o.quality) ? o.quality : 'auto'
	const detected = autoQuality(renderer)
	const quality = choice === 'auto' ? detected.quality : choice // quality at creation (sizes, MSAA)
	let lowRuntime = quality === 'low'
	probe.quality = quality
	console.info(`[scene] quality ${quality} (choice ${choice}, GPU "${detected.gpu}")`)

	const scene = new THREE.Scene()
	scene.background = new THREE.Color(0x1b2740)
	const camera = new THREE.PerspectiveCamera(TIMELINE.world.camera.fov, 16 / 9, 0.2, 900)
	let aspect = 16 / 9
	let subject = { x: 0, y: 0, scale: 1 }
	let size = { w: 0, h: 0 }

	let origin = TIMELINE.originFallback.slice()
	const S = (p) => toScene(p, origin)
	let captureVersion = Object.hasOwn(CAPTURE_DIRS, o.captures) ? o.captures : null
	let CAPTURES = null
	let LM = landmarksFor(captureVersion ?? 'v2')

	const mods = { sky: null, look: null, life: null, backdrop: null, dog: null, player: null }
	const hidden = { dog: false, player: false } // debug.hideDog / hidePlayer (differential mask)
	function hideActor(mod, on) {
		mod?.object3d.traverse((obj) => {
			for (const m of obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : []) {
				m.userData.mmHide ??= { colorWrite: m.colorWrite, depthWrite: m.depthWrite }
				m.colorWrite = on ? false : m.userData.mmHide.colorWrite
				m.depthWrite = on ? false : m.userData.mmHide.depthWrite
			}
		})
	}
	let playerFeatures = new Set()
	let dogFeatures = new Set() // v5: DOG_FEATURES of characters.js ('glowTint': the tint of the warm glows is done by the module)
	let fallbackLights = null
	let veilPass = null
	let depthTap = null
	let veilOverlay = null
	const lanternLights = []
	const stages = []
	const falls = []
	let groundScene = TIMELINE.world.surfaceY - origin[1]
	let currentShown = -1
	const lookBase = { scatter: 0.42, rays: 0.5, emissiveLantern: null }
	const ember = createEmber()
	scene.add(ember.group)
	let wrapped = false // the loop playback has just resumed: fade in (otherwise the first frame is the poster)

	// Glow of the windows at night: one card (and one material) per window, to switch them off one by one.
	const windowCards = new THREE.Group()
	windowCards.name = 'windows'
	const cardMaterials = []
	const makeCardMaterial = () =>
		new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
	let backdropFaded = false
	let bgKey = null

	// --- run-time quality (low: no bloom, no shadows, no decorative particles) -------------
	function applyRuntimeQuality() {
		const look = mods.look
		if (look) {
			for (const pass of look.composer.passes) {
				if (pass === look.bloom || (!look.bloom && pass.constructor?.name === 'UnrealBloomPass')) pass.enabled = !lowRuntime
			}
			look.lights.key.castShadow = !lowRuntime
			lookBase.rays = lowRuntime ? 0 : 0.5
			look.params.rays = lookBase.rays
			look.params.grain = lowRuntime ? 0.02 : 0.035
			look.params.bloomThreshold = 1.5
		}
		if (mods.life?.points) {
			const decorative = mods.life.decorative ?? ['dust', 'needles', 'birds']
			for (const [name, p] of Object.entries(mods.life.points)) {
				const on = decor[name] !== false && (!lowRuntime || !decorative.includes(name))
				decorVisible.set(name, on)
				p.visible = on
			}
		}
		probe.quality = lowRuntime ? 'low' : 'high'
		dirty = true
	}

	const has = (mod, feature) => {
		const f = mod?.features
		return Boolean(f && (Array.isArray(f) ? f.includes(feature) : f.has?.(feature)))
	}
	const lookHas = (feature) => has(mods.look, feature)
	let lifeEmberLook = null // settings of the ember of life.js (size of the anchor `ember.size`)
	// Front of the forgetting of the particles (life.js, option forgetLook): live object copied from look.params at every frame,
	// so that particles and blocks share the same front (instead of two copies of the same constants).
	const forgetSync = {}
	function syncForget() {
		const P = mods.look?.params
		if (!P) return
		forgetSync.gain = P.forgetGain
		forgetSync.world = P.forgetWorld
		forgetSync.soft = P.forgetSoft
		forgetSync.max = P.forgetMax
		forgetSync.round = P.forgetRound
		forgetSync.tint = P.forgetTint
		for (const key of Object.keys(forgetSync)) if (forgetSync[key] === undefined) delete forgetSync[key]
	}
	const lifeHas = (feature) => has(mods.life, feature)

	// --- application of the state ------------------------------------------------
	const axis = new THREE.Vector3()
	const v3 = new THREE.Vector3()
	const sunDir = new THREE.Vector3()
	const moonDir = new THREE.Vector3()

	function resolveStage(i) {
		while (i > 0 && !stages[i]) i--
		return i
	}

	// Cheat of the main light: same side and same height as the body, but from behind the camera.
	const basis = skyBasis()
	const fVec = new THREE.Vector3().fromArray(basis.f)
	const rVec = new THREE.Vector3().fromArray(basis.r)
	function cheatKeyLight(state) {
		const look = mods.look
		if (!look || o.realLight) return
		const K = TIMELINE.keyLight
		const useSun = state.lighting.sunIntensity >= state.lighting.moonIntensity || state.lighting.elevation > 0
		const d = useSun ? sunDir : moonDir
		const a = d.dot(fVec)
		const b = d.dot(rVec)
		const w = state.keyLapse ?? 0
		v3.copy(rVec)
			.multiplyScalar(b)
			.addScaledVector(fVec, -Math.abs(a) * lerp(K.behind, lerp(K.lapse.behind, K.lapse.greyBehind, state.grey ?? 0), w))
			.add(axis.set(0, Math.max(d.y, 0.08) * K.lift, 0))
			.normalize()
		const maxY = lerp(1, K.lapse.maxY, w)
		if (v3.y > maxY) {
			const h = Math.sqrt(1 - maxY * maxY)
			const hl = Math.hypot(v3.x, v3.z)
			if (hl < 1e-3) v3.set(-fVec.x * h, maxY, -fVec.z * h)
			else v3.set((v3.x / hl) * h, maxY, (v3.z / hl) * h)
		}
		const { center, radius } = LM.shadowFocus
		const c = axis.fromArray(S(center))
		look.lights.key.position.copy(c).addScaledVector(v3, radius + 60)
		look.lights.fill.position.copy(c).add(v3.set(-v3.x, 0.35, -v3.z).normalize().multiplyScalar(50))
	}

	// Procedural decor: fade before the camera leaves the captured zone (diorama of act III).
	function setBackdropOpacity(a) {
		const root = mods.backdrop?.object3d
		if (!root) return
		root.visible = a > 0.001
		const fading = a < 0.999
		if (fading === backdropFaded && !fading) return
		root.traverse((obj) => {
			const list = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : []
			for (const m of list) {
				if (m.userData.mmOpacity === undefined) m.userData.mmOpacity = { opacity: m.opacity, transparent: m.transparent }
				const base = m.userData.mmOpacity
				if (m.transparent !== (fading || base.transparent)) {
					m.transparent = fading || base.transparent
					m.needsUpdate = true
				}
				m.opacity = base.opacity * (fading ? a : 1)
			}
		})
		backdropFaded = fading
	}

	const mean = (list) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : 0)

	function apply(state) {
		const shown = resolveStage(stageOverride ?? state.stage)
		stages.forEach((root, i) => {
			if (root) root.visible = i === shown
		})
		if (shown !== currentShown) {
			currentShown = shown
			if (mods.life && stages[shown]) guarded('life.setStage', () => mods.life.setStage(stages[shown]), warn)
		}

		// Falls (and rises of the rewind), disabled when a stage is forced.
		for (const group of falls) {
			if (!group) continue
			const active = stageOverride === null ? state.falls.find((f) => f.k === group.userData.k) : null
			group.visible = Boolean(active)
			if (!active) continue
			const opacity = fallOpacity(active.tau, active.reverse)
			for (const m of group.userData.materials) m.opacity = m.userData.baseOpacity * opacity
			for (const pivot of group.children) {
				const pose = fallPose(active.tau, pivot.userData.drop, pivot.userData.seed, Boolean(active.reverse))
				pivot.position.copy(pivot.userData.home).add(axis.set(pose.dx, pose.dy, pose.dz))
				pivot.quaternion.setFromAxisAngle(axis.fromArray(pose.axis), pose.angle)
			}
		}

		// Camera (except the free development camera).
		const cam = state.camera
		if (camera.fov !== cam.fov) {
			camera.fov = cam.fov
			camera.updateProjectionMatrix()
		}
		if (!freeCam) {
			camera.position.fromArray(S(cam.eye))
			camera.lookAt(axis.fromArray(S(cam.target)))
		}
		camera.updateMatrixWorld()

		// The house: fire, windows, lanterns, chimney (S0 only).
		const home = shown === 0 && Boolean(stages[0])
		const windowsMean = mean(state.windowLevels)
		const lanternsMean = mean(state.lanternLevels)
		sunDir.fromArray(state.sunDir)
		moonDir.fromArray(state.moonDir)
		// Contract v4: ember, wave (scene positions), forgetting, cold glow, freeze.
		const E = state.ember
		const emberScene = S(E.pos)
		const W8 = state.wave
		const emberState = { pos: E.pos, scenePos: emberScene, strength: E.strength, suspended: E.suspended, pulse: E.pulse, born: E.born, lightGain: E.lightGain ?? 1 }
		// v5: outline of the square edge of the capture (box of S0.json: world and scene), k = 0 outside the diorama.
		const rimState = captureBox
			? { k: state.rim ?? 0, min: captureBox[0].map((v, i) => v + origin[i]), max: captureBox[1].map((v, i) => v + origin[i]), sceneMin: captureBox[0], sceneMax: captureBox[1] }
			: { k: state.rim ?? 0, min: null, max: null, sceneMin: null, sceneMax: null }
		const waveState = W8 ? { origin: W8.origin, sceneOrigin: emberScene, radius: W8.radius, maxRadius: W8.maxRadius, progress: W8.progress, strength: W8.strength } : null
		const freezeFrame = state.freezeFrame
		const mc = moduleClocks(state) // v8: the `t` of the modules, the grain seed and the breathing of the fire follow the v7 time
		const shared = {
			t: mc.t,
			dt: state.t - prevT,
			clock: state.clock,
			clockRate: state.clockRate,
			phase: state.phase,
			day: state.day,
			sunDir,
			moonDir,
			daylight: state.daylight,
			night: state.night,
			grey: state.grey,
			lighting: state.lighting,
			stage: shown,
			fire: home ? Math.min(1, state.campfire) * (1 + 0.4 * state.fireFlare) : 0, // burst: fire +40 %
			fireBoost: home ? Math.max(0, state.campfire - 1) : 0, // v9b: the level above 1 of the celebration goes to the fill of the fire (look.js), not to the flame's own light
			fireFlare: home ? state.fireFlare : 0,
			chimney: home ? state.chimney : 0,
			windows: home ? state.windowNight * windowsMean : 0, // glow of the v2 panes (look.js, kind 'glass')
			lanterns: lanternsMean, // request to the modules: emission of the lanterns (look.js)
			snow: state.snow,
			autumn: state.autumn,
			pause: state.veil.pause,
			// The glow of the fire breathes during both freezes (life.js, look.js); clock relative to the start of the freeze, so that
			// both freezes give the same image (and which continues with the ambience).
			breath: freezeFrame ? 1 : 0,
			// v6: `holdBreath` (hold of the host, controller.hold) is ONLY added to that clock, not to the scene clocks: the
			// glow breathes during the hold without shifting the fire, the clouds or the characters. 0 outside a hold.
			breathT: mc.breathT + state.ambient + (state.holdBreath ?? 0),
			rain: 0,
			// Old channel of the wave (look.js v3, 'captureWave'): only the wave of the rewind, born from the ember
			// (radius of the ring = k x radius x 1.12 in look.js, hence radius = maxRadius / 1.12).
			capture: state.capture && W8 ? { k: state.capture.k, center: emberScene, radius: W8.maxRadius / 1.12 } : null,
			// Contract v4.
			ember: emberState,
			rim: rimState,
			forgetting: state.forgetting,
			dogCoat: state.dogCoat, // v11b: weight of the white of the coat of the dog (look.js)
			wave: waveState,
			coldGlow: state.coldGlow,
			freezeFrame,
			variant: state.variant,
			abandon: state.abandon, // grading warm -> cold, continuous (look.js)
			cycleRate: state.cycleRate, // day/night cycles per second (life.js, sky.js: pure fades after a jump)
			growth: state.growth, // v12: threshold of the dissolve-in of the new cells of a stage (look.js uMmGrow)
			skySmooth: state.skySmooth, // v12: width (cycles) of the averaging of the sky's twilight glow inside the timelapse (undefined: sky.js keys it by the rate)
			exposure: state.exposure, // EV added: breathing of the freezes (+0.1) (look.js); v7c: the presentation of the diorama (+1.6 EV x display) is added by look.js (params.presentEV)
			display: state.display, // presentation of the diorama 0..1 (look.js: presentation light, lift of the characters)
			// Clock of the particles (life.js): that of the band; it goes back at the rewind (otherwise the particles stay
			// frozen then jump at the restore). Equal to `clock` outside the rewind, and at both freezes.
			particleClock: state.particleClock ?? state.actorClock,
			fogScale: lerp(1, TIMELINE.display.fog, state.display),
			ambientGain: lerp(1, TIMELINE.display.ambient, state.display),
			mistScale: 1 - 0.75 * state.display, // the golden mist veiled the diorama
			keyLapse: state.keyLapse,
			wind: state.wind,
			frozen: state.frozen,
			beats: probe.beats,
			camera,
			reducedMotion: reduced(),
		}
		prevT = state.t

		const c = state.clock
		// v7c: lanterns at the same slow pace as the fire (0.7 / 1.2 / 1.5 Hz, +/- 11.5 %; v7b: 1.5 to 3.8 Hz, +/- 19 %).
		const flicker = 1 + 0.05 * Math.sin(c * 4.2 + 0.4) + 0.04 * Math.sin(c * 7.3 + 1.3) + 0.025 * Math.sin(c * 9.6 + 0.9)
		lanternLights.forEach((l, j) => {
			const U = l.userData
			const level = state.lanternLevels[Math.min(j, state.lanternLevels.length - 1)] ?? 1
			l.intensity = home && U.used ? U.intensity * level * (U.flicker ? flicker : 1) : 0
		})
		probe.stage = shown
		const glow = LM.windowGlow?.opacity ?? TIMELINE.lights.windowGlow
		cardMaterials.forEach((m, i) => {
			m.opacity = home ? glow * state.windowNight * (state.windowLevels[Math.min(i, state.windowLevels.length - 1)] ?? 1) : 0
		})
		windowCards.visible = cardMaterials.some((m) => m.opacity > 0.001)
		if (mods.look && lookBase.emissiveLantern !== null) mods.look.params.emissiveLantern = lookBase.emissiveLantern * lanternsMean

		if (mods.sky) {
			const cloudOpacity = 0.7 - 0.3 * state.night
			mods.sky.update({ ...shared, t: state.clock, cloudClock: state.cloudClock, clockRate: state.cloudRate, cloudOpacity })
			mods.sky.uniforms.uMoonPhase.value = state.moonPhase
			mods.sky.uniforms.uSunTint.value.multiplyScalar(TIMELINE.sunDisc * (1 - 0.75 * state.glareCut))
			mods.sky.uniforms.uSunColor.value.multiplyScalar(TIMELINE.sunHalo * (1 - state.glareCut))
			mods.sky.uniforms.uTwilight.value *= 1 - 0.5 * state.glareCut
			// Diorama: the dome goes out while the final pass sets the page colour on the sky. The pixels of the edge
			// of the foliage (multisampled colour leaf + sky, "leaf" depth) then blend the leaf
			// with a dark background, instead of a light grain outline.
			mods.sky.uniforms.uGain.value = o.background ? 1 - 0.97 * state.veil.page : 1
			// Anti-flash: the moon fades when the days go by fast (TIMELINE.lapse.moonCut; cycleRate = 0 at the freezes).
			const MC = TIMELINE.lapse.moonCut
			mods.sky.uniforms.uMoonVis.value *= 1 - MC.amount * smoothstep(MC.from, MC.to, state.cycleRate)
			const SC = TIMELINE.lapse.sunCut
			const sunCut = SC.amount * smoothstep(SC.from, SC.to, state.cycleRate)
			mods.sky.uniforms.uSunTint.value.multiplyScalar(1 - sunCut)
			mods.sky.uniforms.uSunVis.value *= 1 - 0.95 * sunCut // v12: was 0.6: the halo of the sun (Mie, uSunVis) was the pink haze that crossed the frame at every sunset
			// The forgetting (contract v4) also takes the disc and the halo of the sun, the twilight glow and the clouds: at
			// equal luminance (no effect on the anti-flash rule), otherwise the sun stays the warm point of the absence and
			// competes with the ember. 0 at the freezes.
			if (state.forgetting > 0) {
				const k = Math.min(1, state.forgetting / 0.75) * TIMELINE.forgetting.sky
				const U = mods.sky.uniforms
				for (const name of ['uSunTint', 'uSunColor', 'uGlow', 'uCloudLit', 'uCloudShade', 'uCloudSide']) {
					const v = U[name]?.value
					if (!v?.isVector3) continue
					const y = 0.2126 * v.x + 0.7152 * v.y + 0.0722 * v.z
					v.set(lerp(v.x, y, k), lerp(v.y, y, k), lerp(v.z, y, k))
				}
			}
		}
		if (mods.backdrop) {
			mods.backdrop.update(shared)
			setBackdropOpacity(state.veil.backdrop)
		}
		// Bats: never during the shared moment, the capture and the goodbye (the still image), nor in act III.
		const bats = mods.life?.points?.['bats']
		if (bats) bats.visible = (decorVisible.get('bats') ?? true) && !((state.t >= STORY.together[0] - 0.4 && state.t < INSERT.cut) || state.t >= STORY.rewind[0])
		// Frozen smoke: readable in a close shot (the world is stopped), but a column of orange squares in the crane.
		const smoke = mods.life?.points?.['smoke']
		if (smoke) smoke.visible = (decorVisible.get('smoke') ?? true) && state.t < STORY.diorama[0] + 0.9
		if (mods.life) {
			syncForget()
			// The forgetting of the particles follows the gain of look.js (params.forget: 0 cuts the forgetting on the look side, so here too).
			const forgetGain = Number.isFinite(mods.look?.params?.forget) ? mods.look.params.forget : 1
			mods.life.update(forgetGain === 1 ? shared : { ...shared, forgetting: shared.forgetting * forgetGain })
		}

		// Characters.
		const actorState = { ...shared, t: state.charClock }
		// A single owner of the lift of the diorama: look.js ('charLift'), otherwise characters.js (`glow`).
		const glowK = lookHas('charLift') ? 0 : 1
		// v5: the warm glows (return of the player as a memory, warmth of the ember on the dog) go through `glow`, tinted
		// by `glowTint` (characters.js; without it, the lift keeps the colour of the texture). They do not depend on
		// 'charLift' (which only concerns the diorama) and are 0 at both freezes.
		const warmGlow = (base, warm, tint) => {
			const g = Math.max(base * glowK, warm)
			return warm > base * glowK && warm > 0 ? { glow: g, glowTint: tint } : { glow: g, glowTint: undefined }
		}
		// Tint fallback (as long as characters.js does not announce 'glowTint'): after update(), which resets the emissive to the
		// colour of the material at every frame, the scene sets the tint of the ember on the emissive of the skin.
		const tintFallback = (mod, glow) => {
			if (!glow.glowTint) return
			mod.object3d.traverse((obj) => {
				for (const m of obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : []) {
					if (m.emissiveMap && m.userData.mmRole !== 'collar') m.emissive.setRGB(glow.glowTint[0], glow.glowTint[1], glow.glowTint[2])
				}
			})
		}
		const P = state.player
		if (mods.player) {
			const visible = state.playerVisible && P.visible !== false
			mods.player.object3d.visible = visible
			if (visible) {
				const g = warmGlow(P.glow ?? 0, P.memoryGlow ?? 0, P.glowTint)
				mods.player.update(actorState, { ...actorPoseOf(state, 'player', S), ...g, t: state.charClock, position: S(P.position), lookAt: P.lookAt && S(P.lookAt) })
				if (!playerFeatures.has('glowTint')) tintFallback(mods.player, g)
				applyPlayerFallback(mods.player, P, playerFeatures)
			}
		}
		const Dg = state.dog
		if (mods.dog) {
			mods.dog.object3d.visible = Dg.visible !== false
			if (mods.dog.object3d.visible) {
				const g = warmGlow(Dg.glow ?? 0, (Dg.warm ?? 0) * dogWarmGain, Dg.glowTint)
				mods.dog.update(actorState, { ...actorPoseOf(state, 'dog', S), ...g, t: state.charClock, position: S(Dg.position), lookAt: Dg.lookAt && S(Dg.lookAt) })
				if (!dogFeatures.has('glowTint')) tintFallback(mods.dog, g)
			}
		}

		// Fallback ember (contract v4): sprite at constant screen size, as long as life.js does not draw it itself.
		const showEmber = E.strength > 0.002 && !lifeHas('ember')
		ember.group.visible = showEmber
		if (showEmber) {
			const T = TIMELINE.ember
			ember.group.position.fromArray(emberScene)
			const p = camera.projectionMatrix.elements
			const wpx = Math.max(1, size.w)
			const hpx = Math.max(1, size.h)
			// Fraction of the width, with a floor in px (otherwise the ember is only 12 px in phone portrait).
			const sized = (sprite, f, minPx) => {
				const k = Math.max(f, minPx / wpx)
				sprite.scale.set((2 * k) / Math.max(1e-6, p[0]), (2 * k * wpx) / (hpx * Math.max(1e-6, p[5])), 1)
			}
			// Slow breathing on the scene clock (frozen during the freezes: same image at both freezes).
			const live = 1 + 0.06 * Math.sin(state.clock * 2.1) + 0.04 * Math.sin(state.clock * 3.7 + 1.1)
			const glowK = E.strength * live * (1 + 0.8 * E.pulse)
			sized(ember.glow, T.halo * (0.85 + 0.15 * E.strength) * (1 + 0.35 * E.pulse), T.minHaloPx * (1 + 0.35 * E.pulse))
			sized(ember.core, T.core * (1 + 0.25 * E.pulse), T.minCorePx)
			ember.core.material.color.setRGB(T.color[0] * glowK, T.color[1] * glowK, T.color[2] * glowK)
			ember.glow.material.color.setRGB(3.2 * glowK, 1.15 * glowK, 0.26 * glowK)
		}

		if (mods.look) {
			mods.look.params.scatter = lookBase.scatter * (1 - state.glareCut) * (1 - 0.6 * state.display)
			mods.look.params.rays = lookBase.rays * (1 - state.glareCut)
		}

		// Voile (passe finale) : uniformes.
		if (veilPass) {
			const u = veilPass.material.uniforms
			const V = state.veil
			u.uBlack.value = V.black
			// A single owner: if look.js does the blurred pause and the wave (features), the final pass does not redo them.
			u.uPause.value = lookHas('pause') ? 0 : V.pause
			u.uCold.value = TIMELINE.coldGlow.strength * V.cold
			u.uColdHeight.value = TIMELINE.coldGlow.height
			u.uColdColor.value.fromArray(TIMELINE.coldGlow.color)
			const waveOn = !lookHas('captureWave') && !lookHas('wave')
			u.uWave.value.set(emberScene[0], emberScene[1], emberScene[2], V.wave.radius)
			u.uWaveK.value = waveOn ? V.wave.strength : 0
			u.uProjInv.value.copy(camera.projectionMatrixInverse)
			u.uCamWorld.value.copy(camera.matrixWorld)
			u.uBgK.value = o.background ? V.page : 0
			// The pass works in display space (after OutputPass): the page colour is taken as is.
			if (o.background && bgKey !== o.background) {
				bgKey = o.background
				if (typeof o.background === 'number') u.uBg.value.setHex(o.background, THREE.LinearSRGBColorSpace)
				else u.uBg.value.setStyle(String(o.background), THREE.LinearSRGBColorSpace)
			}
		}
		if (veilOverlay) veilOverlay.material.uniforms.uBlack.value = Math.max(state.veil.black, 0.4 * state.veil.pause)

		// Fallback without look.js: simple lights, v0 style.
		if (fallbackLights) {
			const L = state.lighting
			scene.background.setRGB(...L.horizon, THREE.SRGBColorSpace)
			fallbackLights.hemi.color.setRGB(...L.hemiSky, THREE.SRGBColorSpace)
			fallbackLights.hemi.groundColor.setRGB(...L.hemiGround, THREE.SRGBColorSpace)
			fallbackLights.hemi.intensity = L.hemiIntensity
			const up = L.elevation >= 0
			fallbackLights.sun.color.setRGB(...(up ? L.sunColor : L.moonColor), THREE.SRGBColorSpace)
			fallbackLights.sun.intensity = up ? L.sunIntensity : L.moonIntensity
			fallbackLights.sun.position.copy(camera.position).add(v3.copy(up ? sunDir : moonDir).multiplyScalar(60))
			if (scene.fog) scene.fog.color.setRGB(...L.fog, THREE.SRGBColorSpace)
		}
		return shared
	}

	function ensureVeilLast() {
		const passes = mods.look?.composer?.passes
		if (!passes || !veilPass) return
		if (passes.at(-1) !== veilPass) {
			const i = passes.indexOf(veilPass)
			if (i >= 0) passes.splice(i, 1)
			passes.push(veilPass)
		}
	}

	function draw(shared) {
		const look = mods.look
		if (look) {
			try {
				look.update(shared)
				cheatKeyLight(shared)
				ensureVeilLast()
				look.composer.render()
				return
			} catch (error) {
				console.error(error)
				warn(`look.js disabled (${error.message})`)
				mods.look = null
				installFallbackLights()
			}
		}
		renderer.render(scene, camera)
		if (veilOverlay) {
			const auto = renderer.autoClear
			renderer.autoClear = false
			veilOverlay.render(renderer)
			renderer.autoClear = auto
		}
	}

	function installFallbackLights() {
		if (fallbackLights) return
		const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1.5)
		const sun = new THREE.DirectionalLight(0xffffff, 1)
		scene.add(hemi, sun)
		scene.fog = new THREE.FogExp2(0x000000, 0.01)
		scene.background ??= new THREE.Color()
		renderer.toneMappingExposure = 1.2
		fallbackLights = { hemi, sun }
		// Without composer: the black and the pause go through a transparent quad drawn over the image.
		veilOverlay = new FullScreenQuad(
			new THREE.ShaderMaterial({
				uniforms: { uBlack: { value: 0 } },
				vertexShader: VEIL_VERTEX,
				fragmentShader: 'uniform float uBlack; void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, uBlack); }',
				transparent: true,
				depthTest: false,
				depthWrite: false,
			}),
		)
	}

	// --- screen anchors (normalised coordinates 0..1 of the canvas, y downward) -------------------------
	const pv = new THREE.Vector3()
	const box = new THREE.Box3()
	const corner = new THREE.Vector3()
	const round = (v) => +v.toFixed(4)
	function projectScene(p) {
		pv.copy(p).project(camera)
		const x = (pv.x + 1) / 2
		const y = (1 - pv.y) / 2
		return { x: round(x), y: round(y), visible: pv.z > -1 && pv.z < 1 && x >= 0 && x <= 1 && y >= 0 && y <= 1, behind: pv.z >= 1 }
	}
	const projectWorld = (w) => projectScene(corner.fromArray(S(w)))
	// v8: anchor `player.front` { x, y, visible, side, px }: point 0.6 block in front of the chest, at hand height (0..1 of the canvas);
	// `side` = +/-1, direction of the gaze on screen; `px` = CSS px per block at that depth. This is where the host puts the menu screen.
	const frontCorner = new THREE.Vector3()
	const frontRight = new THREE.Vector3()
	function playerFrontAnchor(pose, playerVisible) {
		const w = playerFrontWorld(pose)
		const a = projectScene(frontCorner.fromArray(S(w)))
		frontRight.setFromMatrixColumn(camera.matrixWorld, 0)
		const b = projectScene(frontCorner.add(frontRight))
		const px = Math.hypot((b.x - a.x) * size.w, (b.y - a.y) * size.h)
		const chest = projectWorld(aheadOf(pose, 0, 1.0 - 0.3 * (pose.sneakK ?? 0)))
		const ahead = projectWorld(aheadOf(pose, 1, 1.0 - 0.3 * (pose.sneakK ?? 0)))
		return { x: a.x, y: a.y, visible: Boolean(a.visible && playerVisible), side: ahead.x >= chest.x ? 1 : -1, px: +px.toFixed(1) }
	}
	function rectOf(points) {
		let l = Infinity
		let tp = Infinity
		let r = -Infinity
		let b = -Infinity
		let any = false
		for (const p of points) {
			pv.copy(p).project(camera)
			if (pv.z >= 1) continue
			any = true
			const x = (pv.x + 1) / 2
			const y = (1 - pv.y) / 2
			l = Math.min(l, x)
			r = Math.max(r, x)
			tp = Math.min(tp, y)
			b = Math.max(b, y)
		}
		if (!any) return null
		const visible = r > 0 && l < 1 && b > 0 && tp < 1
		return { l: round(clamp(l, 0, 1)), t: round(clamp(tp, 0, 1)), r: round(clamp(r, 0, 1)), b: round(clamp(b, 0, 1)), visible }
	}
	function boxCorners(min, max) {
		const out = []
		for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push(new THREE.Vector3(x, y, z))
		return out
	}
	let lastState = null
	let captureBox = null // world box of the whole capture (captureBounds of S0.json), for `capture` and fitSubject
	const rawCam = new THREE.PerspectiveCamera()
	// Projected rectangle (0..1, NOT bounded) of a list of points, by a given camera.
	function rawRect(points, cam) {
		let l = Infinity
		let tp = Infinity
		let r = -Infinity
		let b = -Infinity
		for (const p of points) {
			pv.copy(p).project(cam)
			if (pv.z >= 1) continue
			const x = (pv.x + 1) / 2
			const y = (1 - pv.y) / 2
			l = Math.min(l, x)
			r = Math.max(r, x)
			tp = Math.min(tp, y)
			b = Math.max(b, y)
		}
		return Number.isFinite(l) ? { l, t: tp, r, b } : null
	}
	// Offset of the subject ({ x, y, scale }) that places the requested box (whole capture or chalet), seen by the current
	// camera, in the rectangle `rect` of the canvas (fractions 0..1). Direct computation (without the current offset): the host
	// can interpolate it with its own offset, frame by frame.
	// `at` (story seconds): camera of the story at that instant instead of the current camera (e.g. the diorama at rest,
	// for a card that the host prepares in advance).
	function fitSubject(rect = { l: 0.1, t: 0.1, r: 0.9, b: 0.9 }, { box: which = 'capture', fill = 1, at = null } = {}) {
		const src = which === 'chalet' ? LM.chaletBox.map(S) : captureBox
		if (!src || !size.w) return null
		rawCam.copy(camera)
		rawCam.clearViewOffset()
		if (Number.isFinite(at)) {
			const cam = cameraAt(clamp(at, 0, D - 1e-4), aspect)
			rawCam.fov = cam.fov
			rawCam.aspect = aspect
			rawCam.position.fromArray(S(cam.eye))
			rawCam.lookAt(axis.fromArray(S(cam.target)))
		}
		rawCam.updateProjectionMatrix()
		rawCam.updateMatrixWorld()
		const B = rawRect(boxCorners(src[0], src[1]), rawCam)
		if (!B || B.r - B.l < 1e-4 || B.b - B.t < 1e-4) return null
		const s = Math.min((rect.r - rect.l) / (B.r - B.l), (rect.b - rect.t) / (B.b - B.t)) * fill
		const cx = (rect.l + rect.r) / 2
		const cy = (rect.t + rect.b) / 2
		return { x: +((cx - 0.5) / s - (B.l + B.r) / 2 + 0.5).toFixed(5), y: +((cy - 0.5) / s - (B.t + B.b) / 2 + 0.5).toFixed(5), scale: +s.toFixed(5) }
	}
	// v9 site phase. Union of the projected capture box over a whole turn of the orbit (every 15 degrees of yaw, at the elevation of the
	// current view and zoom 1): a size that does not depend on the angle, so that the diorama keeps its size while it turns.
	// The camera of the film's last frame, translated so that it looks at the center of the capture box: the orbit then turns around the
	// middle of the diorama (same orientation and distance, so nothing jumps), and its size on screen does not depend on the angle.
	function siteBase() {
		const c = cameraAt(D - 1e-4, aspect)
		if (!captureBox) return c
		const mid = captureBox[0].map((v, i) => (v + captureBox[1][i]) / 2 + origin[i])
		const d = mid.map((v, i) => v - c.target[i])
		return { ...c, eye: c.eye.map((v, i) => v + d[i]), target: mid }
	}
	// v9c: the capture's own vertices, reduced to the vertices of their CONVEX HULL. The extremes of a point set under any perspective projection are hull vertices, so the union
	// over a turn of the hull's projected bounds is that of the whole shape, to the pixel, with a few dozen points instead of a few hundred thousand. The union over a turn of
	// THIS cloud is the real silhouette's box; the capture's box (`fit: 'turn'`) is mostly empty air above the forest, so the model came out about 25 % smaller than the panel
	// could hold. hull(A + B) = hull(hull(A) + B): the vertices are fed in batches of 4 000 (about 10 ms each) while the film plays (`startCaptureCloud`, one batch per timer tick), so
	// that no frame is lost; `captureCloud()` finishes the job at once if a framing is asked before it is done. Result in probe.cloud: { points, hull, ms }.
	let captureCloudPoints = null
	let cloudJob = null
	const hullOf = (points) => {
		try {
			const hull = new ConvexHull().setFromPoints(points)
			const verts = new Set()
			for (const face of hull.faces) {
				let edge = face.edge
				do {
					verts.add(edge.head().point)
					edge = edge.next
				} while (edge !== face.edge)
			}
			return verts.size >= 4 ? [...verts] : points
		} catch {
			return points // coplanar start (a batch of one flat tile): keep the points, the next batch will fix it
		}
	}
	function advanceCaptureCloud(batches) {
		if (captureCloudPoints) return true
		const root = stages[0]
		if (!root) return false
		if (!cloudJob) {
			root.updateWorldMatrix(true, true)
			const meshes = []
			root.traverse((obj) => {
				if (obj.isMesh && obj.geometry?.attributes?.position) meshes.push(obj)
			})
			cloudJob = { meshes, mi: 0, vi: 0, hull: [], total: 0, busy: 0 }
		}
		const job = cloudJob
		for (let b = 0; b < batches && job.mi < job.meshes.length; b++) {
			const t0 = performance.now()
			const batch = job.hull.slice()
			let n = 0
			while (job.mi < job.meshes.length && n < 4000) {
				const mesh = job.meshes[job.mi]
				const pos = mesh.geometry.attributes.position
				const end = Math.min(pos.count, job.vi + (4000 - n))
				for (; job.vi < end; job.vi++, n++) batch.push(new THREE.Vector3().fromBufferAttribute(pos, job.vi).applyMatrix4(mesh.matrixWorld))
				if (job.vi >= pos.count) {
					job.mi++
					job.vi = 0
				}
			}
			job.total += n
			job.hull = hullOf(batch)
			job.busy += performance.now() - t0
		}
		if (job.mi < job.meshes.length) return false
		captureCloudPoints = job.hull.length >= 4 ? job.hull : null
		probe.cloud = { points: job.total, hull: job.hull.length, ms: +job.busy.toFixed(1) }
		return true
	}
	function startCaptureCloud() {
		const tick = () => {
			if (disposed || captureCloudPoints) return
			if (!advanceCaptureCloud(1)) setTimeout(tick, 24)
		}
		setTimeout(tick, 1500)
	}
	function captureCloud() {
		advanceCaptureCloud(Infinity)
		return captureCloudPoints
	}
	// Projected box of the capture at a given yaw and elevation (the hull of the silhouette with `tight`, the capture's box otherwise), zoom 1, no framing offset.
	function boxAtYaw(base, yawDeg, pitch, cloud) {
		const cam = siteCameraFrom(base, { yaw: yawDeg, pitch, zoom: 1 })
		rawCam.copy(camera)
		rawCam.clearViewOffset()
		rawCam.fov = cam.fov
		rawCam.aspect = aspect
		rawCam.position.fromArray(S(cam.eye))
		rawCam.lookAt(axis.fromArray(S(cam.target)))
		rawCam.updateProjectionMatrix()
		rawCam.updateMatrixWorld()
		return rawRect(cloud ?? boxCorners(captureBox[0], captureBox[1]), rawCam)
	}
	// v10: the boxes of the 24 angles are kept (siteFrameFor: the mean centre and the live centre use them).
	function siteUnion(fit = 'turn') {
		if (!captureBox || !size.w) return null
		const cloud = fit === 'tight' ? captureCloud() : null
		const base = siteBase()
		const pitch = siteView ? siteView.getView().pitch : elevationOf(base.eye, base.target)
		let U = null
		const boxes = []
		const yaws = fit === 'current' ? [siteView ? siteView.getView().yaw : 0] : Array.from({ length: 24 }, (_, i) => i * 15)
		for (const yawDeg of yaws) {
			const B = boxAtYaw(base, yawDeg, pitch, cloud)
			if (!B) continue
			boxes.push(B)
			U = U ? { l: Math.min(U.l, B.l), t: Math.min(U.t, B.t), r: Math.max(U.r, B.r), b: Math.max(U.b, B.b) } : B
		}
		if (!(U && U.r - U.l > 1e-4 && U.b - U.t > 1e-4)) return null
		return Object.assign({ ...U }, { boxes, pitch })
	}
	// Screen position (0..1) of the center of that union box for a subject offset, and the offset that puts it at (cx, cy).
	const siteCenterOf = (U, s) => [s.scale * ((U.l + U.r) / 2 + s.x - 0.5) + 0.5, s.scale * ((U.t + U.b) / 2 + s.y - 0.5) + 0.5]
	function applySiteFrame(U, { cx, cy, scale }) {
		// v10: frameShift moves the model on screen by as many CSS px (the panel rising with the page when the footer arrives); a translation, nothing recomputed.
		const sx = size.w ? frameShift.x / size.w / scale : 0
		const sy = size.h ? frameShift.y / size.h / scale : 0
		subject = { x: (cx - 0.5) / scale - (U.l + U.r) / 2 + 0.5 + sx, y: (cy - 0.5) / scale - (U.t + U.b) / 2 + 0.5 + sy, scale }
		applyViewOffset()
		// On-screen box of the diorama (CSS px, the union box of the turn seen through the current offset): `getView().rect`.
		const to = (v, axis) => Math.round(((scale * (v + (axis === 'x' ? subject.x : subject.y) - 0.5) + 0.5) * (axis === 'x' ? size.w : size.h)) * 100) / 100
		siteRectPx = { l: to(U.l, 'x'), t: to(U.t, 'y'), r: to(U.r, 'x'), b: to(U.b, 'y') }
		dirty = true
	}
	// The boxes of a whole turn for the framing `fit`, cached: they are computed when a framing is asked (the elevation of that moment), not at every frame.
	function unionOf(fit) {
		const key = `${fit}|${size.w}|${size.h}|${aspect}`
		if (!frameUnion || frameUnion.key !== key) {
			const U = siteUnion(fit)
			frameUnion = U ? { key, U } : null
		}
		return frameUnion?.U ?? null
	}
	// Yaw the model is shown at: the site view's, except during the hand-over driven by setSiteBlend, where the camera comes from the film's: the yaw is brought back to 0 by the short way (yaw x e).
	function effYaw() {
		if (!siteView) return 0
		const yaw = siteView.getView().yaw
		return blend && blend.g < 1 ? wrapDeg(yaw) * EASES.glide(blend.g) : yaw
	}
	const frameE = () => (frameAnim ? frameAnim.e : blend ? EASES.glide(blend.g) : 1)
	// Puts the model in its panel for the progress `e` (0 = the framing it was measured from, 1 = the panel). A PURE function of (e, yaw, panel): the same arguments, the same offset.
	function evalFrame(e = frameE()) {
		if (!siteFrame || !size.w || !captureBox) return false
		const f = siteFrame
		const U = unionOf(f.fit)
		if (!U) return false
		const R = { l: (f.rect.l + f.margin) / size.w, t: (f.rect.t + f.margin) / size.h, r: (f.rect.r - f.margin) / size.w, b: (f.rect.b - f.margin) / size.h }
		let live = null
		if (f.centre === 'live') {
			const base = siteBase()
			const pitch = siteView ? siteView.getView().pitch : elevationOf(base.eye, base.target)
			live = boxAtYaw(base, effYaw(), pitch, f.fit === 'tight' ? captureCloud() : null)
		}
		const T = siteFrameFor({ boxes: U.boxes, live, rect: R, fill: f.fill, centre: f.centre })
		if (!T) return false
		const from = siteCenterOf(T.U, frameFrom)
		const k = clamp(e, 0, 1)
		applySiteFrame(T.U, { cx: lerp(from[0], T.cx, k), cy: lerp(from[1], T.cy, k), scale: lerp(frameFrom.scale, T.scale, k) })
		return true
	}
	/**
	 * v9: frames the diorama in `rect` ({ l, t, r, b } in CSS px of the canvas, `margin` px of air inside it): the offset and the scale
	 * of the subject are tweened over `duration` seconds (0 = at once; at once too in reduced motion). Options: `fit` 'turn' (default,
	 * the union box of the capture over a whole turn: the size does not change while the model turns), 'tight' (v9c: the union over a whole turn of the capture's
	 * own vertices: the real silhouette, about 25 % larger in a wide panel) or 'current' (the box at the current angle,
	 * larger but it can overflow while turning); `fill` multiplies the scale (1.2 = 20 % larger than the fit). Resolves with the
	 * final { x, y, scale }. v10: `centre` 'union' (v9, default) or 'live' (siteFrameFor: the box at the current angle is centred in the panel, at every angle).
	 */
	function frameSubject(rect, { duration = 0.8, ease = 'standard', margin = 12, fit = 'turn', fill = 1, centre = 'union' } = {}) {
		const run = () =>
			new Promise((resolve) => {
				if (disposed) {
					resolve(null)
					return
				}
				siteFrame = { rect: { l: rect.l, t: rect.t, r: rect.r, b: rect.b }, margin, fit, fill, centre }
				frameUnion = null // the boxes of the turn are measured now, at the elevation of this moment
				if (!unionOf(fit)) {
					resolve(null)
					return
				}
				sitePanelPx = { l: rect.l, t: rect.t, r: rect.r, b: rect.b }
				frameAnim?.resolve(null) // a newer request supersedes the running one
				frameAnim = null
				const d = reduced() ? 0 : Math.max(0, Number(duration) || 0)
				frameFrom = { ...subject }
				if (d <= 0) {
					evalFrame(1)
					resolve({ ...subject })
					return
				}
				frameAnim = { duration: d, ease: EASES[ease] ?? STANDARD_EASE, at: 0, e: 0, resolve }
				evalFrame(0)
			})
		return isReady ? run() : ready.then(run, () => null)
	}
	// Diameter of the halo of the ember in CSS px, from the one that draws it (life.js: LIFE.ember merged with
	// tune.life.emberLook; otherwise the fallback ember, TIMELINE.ember). The visible glow is about two thirds of it.
	function emberHaloPx(E) {
		if (!(E?.strength > 0.002) || !size.w) return 0
		const pulse = clamp(E.pulse ?? 0, 0, 1)
		if (lifeHas('ember') && lifeEmberLook) {
			const k = Math.max(lifeEmberLook.halo * (0.85 + 0.15 * E.strength) * (1 + 0.7 * pulse) * size.w, lifeEmberLook.minHaloPx)
			return Math.round(k)
		}
		const T = TIMELINE.ember
		return Math.round(Math.max(T.halo * (0.85 + 0.15 * E.strength) * (1 + 0.35 * pulse) * size.w, T.minHaloPx * (1 + 0.35 * pulse)))
	}
	// Side of the 3 x 3 core of the ember in CSS px (v6), from the one that draws it: cells of >= minCellPx (rounded).
	function emberCorePx(E) {
		if (!(E?.strength > 0.002) || !size.w) return 0
		const pulse = clamp(E.pulse ?? 0, 0, 1)
		const L = lifeHas('ember') && lifeEmberLook ? lifeEmberLook : { core: 0.0105, minCellPx: 3 }
		return Math.round(3 * Math.max(Math.round(Math.max((L.core * (1 + 0.15 * pulse) * size.w) / 3, L.minCellPx ?? 3)), 2))
	}
	// Box (0..1, not bounded, `visible` afterwards) around a screen point, of side `px` in CSS px.
	function boxAround(p, px) {
		if (!size.w || !size.h || !(px > 0)) return null
		const hx = px / 2 / size.w
		const hy = px / 2 / size.h
		return { l: round(p.x - hx), t: round(p.y - hy), r: round(p.x + hx), b: round(p.y + hy) }
	}
	// Box of the head of a character (cubes of `parts.head`: skull, layer, ears and muzzle of the dog), projected.
	// The eight corners of each cube are transformed by its world matrix (not the box aligned with the world axes, which
	// would grow a turned head by about 40 %): the screen box is that of the cubes as they are rendered.
	const headPts = []
	function headRect(actor) {
		const g = actor?.parts?.head?.group
		if (!g) return null
		g.updateWorldMatrix(true, true)
		let n = 0
		g.traverse((obj) => {
			const geo = obj.isMesh ? obj.geometry : null
			if (!geo) return
			if (!geo.boundingBox) geo.computeBoundingBox()
			const { min, max } = geo.boundingBox
			for (const x of [min.x, max.x]) {
				for (const y of [min.y, max.y]) {
					for (const z of [min.z, max.z]) {
						headPts[n] ??= new THREE.Vector3()
						headPts[n++].set(x, y, z).applyMatrix4(obj.matrixWorld)
					}
				}
			}
		})
		return n ? rectOf(headPts.slice(0, n)) : null
	}
	// v6: recommended free zone for text, outside the visible protected boxes (heads, ember, fire) + 8 px of margin.
	// One side of the union of the protected boxes: `above`, `left`, `right`; `best`: the biggest that stays readable.
	function freeBox(out) {
		const parts = [out.player?.head, out.dog?.head, out.ember?.visible ? out.ember.box : null]
		if (out.fire?.visible && out.fire.lit) {
			const fb = boxAround(out.fire, 0.06 * size.w)
			if (fb) parts.push({ ...fb, t: round(fb.t - 0.05), b: round(fb.b + 0.02), visible: true })
		}
		const list = parts.filter((r) => r && r.visible !== false)
		if (!list.length || !size.w) return null
		const U = { l: Math.min(...list.map((r) => r.l)), t: Math.min(...list.map((r) => r.t)), r: Math.max(...list.map((r) => r.r)), b: Math.max(...list.map((r) => r.b)) }
		const mx = 8 / size.w
		const my = 8 / size.h
		const edge = 0.04
		const above = { l: edge, t: edge, r: 1 - edge, b: round(U.t - my) }
		const left = { l: edge, t: edge, r: round(U.l - mx), b: 1 - edge }
		const right = { l: round(U.r + mx), t: edge, r: 1 - edge, b: 1 - edge }
		const area = (r) => Math.max(0, r.r - r.l) * Math.max(0, r.b - r.t) * (size.w * size.h)
		const ok = (r) => r.r - r.l >= 0.2 && r.b - r.t >= 0.08
		const sides = { above, left, right }
		let best = null
		for (const k of ['above', 'left', 'right']) if (ok(sides[k]) && (!best || area(sides[k]) > area(sides[best]) * 1.0001)) best = k
		return { above, left, right, best, protect: { l: round(U.l), t: round(U.t), r: round(U.r), b: round(U.b) } }
	}
	function computeAnchors() {
		if (!lastState) return null
		const st = lastState
		const W = TIMELINE.world
		const out = { t: round(st.t), width: size.w, height: size.h }
		const dark = st.veil.black > 0.6 // black of the departure or of the fade: nothing is visible
		// Dog: head (point) and box of the model.
		if (mods.dog?.object3d.visible) {
			box.setFromObject(mods.dog.object3d)
			const rect = rectOf(boxCorners(box.min.toArray(), box.max.toArray()))
			const head = st.dog.position
			const yaw = st.dog.yaw ?? 0
			const p = projectWorld([head[0] + 0.45 * Math.sin(yaw), head[1] + (st.dog.clip === 'lie' ? 0.45 : 0.9), head[2] + 0.45 * Math.cos(yaw)])
			out.dog = { ...p, box: rect, visible: Boolean(rect?.visible) && !dark }
			// v6: box of the head (ears and muzzle included), so that the text passes above.
			const hr = headRect(mods.dog)
			out.dog.head = hr ? { ...hr, visible: hr.visible && out.dog.visible } : { l: 0, t: 0, r: 0, b: 0, visible: false }
		} else out.dog = { visible: false }
		// Player: head (point).
		if (mods.player?.object3d.visible) {
			const pp = st.player.position
			out.player = projectWorld([pp[0], pp[1] + 1.62, pp[2]])
			if (dark) out.player.visible = false
			// v6: box of the head (layer included), where it is rendered (sitting, standing, head raised).
			const hr = headRect(mods.player)
			out.player.head = hr ? { ...hr, visible: hr.visible && out.player.visible } : { l: 0, t: 0, r: 0, b: 0, visible: false }
			out.player.front = playerFrontAnchor(st.player, out.player.visible)
		} else out.player = { visible: false, front: { x: 0, y: 0, visible: false, side: 1, px: 0 } }
		out.fire = projectWorld([W.fire[0], W.fire[1] + 0.5, W.fire[2]])
		out.fire.lit = st.campfire > 0.05 && currentShown === 0
		if (dark) out.fire.visible = false
		const [cmin, cmax] = LM.chaletBox
		out.chalet = rectOf(boxCorners(S(cmin), S(cmax)))
		if (out.chalet && dark) out.chalet.visible = false
		// Whole capture (box of captureBounds): used during the diorama (card of the host, fitSubject).
		out.capture = captureBox ? rectOf(boxCorners(captureBox[0], captureBox[1])) : null
		if (out.capture && dark) out.capture.visible = false
		// Suspended ember (v4): point not to be covered by text; `icon` (v3) no longer exists and stays invisible.
		out.ember = { ...projectWorld(st.ember.pos), strength: +st.ember.strength.toFixed(3), size: emberHaloPx(st.ember) }
		out.ember.visible = out.ember.visible && st.ember.strength > 0.02 && !dark
		// v6: box of the halo (side = size), side of the 3 x 3 core (px) and brightening (0..1, to time a pulse of the host).
		out.ember.box = boxAround(out.ember, out.ember.size) ?? { l: 0, t: 0, r: 0, b: 0 }
		out.ember.coreSize = emberCorePx(st.ember)
		out.ember.pulse = +clamp(st.ember.pulse ?? 0, 0, 1).toFixed(3)
		out.icon = { x: out.ember.x, y: out.ember.y, visible: false, opacity: 0 }
		// Horizon (height of the eye) and tree line (about 18 blocks above the ground, 70 blocks ahead).
		camera.getWorldDirection(v3)
		v3.y = 0
		v3.normalize()
		out.horizon = projectScene(axis.copy(camera.position).addScaledVector(v3, 1000)).y
		// Approximate tree line (tops about 20 blocks above the ground, at 60 blocks): heuristic, not a measure of the image.
		const ridge = projectScene(axis.copy(camera.position).addScaledVector(v3, 60).setY(W.surfaceY + 20 - origin[1]))
		out.ridge = ridge.y
		const astro = (dir) => {
			const p = projectScene(axis.copy(camera.position).addScaledVector(v3.fromArray(dir), 500))
			return { x: p.x, y: p.y, visible: p.visible && dir[1] > -0.03 }
		}
		out.sun = astro(st.sunDir)
		out.moon = astro(st.moonDir)
		// Free sky: the biggest of the zones above the tree line (above the chalet, on its left, on its right).
		const ch = out.chalet?.visible ? out.chalet : null
		const zones = [{ side: 'top', l: 0, t: 0, r: 1, b: Math.min(out.ridge, ch ? ch.t : 1) }]
		if (ch) zones.push({ side: 'left', l: 0, t: 0, r: ch.l, b: out.ridge }, { side: 'right', l: ch.r, t: 0, r: 1, b: out.ridge })
		out.skyZones = zones.map((z) => ({ ...z, b: round(clamp(z.b - 0.03, 0, 1)), l: round(z.l), r: round(z.r) })).filter((z) => z.r - z.l > 0.05 && z.b > 0.05)
		out.sky = out.skyZones.reduce((best, z) => ((z.r - z.l) * z.b > (best ? (best.r - best.l) * best.b : 0) ? z : best), null) ?? { side: 'none', l: 0, t: 0, r: 0, b: 0 }
		const calm = probe.beats.length ? BEATS.find((b) => b.name === probe.beats.at(-1))?.data.calm : null
		out.calm = calm ?? null
		out.free = freeBox(out)
		return out
	}

	function publishAnchors(anchors) {
		const el = o.anchorsTarget
		if (!el || !anchors) return
		const w = size.w
		const h = size.h
		const set = (name, v) => el.style.setProperty(`--mm-${name}`, Number.isFinite(v) ? v.toFixed(1) : '0')
		if (anchors.dog?.visible) {
			set('dog-x', anchors.dog.x * w)
			set('dog-y', anchors.dog.y * h)
		}
		if (anchors.player?.visible) {
			set('player-x', anchors.player.x * w)
			set('player-y', anchors.player.y * h)
		}
		if (anchors.player?.front?.visible) {
			set('player-front-x', anchors.player.front.x * w)
			set('player-front-y', anchors.player.front.y * h)
			set('player-front-px', anchors.player.front.px)
		}
		set('fire-x', anchors.fire.x * w)
		set('fire-y', anchors.fire.y * h)
		if (anchors.ember?.visible) {
			set('ember-x', anchors.ember.x * w)
			set('ember-y', anchors.ember.y * h)
		}
		el.style.setProperty('--mm-ember-visible', anchors.ember?.visible ? '1' : '0')
		if (anchors.ember?.size) set('ember-size', anchors.ember.size)
		if (anchors.chalet) {
			set('chalet-l', anchors.chalet.l * w)
			set('chalet-t', anchors.chalet.t * h)
			set('chalet-r', anchors.chalet.r * w)
			set('chalet-b', anchors.chalet.b * h)
		}
		set('horizon-y', anchors.horizon * h)
		set('sky-b', anchors.sky.b * h)
		el.style.setProperty('--mm-dog-visible', anchors.dog?.visible ? '1' : '0')
		// v6: heads, box and core of the ember, brightening, recommended free zone (px; 0 out of the field).
		const rect = (name, r, on) => {
			for (const k of ['l', 't', 'r', 'b']) set(`${name}-${k}`, on && r ? r[k] * (k === 'l' || k === 'r' ? w : h) : 0)
		}
		rect('player-head', anchors.player?.head, anchors.player?.head?.visible)
		rect('dog-head', anchors.dog?.head, anchors.dog?.head?.visible)
		rect('ember', anchors.ember?.box, anchors.ember?.visible)
		set('ember-core', anchors.ember?.visible ? anchors.ember.coreSize : 0)
		el.style.setProperty('--mm-ember-pulse', String(anchors.ember?.visible ? anchors.ember.pulse : 0))
		const fb = anchors.free?.best ? anchors.free[anchors.free.best] : null
		rect('free', fb, Boolean(fb))
		el.style.setProperty('--mm-free-side', anchors.free?.best ? `'${anchors.free.best}'` : "'none'")
	}

	// --- story events (crossings in both directions) -------------------------------------
	let activeBeats = new Map() // id → beat
	let lastStage = null
	let lastTheme = null
	let lastProgressAt = 0
	let lastEmitT = null
	function emitStory(state) {
		const now = beatsAt(state.t, variant)
		const ids = new Set(now.map((b) => b.id))
		const backward = lastEmitT !== null && state.t < lastEmitT
		const direction = backward ? 'backward' : 'forward'
		const base = { t: state.t, direction, seek: seeked }
		const exits = [...activeBeats.values()].filter((b) => !ids.has(b.id))
		const enters = now.filter((b) => !activeBeats.has(b.id))
		exits.sort((a, b) => (backward ? b.start - a.start : a.end - b.end))
		enters.sort((a, b) => (backward ? b.end - a.end : a.start - b.start))
		for (const b of exits) emit('beat', { ...base, name: b.name, phase: 'exit', id: b.id, start: b.start, end: b.end, data: beatData(b) })
		for (const b of enters) emit('beat', { ...base, name: b.name, phase: 'enter', id: b.id, start: b.start, end: b.end, data: beatData(b) })
		activeBeats = new Map(now.map((b) => [b.id, b]))
		probe.beats = now.map((b) => b.name)
		if (currentShown !== lastStage) {
			emit('stage', { ...base, stage: currentShown, name: STAGE_NAMES[currentShown], from: lastStage, elapsed: state.elapsed })
			lastStage = currentShown
		}
		const theme = themeOf(state)
		if (!lastTheme || theme.sky !== lastTheme.sky) {
			emit('theme', { ...base, ...theme })
			lastTheme = theme
		}
		const clockNow = performance.now()
		if (seeked || clockNow - lastProgressAt > 100) {
			emit('progress', { t: state.t, p: timeToProgress(state.t, o.scrollMap), duration: D })
			lastProgressAt = clockNow
		}
		emitSignals(state, base)
		emitCues(state, base)
		probe.signalActive = signalAt(state.t)
		const ca = cuesAt(state.t, { modchat: o.modchat !== false })
		probe.cueActive = { lines: ca.lines.map((l) => l.id), typing: ca.typing ? { ...ca.typing } : null, menu: ca.menu ? { panel: ca.menu.panel, item: ca.menu.item, hover: ca.menu.hover, pressed: ca.menu.pressed } : null, gone: ca.gone }
		lastEmitT = state.t
		seeked = false
	}

	// v7 (B): `signal` event at the crossings of the three instants of the capture signal (STORY.signals), in both
	// directions. `enter` going forward (t passes the instant), `exit` going backward. After a jump (`seek: true`, or a catch-up
	// cut) it is also emitted, with `late` (film s elapsed since the instant): the host ignores the `enter` whose
	// `late` exceeds TIMELINE.signals.active. The anchors are those of the frame that has just been rendered.
	function emitSignals(state, base) {
		if (lastEmitT === null) return
		const eps = TIMELINE.signals.eps
		const backward = state.t < lastEmitT
		const crossed = STORY.signals.filter((g) => {
			const at = g.t - eps
			return backward ? lastEmitT >= at && state.t < at : lastEmitT < at && state.t >= at
		})
		if (!crossed.length) return
		if (backward) crossed.reverse()
		const wantAnchors = Boolean(listeners.get('signal')?.size || listeners.get('*')?.size || o.dispatchTarget)
		const anchors = wantAnchors ? computeAnchors() : null
		for (const g of crossed) {
			const phase = backward ? 'exit' : 'enter'
			const late = +(state.t - g.t).toFixed(3)
			probe.signal = { id: g.id, phase, t: +state.t.toFixed(3), late, wall: Math.round(performance.now()) }
			probe.signals.push(probe.signal)
			if (probe.signals.length > 12) probe.signals.shift()
			emit('signal', {
				...base,
				id: g.id,
				index: g.index,
				phase,
				instant: g.t,
				late,
				hold: g.hold,
				wall: g.wall,
				// Ember (centre, halo, core, brightening) and free zone: what is needed to place the cell, the frame and the notification.
				ember: anchors?.ember ?? null,
				capture: anchors?.capture ?? null,
				anchors,
			})
		}
	}

	// v8: `cue` event at the crossings of the cues of STORY.cues (decisions-v8 section 6.2), in both directions, like `signal`.
	// The events only serve announcements and tests: the display is computed from t (cuesAt). After a jump, they are
	// also emitted with `late` (film s since the instant); the host ignores an `enter` whose `late` exceeds 0.6.
	function emitCues(state, base) {
		if (lastEmitT === null) return
		const crossed = cueEventsBetween(lastEmitT, state.t, { modchat: o.modchat !== false })
		if (!crossed.length) return
		const wantAnchors = Boolean(listeners.get('cue')?.size || listeners.get('*')?.size || o.dispatchTarget)
		const anchors = wantAnchors ? computeAnchors() : null
		for (const e of crossed) {
			const late = +(state.t - e.at).toFixed(3)
			probe.cues.push({ name: e.name, id: e.id, phase: e.phase, at: e.at, t: +state.t.toFixed(3), late })
			if (probe.cues.length > 12) probe.cues.shift()
			emit('cue', { ...base, name: e.name, id: e.id, phase: e.phase, at: e.at, late, data: e.data, anchors })
		}
	}

	// --- loop -----------------------------------------------------------------
	let last = performance.now()
	let fpsFrames = 0
	let fpsSince = last
	let slowSince = null
	let fastSince = null
	let flips = 0
	let raf = 0
	const gazeStats = { min: Infinity }
	// v9: in the site phase the world is the last frame of the film (crane done, background at the page colour); the camera is the
	// orbit of the site view, blended from the film camera over the hand-over (0.8 s), and so is the rim of the capture box.
	function applySitePhase(state) {
		const v = siteView.getView()
		const yaw = effYaw()
		const orbit = siteCameraFrom(siteBase(), { ...v, yaw })
		// v10: during a hand-over driven by setSiteBlend the blend is the host's g on the glide curve (a pure function of g); otherwise it runs on the wall clock.
		const k = blend ? EASES.glide(blend.g) : siteBlendDuration > 0 ? siteBlendEase(clamp(siteBlendAt / siteBlendDuration, 0, 1)) : 1
		let { eye, target, fov } = orbit
		if (k < 1) {
			const film = cameraAt(siteEnterT, aspect)
			eye = lerp3(film.eye, orbit.eye, k)
			target = lerp3(film.target, orbit.target, k)
			fov = lerp(film.fov, orbit.fov, k)
			state.rim = lerp(rimAt(siteEnterT), state.rim, k)
		}
		state.camera = { ...state.camera, eye, target, fov, spin: (yaw * Math.PI) / 180 }
	}
	function renderNow() {
		const siteOn = sitePhase && siteView !== null
		// v10: during the hand-over the world goes from the film's instant to the resting world with g (the two differ only by the breath and the grain of the freeze, `freezeFrame.at`):
		// g = 0 is the film's image, g = 1 the site's, and the way back gives the same images.
		const worldT = siteOn ? (blend ? lerp(blendFilmT, D - 1e-4, blend.g) : D - 1e-4) : t
		const state = sceneState(worldT, { loop: o.loop, fadeIn: wrapped, aspect, variant })
		if (siteOn) applySitePhase(state)
		// Ambient life: the fire, the fireflies, the smoke, the clouds and the breaths go on when the story is stopped
		// (scroll mode without scrolling, end of playback). The frozen world (freezes) stays so; t and renderedT do not change.
		state.ambient = ambient
		if (restT <= 0 && probe.rest) probe.rest = null
		// v6: a whole breath (or n, for a long hold) of the glow over the duration of the hold: it starts again and ends in
		// the same phase, hence no jump at the resumption. The phase only runs while the timer of the hold runs.
		state.holdBreath = holdTotal > 0 ? (holdAt / holdTotal) * 4 * Math.max(1, Math.round(holdTotal / 4)) : 0
		if (holdTotal > 0 && probe.hold) probe.hold.at = +holdAt.toFixed(3)
		if (ambient > 0 && !state.frozen) {
			state.clock += ambient
			state.cloudClock += ambient
			state.actorClock += ambient
		} else if (restT > 0 && state.frozen) {
			// v7c: the diorama at rest lives: flames, ember, wind, clouds and particles continue from the frozen clock (continuous: no jump), the
			// characters stay the kept instant (actorClock unchanged), and the camera turns very slowly (+/- 6 deg, restSpinAt). v9: the site phase replaces the spin.
			state.clock += restT
			state.cloudClock += restT
			state.particleClock = state.actorClock + restT
			const spin = siteOn ? 0 : restSpinAt(restT)
			probe.rest = { t: +restT.toFixed(2), spin: +((spin * 180) / Math.PI).toFixed(3) }
			if (spin !== 0) {
				const eye = state.camera.eye
				const tg = state.camera.target
				const dx = eye[0] - tg[0]
				const dz = eye[2] - tg[2]
				const c = Math.cos(spin)
				const sn = Math.sin(spin)
				state.camera = { ...state.camera, eye: [tg[0] + c * dx + sn * dz, eye[1], tg[2] - sn * dx + c * dz], spin: (state.camera.spin ?? 0) + spin }
			}
		}
		lastState = state
		const shared = apply(state)
		draw(shared)
		probe.frames++
		probe.renderedT = t
		if (!siteOn) emitStory(state)
		// Check of the brief: the dog never looks at the camera (act II), except in the window of the departure (v9).
		if (mods.dog?.object3d.visible) {
			const g = dogGazeAngle(state.dog, state.camera.eye)
			probe.dogGaze.now = +g.toFixed(1)
			// Rendered gaze, measured by characters.js (micro-life and avoidCamera included), when the module exposes it.
			const live = mods.dog.live?.gazeDeg
			if (Number.isFinite(live)) probe.dogGaze.rendered = +live.toFixed(1)
			if (state.t >= STORY.away[0] && state.t < STORY.rewind[0]) {
				gazeStats.min = Math.min(gazeStats.min, g)
				probe.dogGaze.minActII = +gazeStats.min.toFixed(1)
				if (Number.isFinite(live)) {
					gazeStats.rendered = Math.min(gazeStats.rendered ?? Infinity, live)
					probe.dogGaze.renderedMinActII = +gazeStats.rendered.toFixed(1)
				}
			}
		}
		const wantAnchors = o.anchorsTarget || listeners.get('anchors')?.size
		if (wantAnchors) {
			const anchors = computeAnchors()
			probe.anchors = anchors
			publishAnchors(anchors)
			emit('anchors', anchors)
		}
	}

	// v6: end of the hold (controller.hold). `hold` event { phase: 'end', reason, t, wall }.
	function endHold(reason) {
		if (!(holdTotal > 0)) return false
		const wall = holdTotal
		holdTotal = 0
		holdAt = 0
		probe.hold = null
		dirty = true
		last = performance.now()
		emit('hold', { phase: 'end', reason, t, wall })
		return true
	}

	function setPlaying(value, reason = 'host') {
		if (playing === value) return
		playing = value
		dirty = true
		last = performance.now()
		emit(value ? 'play' : 'pause', { t, reason })
	}

	function frame(now) {
		raf = requestAnimationFrame(frame)
		const rawDt = (now - last) / 1000
		const dt = clamp(rawDt, 0, 0.1)
		last = now
		if (!isReady || contextLost || disposed) return
		// v9: nothing is rendered or advanced while the tab is hidden or the canvas is off screen (the site phase keeps running otherwise).
		if (sitePhase && ((typeof document !== 'undefined' && document.hidden) || (o.pauseOffscreen && offscreen))) return
		if (sitePhase) {
			// The film is over: its time does not move. The site view, the hand-over and the framing advance below.
		} else if (mode === 'external') {
			// v10: the host sets t (setTime). Only the stop's timer (the glow's breath) runs here.
			if (holdTotal > 0) {
				holdAt += clamp(rawDt, 0, 0.5)
				if (holdAt >= holdTotal) endHold('timeout')
				dirty = true
			}
		} else if (mode === 'scroll') {
			if (Math.abs(tTarget - t) > 1e-6) {
				// Damping toward the target, capped during the scroll of the days (anti-flash: scrollStep). v7: catch-up cut
				// on fast scroll (C1, at most one per TIMELINE.lapse.cutCooldown wall s) and speed ceiling.
				if (reduced()) t = tTarget
				else {
					const before = t
					const step = scrollAdvance(t, tTarget, dt, o.damping, {
						fast: scrollFast,
						cutOk: now - lastCutAt >= TIMELINE.lapse.cutCooldown * 1000,
						maxRate: catchUp,
					})
					t = step.t
					if (step.cut) {
						lastCutAt = now
						probe.cuts++
						probe.scroll.cutAt = { from: +before.toFixed(3), to: +t.toFixed(3), wall: Math.round(now) }
						emit('cut', { reason: 'catchup', from: before, to: t, t, direction: t > before ? 'forward' : 'backward' })
					}
				}
				dirty = true
			}
			// `arrive` leaves AFTER the render of the arrival frame (see below): the `signal` event of the same frame precedes it.
			if (!arrived && Math.abs(tTarget - t) <= 1e-6) {
				arrived = true
				arriveAt = now
			}
		} else if (playing && holdTotal > 0) {
			// Hold requested by the host: t does not move, the timer runs (while playing only: an explicit pause suspends it, a hidden
			// tab or an off-screen canvas go through setPlaying(false)).
			// Wall time (not the dt capped at 0.1 s: on a slow machine, the hold must not get longer), capped at 0.5 s.
			holdAt += clamp(rawDt, 0, 0.5)
			if (holdAt >= holdTotal) endHold('timeout')
			dirty = true
		} else if (playing) {
			t += dt
			if (t >= D) {
				if (o.loop) {
					t -= D
					wrapped = true
					seeked = true
				} else {
					t = D - 1e-4
					setPlaying(false, 'end')
					emit('end', { t })
				}
			}
			tTarget = t
			dirty = true
		}
		// v9: the framing tween runs in any phase; the site view (hand-over, views, zoom, auto-rotation) only in the site phase.
		// The site animations follow the wall clock (up to 0.5 s per frame) so that a slow machine does not stretch them.
		const siteDt = clamp(rawDt, 0, 0.5)
		if (frameAnim) {
			frameAnim.at += siteDt
			const u = clamp(frameAnim.at / frameAnim.duration, 0, 1)
			frameAnim.e = frameAnim.ease(u)
			evalFrame(frameAnim.e)
			if (u >= 1) {
				const done = frameAnim
				frameAnim = null
				evalFrame(1)
				done.resolve({ ...subject })
			}
		}
		if (sitePhase && siteView) {
			siteView.setReducedMotion(reduced())
			if (!blend && siteBlendAt < siteBlendDuration) {
				siteBlendAt += siteDt
				dirty = true
			}
			// v10: while the hand-over is driven by setSiteBlend (g < 1) the model does not turn on its own: its yaw would not be a function of g.
			if (!blend || blend.g >= 1) {
				if (siteView.step(siteDt)) {
					dirty = true
					// The model's box swings as it turns: with `centre: 'live'` the framing follows the angle.
					if (siteFrame?.centre === 'live' && !frameAnim) evalFrame()
				}
			}
		}
		if (freeCam) dirty = true
		const hidden = (typeof document !== 'undefined' && document.hidden) || (o.pauseOffscreen && offscreen)
		if (mode === 'external' && sitePhase && blend && blend.g < 1) {
			// The film and the hand-over are pure functions of (t, g): no ambient life until the site is reached; it starts again from zero there.
			ambient = 0
			restT = 0
		}
		const ambientRuns = mode === 'external' ? sitePhase && (!blend || blend.g >= 1) : sitePhase || mode === 'scroll' || (!playing && !hostPaused)
		if (ambientOn && !reduced() && !hidden && ambientRuns) {
			ambient += dt
			// v7c: the diorama at rest. The rest time only runs on the last frame of the film (scrolling back resets it); in the
			// site phase it runs from the hand-over, so the flames, the ember and the wind start from the held world without a jump.
			if (sitePhase || t >= D - 0.06) restT += dt
			else restT = 0
			dirty = true
		} else if (!sitePhase && t < D - 0.06) restT = 0
		if (!dirty) return
		if (!limiter.tick(now)) return // setMaxFps: the frame stays dirty and is rendered on a later tick
		dirty = false
		renderNow()
		serveSnapshot()
		if (arriveAt !== null) {
			emit('arrive', { t, target: tTarget, wall: arriveAt })
			arriveAt = null
		}
		// Automatic quality with hysteresis: low under 24 fps for 4 s, back to high above 50 fps
		// for 8 s; at most two round trips.
		fpsFrames++
		if (now - fpsSince > 500) {
			const fps = (fpsFrames * 1000) / (now - fpsSince)
			fpsFrames = 0
			fpsSince = now
			probe.fps = +fps.toFixed(1)
			if (choice === 'auto' && (playing || mode === 'scroll')) {
				if (!lowRuntime) {
					slowSince = fps < 24 ? (slowSince ?? now) : null
					if (slowSince !== null && now - slowSince > 4000) {
						lowRuntime = true
						flips++
						slowSince = null
						applyRuntimeQuality()
						emit('quality', { level: 'low', auto: true, fps })
					}
				} else if (flips < 2 && quality === 'high') {
					fastSince = fps > 50 ? (fastSince ?? now) : null
					if (fastSince !== null && now - fastSince > 8000) {
						lowRuntime = false
						fastSince = null
						applyRuntimeQuality()
						emit('quality', { level: 'high', auto: true, fps })
					}
				}
			}
		}
	}

	function applyViewOffset() {
		const { w, h } = size
		if (!w || !h) return
		// Floor 0.05: a short strip (390 x 141 px) in a tall canvas needs a scale near 0.15; the old floor of 0.2 drew the model above the strip (UX control P0-1).
		const s = Math.max(0.05, subject.scale || 1)
		if (Math.abs(subject.x) < 1e-4 && Math.abs(subject.y) < 1e-4 && Math.abs(s - 1) < 1e-4) camera.clearViewOffset()
		else {
			const vw = w / s
			const vh = h / s
			camera.setViewOffset(w, h, -subject.x * w + (w - vw) / 2, -subject.y * h + (h - vh) / 2, vw, vh)
		}
		camera.updateProjectionMatrix()
	}

	function resize() {
		const el = createdCanvas ? canvas.parentElement : canvas
		const w = el?.clientWidth || canvas.clientWidth
		const h = el?.clientHeight || canvas.clientHeight
		if (!w || !h) return
		size = { w, h }
		const ratio = Math.min(window.devicePixelRatio || 1, pixelCap(w, h))
		if (Math.abs(renderer.getPixelRatio() - ratio) > 1e-3) renderer.setPixelRatio(ratio)
		if (mods.look) {
			mods.look.setSize(w, h)
			if (lowRuntime) mods.look.composer.setPixelRatio(Math.min(renderer.getPixelRatio(), 1))
		} else renderer.setSize(w, h, false)
		aspect = w / h
		camera.aspect = aspect
		applyViewOffset()
		if (sitePhase && siteFrame && !frameAnim) evalFrame() // v10: the panel's framing is a function of the size
		dirty = true
	}
	const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
	resizeObserver?.observe(createdCanvas ? canvas.parentElement : canvas)

	// Off screen or hidden tab: pause of the story clock, resumed afterwards if it was us who stopped it.
	const visibility = () => {
		const hidden = (typeof document !== 'undefined' && document.hidden) || (o.pauseOffscreen && offscreen)
		if (hidden && playing) {
			autoPaused = true
			setPlaying(false, 'hidden')
		} else if (!hidden && autoPaused) {
			autoPaused = false
			setPlaying(true, 'visible')
		}
	}
	document.addEventListener('visibilitychange', visibility)
	const intersection =
		typeof IntersectionObserver === 'function'
			? new IntersectionObserver((entries) => {
					offscreen = !entries.at(-1).isIntersecting
					visibility()
				})
			: null
	intersection?.observe(canvas)
	const onReducedChange = () => {
		if (reduced() && playing) setPlaying(false, 'reduced-motion')
		emit('reducedmotion', { reduced: reduced() })
	}
	reducedQuery?.addEventListener?.('change', onReducedChange)

	const onLost = (event) => {
		event.preventDefault()
		contextLost = true
		if (playing) {
			autoPaused = true
			setPlaying(false, 'context-lost')
		}
		emit('error', { code: 'context-lost', message: 'WebGL context lost (graphics driver or memory).', fatal: false })
	}
	const onRestored = () => {
		contextLost = false
		dirty = true
		emit('restored', { t })
		if (autoPaused) {
			autoPaused = false
			setPlaying(true, 'context-restored')
		}
	}
	canvas.addEventListener('webglcontextlost', onLost)
	canvas.addEventListener('webglcontextrestored', onRestored)

	raf = requestAnimationFrame(frame)

	// --- methods ---------------------------------------------------------------
	const clampT = (v) => clamp(Number(v) || 0, 0, D - 1e-4)
	Object.assign(controller, {
		play() {
			if (disposed) return false
			// In scroll mode, play() resumes playback: the scene goes back to time mode (`mode` event).
			if (mode !== 'time') {
				mode = 'time'
				tTarget = t
				emit('mode', { mode, t })
			}
			hostPaused = false
			autoPaused = false
			if (!isReady) {
				wantPlay = true
				return true
			}
			if (t >= D - 1e-3) {
				t = 0
				wrapped = false
				seeked = true
			}
			setPlaying(true, 'host')
			return true
		},
		pause() {
			wantPlay = false
			autoPaused = false
			hostPaused = true
			setPlaying(false, 'host')
			return true
		},
		toggle() {
			return playing || (!isReady && wantPlay) ? controller.pause() : controller.play()
		},
		// v6: stops the film for `seconds` wall s (default STORY.holdWall) then resumes it by itself, without `pause`/`play` event
		// (the pause button of the host does not toggle). Time mode playback only; false otherwise (not ready, paused,
		// reduced motion, scroll mode, hold already running). The pause button suspends the timer; seek(), setProgress()
		// in time mode, setMode('scroll'), cancelHold() and dispose() cancel it (`hold` event phase 'end').
		hold(seconds = STORY.holdWall) {
			const wall = Number(seconds)
			if (disposed || !isReady || !((mode === 'time' && playing) || mode === 'external') || reduced() || holdTotal > 0 || !(wall > 0)) return false
			holdTotal = Math.min(wall, 30)
			holdAt = 0
			probe.hold = { t, wall: holdTotal }
			dirty = true
			emit('hold', { phase: 'start', t, wall: holdTotal })
			return true
		},
		cancelHold() {
			return endHold('cancel')
		},
		// v7 (C1): scroll speed of the page (px/s, average over about 0.5 s), given by the host. Above
		// TIMELINE.lapse.fastScroll (600) the scroll is "fast" (catch-up cut of the timelapse); it stays so
		// until the speed goes under fastScrollOff (450). Returns the state. No effect in time mode.
		setScrollSpeed(pxPerSec) {
			const v = Math.max(0, Number(pxPerSec) || 0)
			const L = TIMELINE.lapse
			if (!scrollFast && v > L.fastScroll) scrollFast = true
			else if (scrollFast && v < L.fastScrollOff) scrollFast = false
			probe.scroll.speed = Math.round(v)
			probe.scroll.fast = scrollFast
			return scrollFast
		},
		// v7: forces the fast mode (tests, hosts that measure the speed themselves).
		setScrollFast(on) {
			scrollFast = Boolean(on)
			probe.scroll.fast = scrollFast
			return scrollFast
		},
		// v7 (C2): caps the speed of the film in scroll mode at `rate` film s per wall s (catch-up after the last
		// hold). 0 or null: no ceiling. Returns the retained value.
		setCatchUp(rate = 0) {
			catchUp = Math.max(0, Number(rate) || 0)
			probe.scroll.catchUp = catchUp
			return catchUp
		},
		get scrollFast() {
			return scrollFast
		},
		get catchUp() {
			return catchUp
		},
		// v7: target of the time (s) in scroll mode, and conversions between progress of the host (scrollMap of mount) and time.
		get target() {
			return tTarget
		},
		progressToTime: (p) => progressToTime(p, o.scrollMap),
		timeToProgress: (time) => timeToProgress(time, o.scrollMap),
		// v7 (B): the three instants of the capture signal ({ id, t, hold, wall, index }).
		getSignals: () => STORY.signals.map((g) => ({ ...g })),
		signalAt: (time = t) => signalAt(time),
		/** v9b: copies the next rendered frame into `target` (a 2D canvas, resized to the drawing buffer). Resolves true when copied, false when it could not be (or after `timeout` ms). */
		snapshot(target, { timeout = 1500 } = {}) {
			return new Promise((resolve) => {
				if (snapReq) snapReq.resolve(false)
				const timer = setTimeout(() => {
					if (snapReq?.resolve === done) snapReq = null
					resolve(false)
				}, timeout)
				const done = (ok) => {
					clearTimeout(timer)
					resolve(ok)
				}
				snapReq = { target, resolve: done }
				dirty = true
			})
		},
		/**
		 * v9c: forces ONE render and resolves true once it has been drawn (false after `timeout` ms, or when the tab is hidden: nothing is drawn then). The scene renders only
		 * when something changed (`dirty`): a paused or reduced-motion scene produces exactly one frame after a seek, so a host that waits for "two more frames" waits for
		 * ever (the 2 s of frozen picture of v9b, technical control P1-3). Call it AFTER the calls that change the picture; it marks the scene dirty itself.
		 */
		nextFrame({ timeout = 600 } = {}) {
			return new Promise((resolve) => {
				const done = (ok) => {
					clearTimeout(timer)
					resolve(ok)
				}
				const timer = setTimeout(() => {
					frameWaiters = frameWaiters.filter((w) => w !== done)
					resolve(false)
				}, timeout)
				frameWaiters.push(done)
				dirty = true
			})
		},
		seek(value) {
			if (sitePhase) controller.setSitePhase(false)
			endHold('seek')
			wrapped = false
			t = clampT(value)
			tTarget = t
			seeked = true
			dirty = true
		},
		setProgress(p) {
			wrapped = false
			const next = progressToTime(p, o.scrollMap)
			if (Math.abs(next - tTarget) > 1e-9) arrived = false
			tTarget = next
			if (mode === 'time') {
				endHold('seek')
				t = tTarget
				seeked = true
			}
			dirty = true
		},
		setMode(next) {
			const before = mode
			mode = next === 'scroll' ? 'scroll' : next === 'external' ? 'external' : 'time'
			if (mode === 'scroll' || mode === 'external') {
				endHold('mode')
				setPlaying(false, 'mode')
			}
			tTarget = t
			dirty = true
			if (mode !== before) emit('mode', { mode, t })
		},
		// Ambient life (fire, fireflies...) when the story is stopped. false: perfectly still image (pause button of
		// the host, WCAG 2.2.2). Never in reduced motion.
		setAmbient(on) {
			ambientOn = Boolean(on)
			dirty = true
		},
		// Story variants (contract v4): { coldGlow, forgetting, afk, dawnSwish }; merged with the current state, image
		// recomputed.
		setVariant(next = {}) {
			for (const key of VARIANT_KEYS) if (key in next) variant[key] = Boolean(next[key])
			dirty = true
			return { ...variant }
		},
		setDecor(next = {}) {
			decor = { ...decor, ...next }
			applyRuntimeQuality()
		},
		setPixelRatio(max) {
			o.maxPixelRatio = max
			resize()
		},
		fitSubject,
		setQuality(level) {
			if (!['high', 'low', 'auto'].includes(level)) return
			choice = level
			if (level !== 'auto') lowRuntime = level === 'low'
			applyRuntimeQuality()
			emit('quality', { level: lowRuntime ? 'low' : 'high', auto: level === 'auto' })
		},
		setSubjectOffset(offset = {}) {
			subject = { x: Number(offset.x) || 0, y: Number(offset.y) || 0, scale: Number(offset.scale) || 1 }
			if (!sitePhase) filmSubject = { ...subject }
			applyViewOffset()
			dirty = true
		},
		// ---- v9 site phase (decisions-v9 section 10.2; HOST-API.md section 23) ---------------------------------------------
		frameSubject,
		/** on: the film is over (crane done, background at the page colour); the diorama keeps living and can be turned. off: back to the film. */
		setSitePhase(on, opts = {}) {
			if (disposed) return
			if (on) {
				if (sitePhase) return
				endHold('site')
				if (playing) setPlaying(false, 'site')
				const base = cameraAt(D - 1e-4, aspect)
				siteView = createSiteView({ basePitch: elevationOf(base.eye, base.target), reducedMotion: reduced() })
				if (autoRotatePref) siteView.setAutoRotate(true) // v10: asked before the view existed (a direct link, a jump to the site)
				siteView.setSitePhase(true)
				sitePhase = true
				siteEnterT = t
				siteBlendAt = 0
				siteBlendDuration = reduced() ? 0 : Math.max(0, Number(opts.duration ?? 0.8))
				siteBlendEase = EASES[opts.ease] ?? STANDARD_EASE
				restT = 0
			} else if (sitePhase) {
				sitePhase = false
				siteView.setSitePhase(false)
				siteView = null
				frameAnim?.resolve(null)
				frameAnim = null
				blend = null
				frameUnion = null
				restT = 0
			}
			dirty = true
		},
		/**
		 * v10: the film time, set by the host in `mode: 'external'` (the scene never advances it). |dt| <= 1 s is continuous (the `beat` and `cue` events carry `direction`, `seek: false`),
		 * anything else is a jump (`seek: true`). A stop (`hold`) is not touched by it. The picture for `t` is rendered on the next frame (probe.renderedT === t).
		 */
		setTime(value) {
			if (disposed) return
			const next = clampT(value)
			if (next === t) return
			if (sitePhase) controller.setSiteBlend(0)
			if (Math.abs(next - t) > 1) seeked = true
			wrapped = false
			t = next
			tTarget = next
			lastTimeChangeAt = performance.now()
			dirty = true
		},
		/**
		 * v10: the hand-over to the site as a position g (0 to 1), a PURE function of (g, panel, angle): g = 0 is the film's image at `filmT` (default: the t of the first call), g = 1 the site at rest
		 * framed in `rect`, and in between the camera, the rim and the framing blend on the glide curve while the model's turn is stopped and its yaw brought back to 0 (yaw x e).
		 * `rect` is the panel ({ l, t, r, b } in canvas CSS px); options `margin` (16), `fit` ('tight'), `fill` (1), `centre` ('live'). Without `rect` the last one is kept.
		 */
		setSiteBlend(g, { rect = null, margin, fit, fill, centre, filmT } = {}) {
			if (disposed) return
			const gg = clamp(Number(g) || 0, 0, 1)
			if (gg <= 0) {
				if (sitePhase) {
					sitePhase = false
					siteView?.setSitePhase(false)
					siteView = null
					frameAnim?.resolve(null)
					frameAnim = null
					frameUnion = null
				}
				blend = null
				ambient = 0
				restT = 0
				subject = { ...filmSubject }
				applyViewOffset()
				dirty = true
				return
			}
			if (!sitePhase) {
				endHold('site')
				const base = cameraAt(D - 1e-4, aspect)
				siteView = createSiteView({ basePitch: elevationOf(base.eye, base.target), reducedMotion: reduced() })
				if (autoRotatePref) siteView.setAutoRotate(true) // v10: asked before the view existed (a direct link, a jump to the site)
				siteView.setSitePhase(true)
				sitePhase = true
				frameUnion = null
				restT = 0
				ambient = 0
			}
			const entering = !blend
			blend = { g: gg }
			if (Number.isFinite(filmT)) blendFilmT = filmT
			else if (entering) blendFilmT = t
			siteEnterT = blendFilmT
			if (rect) {
				siteFrame = { rect: { l: rect.l, t: rect.t, r: rect.r, b: rect.b }, margin: Number.isFinite(margin) ? margin : 16, fit: fit ?? 'tight', fill: Number(fill) > 0 ? Number(fill) : 1, centre: centre ?? 'live' }
				sitePanelPx = { ...siteFrame.rect }
			}
			frameAnim?.resolve(null)
			frameAnim = null
			frameFrom = { ...filmSubject }
			evalFrame(EASES.glide(gg))
			dirty = true
		},
		/** v10: translates the model on screen by (dx, dy) CSS px, after the framing and without animation (the panel rising with the page when the footer arrives). */
		setFrameShift(dx = 0, dy = 0) {
			frameShift = { x: Number(dx) || 0, y: Number(dy) || 0 }
			if (sitePhase && siteFrame) evalFrame()
			dirty = true
		},
		/** 3 deg/s, ramps of 1 s up and down; stopped at once by orbitBy and resumed 4 s later; never in reduced motion. */
		setAutoRotate(on) {
			autoRotatePref = Boolean(on)
			siteView?.setAutoRotate(on)
			dirty = true
		},
		/** Turns the diorama by (dYaw, dPitch) degrees, 1:1, with no inertia. Pitch is bounded to [10, 55] degrees of elevation. */
		orbitBy(dYaw = 0, dPitch = 0) {
			if (!siteView) return
			siteView.orbitBy(dYaw, dPitch)
			dirty = true
		},
		/** Dolly by a factor (bounds 0.8 to 1.6), over 0.2 s (at once in reduced motion). */
		zoomBy(factor = 1) {
			if (!siteView) return
			siteView.zoomBy(factor)
			dirty = true
		},
		/** A view per section ('hero', 'steps', 'share', 'limits', 'faq'), eased over `duration` seconds (0.9). */
		setView(name, { duration = SITE_LIMITS.viewSec, bandSafe = false, maxZoom = Infinity } = {}) {
			if (!siteView) return false
			const ok = siteView.setView(name, { duration, bandSafe, maxZoom })
			dirty = true
			return ok
		},
		resetView() {
			siteView?.resetView()
			dirty = true
		},
		/** { yaw, pitch, zoom, view, autoRotate, rect, panel }: `rect` = on-screen box of the diorama (CSS px), `panel` = the framed rectangle. */
		getView() {
			const v = siteView ? siteView.getView() : { yaw: 0, pitch: 0, zoom: 1, view: 'hero', autoRotate: false }
			return { ...v, rect: siteRectPx ? { ...siteRectPx } : null, panel: sitePanelPx ? { ...sitePanelPx } : null, blend: blend ? blend.g : sitePhase ? 1 : 0, shift: { ...frameShift }, centre: siteFrame?.centre ?? 'union' }
		},
		/** Caps the render rate (frames per second); null removes the cap. */
		setMaxFps(fps = null) {
			limiter.set(Number(fps) > 0 ? Number(fps) : 0)
			dirty = true
		},
		getAnchors() {
			const anchors = computeAnchors()
			probe.anchors = anchors
			return anchors
		},
		resize,
		dispose() {
			if (disposed) return
			endHold('dispose')
			frameAnim?.resolve(null)
			frameAnim = null
			disposed = true
			cancelAnimationFrame(raf)
			resizeObserver?.disconnect()
			intersection?.disconnect()
			document.removeEventListener('visibilitychange', visibility)
			reducedQuery?.removeEventListener?.('change', onReducedChange)
			canvas.removeEventListener('webglcontextlost', onLost)
			canvas.removeEventListener('webglcontextrestored', onRestored)
			for (const m of Object.values(mods)) guarded('dispose', () => m?.dispose?.(), () => {})
			veilPass?.dispose()
			depthTap?.dispose()
			veilOverlay?.dispose()
			scene.traverse((obj) => {
				obj.geometry?.dispose?.()
				const list = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : []
				for (const m of list) {
					for (const v of Object.values(m)) if (v?.isTexture) v.dispose()
					m.dispose()
				}
			})
			renderer.dispose()
			// The context is only forced to be lost on a canvas created by the scene: a canvas of the host may be remounted
			// (React StrictMode mounts, unmounts then remounts the same element).
			if (createdCanvas) renderer.forceContextLoss?.()
			listeners.clear()
			if (createdCanvas) canvas.remove()
		},
		debug: {
			renderer,
			scene,
			camera,
			mods,
			// v10 (test G2): the ambient life level (0 over the whole film and the glide: the picture is a pure function of the film time).
			get ambientLevel() {
				return ambient
			},
			get stages() {
				return stages
			},
			setFreeCamera(on) {
				freeCam = Boolean(on)
				dirty = true
			},
			setStage(i) {
				stageOverride = i === null || i === undefined ? null : clamp(Math.round(i), 0, 4)
				dirty = true
			},
			invalidate() {
				dirty = true
			},
			// v5 (brief section 2.0): differential mask. hideDog(true) / hidePlayer(true) make the character invisible to the
			// camera (colorWrite and depthWrite off) without changing anything else: its cast shadow stays, so do the pose and the
			// clocks. Measuring the dog = same image with and without it. Development only.
			hideDog(on = true) {
				hidden.dog = Boolean(on)
				hideActor(mods.dog, hidden.dog)
				dirty = true
			},
			hidePlayer(on = true) {
				hidden.player = Boolean(on)
				hideActor(mods.player, hidden.player)
				dirty = true
			},
			get hidden() {
				return { ...hidden }
			},
			get veil() {
				return { pass: veilPass, tap: depthTap }
			},
		},
	})
	if (o.subjectOffset) controller.setSubjectOffset(o.subjectOffset)

	// --- loading -------------------------------------------------------------
	// 1) S0, the metadata, the modules and the textures of the characters: first frame (`ready`).
	// 2) Then S1 to S4 in the background (they are only needed from the first switch), prepared at a calm moment.
	const loader = new GLTFLoader()
	loader.setMeshoptDecoder(MeshoptDecoder)
	// LITERAL URLs `new URL('./assets/...', import.meta.url)`: a bundler copies the files and rewrites the URL.
	// `assetsUrl` replaces them with a folder of the host (same file name).
	const asset = (file, local) => (o.assetsUrl ? new URL(file, new URL(o.assetsUrl, location.href)).href : local.href)
	const FLAME_STRIP = asset('campfire_fire.png', new URL('./assets/mc/blocks/campfire_fire.png', import.meta.url))
	const CHAR_TEXTURES = {
		wolf: asset('wolf_tame.png', new URL('./assets/mc/entities/wolf_tame.png', import.meta.url)),
		collar: asset('wolf_collar.png', new URL('./assets/mc/entities/wolf_collar.png', import.meta.url)),
		skin: asset('player_efe.png', new URL('./assets/mc/entities/player_efe.png', import.meta.url)),
	}
	const loadCharTextures = async () => {
		const texLoader = new THREE.TextureLoader()
		const entries = await Promise.all(
			Object.entries(CHAR_TEXTURES).map(async ([key, url]) => {
				const texture = await texLoader.loadAsync(url)
				texture.flipY = false
				texture.colorSpace = THREE.SRGBColorSpace
				return [key, texture]
			}),
		)
		return Object.fromEntries(entries)
	}
	const charTexturesFromGlb = async () => {
		const gltf = await loadGlb(loader, CAPTURES, 'personnages')
		const { byKind } = prepareCapture(gltf.scene)
		const maps = { collarColor: null }
		for (const m of [...byKind.wolf, ...byKind.player]) {
			const name = m.material.name
			if (name.includes('wolf_tame')) maps.wolf = m.material.map
			if (name.includes('wolf_collar')) {
				maps.collar = m.material.map
				const raw = m.material.userData.rawColor
				if (raw !== undefined && raw !== 0xffffff) maps.collarColor = raw
			}
			if (name.includes('entity/player/')) maps.skin = m.material.map
		}
		return maps
	}
	const pickCaptures = async () => {
		if (o.capturesUrl) {
			CAPTURES = new URL(o.capturesUrl, typeof location !== 'undefined' ? location.href : import.meta.url)
			captureVersion ??= 'v2'
		} else {
			if (!captureVersion) {
				for (const version of CAPTURE_ORDER) {
					try {
						const response = await fetch(new URL('S0.json', new URL(CAPTURE_DIRS[version], import.meta.url)), { cache: 'no-store' })
						if (response.ok) {
							captureVersion = version
							break
						}
					} catch {}
				}
				captureVersion ??= 'v0'
			}
			CAPTURES = new URL(CAPTURE_DIRS[captureVersion], import.meta.url)
		}
		LM = landmarksFor(captureVersion)
		probe.version = captureVersion
	}
	const settle = (promise) =>
		promise.then(
			(value) => ({ status: 'fulfilled', value }),
			(reason) => ({ status: 'rejected', reason }),
		)

	let metas = []
	let lanternPositions = []
	const cellCache = new Map()
	const cellsOf = (i) => {
		if (!cellCache.has(i)) cellCache.set(i, collectCells(stages[i]))
		return cellCache.get(i)
	}

	function installStage(i, gltf) {
		const root = gltf.scene
		const og = metas[i]?.origin
		if (og) root.position.fromArray(og.map((v, j) => v - origin[j]))
		const { lightPositions, byKind } = prepareCapture(root)
		const entities = [...byKind.wolf, ...byKind.player, ...byKind.entity]
		if (entities.length) removeMeshes(entities)
		root.visible = false
		root.name = STAGE_NAMES[i]
		// Trampled place of the dog (sitting then lying in front of the bench) and corridor toward the camera of the scroll.
		// v4: also at the place of the player where the dog lay down (DOG_REST), and in the corridor toward the witness frame (otherwise
		// the tall grass of S1 to S4 hides the dog lying at dawn).
		const ground = TIMELINE.world.surfaceY
		const shotsW = TIMELINE.world.shots
		let removed = 0
		for (const [spot, eye, opt] of [
			[DOG_SPOT, shotsW.tripod.eye],
			[DOG_SPOT, shotsW.witness.eye],
			[DOG_REST, shotsW.witness.eye, { radius: 1.3, lane: 0.9, laneLength: 7 }],
			[DOG_REST, shotsW.tripod.eye],
		])
			removed += trample(root, S([spot[0], ground, spot[1]]), S(eye), opt).removed
		console.info(`[scene] ${STAGE_NAMES[i]}: grass flattened around the dog, ${removed} triangles removed`)
		scene.add(root)
		stages[i] = root
		if (mods.look) guarded('look.patchMaterials', () => mods.look.patchMaterials(root), warn)
		return lightPositions
	}

	function warmUp(objects, at) {
		const toggled = objects.filter(Boolean)
		for (const ob of toggled) ob.visible = true
		try {
			const shared = apply(sceneState(at, { loop: o.loop, aspect, variant }))
			for (const ob of toggled) ob.visible = true
			draw(shared)
		} catch (error) {
			console.warn('[scene] warm-up frame failed', error)
		}
		for (const ob of toggled) ob.visible = false
		currentShown = -1
		dirty = true
		if (isReady && !contextLost) {
			try {
				// In the site phase the frame to put back is the site's (orbit camera, framing offset, page-colour background), not the film's: drawing the film's here
				// showed, for one frame after each stage that finished loading, the model 40 % larger from the film camera (artistic control correction 15).
				if (sitePhase && siteView) renderNow()
				else draw(apply(sceneState(t, { loop: o.loop, fadeIn: wrapped, aspect, variant })))
			} catch {}
		}
	}

	// Preparing a stage costs about 250 ms of main thread: we wait for the black of the departure, the pause, scroll mode, or an
	// already slow machine (under 20 fps: the hitch would not show, and waiting for 13 s of story there would take minutes).
	const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))
	// Calm moment: playback stopped (and, in scroll mode, scroll at rest), black of the departure and beyond, or machine so
	// slow (under 8 fps, software GPU) that the hitch drowns there. A weak laptop at 15-20 fps waits for the black: the arrival
	// at the golden hour no longer freezes during the compilation of S1 and S2.
	const quietMoment = () =>
		new Promise((resolve) => {
			const check = () => {
				const idle = mode === 'external' ? performance.now() - lastTimeChangeAt > 500 : !playing && (mode === 'time' || Math.abs(tTarget - t) < 1e-3)
				// v5: no more black at the departure; the calm moment is the hard cut of 16.3 s (fixed night shot; 26.1 s in v9).
				if (disposed || idle || t >= STORY.away[0] || (probe.fps !== undefined && probe.fps < 8)) resolve()
				else requestAnimationFrame(check)
			}
			check()
		})
	// Download of S1..S4 (option preload): 'all' right after `ready`; 'auto' after 2.5 s or as soon as the
	// story reaches 4 s; 'lazy' when it reaches the captured instant (the first switch is at 31.6 s in v9).
	const preloadGate = () =>
		new Promise((resolve) => {
			if (o.preload === 'all') return resolve()
			const lazy = o.preload === 'lazy'
			const since = performance.now()
			const check = () => {
				if (disposed || Math.max(t, tTarget) >= (lazy ? STORY.capture : 4) || (!lazy && performance.now() - since > 2500)) resolve()
				else setTimeout(check, 200)
			}
			check()
		})
	async function step(fn) {
		await quietMoment()
		const t0 = performance.now()
		const value = await fn()
		const ms = Math.round(performance.now() - t0)
		await nextFrame()
		return { value, ms }
	}

	async function loadRemainingStages() {
		await preloadGate()
		if (disposed) return
		const downloads = []
		let previous = Promise.resolve()
		for (const name of STAGE_NAMES.slice(1)) {
			previous = previous.then(() => settle(fetchGlb(CAPTURES, name)))
			downloads.push(previous)
		}
		for (let i = 1; i < STAGE_NAMES.length; i++) {
			if (disposed) return
			const name = STAGE_NAMES[i]
			const download = await downloads[i - 1]
			if (download.status === 'rejected') {
				warn(`${name}.glb missing (${download.reason.reason ?? download.reason.message}): the previous stage stays displayed`)
				continue
			}
			try {
				const parsed = await step(() => parseGlb(loader, CAPTURES, name, download.value))
				const install = await step(() => installStage(i, parsed.value))
				const fresh = [stages[i]]
				const k = i - 1
				const fall = await step(() => {
					if (!stages[k]) return null
					const gone = vanishedCells(cellsOf(k), cellsOf(i))
					const group = buildFalls(stages[k], gone, cellsOf(i), k, groundScene)
					console.info(`[scene] S${k}→S${i}: ${gone.size} cells gone, ${group.children.length} pivots`)
					scene.add(group)
					falls[k] = group
					// The material copies of the falls do not receive the patches of look.js: to be registered for the forgetting.
					if (typeof mods.look?.registerForgetting === 'function') guarded('look.registerForgetting', () => mods.look.registerForgetting(group), warn)
					return group
				})
				if (fall.value) fresh.push(fall.value)
				// v12: the cells that appear at this switch dissolve in (look.js, state.growth)
				await step(() => {
					if (!stages[k]) return 0
					const marked = markGrowth(stages[i], vanishedCells(cellsOf(i), cellsOf(k)))
					console.info(`[scene] S${k}→S${i}: ${marked} vertices of new cells dissolve in`)
					return marked
				})
				const life = await step(() => {
					if (mods.life) guarded('life.setStage', () => mods.life.setStage(stages[i]), warn)
					currentShown = -1
				})
				const warm = await step(() => warmUp(fresh, SWAP_TIMES[k] + 0.05))
				probe.loadSteps.push({ stage: name, parse: parsed.ms, install: install.ms, falls: fall.ms, life: life.ms, warm: warm.ms, at: Number(t.toFixed(2)) })
			} catch (error) {
				console.error(error)
				warn(`${name} ignored (${error.message})`)
			}
		}
		probe.allLoaded = true
		emit('loaded', { stages: stages.filter(Boolean).length })
		console.info('[scene] all stages are loaded')
	}

	pickCaptures()
		.then(() =>
			Promise.all([
				settle(loadGlb(loader, CAPTURES, 'S0')),
				Promise.all(STAGE_NAMES.map((n) => loadMeta(CAPTURES, n))),
				Promise.all([
					importModule('sky.js', () => import('./sky.js'), warn),
					importModule('look.js', () => import('./look.js'), warn),
					importModule('life.js', () => import('./life.js'), warn),
					importModule('characters.js', () => import('./characters.js'), warn),
					importModule('backdrop.js', () => import('./backdrop.js'), warn),
				]),
				loadCharTextures().catch((error) => {
					console.warn('[scene] character PNG textures unavailable, falling back to personnages.glb', error)
					return null
				}),
			]),
		)
		.then(async ([s0, metaList, [skyMod, lookMod, lifeMod, charMod, backdropMod], charTextures]) => {
			if (disposed) return
			metas = metaList
			if (s0.status === 'rejected') {
				fail('capture', `Set S0 not found: ${s0.reason.reason ?? s0.reason.message} (${CAPTURES.pathname}S0.glb)`, s0.reason)
				return
			}
			console.info(`[scene] captures: ${CAPTURES.pathname}`)
			if (metas[0]?.origin) origin = metas[0].origin
			else warn(`S0.json missing or without captureOrigin: assumed origin ${origin.join(',')}`)
			groundScene = TIMELINE.world.surfaceY - origin[1]
			const bounds = metas[0]?.bounds ?? { minX: 80, minY: -63, minZ: 80, maxX: 119, maxY: -40, maxZ: 119 }
			captureBox = [S([bounds.minX, bounds.minY, bounds.minZ]), S([bounds.maxX + 1, bounds.maxY + 1, bounds.maxZ + 1])]

			const eyeW = TIMELINE.world.camera.eye
			const targetW = TIMELINE.world.camera.target
			if (lookMod) {
				mods.look = guarded(
					'look.js',
					() =>
						lookMod.createLook({
							renderer,
							scene,
							camera,
							quality,
							groundY: groundScene,
							skyDistance: 480,
							focus: { center: S(LM.shadowFocus.center), radius: LM.shadowFocus.radius },
						}),
					warn,
				)
			}
			if (!mods.look) installFallbackLights()
			else {
				scene.background = null
				lookBase.scatter = mods.look.params.scatter
				// Veil: final pass after the grading, and detection of the depth of the scene right after RenderPass.
				guarded(
					'veil',
					() => {
						const passes = mods.look.composer.passes
						const ri = passes.findIndex((p) => p.isRenderPass || p.constructor?.name === 'RenderPass' || 'clearDepth' in p)
						depthTap = new DepthTap(camera)
						if (ri >= 0) mods.look.composer.insertPass(depthTap, ri + 1)
						else depthTap = null
						veilPass = new VeilPass(depthTap)
						mods.look.composer.addPass(veilPass)
					},
					warn,
				)
			}

			lanternPositions = installStage(0, s0.value)

			if (skyMod) {
				mods.sky = guarded(
					'sky.js',
					() =>
						skyMod.createSky({
							quality,
							trails: false,
							path: {
								...skyMod.SKY_PATH,
								spread: TIMELINE.skyPath.spread,
								peak: TIMELINE.skyPath.peak,
								starPole: TIMELINE.skyPath.starPole,
								eye: S(eyeW),
								target: S([eyeW[0] + BASIS.f[0] * 20, targetW[1], eyeW[2] + BASIS.f[2] * 20]),
							},
							...tune.sky,
						}),
					warn,
				)
				if (mods.sky) scene.add(mods.sky.object3d)
			}
			if (backdropMod) {
				mods.backdrop = guarded(
					'backdrop.js',
					() => backdropMod.createBackdrop({ origin, bounds, groundY: TIMELINE.world.surfaceY - 1, quality, captureRoot: stages[0], viewEye: eyeW }),
					warn,
				)
				if (mods.backdrop) scene.add(mods.backdrop.object3d)
			}

			if (charMod) {
				let maps = charTextures
				if (!maps) {
					try {
						maps = await charTexturesFromGlb()
					} catch (error) {
						warn(`personnages.glb missing (${error.reason ?? error.message}): characters absent`)
						maps = {}
					}
				}
				const collarColor = maps.collarColor ?? 0xb02e26
				if (maps.wolf) {
					mods.dog = guarded('dog', () => charMod.createDog({ texture: maps.wolf, collarTexture: maps.collar, collarColor }), warn)
					if (mods.dog) scene.add(mods.dog.object3d)
				} else warn('wolf texture missing')
				if (maps.skin) {
					mods.player = guarded('player', () => charMod.createPlayer({ skin: maps.skin, slim: true }), warn)
					if (mods.player) scene.add(mods.player.object3d)
				} else warn('player skin missing')
				// Contract v4: the collar keeps its colour during the forgetting (separate material "dog / wolf_collar"). v5 (brief
				// b2): the skin of the dog too ("everything fades, except the dog and the ember"); characters.js may mark it
				// itself, the scene marks it anyway (before registerForgetting and the first compilation).
				let collars = 0
				let skins = 0
				mods.dog?.object3d.traverse((obj) => {
					for (const m of obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : []) {
						if (/wolf_collar/.test(m.name ?? '')) {
							m.userData.mmKeepColor = true
							collars++
						} else if (TIMELINE.keepDogColor && (m.userData.mmRole === 'skin' || /wolf_tame/.test(m.name ?? ''))) {
							m.userData.mmKeepColor = true
							skins++
						}
					}
				})
				probe.keepColor = { collar: collars > 0, skin: skins > 0, ember: ember.core.material.userData.mmKeepColor === true }
				if (mods.dog && !collars) warn('dog collar not found: it will not keep its colour during the forgetting')
				// Poses that the module can do itself; otherwise fallbacks of applyPlayerFallback.
				const clips = charMod.PLAYER_CLIPS ?? []
				playerFeatures = new Set([...(charMod.PLAYER_FEATURES ?? []), ...(clips.includes('sit') ? ['sit'] : []), ...(clips.includes('sneak') ? ['crouch'] : []), ...(clips.includes('swing') ? ['swing'] : [])])
				dogFeatures = new Set(charMod.DOG_FEATURES ?? [])
				probe.playerFeatures = [...playerFeatures]
			}

			const fireWorld = TIMELINE.world.fire
			const khr = lanternPositions.map((v) => [v.x + origin[0], v.y + origin[1], v.z + origin[2]]).filter((p) => Math.hypot(p[0] - fireWorld[0], p[1] - fireWorld[1], p[2] - fireWorld[2]) >= 1.6)
			const { plan, unknown } = placeLights(khr, LM)
			const R = TIMELINE.lights.roles
			for (const item of plan) {
				const role = LM.lights ? R[item.role] : { intensity: TIMELINE.lights.lantern, distance: 10, color: TIMELINE.lights.lanternColor }
				item.light = role.enabled !== false
				if (!item.light) continue
				const light = new THREE.PointLight(role.color, 0, role.distance, 2)
				light.name = `light ${item.name ?? item.role}`
				light.userData = { used: item.used, intensity: role.intensity, flicker: Boolean(role.flicker), role: item.role }
				light.position.fromArray(S(item.at ?? fireWorld))
				lanternLights.push(light)
				scene.add(light)
			}
			const fmt = (p) => p.map((v) => +v.toFixed(2)).join(' ')
			probe.lights = plan.map((item) => ({ role: item.role, name: item.name, at: item.at && fmt(item.at), source: item.source, used: item.used, light: item.light }))
			probe.unknownLights = unknown.map(fmt)
			probe.pointLights = lanternLights.length
			if (LM.lights && unknown.length) warn(`capture light(s) without a landmark: ${probe.unknownLights.join(' ; ')}`)
			const NORMAL_YAW = { '+z': 0, '+x': Math.PI / 2, '-z': Math.PI, '-x': -Math.PI / 2 }
			for (const w of LM.windows) {
				const material = makeCardMaterial()
				if (LM.windowGlow) {
					material.color.set(LM.windowGlow.color)
					if (LM.windowGlow.blending === 'normal') material.blending = THREE.NormalBlending
				}
				cardMaterials.push(material)
				const card = new THREE.Mesh(new THREE.PlaneGeometry(w.size[0], w.size[1]), material)
				card.name = `window ${w.name ?? ''}`.trim()
				card.position.fromArray(S(w.at))
				card.rotation.y = NORMAL_YAW[w.normal] ?? 0
				windowCards.add(card)
			}
			scene.add(windowCards)
			if (mods.look && LM.windowGlow) mods.look.params.window = LM.windowGlow.hdr
			if (mods.look && LM.look) Object.assign(mods.look.params, LM.look)
			// Settings to decide (option `tune.look`): after those of the version, so that they win.
			if (mods.look && Object.keys(tune.look).length) Object.assign(mods.look.params, tune.look)
			if (mods.look) {
				for (const m of cardMaterials) mods.look.registerEmissive(m, 'window')
				lookBase.emissiveLantern = Number.isFinite(mods.look.params.emissiveLantern) ? mods.look.params.emissiveLantern : null
			}

			if (lifeMod) {
				mods.life = guarded(
					'life.js',
					() =>
						lifeMod.createLife({
							scene,
							origin,
							stageRoots: [stages[0]],
							flameStripUrl: FLAME_STRIP,
							quality,
							chimneys: LM.chimneys,
							chimneySmoke: LM.chimneySmoke,
							fireflyLook: LM.fireflies,
							forgetLook: forgetSync,
							...tune.life,
						}),
					warn,
				)
				if (mods.life) {
					lifeEmberLook = { ...(lifeMod.LIFE?.ember ?? { halo: 0.034, minHaloPx: 28 }), ...(tune.life.emberLook ?? {}) }
					// Contract v4: the ember of life.js keeps its colour during the forgetting (check of the marking).
					if (lifeHas('ember')) probe.keepColor = { ...(probe.keepColor ?? {}), ember: mods.life.ember?.material?.userData?.mmKeepColor === true }
				}
			}

			// Forgetting outside the captures (characters, decor): only if look.js offers registerForgetting (contract v4).
			if (typeof mods.look?.registerForgetting === 'function') {
				for (const root of [mods.dog?.object3d, mods.player?.object3d, mods.backdrop?.object3d]) if (root) guarded('look.registerForgetting', () => mods.look.registerForgetting(root), warn)
			}

			applyRuntimeQuality()
			resize()
			warmUp([stages[0], windowCards, ember.group], STORY.poster)

			isReady = true
			probe.ready = true
			// v9c: the silhouette hull of `fit: 'tight'` is built while the film plays, batch by batch, not at the visitor's first gesture (it would add to the hand-over's wait).
			startCaptureCloud()
			if (reduced() || !wantPlay || mode === 'scroll') {
				t = mode === 'scroll' ? tTarget : reduced() ? STORY.poster : t
				tTarget = t
				playing = false
			} else {
				t = 0
				tTarget = 0
				playing = true
			}
			seeked = true
			dirty = true
			last = performance.now()
			renderNow()
			dirty = false
			const info = { t, duration: D, version: captureVersion, quality: lowRuntime ? 'low' : 'high', reducedMotion: reduced(), playing, mode, variant: { ...variant }, beats: controller.getBeats() }
			emit('ready', info)
			if (playing) emit('play', { t, reason: 'autoplay' })
			resolveReady(info)
			loadRemainingStages()
		})
		.catch((error) => {
			console.error(error)
			fail('init', `Error while preparing the scene: ${error.message}`, error)
		})

	return controller
}
