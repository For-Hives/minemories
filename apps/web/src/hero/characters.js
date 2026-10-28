// characters.js - articulated dog (tamed wolf) and player (slim skin), Minecraft 1.21.1 style.
//
// Geometry, pivots and UVs copied from the 1.21.1 sources (NeoForge 21.1.248):
//   WolfModel.createMeshDefinition, PlayerModel.createMesh, HumanoidModel.createMesh,
//   ModelPart.Cube (vertices, faces and UV rectangles, mirror), ModelPart.translateAndRotate (ZYX rotation).
// Animations inspired by WolfModel.prepareMobModel / setupAnim, HumanoidModel.setupAnim and
// AnimationUtils.bobModelPart. The "lie" pose (lying down) is invented, the game does not have one.
//
// Frames of reference
// - Minecraft model space: pixels (1/16 of a block), Y downward, the front of the model toward -Z.
//   Vanilla rendering applies scale(-1,-1,1) then translate(0,-1.501,0): that is a rotation of pi
//   around a horizontal axis, reproduced here by `rotation.x = pi` (determinant +1, no mirror).
//   The player also receives the 0.9375 scale of PlayerRenderer.scale.
// - Scene space: 1 unit = 1 block, Y upward. `object3d` has its feet at y = 0.
// - `yaw` (radians): 0 = the character looks toward +Z; it looks toward (sin yaw, 0, cos yaw).
//   To look at a point: yaw = atan2(dx, dz) (see `yawToward`). From a Minecraft yaw in degrees
//   (0 = south = +Z, 90 = west = -X): yaw = -deg*pi/180 (see `yawFromMinecraft`).
//
// API
//   createDog({ texture, collarTexture, collarColor = 0xb02e26, seed = 1 })
//     -> { object3d, update(state, pose), parts, dispose() }
//   createPlayer({ skin, slim = true, seed = 2 })
//     -> { object3d, update(state, pose), parts, dispose() }
//   pose = {
//     clip,          // dog: 'walk' | 'stand' | 'sit' | 'lie' | 'sit_down' | 'lie_down' | 'stand_up'
//                    // player: 'walk' | 'idle' | 'afk' | 'lookAt'
//     time,          // seconds since the start of the clip (advances the transitions and the walk)
//     t,             // continuous time for the additive layers (breathing, ears, tail, arms);
//                    // default: state.t, then time. Do not reset it to zero at every clip change.
//     from,          // starting clip: source of the transitions (sit_down from 'stand' or 'walk',
//                    // lie_down from 'sit', 'stand' or 'walk', stand_up from 'sit' or 'lie')
//                    // or generic fade with `blend`. From 'walk', the legs start from the stride
//                    // given by `distance` (blocks walked at the stop) and `speed`.
//     blend,         // 0..1: fade from -> clip (for a transition, replaces the automatic progress)
//     position,      // [x, y, z] scene, feet on the ground
//     yaw,           // radians, see above
//     speed,         // blocks/s for 'walk' (dog 2.6, player 4.317 by default); the amplitude of the
//                    // legs follows the speed (vanilla: ~69 deg at 4.317), 0 = motionless legs
//     fromSpeed,     // player: speed of the `from` clip during a fade (e.g. walk -> idle)
//     distance,      // optional, blocks walked: continuous walk phase even if the speed varies
//     lookAt,        // [x, y, z] scene: the head turns toward this point (realistic limits)
//     lookWeight,    // 0..1, weight of the gaze (default 1)
//     tilt,          // dog, 0..1: head tilted "interested" (Wolf.getHeadRollAngle)
//     breath,        // 0..1+, amplitude of the breathing (default 1; 0 = none)
//     earTwitch,     // dog, 0..1, ear twitches (default 1)
//     sad,           // dog, 0..1: head low, ears back, tail low
//     tail,          // dog: 'wag' | 'low' | 'still' | number (Minecraft angle of the tail, rad)
//   }
//
//   --- Added layers (3rd pass, "life" and emotion). All fields are optional and additive: a pose
//   that does not contain them keeps its transformations (checked by comparing 250 poses of the old version, with
//   `life: 0`); only the micro-animations of `life` (default 1) add themselves. Everything is a function of
//   (state.t, pose, seed), stateless: a frozen `pose.t` also freezes glances, breathing, sniffing and sighs.
//   Common
//     life,          // 0..1 (default 1): micro-life (small glances, head drift, weight, ears). 0 = as before
//     fade,          // 0..1 (default 1): "pixel" fade (each texel disappears in turn, head first). No alpha
//     cameraPos,     // [x, y, z] scene (default: state.camera.position) to measure the gaze (see `live.gazeDeg`)
//     avoidCamera,   // degrees: minimum gaze/camera gap; the head is pushed away within its limits (best effort)
//   Dog (existing clips unchanged; these layers stack on stand/sit/lie)
//     wait,          // 0..1: waiting time, chain alert (0) -> slump (0.2-0.65) -> head on the paws (0.6+),
//                    // automatic sighs from 0.45. Without `wait`, none of these layers. The fields below win
//     alert,         // 0..1: head high, ears up, slow sweeping of the head, tail still
//     headUp,        // 0..1: lying, the head lifts from the paws, the chest rises, ears up (act III)
//     rest,          // 0..1: lying, cheek on the paws, ears flat
//     sigh,          // 0..1: progress of a sigh (3 s); or sighAt = start instant T; otherwise automatic sighs through wait
//     sniff,         // 0..2 (default 1): amplitude of the muzzle sniffing (bursts; more frequent with state.wind)
//     tailBeat,      // instant T (of `pose.t`) of a single 1.3 s tail beat (DOG_TAIL_BEAT_DURATION)
//     tailBeatU,     // 0..1: progress of the same beat, driven by the host (for a frozen pose.t, act III)
//   Player
//     clip 'sit'        : sitting (HumanoidModel.riding). seat = height of the seat (default 0.75, bench), lean (rad), hands 0..1,
//                         legPitch (rad), sitBack (blocks: setback of the model from `position`)
//     clip 'sit_down' / 'stand_up' : transitions of PLAYER_SIT_TIME s (time, or blend 0..1); same parameters
//     clip 'sneak'      : crouching (vanilla). sneakBeats (default 2; <= 0 = held), sneakPeriod (0.46 s), sneakDrop (default 0)
//     clip 'swing'      : arm gesture (HumanoidModel.setupAttackAnimation): swingDuration (0.8 s), swings (1), swingArm
//     clip 'wave'       : wave of the hand (invention), waveDuration (1.8 s)
//     still,         // 0..1: freezes breathing of the arms, sways and glances (pause: the menu does not move the model)
//     afk,           // 0..1: head that droops (deduced from the 'afk' clip by default); usable with 'sit'
//
//   --- Layers v4 ("the kept evening", bible section 6). Optional, additive, pure functions of (pose.t, pose, seed).
//   Dog
//     eager,         // 0..1: it wants to follow (standing): weight forward, head high toward the master, ears up,
//                    // a front paw stomping, high tail that wags harder
//     obey,          // 0..1: it obeys ("stay"): head that bows, ears down, the tail stops;
//                    // the host raises and lowers it during the sit_down that follows the gesture of the master
//     wagAmp,        // 0..1 (default 1): amplitude of the 'wag' beat (to calm it during the replayed band)
//     lookUp,        // 0..1: sitting, it really raises its head toward its master (pitch allowed up to 43 deg, neck stretched)
//     headUp,        // (existed) lying: in v4, the allowed pitch goes up to 46 deg to aim at the ember
//     restless,      // 0..1 (default 1): lying, automatic life "it sleeps, it is not dead": it lifts its head and
//                    // looks aside (7 s windows), sweeps the ground with its tail (4.1 s windows), visible breathing.
//                    // Cut by headUp. 0 = only breathing and ears
//     stir / stirAt, // lying, a forced head lift of DOG_STIR_DURATION s: progress 0..1, or start instant T
//     stirSide,      // -1..1 (default 0.6): where it turns its head during `stir` (+ = toward its left)
//     swish / swishAt, // lying, a forced tail sweep of DOG_SWISH_DURATION s (progress or instant T)
//     tailBeat / tailBeatU, // (existed) v4: ONE single beat (back and forth, tail slightly raised) in DOG_TAIL_BEAT_DURATION s
//   Player
//     clip 'stay'    : "stay": the right arm extends toward `pointAt` (scene; default: lookAt), a push of the
//                      hand downward (palm toward the ground), then falls back. time, stayDuration (PLAYER_STAY_TIME),
//                      stayArm ('right' | 'left'). Advantageously replaces 'swing' (the attack stroke may read "he
//                      hits it"). 'point' is an alias.
//   Common
//     glow,          // 0..1 (default 0): lifts the lighting of the character (emissive drawn from its texture), for the diorama
//
//   --- Layers v8 ("Efe near the dog": typing, holding a screen). Optional, additive, pure functions of (pose.t, pose);
//   without these fields, the pose is exactly that of v7c (checked: T5, 250 poses compared matrix by matrix).
//   Player
//     sneakK,        // 0..1: clip 'sneak', crouch held at this degree (replaces the curve of the `sneakBeats`; the rise and the fall
//                    // are written by the scene). Absent: v7c behaviour.
//     type,          // 0..1: typing on a keyboard, in front of the character: both forearms raised (pitch about -1.1 standing, -0.9
//                    // crouching), slightly tucked in, head a little lowered. Combines with `sneak` and `idle`.
//     typeHit,       // 0..1: bounce of the key that was just hit (the scene: exp(-dt/0.06) since the last key);
//     typeSide,      // 0 | 1: hand that hits (0 right, 1 left, alternating);
//     typeRate,      // keys/s (instantaneous rate): amplitude of the bounce and of the alternating oscillation of +/-0.06 rad at typeRate/2 Hz
//                    // ("crazier when typing fast"). 0 outside a burst.
//     waveK,         // 0..1: wave of the hand ("hello"), additive to the current clip (crouching included)
//     gui,           // 0..1: screen held in front of oneself (the game menu): the right hand aims at the cursor, the left stays a bit in front
//     guiCursor,     // [u, v] in [-1; 1]^2 in the frame of the character (u+ = its local lateral axis of armAim, v+ = downward): the
//                    // plane of the screen is at GUI_PLANE.forward in front of the chest, height GUI_PLANE.height, +/- GUI_PLANE.w in u, +/- GUI_PLANE.h in v
//     guiClick,      // 0..1: press (the hand sinks by 0.08 rad)
//
//   --- Layers v5 (brief v5 "You told him stay"). Optional; without `glowTint`, rendering identical to v4 (checked at the
//   pixel on both freezes, renders-v5/chars/gel-1100).
//   Common
//     glowTint,      // [r, g, b] linear RGB (tint of the ember): the `glow` becomes a tinted warm glow.
//                    // Dog: the warmth goes through the ALBEDO (skin x cream, CHAR_TUNE.dog.albedo, share = smooth of glow over
//                    // albedoRamp) plus a breath of tinted emissive (x CHAR_TUNE.dog.emissive); the collar does not light up
//                    // (collarGlow 0): "everything fades, except the dog", without making the collar the only colour.
//                    // Player: warm silhouette of the return as a memory: tinted emissive (glow x CHAR_TUNE.player.max) whose
//                    // flat part (uGlowFlat = glow x player.flat) erases the texture; the real skin returns with glow -> 0.
//   Dog
//     swish / swishAt // v5: also valid SITTING (the tail resting on the ground sweeps sideways); amplitude = max(lying, sitting).
//     (auto)         // v5, feature 'sitSwish': sitting with `wait` (absence), a slow sweep at most every
//                    // DOG_SIT_SWISH_WINDOW s (probability 0.75), cut by restless 0 and tail 'still'. Never without `wait` (evening, freezes).
//   createDog({ ..., keepSkinColor }): also marks the skin `mmKeepColor` (excluded from the forgetting; default false, the scene
//   marks it itself). Features: DOG_FEATURES + 'glowTint', 'sitSwish'; PLAYER_FEATURES + 'glowTint'
//   (the scene no longer sets its fallback tint). Live settings: CHAR_TUNE (measuring tools).
//   No new lying pose: brief v5 b1 forbids "lying flat" and "head on the paws" by default; the layers `lie`, `rest`,
//   `restless` stay for the v4 look. v9: the dog lies as a sphinx with its head up (headUp 0.6 to 0.8, rest <= 0.3).
//
//   Collar and forgetting (contract v4): the collar is a separate material, `DOG_COLLAR_MATERIAL` = 'dog / wolf_collar'
//   (one mesh per piece, `main` layer drawn after the skin), marked `userData.mmKeepColor = true` and
//   `userData.mmRole = 'collar'` (the skin: 'skin'). `dog.materials` = { skin, collar }. The program key of the
//   materials includes this flag: the skin and the collar never share the same program. A module that patches
//   `onBeforeCompile` must chain the existing one and extend `customProgramCacheKey`, not replace it.
//
//   Read-only outputs: `character.live` ({ exhale, sigh, sniff, gazeDeg, avoided, ... }) and `character.anchor(name)`
//   -> world THREE.Vector3 ('mouth', 'head', and 'tail' for the dog) to emit breath mist.
//
//   Pure functions: the same (state.t, pose) always gives the same image.
//   Paused game (state.frozen: menu, diorama of act III): the integrator keeps `pose.t` fixed,
//   otherwise breathing and ears keep moving with state.t.
//   The entities of personnages.glb look toward -Z: yaw = pi in this convention.
//
// The textures are THREE.Texture (images of ../captures/personnages.glb): the module forces
// NEAREST, no mipmaps, sRGB, and reads `flipY` to orient the UVs (false for glTF textures).

import * as THREE from 'three'
// v11 (animation pass): pure curve tools, also re-exported for the host (scene.js imports them from the same module).
import { EASE, track, springStep, window4, phaseOf } from './anim/curves.js'
export { EASE, track, trackH, spring, springStep, springKick, springWindow, lag, phaseOf, window4 } from './anim/curves.js'
// v11: baked motion clips (format and pure reader; web/anim/clips/ is empty, see anim/clips.js). `pose.mocap = [{ clip, t, weight? }]` adds them to the pose.
import { applyClipLayers } from './anim/clips.js'
export { parseClip, sampleClip, sampleChannel, clipWeight, applyClipLayers } from './anim/clips.js'

const PI = Math.PI
const TAU = PI * 2

// --- utilities ------------------------------------------------------------------------------

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const lerp = (a, b, k) => a + (b - a) * k
const smooth = (k) => {
	const x = clamp(k, 0, 1)
	return x * x * x * (x * (x * 6 - 15) + 10)
}
const hash = (n) => {
	const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123
	return s - Math.floor(s)
}

/** Scene yaw to look from `from` toward `to` (arrays [x, y, z]). */
export const yawToward = (from, to) => Math.atan2(to[0] - from[0], to[2] - from[2])
/** Scene yaw from a Minecraft yaw in degrees (0 = +Z, 90 = -X). */
export const yawFromMinecraft = (deg) => (-deg * PI) / 180

/**
 * UV rectangles of a Minecraft box (ModelPart.Cube), in texture pixels then normalised.
 * Returns { down, up, west, north, east, south }: [u1, v1, u2, v2] normalised (v from the top
 * of the image), and `mirror`. The dimensions are those of the cube without CubeDeformation.
 */
export function boxUV(texW, texH, u, v, w, h, d, mirror = false) {
	const f4 = u
	const f5 = u + d
	const f6 = u + d + w
	const f7 = u + d + w + w
	const f8 = u + d + w + d
	const f9 = u + d + w + d + w
	const f10 = v
	const f11 = v + d
	const f12 = v + d + h
	const n = (a, b, c, e) => [a / texW, b / texH, c / texW, e / texH]
	return {
		down: n(f5, f10, f6, f11),
		up: n(f6, f11, f7, f10),
		west: n(f4, f11, f5, f12),
		north: n(f5, f11, f6, f12),
		east: n(f6, f11, f8, f12),
		south: n(f8, f11, f9, f12),
		mirror,
	}
}

// Normals of the faces in model space (Direction.step()).
const FACE_NORMAL = {
	down: [0, -1, 0],
	up: [0, 1, 0],
	west: [-1, 0, 0],
	north: [0, 0, -1],
	east: [1, 0, 0],
	south: [0, 0, 1],
}

/**
 * Adds a Minecraft cube (literal port of ModelPart.Cube + Polygon) to the arrays of a mesh.
 * Positions in blocks (pixels / 16), relative to the pivot of the piece. The order of the triangles is
 * chosen so that the front face looks outward (normal of the direction).
 */
function addCube(out, cube, texW, texH, flipY) {
	const [u, v] = cube.uv
	const [ox, oy, oz] = cube.from
	const [w, h, d] = cube.size
	const g = cube.grow ?? 0
	const mirror = !!cube.mirror
	let x0 = ox - g
	let x1 = ox + w + g
	const y0 = oy - g
	const y1 = oy + h + g
	const z0 = oz - g
	const z1 = oz + d + g
	if (mirror) [x0, x1] = [x1, x0]
	// Names of the vertices of the Java code: vertex7, vertex, vertex1 ... vertex6.
	const V7 = [x0, y0, z0]
	const V0 = [x1, y0, z0]
	const V1 = [x1, y1, z0]
	const V2 = [x0, y1, z0]
	const V3 = [x0, y0, z1]
	const V4 = [x1, y0, z1]
	const V5 = [x1, y1, z1]
	const V6 = [x0, y1, z1]
	const uv = boxUV(texW, texH, u, v, w, h, d, mirror)
	const faces = {
		down: [V4, V3, V7, V0],
		up: [V1, V2, V6, V5],
		west: [V7, V3, V6, V2],
		north: [V0, V7, V2, V1],
		east: [V4, V0, V1, V5],
		south: [V3, V4, V5, V6],
	}
	for (const key of Object.keys(faces)) {
		const verts = faces[key]
		const [u1, v1, u2, v2] = uv[key]
		let uvs = [
			[u2, v1],
			[u1, v1],
			[u1, v2],
			[u2, v2],
		]
		let pts = verts
		if (mirror) {
			pts = [...pts].reverse()
			uvs = [...uvs].reverse()
		}
		const nrm = [...FACE_NORMAL[key]]
		if (mirror) nrm[0] = -nrm[0]
		// Rotation direction: front face (CCW) on the side of the normal.
		const ax = pts[1][0] - pts[0][0]
		const ay = pts[1][1] - pts[0][1]
		const az = pts[1][2] - pts[0][2]
		const bx = pts[2][0] - pts[0][0]
		const by = pts[2][1] - pts[0][1]
		const bz = pts[2][2] - pts[0][2]
		const cx = ay * bz - az * by
		const cy = az * bx - ax * bz
		const cz = ax * by - ay * bx
		const ccw = cx * nrm[0] + cy * nrm[1] + cz * nrm[2] >= 0
		const order = ccw ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]
		const base = out.pos.length / 3
		for (let i = 0; i < 4; i++) {
			out.pos.push(pts[i][0] / 16, pts[i][1] / 16, pts[i][2] / 16)
			out.nrm.push(nrm[0], nrm[1], nrm[2])
			out.uv.push(uvs[i][0], flipY ? 1 - uvs[i][1] : uvs[i][1])
		}
		for (const k of order) out.idx.push(base + k)
	}
}

function makeGeometry(cubes, texW, texH, flipY) {
	const out = { pos: [], nrm: [], uv: [], idx: [] }
	for (const c of cubes) addCube(out, c, texW, texH, flipY)
	const geo = new THREE.BufferGeometry()
	geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3))
	geo.setAttribute('normal', new THREE.Float32BufferAttribute(out.nrm, 3))
	geo.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2))
	geo.setIndex(out.idx)
	geo.computeBoundingSphere()
	return geo
}

function prepareTexture(tex) {
	if (!tex) return null
	tex.colorSpace = THREE.SRGBColorSpace
	tex.magFilter = THREE.NearestFilter
	tex.minFilter = THREE.NearestFilter
	tex.generateMipmaps = false
	tex.needsUpdate = true
	return tex
}

const texSize = (tex, w, h) => [tex?.image?.width || w, tex?.image?.height || h]

/**
 * Builds the tree of pieces. spec = { name, pivot, rot?, cubes: { <layer>: [cube] }, children? }.
 * Each piece: group (pivot + ZYX rotation) -> holder (scale around the centre of the first cube)
 * -> meshes (one per material layer).
 */
function buildParts(specs, parent, layers, parts, geometries) {
	for (const spec of specs) {
		const group = new THREE.Group()
		group.name = spec.name
		group.rotation.order = 'ZYX'
		const first = Object.values(spec.cubes ?? {}).flat()[0]
		const center = first
			? first.from.map((f, i) => (f + first.size[i] / 2) / 16)
			: [0, 0, 0]
		const holder = new THREE.Group()
		holder.position.fromArray(center)
		group.add(holder)
		const inner = new THREE.Group()
		inner.position.set(-center[0], -center[1], -center[2])
		holder.add(inner)
		for (const [layerName, cubes] of Object.entries(spec.cubes ?? {})) {
			if (!cubes.length) continue
			for (const layer of layers[layerName]) {
				const key = `${spec.name}/${layerName}/${layer.texW}x${layer.texH}/${layer.flipY}`
				let geo = geometries.get(key)
				if (!geo) {
					geo = makeGeometry(cubes, layer.texW, layer.texH, layer.flipY)
					geometries.set(key, geo)
				}
				const mesh = new THREE.Mesh(geo, layer.material)
				mesh.name = `${spec.name}:${layer.material.name}`
				mesh.castShadow = true
				mesh.receiveShadow = true
				mesh.renderOrder = layer.renderOrder ?? 0
				inner.add(mesh)
			}
		}
		parent.add(group)
		parts[spec.name] = { group, holder }
		if (spec.children) buildParts(spec.children, group, layers, parts, geometries)
	}
}

// A pose = { piece: [x, y, z, rx, ry, rz, sx, sy, sz] } (pixels, radians, scale of the holder).
const P = (x, y, z, rx = 0, ry = 0, rz = 0) => [x, y, z, rx, ry, rz, 1, 1, 1]
const clonePose = (pose) => Object.fromEntries(Object.entries(pose).map(([k, v]) => [k, v.slice()]))
function mixPose(a, b, k) {
	const out = {}
	for (const key of Object.keys(a)) {
		const pa = a[key]
		const pb = b[key] ?? pa
		out[key] = pa.map((v, i) => lerp(v, pb[i], k))
	}
	return out
}
function applyPose(parts, pose) {
	for (const [name, p] of Object.entries(pose)) {
		const part = parts[name]
		if (!part) continue
		part.group.position.set(p[0] / 16, p[1] / 16, p[2] / 16)
		part.group.rotation.set(p[3], p[4], p[5], 'ZYX')
		part.holder.scale.set(p[6], p[7], p[8])
	}
}

/**
 * Point of a piece (pixels, model space) -> local frame of the character (blocks, Y up, front +Z).
 * The rotations of the parents of the head are zero in our poses, only the position counts.
 */
const modelToLocal = (mx, my, mz, scale = 1) => [(mx / 16) * scale, (1.501 - my / 16) * scale, (-mz / 16) * scale]

/**
 * Head angles (local yaw, pitch upward) to look at `target` (scene) from the eye `eyeLocal`.
 * Returns Minecraft [yRot, xRot] (yRot = -local yaw, xRot > 0 = looks downward).
 */
function lookAngles(pose, eyeLocal, limits) {
	const target = pose.lookAt
	if (!target) return [0, 0]
	const pos = pose.position ?? [0, 0, 0]
	const yaw = pose.yaw ?? 0
	const dx = target[0] - pos[0]
	const dy = target[1] - pos[1]
	const dz = target[2] - pos[2]
	// Inverse of the Y rotation of the character.
	const c = Math.cos(yaw)
	const s = Math.sin(yaw)
	const lx = c * dx - s * dz - eyeLocal[0]
	const lz = s * dx + c * dz - eyeLocal[2]
	const ly = dy - eyeLocal[1]
	const psi = Math.atan2(lx, lz)
	const fixOn = pose.fix > 0
	// v11 (fix): the stop of the neck used to be a hard clamp: the head stayed pinned, then followed the target at the full angular speed of the target the moment it came back in
	// reach (a velocity jump of up to 11 rad/s). Past 70 % of the range the angle now saturates smoothly (C2): same limits, no corner.
	const softHi = (x, L) => (x <= 0.7 * L ? x : 0.7 * L + 0.3 * L * Math.tanh((x - 0.7 * L) / (0.3 * L)))
	const softLimit = (x, lo, hi) => (x >= 0 ? softHi(x, hi) : -softHi(-x, lo))
	const rawPitch = Math.atan2(ly, Math.hypot(lx, lz))
	const kFix = fixOn ? clamp(pose.fix, 0, 1) : 0
	const localYaw = fixOn ? lerp(clamp(psi, -limits.yaw, limits.yaw), softLimit(psi, limits.yaw, limits.yaw), kFix) : clamp(psi, -limits.yaw, limits.yaw)
	const pitchUp = fixOn ? lerp(clamp(rawPitch, -limits.down, limits.up), softLimit(rawPitch, limits.down, limits.up), kFix) : clamp(rawPitch, -limits.down, limits.up)
	let w = clamp(pose.lookWeight ?? 1, 0, 1)
	// v11 (fix): a target that goes behind the head used to flip it from one stop to the other in one frame (atan2 jumps at +-pi, the clamp keeps the sign). The gaze weight now
	// falls to 0 as the target goes from 127 degrees (inside the reach of the neck) to straight behind: both sides meet on the neutral head, no jump.
	const fix = pose.fix > 0 ? clamp(pose.fix, 0, 1) : 0
	if (fix > 0) {
		const edge = (PI + limits.yaw) / 2
		w *= 1 - fix * smooth((Math.abs(psi) - edge) / (PI - edge))
	}
	return [-localYaw * w, -pitchUp * w]
}

function makeMaterial(name, map, opts = {}) {
	const mat = new THREE.MeshStandardMaterial({
		name,
		map,
		color: opts.color ?? 0xffffff,
		roughness: 1,
		metalness: 0,
		alphaTest: 0.1,
		side: opts.side ?? THREE.FrontSide,
	})
	// `glow` layer (diorama): emissive = texture, intensity 0 by default (no contribution).
	if (map) {
		mat.emissive.setHex(0xffffff)
		mat.emissiveMap = map
		mat.emissiveIntensity = 0
	}
	if (opts.polygonOffset) {
		mat.polygonOffset = true
		mat.polygonOffsetFactor = -1
		mat.polygonOffsetUnits = -1
	}
	return mat
}

function makeRoot(name, scale = 1) {
	const object3d = new THREE.Group()
	object3d.name = name
	const scaler = new THREE.Group()
	scaler.scale.setScalar(scale)
	object3d.add(scaler)
	const model = new THREE.Group()
	model.name = `${name}-modele`
	model.position.y = 1.501
	model.rotation.x = PI // vanilla scale(-1,-1,1) + half turn to look toward +Z
	scaler.add(model)
	return { object3d, model, scaler }
}

/**
 * "Pixel" fade (pose.fade: 1 = visible, 0 = gone): each texel of the model disappears in turn
 * (hash per texel, head first), without transparency: no sorting problem with the outer
 * layers. The cast shadows stop below 50 % (they do not follow the fade).
 */
function makeFade(texDims, height = 1) {
	const uniforms = {
		uFade: { value: 1 },
		uFadeBase: { value: 0 },
		uFadeH: { value: height },
		uFadeTex: { value: new THREE.Vector2(texDims[0], texDims[1]) },
		// v5: "silhouette" share of the emissive (0 = modulated by the texture, as before; 1 = flat tint). See applyGlow.
		uGlowFlat: { value: 0 },
	}
	let casting = true
	return {
		uniforms,
		install(material) {
			const previous = material.onBeforeCompile
			material.onBeforeCompile = (shader, r) => {
				if (previous && previous !== THREE.Material.prototype.onBeforeCompile) previous.call(material, shader, r)
				Object.assign(shader.uniforms, uniforms)
				shader.vertexShader = shader.vertexShader
					.replace('#include <common>', '#include <common>\nvarying float vFadeY;\nuniform float uFadeBase;')
					.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFadeY = (modelMatrix * vec4(transformed, 1.0)).y - uFadeBase;')
				shader.fragmentShader = shader.fragmentShader
					.replace(
						'#include <common>',
						'#include <common>\nvarying float vFadeY;\nuniform float uFade;\nuniform float uFadeH;\nuniform vec2 uFadeTex;\nuniform float uGlowFlat;',
					)
					// v5: warm silhouette (return of the player as a memory). Null branch at uGlowFlat = 0 (freezes intact).
					.replace(
						'#include <emissivemap_fragment>',
						`#include <emissivemap_fragment>
#ifdef USE_EMISSIVEMAP
	if (uGlowFlat > 0.0) totalEmissiveRadiance = mix(totalEmissiveRadiance, emissive, uGlowFlat);
#endif`,
					)
					.replace(
						'#include <map_fragment>',
						`#include <map_fragment>
#ifdef USE_MAP
	if (uFade < 0.999) {
		vec2 fq = floor(vMapUv * uFadeTex);
		float fh = fract(sin(dot(fq, vec2(127.1, 311.7))) * 43758.5453);
		float fth = fh * 0.7 + clamp(vFadeY / uFadeH, 0.0, 1.0) * 0.3;
		if (fth > uFade) discard;
	}
#endif`,
					)
			}
			// The key distinguishes the materials kept in colour (collar): without it, the skin and the collar would share
			// a program and a forgetting patch set on one would apply to the other (the first compiled wins).
			const previousKey = material.customProgramCacheKey
			const ownKey = previousKey === THREE.Material.prototype.customProgramCacheKey ? null : previousKey
			material.customProgramCacheKey = () =>
				`${ownKey ? ownKey.call(material) : ''}|mm-char-fade|${material.userData.mmKeepColor ? 'keep' : 'all'}`
			material.needsUpdate = true
		},
		apply(object3d, value) {
			const f = value == null ? 1 : clamp(value, 0, 1)
			uniforms.uFade.value = f
			uniforms.uFadeBase.value = object3d.position.y
			const cast = f > 0.5
			if (cast !== casting) {
				casting = cast
				object3d.traverse((o) => {
					if (o.isMesh) o.castShadow = cast
				})
			}
		},
	}
}

/** Emissive intensity of the materials of a character for `pose.glow` (0..1). */
export const CHAR_GLOW_MAX = 0.45
/**
 * v5 - tinted warm glows (`pose.glowTint`, feature 'glowTint'). Readable settings, changeable live (measuring tools:
 * `(await import('./characters.js')).CHAR_TUNE`), without effect when glowTint is absent.
 *   dog.albedo        skin colour (linear RGB) at glow = 1: warm cream (hue about 60-70 deg), multiplied with the texture.
 *                     The warmth goes through the ALBEDO (it follows the received light, keeps the modelling): warm on the grey day,
 *                     discreet at night. An emissive alone crushes to white under a clear day and turns flesh pink at night.
 *   dog.albedoRamp    [g0, g1]: share of the albedo k = smooth((glow - g0) / (g1 - g0)). The weak glow of the night
 *                     (glow about 0.43) already tints (ramp [0.1; 0.6] since the wiring pass: about 0.7); that of the dawn (about 0.68) and of the memory (about 0.85) tint fully.
 *   dog.emissive      share of the tinted emissive (x glow x CHAR_GLOW_MAX): a breath of ember glow, not a colour.
 *   dog.collarGlow    emissive of the collar when glowTint is present (0: the collar does not light up with the warmth).
 *   player.max        emissive intensity at glow = 1 (warm silhouette of the return).
 *   player.flat       "silhouette" share (flat tint) of the emissive, x glow: 1 at the strongest, the texture returns while cooling.
 */
export const CHAR_TUNE = {
	// Wiring pass v5 (measured with the mask, renders-v5/cablage/tune1, tunej): yellower albedo and lower ramp (the glow
	// of the night, glow about 0.43, also tints the coat): under the pink sunrises, the hue of the coat goes from 29 to 46 deg
	// (19.6 s) and from 4 to 33 deg (22.5 s), far from the collar; the dawn stays at C* 17.6, hue 81 deg. Player: max 0.85 -> 0.6,
	// flat 0.75 -> 0.5: the silhouette of the return is more orange (hue 73 -> 64 deg at 34.6 s), less white.
	dog: { albedo: [1.0, 0.8, 0.55], albedoRamp: [0.1, 0.6], emissive: 0.12, collarGlow: 0 },
	player: { max: 0.6, flat: 0.5 },
}
/**
 * Emissive and tint of the materials of a character.
 * - Without `tint` (contract v4, diorama): emissive = material colour x texture, intensity glow x CHAR_GLOW_MAX; the
 *   colour of each material is set back EXACTLY to its base value (identity at the pixel at the freezes).
 * - With `tint` [r, g, b] (v5): dog -> cream albedo + breath of tinted emissive, collar off; player -> warm silhouette
 *   (tinted emissive, partly flat through uGlowFlat).
 */
function applyGlow(materials, glow, { tint = null, kind = 'dog', fade = null } = {}) {
	const g = clamp(glow ?? 0, 0, 1)
	const k = g * CHAR_GLOW_MAX
	const warm = Array.isArray(tint) && tint.length >= 3 && g > 0
	for (const m of materials) {
		if (!m?.emissiveMap) continue
		const base = m.userData.mmBaseColor
		if (base) m.color.copy(base)
		if (!warm) {
			m.emissive.copy(m.color) // the collar keeps its tint
			m.emissiveIntensity = k
			continue
		}
		if (kind === 'dog') {
			if (m.userData.mmRole === 'collar') {
				m.emissive.copy(m.color)
				m.emissiveIntensity = k * CHAR_TUNE.dog.collarGlow
				continue
			}
			const a = CHAR_TUNE.dog.albedo
			const [r0, r1] = CHAR_TUNE.dog.albedoRamp
			const ka = smooth((g - r0) / Math.max(1e-3, r1 - r0))
			m.color.setRGB(lerp(1, a[0], ka), lerp(1, a[1], ka), lerp(1, a[2], ka))
			m.emissive.setRGB(tint[0], tint[1], tint[2])
			m.emissiveIntensity = k * CHAR_TUNE.dog.emissive
		} else {
			m.emissive.setRGB(tint[0], tint[1], tint[2])
			m.emissiveIntensity = g * CHAR_TUNE.player.max
		}
	}
	if (fade) fade.uniforms.uGlowFlat.value = warm && kind === 'player' ? clamp(g * CHAR_TUNE.player.flat, 0, 1) : 0
}
/** Remembers the base colour of a material (restored identically at every frame). */
function rememberBase(m) {
	if (m) m.userData.mmBaseColor = m.color.clone()
}

function placeRoot(object3d, pose) {
	const p = pose.position ?? [0, 0, 0]
	object3d.position.set(p[0], p[1], p[2])
	object3d.rotation.set(0, pose.yaw ?? 0, 0)
}

// ==============================================================================================
// Dog
// ==============================================================================================

// Tail angle of a tamed wolf in full health (Wolf.getTailAngle) and low tail (low health).
const TAIL_TAME = 0.55 * PI
const TAIL_LOW = 0.15 * PI

const LEG = [{ uv: [0, 18], from: [0, 0, -1], size: [2, 8, 2] }]

const DOG_SPEC = [
	{
		name: 'head',
		cubes: {},
		children: [
			{
				name: 'realHead',
				cubes: {
					main: [{ uv: [0, 0], from: [-2, -3, -2], size: [6, 6, 4] }],
				},
				// Ears and muzzle separated from the head so that they can be moved: same boxes and same UVs.
				// Ears: pivot at their base (Java: addBox(-2,-5,0,2,2,1) and addBox(2,-5,0,2,2,1)).
				// Muzzle (Java: addBox(-0.5,-0.001,-5,3,3,4)): pivot at its base (1; 1.5; -1) in the frame of the
				// head, box shifted by as much: (-0.5; -0.001; -5) - (1; 1.5; -1) = (-1.5; -1.501; -4).
				children: [
					{ name: 'snout', cubes: { main: [{ uv: [0, 10], from: [-1.5, -1.501, -4], size: [3, 3, 4] }] } },
					{ name: 'earR', cubes: { main: [{ uv: [16, 14], from: [-1, -2, -0.5], size: [2, 2, 1] }] } },
					{ name: 'earL', cubes: { main: [{ uv: [16, 14], from: [-1, -2, -0.5], size: [2, 2, 1] }] } },
				],
			},
		],
	},
	{ name: 'body', cubes: { main: [{ uv: [18, 14], from: [-3, -2, -3], size: [6, 9, 6] }] } },
	{ name: 'upperBody', cubes: { main: [{ uv: [21, 0], from: [-3, -3, -3], size: [8, 6, 7] }] } },
	{ name: 'rightHindLeg', cubes: { main: LEG } },
	{ name: 'leftHindLeg', cubes: { main: LEG } },
	{ name: 'rightFrontLeg', cubes: { main: LEG } },
	{ name: 'leftFrontLeg', cubes: { main: LEG } },
	{
		name: 'tail',
		cubes: {},
		children: [{ name: 'realTail', cubes: { main: [{ uv: [9, 18], from: [0, 0, -1], size: [2, 8, 2] }] } }],
	},
]

const DOG_COMMON = {
	realHead: P(0, 0, 0),
	snout: P(1, 1.5, -1),
	earR: P(-1, -3, 0.5),
	earL: P(3, -3, 0.5),
	realTail: P(0, 0, 0),
}

/** Standing (WolfModel, "not sitting" branch of prepareMobModel, legs motionless). */
const DOG_STAND = {
	...DOG_COMMON,
	head: P(-1, 13.5, -7),
	body: P(0, 14, 2, PI / 2),
	upperBody: P(-1, 14, -3, PI / 2),
	rightHindLeg: P(-2.5, 16, 7),
	leftHindLeg: P(0.5, 16, 7),
	rightFrontLeg: P(-2.5, 16, -4),
	leftFrontLeg: P(0.5, 16, -4),
	tail: P(-1, 12, 8, TAIL_TAME),
}

/** Sitting (WolfModel.prepareMobModel, isInSittingPose); angles brought back into ]-pi, pi]. */
const DOG_SIT = {
	...DOG_COMMON,
	head: P(-1, 13.5, -7),
	body: P(0, 18, 0, PI / 4),
	upperBody: P(-1, 16, -3, (PI * 2) / 5),
	rightHindLeg: P(-2.5, 22.7, 2, -PI / 2),
	leftHindLeg: P(0.5, 22.7, 2, -PI / 2),
	rightFrontLeg: P(-2.49, 17, -4, 5.811947 - TAU),
	leftFrontLeg: P(0.51, 17, -4, 5.811947 - TAU),
	tail: P(-1, 21, 6, TAIL_TAME),
}

/**
 * Lying (invented): as a sphinx, belly on the ground (body lowered by 7 px), front legs stretched
 * forward, hind legs folded along the flank, head resting on the paws, tail on the ground.
 */
const DOG_LIE = {
	...DOG_COMMON,
	head: P(-1, 18.9, -8.2, 0.06),
	body: P(0, 21, 2.5, PI / 2),
	upperBody: P(-1, 21, -2.5, PI / 2 - 0.04),
	rightHindLeg: P(-3.4, 22.7, 7.5, -PI / 2, -0.18),
	leftHindLeg: P(1.4, 22.7, 7.5, -PI / 2, 0.18),
	rightFrontLeg: P(-2.6, 22.7, -4.5, -PI / 2, 0.06),
	leftFrontLeg: P(0.6, 22.7, -4.5, -PI / 2, -0.06),
	tail: P(-1, 21.2, 9.4, 1.42, 0, 0),
	realTail: P(0, 0, 0, 0, 0, 0),
}

const DOG_STATIC = { stand: DOG_STAND, sit: DOG_SIT, lie: DOG_LIE }
const DOG_TRANSITIONS = {
	sit_down: { from: 'stand', to: 'sit' },
	lie_down: { from: 'sit', to: 'lie' },
	stand_up: { from: 'sit', to: 'stand' },
}
/** Duration of a transition step (s). stand <-> lie goes through sit: two steps. */
export const DOG_TRANSITION_STEP = 0.6
export const DOG_CLIPS = ['walk', 'stand', 'sit', 'lie', 'sit_down', 'lie_down', 'stand_up']

const DOG_WALK_SPEED = 2.6
/** Duration (s) of the single tail beat `tailBeat`: ONE back and forth (v4; 1.3 s and 2.5 beats in v3). */
export const DOG_TAIL_BEAT_DURATION = 0.9
/** Duration (s) of a head lift of the lying dog (`stir`): it lifts from the paws, looks aside, rests. */
export const DOG_STIR_DURATION = 2.4
/** Duration (s) of a tail sweep of the lying dog (`swish`). */
export const DOG_SWISH_DURATION = 1.2
/** v5: sitting during the wait, at most one tail sweep per window of DOG_SIT_SWISH_WINDOW s (probability 0.75). */
export const DOG_SIT_SWISH_WINDOW = 6.5
/** Name of the collar material (contract v4: excluded from the forgetting, `userData.mmKeepColor`). */
export const DOG_COLLAR_MATERIAL = 'dog / wolf_collar'
/** Pose layers v4 recognised (so that an integrator detects the version of the module). */
export const DOG_FEATURES = ['eager', 'obey', 'wagAmp', 'lookUp', 'restless', 'stir', 'swish', 'tailBeatOnce', 'glow', 'keepColor', 'glowTint', 'sitSwish', 'nat', 'earLag', 'tailWhip', 'stepTurn', 'mocap']

/** Walking pose (prepareMobModel, standing branch, + vanilla tail swing). */
function dogWalk(pose) {
	const speed = pose.speed ?? DOG_WALK_SPEED
	let amount = clamp((speed * 4) / 20, 0, 1)
	// v11 (fix): `gait` (0..1) is the envelope of the stride over the first and the last half step of a walk (set by the scene): the legs leave and reach the stop closed.
	if (pose.fix > 0 && pose.gait != null) amount *= pose.gait
	const limb = 4 * (pose.distance ?? (pose.time ?? 0) * speed)
	const out = clonePose(DOG_STAND)
	const a = Math.cos(limb * 0.6662) * 1.4 * amount
	const b = Math.cos(limb * 0.6662 + PI) * 1.4 * amount
	out.rightHindLeg[3] = a
	out.leftHindLeg[3] = b
	out.rightFrontLeg[3] = b
	out.leftFrontLeg[3] = a
	out.tail[4] = Math.cos(limb * 0.6662) * 1.4 * amount * 0.6 // vanilla x 0.6 (less frantic)
	// Small nod of the head at the pace of the step (addition).
	out.head[3] += Math.sin(limb * 0.6662 * 2) * 0.05 * amount
	// v11: |sin| has a corner at every footfall; sin squared (same period, same peak) does not
	out.head[1] += (pose.nat > 0 ? lerp(Math.abs(Math.sin(limb * 0.6662)), Math.sin(limb * 0.6662) ** 2, clamp(pose.nat, 0, 1)) : Math.abs(Math.sin(limb * 0.6662))) * 0.25 * amount
	return out
}

/** Weights of the postures in the base pose, to adapt the layers (lying, sitting...). */
function dogStatic(name, pose) {
	if (name === 'walk') return { p: dogWalk(pose), w: { stand: 1, sit: 0, lie: 0 } }
	const p = clonePose(DOG_STATIC[name] ?? DOG_STAND)
	const w = { stand: 0, sit: 0, lie: 0 }
	w[DOG_STATIC[name] ? name : 'stand'] = 1
	return { p, w }
}

function mixWeights(a, b, k) {
	return { stand: lerp(a.stand, b.stand, k), sit: lerp(a.sit, b.sit, k), lie: lerp(a.lie, b.lie, k) }
}

// v11 - the transitions of the dog in stages (pose.nat). `u` (0..1) is the progress of the step. Each group of parts has its own share of the way to the target pose:
// standing up, the head leads, the front legs and the mane go first, the hindquarters push late, the tail follows; sitting down, the hindquarters go first and the mane follows;
// lying down, the front legs step forward, the chest drops (with a small "plop"), the hindquarters settle last, the tail last of all. Reverse for getting back up.
const DOG_GROUP = { head: 'head', realHead: 'head', snout: 'head', earR: 'head', earL: 'head', body: 'body', upperBody: 'upper', rightHindLeg: 'hind', leftHindLeg: 'hind', rightFrontLeg: 'front', leftFrontLeg: 'front', tail: 'tail', realTail: 'tail' }
const DOG_STAGES = {
	'sit>stand': (u) => ({ front: stage(u, 0, 0.7), upper: stage(u, 0, 0.7), head: stage(u, 0, 0.8), body: stage(u, 0.25, 1), hind: stage(u, 0.3, 1), tail: stage(u, 0.4, 1) }),
	'stand>sit': (u) => ({ body: stage(u, 0, 0.7), hind: stage(u, 0, 0.7), upper: stage(u, 0.15, 0.9), front: stage(u, 0.5, 1), head: stage(u, 0, 1), tail: stage(u, 0.2, 0.9) }),
	'sit>lie': (u) => ({ front: stage(u, 0, 0.45), upper: stage(u, 0.05, 0.6), head: stage(u, 0.1, 0.8), body: stage(u, 0.3, 0.9), hind: stage(u, 0.35, 0.95), tail: stage(u, 0.55, 1) }),
	'lie>sit': (u) => ({ upper: stage(u, 0, 0.7), front: stage(u, 0, 0.8), head: stage(u, 0, 0.7), body: stage(u, 0.2, 1), hind: stage(u, 0.25, 1), tail: stage(u, 0.4, 1) }),
}
function dogMixPose(a, b, u, fromName, toName, nat) {
	const old = mixPose(a, b, smooth(u))
	const st = nat > 0 ? DOG_STAGES[`${fromName}>${toName}`] : null
	if (!st) return old
	const g = st(u)
	const ks = {}
	for (const key of Object.keys(a)) ks[key] = g[DOG_GROUP[key]] ?? 0
	const q = mixPoseParts(a, b, ks)
	// the last half step of a front paw when it has stood up; the "plop" of the chest when it lies down
	if (fromName === 'sit' && toName === 'stand') q.leftFrontLeg[3] -= 0.3 * window4(u, 0.4, 0.65, 0.7, 1)
	if (fromName === 'sit' && toName === 'lie') q.upperBody[1] += 0.8 * window4(u, 0.5, 0.6, 0.65, 0.8)
	return mixPose(old, q, nat)
}

function dogTransition(from, to, time, blend, pose = {}) {
	const path = [from]
	const upright = from === 'stand' || from === 'walk'
	if ((upright && to === 'lie') || (from === 'lie' && to === 'stand')) path.push('sit')
	path.push(to)
	const steps = path.length - 1
	const progress = blend != null ? clamp(blend, 0, 1) * steps : clamp(time / DOG_TRANSITION_STEP, 0, steps)
	const i = Math.min(steps - 1, Math.floor(progress))
	const k = smooth(progress - i)
	// Start of the walk: legs frozen at the stride of the stop (pose.distance), then folded.
	const walkStop = { speed: pose.speed, distance: pose.distance ?? 0, fix: pose.fix, gait: pose.gait }
	const a = dogStatic(path[i], path[i] === 'walk' ? walkStop : {})
	const b = dogStatic(path[i + 1], {})
	const p = dogMixPose(a.p, b.p, progress - i, path[i], path[i + 1], natOf(pose))
	// While it lies down or gets up, the body hollows a little (arc): a bit more life.
	const arc = Math.sin(k * PI) * 0.6
	p.head[1] += arc
	return { p, w: mixWeights(a.w, b.w, k) }
}

function dogBase(pose) {
	const clip = pose.clip ?? 'stand'
	const tr = DOG_TRANSITIONS[clip]
	if (tr) {
		const from = DOG_STATIC[pose.from] || pose.from === 'walk' ? pose.from : tr.from
		const to = tr.to
		return dogTransition(from === to ? tr.from : from, to, pose.time ?? 0, pose.blend, pose)
	}
	const cur = dogStatic(clip, pose)
	if (pose.from && pose.from !== clip && pose.blend != null) {
		const prev = DOG_TRANSITIONS[pose.from]
			? dogTransition(DOG_TRANSITIONS[pose.from].from, DOG_TRANSITIONS[pose.from].to, 99, null)
			: dogStatic(pose.from, pose)
		const k = smooth(pose.blend)
		return { p: dogMixPose(prev.p, cur.p, clamp(pose.blend, 0, 1), pose.from, clip, natOf(pose)), w: mixWeights(prev.w, cur.w, k) }
	}
	return cur
}

/** Deterministic ear twitch: 2.3 s windows, one chance in two of a double shiver. */
function earTwitch(T, seed, nat = 0) {
	const win = 2.3
	const n = Math.floor(T / win)
	const r = { R: 0, L: 0 }
	for (const k of [n - 1, n]) {
		const h = hash(k * 3.17 + seed * 19.3)
		if (h > 0.5) continue
		const start = k * win + hash(k * 7.31 + seed) * (win - 0.4)
		const u = (T - start) / 0.32
		if (u < 0 || u > 1) continue
		// v11: the envelope sin(u pi) |sin(2.5 u pi)| has a corner (|sin|) and does not end at 0 with a zero slope; sin(u pi) sin(3 u pi)^2 does (C2 at both ends).
		const env = nat > 0 ? lerp(Math.sin(u * PI) * Math.abs(Math.sin(u * PI * 2.5)), Math.sin(u * PI) * Math.sin(u * PI * 3) ** 2, nat) : Math.sin(u * PI) * Math.abs(Math.sin(u * PI * 2.5))
		const which = hash(k * 1.93 + seed * 5.1) < 0.5 ? 'R' : 'L'
		r[which] = Math.max(r[which], env)
		if (h < 0.12) r[which === 'R' ? 'L' : 'R'] = Math.max(r[which === 'R' ? 'L' : 'R'], env * 0.7)
	}
	return r
}

// --- life layers (deterministic: functions of T and of the seed, no state) -----------------

const bump = (u) => (u <= 0 || u >= 1 ? 0 : Math.sin(u * PI))

/**
 * Deterministic pseudo-random event: time is cut into windows of `win` s; in each one,
 * an event of `dur` s takes place with probability `prob`, at an instant drawn by hash.
 * Returns { u (0..1 in the event), k (window number), h (draw 0..1) } or null.
 */
function windowEvent(T, win, dur, prob, seed, salt) {
	if (prob <= 0) return null
	const n = Math.floor(T / win)
	for (const k of [n, n - 1]) {
		if (hash(k * 3.71 + seed * 17.9 + salt) >= prob) continue
		const start = k * win + hash(k * 9.13 + seed * 2.7 + salt) * Math.max(0, win - dur)
		const u = (T - start) / dur
		if (u >= 0 && u <= 1) return { u, k, h: hash(k * 1.77 + seed + salt * 3) }
	}
	return null
}

/** Small glances of the head (replace blinking: the model has no eyelids). */
function glance(T, seed, scale = 1) {
	const e = windowEvent(T, 3.6, 1.9, 0.62, seed, 1.3)
	if (!e) return { yaw: 0, pitch: 0 }
	const env = smooth(e.u / 0.18) * (1 - smooth((e.u - 0.7) / 0.3))
	return { yaw: (e.h - 0.5) * 0.7 * env * scale, pitch: (hash(e.k * 4.1 + seed) - 0.55) * 0.14 * env * scale }
}

/** Duration of a sigh (s): inspiration then long expiration, the head droops. */
export const DOG_SIGH_DURATION = 3
/** Envelope of a sigh at progress u (0..1): a = inflated chest, sink = drooping head. */
function sighEnv(u) {
	if (u <= 0 || u >= 1) return { a: 0, sink: 0 }
	const a = u < 0.32 ? smooth(u / 0.32) : 1 - smooth((u - 0.32) / 0.4)
	const sink = smooth((u - 0.32) / 0.25) * (1 - smooth((u - 0.62) / 0.38))
	return { a, sink }
}

/** Direction (scene unit vector) the head looks toward, from the yaw of the body and the MC angles. */
function headForward(bodyYaw, headYRot, headXRot) {
	const wy = bodyYaw - headYRot
	const pu = -headXRot
	return [Math.sin(wy) * Math.cos(pu), Math.sin(pu), Math.cos(wy) * Math.cos(pu)]
}
const wrapPi = (a) => a - TAU * Math.floor((a + PI) / TAU)

/**
 * Gap (degrees) between the direction of the gaze of the head and the head -> camera direction.
 * 0 = the character looks at the camera. If `minDeg` is given and the gap is smaller,
 * the yaw of the head is pushed away from the camera (within its limits); returns the corrected yaw.
 */
function gazeVsCamera(pose, headPos, headYRot, headXRot, camPos, minDeg, yawLimit, fix = 0) {
	const bodyYaw = pose.yaw ?? 0
	const dx = camPos[0] - headPos[0]
	const dy = camPos[1] - headPos[1]
	const dz = camPos[2] - headPos[2]
	const dist = Math.hypot(dx, dy, dz) || 1
	const angleFor = (yr) => {
		const f = headForward(bodyYaw, yr, headXRot)
		return (Math.acos(clamp((f[0] * dx + f[1] * dy + f[2] * dz) / dist, -1, 1)) * 180) / PI
	}
	let yr = headYRot
	let deg = angleFor(yr)
	let avoided = false
	if (minDeg && deg < minDeg) {
		// Pushes the head away from the camera (in yaw) as long as the gap is too small.
		const camYaw = Math.atan2(dx, dz)
		const fwdYaw = bodyYaw - yr
		const d = wrapPi(fwdYaw - camYaw)
		// Direction (in world yaw) that moves away; if it looks almost at the camera, the one where the head has the most travel.
		const reach = (sgn) => Math.abs(wrapPi(bodyYaw + sgn * yawLimit - camYaw))
		const away = Math.abs(d) > 0.3 ? (d >= 0 ? 1 : -1) : reach(1) >= reach(-1) ? 1 : -1
		if (fix > 0) {
			// v11 (fix): the push used to move in steps of 0.03 rad (the head hopped by that much when the gap crossed the minimum); the exact amount is found by bisection: continuous.
			const lim = away > 0 ? yr + yawLimit : yawLimit - yr // how far it may go before the stop (yr moves by -away * s)
			let lo = 0
			let hi = Math.max(0, lim)
			// The push used to start at full strength the moment the gap crossed the minimum (a kink: the head's velocity jumped). The deficit now counts for d * smooth(d / 12 degrees):
			// the push eases in over the first 12 degrees of violation (at most 3.4 degrees of tolerance), C2 at both ends.
			const deficit = minDeg - deg
			const goal = deg + deficit * smooth(deficit / 12)
			if (angleFor(yr - away * hi) < goal) {
				yr -= away * hi // not reachable: as far as it goes
				deg = angleFor(yr)
			} else {
				for (let i = 0; i < 24; i++) {
					const mid = (lo + hi) / 2
					if (angleFor(yr - away * mid) >= goal) hi = mid
					else lo = mid
				}
				yr -= away * hi
				deg = angleFor(yr)
			}
			avoided = true
		} else {
			for (let i = 0; i < 80 && deg < minDeg; i++) {
				const next = yr - away * 0.03 // fwdYaw = bodyYaw - yRot
				if (Math.abs(next) > yawLimit) break
				yr = next
				deg = angleFor(yr)
				avoided = true
			}
		}
	}
	return { yRot: yr, deg, avoided }
}

/**
 * v11 - layers of the dog that read the lagged poses and the written gestures: the steps of the notches, the head that leads a turn, the false spine, the trot of the spin, the tail
 * and the ears that trail, the hops (crouch, extension, tuck, reach, squash). Everything is multiplied by `nat` and by the envelopes of the scene (0 outside their windows).
 */
// v11b: the reach of the legs before a landing. The bisection of the flash of the party at 1440 px (RAPPORT v11b) found that this gesture alone (0.15 / 0.25 rad, on a large light dog) made a fifth
// tile of the frame flash three times a second: halved, the surface that flashes is back to that of the v10b.
const REACH_HIND = 0.075
const REACH_FRONT = 0.125
function dogNatural(p, pose, nat, { sit, lie, ly, lx, eye, dogLook }) {
	const lag = pose.lag
	const standing = 1 - Math.max(sit, lie)
	p.rightFrontLeg[3] -= 0.45 * clamp(pose.pawR ?? 0, 0, 1) * nat
	p.leftFrontLeg[3] -= 0.45 * clamp(pose.pawL ?? 0, 0, 1) * nat
	if (lag?.behind && lag?.ahead) {
		const dt = (lag.dtBehind ?? 0.08) + (lag.dtAhead ?? 0.08)
		const yaw = pose.yaw ?? 0
		const rate = (wrapPi((lag.ahead.yaw ?? yaw) - yaw) + wrapPi(yaw - (lag.behind.yaw ?? yaw))) / dt
		const lookW = clamp(pose.lookWeight ?? (pose.lookAt ? 1 : 0), 0, 1)
		// The head leads a turn; the mane leads the hindquarters (a false spine); the legs trot when it spins on its feet (the phase is 2 yaw: it wraps at 2 pi).
		const dY = 0.7 * Math.tanh(wrapPi((lag.ahead.yaw ?? yaw) - yaw) / 0.7)
		// v11b: `leadMute` (0..1, written by the scene over the whirl of the party) takes the lead of the head and the false spine away: on a light dog in a tall frame (820 px) they made two more
		// tiles flash three times a second (RAPPORT v11b, flash at 820); everywhere else the dog turns with them.
		const leadK = 1 - clamp(pose.leadMute ?? 0, 0, 1)
		p.head[4] -= 0.35 * dY * (1 - 0.6 * lookW) * nat * leadK
		const sp = 0.12 * Math.tanh((0.02 * rate) / 0.12) * nat * leadK
		p.upperBody[4] -= sp
		p.body[4] += sp
		// The legs trot in turn when it turns on its feet (`trot` -1..1, written by the scene over each turn): diagonal pairs, 0.3 rad.
		const c = 0.2 * clamp(pose.trot ?? 0, -1, 1) * standing * nat
		p.rightHindLeg[3] += c
		p.leftFrontLeg[3] += c
		p.leftHindLeg[3] -= c
		p.rightFrontLeg[3] -= c
		// The tail swings against a turn of the body (it trails by 0.08 s).
		p.tail[4] -= nat * 0.3 * Math.tanh((1.5 * wrapPi(yaw - (lag.behind.yaw ?? yaw))) / 0.3) // soft saturation (a clamp has corners)
		// The ears trail the head: they follow what the head did 0.08 s ago.
		if (pose.lookAt) {
			const [lyB, lxB] = lookAngles({ ...lag.behind, fix: pose.fix }, eye, dogLook)
			const eyaw = 0.25 * Math.tanh((0.5 * (ly - lyB)) / 0.25) * nat
			const epit = 0.25 * Math.tanh((0.6 * (lx - lxB)) / 0.25) * nat
			p.earR[5] += eyaw
			p.earL[5] += eyaw
			p.earR[3] -= epit
			p.earL[3] -= epit
		}
	}
	const pre = clamp(pose.hopPre ?? 0, 0, 1) * nat
	const ext = clamp(pose.hopExt ?? 0, 0, 1) * nat
	const fold = clamp(pose.hopFold ?? 0, 0, 1) * nat
	const reach = clamp(pose.hopReach ?? 0, 0, 1) * nat
	const land = (pose.hopLand ?? 0) * nat
	if (pre || ext || fold || reach || land) {
		p.upperBody[3] += 0.12 * pre
		p.upperBody[1] += 0.6 * pre + 0.6 * land
		p.head[3] += 0.1 * pre
		p.rightHindLeg[3] += 0.35 * ext - 0.3 * fold + REACH_HIND * reach
		p.leftHindLeg[3] += 0.35 * ext - 0.3 * fold + REACH_HIND * reach
		p.rightFrontLeg[3] += -0.32 * ext + 0.15 * fold - REACH_FRONT * reach + 0.08 * land
		p.leftFrontLeg[3] += -0.32 * ext + 0.15 * fold - REACH_FRONT * reach + 0.08 * land
		p.body[1] += 0.8 * land
		p.head[1] += 0.3 * land
		p.earR[3] -= 0.35 * land
		p.earL[3] -= 0.35 * land
	}
}

export function createDog({ texture, collarTexture, collarColor = 0xb02e26, seed = 1, keepSkinColor = false } = {}) {
	prepareTexture(texture)
	prepareTexture(collarTexture)
	const [tw, th] = texSize(texture, 64, 32)
	const [cw, ch] = texSize(collarTexture, 64, 32)
	const skinMat = makeMaterial('dog / wolf_tame', texture)
	skinMat.userData.mmRole = 'skin'
	// v5 (brief b2): the skin may be excluded from the forgetting like the collar (the scene also marks it itself).
	if (keepSkinColor) skinMat.userData.mmKeepColor = true
	rememberBase(skinMat)
	const fade = makeFade([tw, th], 0.9)
	fade.install(skinMat)
	const layers = { main: [{ material: skinMat, texW: tw, texH: th, flipY: !!texture?.flipY }] }
	let collarMat = null
	if (collarTexture) {
		// WolfCollarLayer: same model, collar texture, tint DyeColor.getTextureDiffuseColor (sRGB).
		collarMat = makeMaterial(DOG_COLLAR_MATERIAL, collarTexture, { polygonOffset: true })
		collarMat.color.setHex(collarColor)
		rememberBase(collarMat)
		// Contract v4: the collar keeps its colour during the forgetting (look.js excludes `mmKeepColor`).
		collarMat.userData.mmKeepColor = true
		collarMat.userData.mmRole = 'collar'
		fade.install(collarMat)
		layers.main.push({ material: collarMat, texW: cw, texH: ch, flipY: !!collarTexture.flipY, renderOrder: 1 })
	}
	const { object3d, model } = makeRoot('dog')
	const parts = {}
	const geometries = new Map()
	buildParts(DOG_SPEC, model, layers, parts, geometries)
	const _v = new THREE.Vector3()
	const materials = [skinMat, collarMat]
	/** Last computed values (read-only, for the host and the probe). */
	const live = { exhale: 0, sigh: 0, sniff: 0, gazeDeg: null, avoided: false, lie: 0, sit: 0, stir: 0, swish: 0 }

	function update(state, pose = {}) {
		placeRoot(object3d, pose)
		fade.apply(object3d, pose.fade)
		const T = pose.t ?? state?.t ?? pose.time ?? 0
		const { p, w } = dogBase(pose)
		const lie = w.lie
		const sit = w.sit
		const life = clamp(pose.life ?? 1, 0, 1)
		const nat = natOf(pose)

		// Wait (wait 0..1): alert -> sitting that slumps -> lying, head on the paws. The explicit
		// fields (alert, sad, rest) win. Without `wait`, none of these layers is active.
		const wait = pose.wait == null ? null : clamp(pose.wait, 0, 1)
		const sad = Math.max(clamp(pose.sad ?? 0, 0, 1), wait == null ? 0 : 0.85 * smooth((wait - 0.2) / 0.45))
		const alert = clamp(pose.alert ?? (wait == null ? 0 : 1 - smooth(wait / 0.3)), 0, 1)
		const rest = clamp(pose.rest ?? (wait == null ? 0 : smooth((wait - 0.62) / 0.28)), 0, 1)
		const headUp = clamp(pose.headUp ?? 0, 0, 1)
		// v4: it wants to follow (eager), it obeys (obey), it really raises its head toward its master (lookUp).
		const eager = clamp(pose.eager ?? 0, 0, 1)
		const obey = clamp(pose.obey ?? 0, 0, 1)
		const lookUp = clamp(pose.lookUp ?? 0, 0, 1)
		// v4: lying, it sleeps, it is not dead. Head lifts (stir) and tail sweeps (swish), automatic
		// (restless, cut by headUp) or forced by the host. Everything is drawn from T: a frozen T freezes the event.
		const restless = clamp(pose.restless ?? 1, 0, 1) * lie * (1 - headUp) * life
		let stirU = null
		let stirSide = pose.stirSide ?? 0.6
		let stirAmp = lie
		if (pose.stir != null) stirU = pose.stir
		else if (pose.stirAt != null) stirU = (T - pose.stirAt) / DOG_STIR_DURATION
		else if (restless > 0) {
			const e = windowEvent(T, 7, DOG_STIR_DURATION, 0.7, seed, 11.3)
			if (e) {
				stirU = e.u
				stirSide = (e.h - 0.5) * 2
				stirAmp = restless * (0.65 + 0.35 * hash(e.k * 2.9 + seed))
			}
		}
		const stirE = stirU != null && stirU > 0 && stirU < 1 ? stirAmp * smooth(stirU / 0.22) * (1 - smooth((stirU - 0.68) / 0.32)) : 0
		let swishU = null
		// v5: the sweep also applies sitting (the tail resting on the ground behind it sweeps the snow): amplitude = lying or sitting.
		let swishAmp = Math.max(lie, sit)
		// v5: sitting during the wait (pose.wait, set by the host during the absence only), rare and slow automatic sweeps:
		// "it waits, it is not dead". Cut by restless 0 (calm dawn, rewind); never at the freezes
		// (no `wait` in the poses of the evening), nor when the host asks for tail: 'still' (right after the departure).
		const restlessSit = pose.wait == null || pose.tail === 'still' ? 0 : clamp(pose.restless ?? 1, 0, 1) * sit * (1 - lie) * life
		if (pose.swish != null) swishU = pose.swish
		else if (pose.swishAt != null) swishU = (T - pose.swishAt) / DOG_SWISH_DURATION
		else if (restless > 0) {
			const e = windowEvent(T, 4.1, DOG_SWISH_DURATION, 0.7, seed, 13.7)
			if (e) {
				swishU = e.u
				swishAmp = restless * (e.h < 0.5 ? 1 : -1)
			}
		} else if (restlessSit > 0) {
			const e = windowEvent(T, DOG_SIT_SWISH_WINDOW, DOG_SWISH_DURATION, 0.75, seed, 17.9)
			if (e) {
				swishU = e.u
				swishAmp = 0.8 * restlessSit * (e.h < 0.5 ? 1 : -1)
			}
		}
		const swishE = swishU != null && swishU > 0 && swishU < 1 ? swishAmp * Math.sin(swishU * PI) ** 2 : 0
		const lift = Math.max(headUp, 0.6 * alert * lie, 0.85 * Math.abs(stirE)) // head raised, lying
		const perk = Math.max(alert, headUp, eager, 0.7 * Math.abs(stirE)) * (1 - obey) // ears up
		const lookW = clamp(pose.lookWeight ?? (pose.lookAt ? 1 : 0), 0, 1)

		// Sigh: forced (sigh = progress 0..1, or sighAt = start instant T) or automatic at the end of the wait.
		let sighU = null
		if (pose.sigh != null) sighU = pose.sigh
		else if (pose.sighAt != null) sighU = (T - pose.sighAt) / DOG_SIGH_DURATION
		else if (wait != null) {
			const e = windowEvent(T, 10.4, DOG_SIGH_DURATION, 0.85 * smooth((wait - 0.45) / 0.3) * life, seed, 7.7)
			if (e) sighU = e.u
		}
		const sig = sighEnv(sighU ?? -1)

		// Breathing: rib cage (body + mane) that swells, 3.2 s cycle.
		// v11 (fix): the walk lowers the breathing to 0.4; the factor used to switch with the clip (a jump of the head at every stop). It now follows the stride envelope.
		const walkBreath = pose.clip === 'walk' ? (pose.fix > 0 && pose.gait != null ? lerp(1, 0.4, clamp(pose.gait, 0, 1)) : 0.4) : 1
		const breathAmp = (pose.breath ?? 1) * walkBreath
		const bph = 0.5 - 0.5 * Math.cos((TAU * T) / 3.2)
		const girth = 1 + breathAmp * bph * (0.035 + 0.05 * lie) + sig.a * 0.035
		p.upperBody[6] *= girth
		p.upperBody[8] *= girth
		p.body[6] *= 1 + (girth - 1) * 0.8
		p.body[8] *= 1 + (girth - 1) * 0.8
		p.head[1] += breathAmp * bph * (0.12 + 0.1 * lie)
		// Lying: the back rises with the breath (v4, "it is not dead"), the head follows a little.
		p.upperBody[1] -= breathAmp * bph * 0.45 * lie
		p.body[1] -= breathAmp * bph * 0.3 * lie

		// Sad head: low, slightly set back; lying, it stays on the paws.
		p.head[3] += sad * (0.42 * (1 - lie) + 0.08 * lie)
		p.head[1] += sad * 1.1 * (1 - lie)
		p.head[2] += sad * 0.4 * (1 - lie)
		// v9 final pass: `sadFace` (0..1) is the close-up look only (the visitor sees the dog from the front): the head dips further and the ears droop OUTWARD
		// (seen from the front, ears pulled back are invisible). A separate field, so that every other `sad` of the film (v8b equivalence) is unchanged.
		const sadFace = clamp(pose.sadFace ?? 0, 0, 1)
		p.head[3] += 0.2 * sadFace * (1 - lie)
		p.head[1] += 0.5 * sadFace * (1 - lie)

		// Alert: head high, a little backward; lying, the head lifts from the paws (headUp).
		p.head[1] -= 1.1 * alert * (1 - lie)
		p.head[3] -= 0.1 * alert * (1 - lie)
		p.head[1] -= 3.2 * lift
		p.head[2] -= 0.5 * lift
		p.head[3] -= 0.32 * lift
		p.upperBody[3] -= 0.16 * lift
		p.upperBody[1] -= 0.6 * lift
		// Rest: cheek on the paws (not during a head lift).
		const restK = rest * lie * (1 - Math.abs(stirE))
		p.realHead[5] += 0.2 * restK
		p.head[1] += 0.5 * restK
		p.head[3] += 0.06 * restK
		// Head lift (stir): it looks aside, then rests.
		p.head[4] += stirSide * 0.45 * stirE
		// Lying, head toward the ember: the chest rises further (v4).
		p.upperBody[1] -= 0.8 * headUp * lie
		p.head[1] -= 0.9 * headUp * lie
		// It wants to follow (eager): weight forward, head high and tense, a front paw stomping.
		if (eager > 0) {
			const e = eager * (1 - lie)
			p.head[1] -= 1.1 * e
			p.head[2] -= 0.7 * e
			p.head[3] -= 0.12 * e
			p.upperBody[2] -= 0.45 * e
			p.body[2] -= 0.3 * e
			const paw = Math.sin(TAU * 1.5 * T)
			// v11: max(0, sin) has a corner; its square (same peak) does not (C1, the acceleration stays under 60 rad/s2).
			const pawR = nat > 0 ? lerp(Math.max(0, paw), Math.max(0, paw) ** 2, nat) : Math.max(0, paw)
			const pawL = nat > 0 ? lerp(Math.max(0, -paw), Math.max(0, -paw) ** 2, nat) : Math.max(0, -paw)
			p.rightFrontLeg[3] -= 0.6 * e * pawR * (1 - sit)
			p.leftFrontLeg[3] -= 0.35 * e * pawL * (1 - sit)
		}
		// It obeys (obey): the head bows, a little low, while it sits back down.
		p.head[1] += 0.8 * obey
		p.head[3] += 0.28 * obey
		// It really raises its head toward its master (lookUp): neck stretched.
		p.head[1] -= 0.7 * lookUp * (1 - lie)
		p.head[2] -= 0.3 * lookUp * (1 - lie)
		// Sigh: the head droops after the expiration.
		p.head[1] += 1.8 * sig.sink * (1 - 0.5 * lie) - 0.5 * sig.a
		p.head[3] += 0.1 * sig.sink

		// Life: small glances, slow drift of the head, sweeping toward the door when it is alert.
		const g = glance(T, seed, life * (1 - lookW) * (1 - 0.7 * lie * (1 - lift)))
		p.head[4] += g.yaw + Math.sin(T * 0.37 + seed) * 0.025 * life + Math.sin(T * 0.9 + seed) * 0.22 * alert * (1 - lookW) * life
		p.head[3] += g.pitch + Math.sin(T * 0.29 + seed * 2) * 0.015 * life

		// Gaze (headLook). Sitting, Minecraft limits the pitch to 20 deg.
		const hp = p.head
		const eye = modelToLocal(hp[0] + 1, hp[1] - 0.5, hp[2] - 3)
		const dogLook = {
			yaw: 1.2,
			// Sitting or lying, Minecraft limits the pitch to 20 deg; v4: lookUp (sitting) and headUp (lying) open it
			// to aim at the standing master or the suspended ember.
			up:
				pose.fix > 0
					? // v11 (fix): the limit follows the posture continuously (the 0.5 threshold made the head pitch jump by 8.5 degrees in the middle of every sit / stand).
						lerp(0.6, lerp(0.35, lerp(0.75, 0.8, lie), Math.max(lookUp * (1 - lie), headUp * lie)), smooth(Math.max(sit, lie)))
					: sit > 0.5 || lie > 0.5
						? lerp(0.35, lie > 0.5 ? 0.8 : 0.75, Math.max(lookUp * (1 - lie), headUp * lie))
						: 0.6,
			down: 0.6,
		}
		const [ly, lx] = lookAngles(pose, eye, dogLook)
		p.head[4] += ly
		p.head[3] += lx * (1 - 0.5 * sad)
		// Head tilted "interested" (getHeadRollAngle), plus a small roll when it turns hard.
		p.realHead[5] += clamp(pose.tilt ?? 0, 0, 1) * 0.15 * PI

		// Gaze never toward the camera: measure (always, if the camera is known) and correction (avoidCamera = minimum gap in deg).
		const camPos = pose.cameraPos ?? (state?.camera?.position ? state.camera.position.toArray() : null)
		live.gazeDeg = null
		live.avoided = false
		if (camPos && pose.position) {
			const pos = pose.position
			const c = Math.cos(pose.yaw ?? 0)
			const sn = Math.sin(pose.yaw ?? 0)
			const headW = [pos[0] + c * eye[0] + sn * eye[2], pos[1] + eye[1], pos[2] - sn * eye[0] + c * eye[2]]
			const r = gazeVsCamera(pose, headW, p.head[4], p.head[3], camPos, pose.avoidCamera, 1.2, pose.fix > 0 ? 1 : 0)
			p.head[4] = r.yRot
			live.gazeDeg = r.deg
			live.avoided = r.avoided
		}

		// Ears: back and apart if sad, up when alert, twitches from time to time,
		// and a light flutter in the wind (state.wind).
		const tw2 = earTwitch(T, seed, nat)
		const twk = clamp(pose.earTwitch ?? 1, 0, 1)
		const windK = clamp(state?.wind ?? 0, 0, 1) * life
		const earBack = (-0.65 * sad - 0.2 * lie - 0.25 * restK - 0.15 * sig.sink) * (1 - perk) - 0.5 * obey
		const earMicro = (ph) => life * Math.sin(T * 0.8 + ph) * 0.05
		p.earR[3] += earBack - 0.55 * tw2.R * twk + 0.2 * perk + earMicro(seed) + windK * 0.09 * Math.sin(TAU * 1.9 * T + seed)
		p.earL[3] += earBack - 0.55 * tw2.L * twk + 0.2 * perk + earMicro(seed * 2.3) + windK * 0.09 * Math.sin(TAU * 1.7 * T + seed * 1.9)
		p.earR[5] += -0.3 * sad - 0.25 * tw2.R * twk + 0.1 * perk - 0.55 * sadFace
		p.earL[5] += 0.3 * sad + 0.25 * tw2.L * twk - 0.1 * perk + 0.55 * sadFace

		// Muzzle: sniffing in bursts (more frequent in the wind), which stop with a frozen pose.t.
		const sniffAmp = clamp(pose.sniff ?? 1, 0, 2) * life
		const burst = windowEvent(T, 4.4, 1.4, clamp(0.3 + 0.7 * windK, 0, 1) * (sniffAmp > 0 ? 1 : 0), seed, 5.1)
		// v11: sqrt(bump) has an infinite slope at both ends of a sniffing burst (a C1 break of the muzzle); a quintic window does not.
		const sEnv = burst ? lerp(Math.sqrt(bump(burst.u)), window4(burst.u, 0, 0.25, 0.75, 1), nat) : 0
		p.snout[3] += (Math.sin(TAU * 5.3 * T) * sEnv * 0.07 - 0.03 * sEnv) * sniffAmp + 0.04 * sig.sink + windK * 0.015 * Math.sin(TAU * 3.1 * T)
		p.snout[4] += Math.cos(TAU * 3.3 * T) * sEnv * 0.03 * sniffAmp
		p.head[3] -= 0.05 * sEnv * sniffAmp

		// Tail: wag / low / still / explicit angle. Default: low if sad, otherwise a light sway.
		const tail = pose.tail ?? (sad > 0.5 ? 'low' : alert > 0.5 ? 'still' : 'idle')
		let lowK = tail === 'low' ? 1 : sad
		// v11 (fix): the host gives the weight of the low tail (`tailLow`, 0..1) instead of switching the regime by a threshold of `sad` in the middle of a continuous shot.
		const tailLow = pose.fix > 0 && pose.tailLow != null && (tail === 'low' || tail === 'still') ? clamp(pose.tailLow, 0, 1) : null
		if (tailLow != null) lowK = lerp(sad, 1, tailLow)
		// Sitting, the tail starts lower (y = 21 px): "low" = resting on the ground behind, not inside it.
		const lowAngle = lerp(TAIL_LOW, 1.36, sit)
		if (typeof tail === 'number') p.tail[3] = lerp(p.tail[3], Math.max(tail, sit * 1.36), 1 - lie)
		else p.tail[3] = lerp(p.tail[3], lerp(p.tail[3], lowAngle, lowK), 1 - lie)
		const wagAmp = clamp(pose.wagAmp ?? 1, 0, 1) * (1 - 0.8 * obey) * (1 + 0.35 * eager)
		if (tail === 'wag') {
			const ph = TAU * 2.6 * T
			p.tail[4] += Math.sin(ph) * (0.55 - 0.25 * lie) * wagAmp
			if (nat > 0) {
				// v11: a whip (a second harmonic, about a fifth of the first; a quarter flashed too much in the party at 820 px) and the hips that answer a strong beat, instead of a pure sine on a rigid back.
				p.tail[4] += nat * 0.12 * Math.sin(2 * ph + 0.6) * (0.55 - 0.25 * lie) * wagAmp
				p.body[4] -= nat * 0.04 * Math.sin(ph) * wagAmp * (1 - lie)
			}
		}
		else if (tail === 'idle') p.tail[4] += Math.sin(TAU * 0.35 * T) * 0.09 * (1 - lie)
		else if (tail === 'low') p.tail[4] += Math.sin(TAU * 0.25 * T) * 0.04 * (1 - lie) * (tailLow == null ? 1 : tailLow)
		else if (tailLow != null && tail === 'still') p.tail[4] += Math.sin(TAU * 0.25 * T) * 0.04 * (1 - lie) * tailLow
		p.tail[3] += 0.2 * eager * (1 - lie) // it wants to follow: high tail
		if (lie > 0) p.tail[4] += lie * 0.55 // lying, the tail curls to the side
		// Lying: a slow tail sweep over the ground (swish), and a small movement during a head lift.
		p.tail[4] += 0.5 * swishE * (1 + 0.3 * sit * (1 - lie)) + 0.12 * stirE * Math.sin(TAU * 0.8 * T)
		p.tail[3] -= 0.12 * Math.abs(swishE) * lie
		// A single beat (tailBeat = instant T, or tailBeatU = progress): the dog recognises someone.
		// v4: ONE back and forth, tail slightly raised (in v3: 2.5 beats over 1.3 s).
		const beatU = pose.tailBeatU ?? (pose.tailBeat != null ? (T - pose.tailBeat) / DOG_TAIL_BEAT_DURATION : null)
		if (beatU != null && beatU > 0 && beatU < 1) {
			const env = Math.sin(beatU * PI) ** 0.6
			p.tail[4] += Math.sin(TAU * beatU) * 0.75 * env * (1 - 0.3 * lie)
			p.tail[3] += 0.25 * env * (1 - lie)
		}
		if (nat > 0) dogNatural(p, pose, nat, { sit, lie, ly, lx, eye, dogLook })
		if (pose.mocap) applyClipLayers(p, pose.mocap)
		applyGlow(materials, pose.glow, { tint: pose.glowTint, kind: 'dog' })

		applyPose(parts, p)

		live.exhale = Math.max(0, -Math.sin((TAU * T) / 3.2)) * breathAmp * 0.7 + sig.sink * 0.9
		live.sigh = sig.a
		live.sniff = sEnv * sniffAmp
		live.lie = lie
		live.sit = sit
		live.stir = stirE
		live.swish = swishE
	}

	update(null, { clip: 'stand', time: 0 })

	/** World anchor points (for the breath mist, the particles): 'mouth', 'head', 'tail'. */
	function anchor(name, out = new THREE.Vector3()) {
		object3d.updateMatrixWorld(true)
		const local = { mouth: [parts.snout, [0, 1.2, -4]], head: [parts.realHead, [0, 0, -1]], tail: [parts.realTail, [0, 8, 0]] }[name]
		if (!local) return out.set(NaN, NaN, NaN)
		_v.set(local[1][0] / 16, local[1][1] / 16, local[1][2] / 16)
		return out.copy(_v).applyMatrix4(local[0].group.matrixWorld)
	}

	function dispose() {
		for (const g of geometries.values()) g.dispose()
		skinMat.dispose()
		collarMat?.dispose()
		object3d.removeFromParent()
	}

	return { object3d, update, parts, dispose, anchor, live, materials: { skin: skinMat, collar: collarMat } }
}

// ==============================================================================================
// Player
// ==============================================================================================

function playerSpec(slim) {
	const arm = slim ? 3 : 4
	return [
		{
			name: 'head',
			cubes: {
				main: [{ uv: [0, 0], from: [-4, -8, -4], size: [8, 8, 8] }],
				overlay: [{ uv: [32, 0], from: [-4, -8, -4], size: [8, 8, 8], grow: 0.5 }],
			},
		},
		{
			name: 'body',
			cubes: {
				main: [{ uv: [16, 16], from: [-4, 0, -2], size: [8, 12, 4] }],
				overlay: [{ uv: [16, 32], from: [-4, 0, -2], size: [8, 12, 4], grow: 0.25 }],
			},
		},
		{
			name: 'rightArm',
			cubes: {
				main: [{ uv: [40, 16], from: [slim ? -2 : -3, -2, -2], size: [arm, 12, 4] }],
				overlay: [{ uv: [40, 32], from: [slim ? -2 : -3, -2, -2], size: [arm, 12, 4], grow: 0.25 }],
			},
		},
		{
			name: 'leftArm',
			cubes: {
				main: [{ uv: [32, 48], from: [-1, -2, -2], size: [arm, 12, 4] }],
				overlay: [{ uv: [48, 48], from: [-1, -2, -2], size: [arm, 12, 4], grow: 0.25 }],
			},
		},
		{
			name: 'rightLeg',
			cubes: {
				main: [{ uv: [0, 16], from: [-2, 0, -2], size: [4, 12, 4] }],
				overlay: [{ uv: [0, 32], from: [-2, 0, -2], size: [4, 12, 4], grow: 0.25 }],
			},
		},
		{
			name: 'leftLeg',
			cubes: {
				main: [{ uv: [16, 48], from: [-2, 0, -2], size: [4, 12, 4] }],
				overlay: [{ uv: [0, 48], from: [-2, 0, -2], size: [4, 12, 4], grow: 0.25 }],
			},
		},
	]
}

export const PLAYER_CLIPS = ['walk', 'idle', 'afk', 'lookAt', 'sit', 'sit_down', 'stand_up', 'sneak', 'swing', 'wave', 'stay', 'point']
/** Layers and clips v4 of the player (the scene merges this list with its own detections). */
export const PLAYER_FEATURES = ['stay', 'glow', 'glowTint', 'type', 'gui', 'sneakK', 'waveK', 'nat', 'walkWeight', 'stepTurn', 'mocap']
/** v8: plane of the held screen (blocks), in front of the chest; the scene and the host (player.front) use the same values. */
// v8 (control pass): the aimed plane rises a little toward the panel that is seen (above the head of Efe): 1.3 blocks high, 0.5 in front (before: 1.0 and 0.6, the hand aimed at the chest). Higher
// (>= 1.5) the hand saturates the upper limit of `armAim` and no longer follows the cursor in height (T5: "the cursor does not move the hand").
export const GUI_PLANE = Object.freeze({ forward: 0.5, height: 1.3, w: 0.3, h: 0.2 })
/** Default duration (s) of the "stay" gesture (clip 'stay'): arm extended, push of the hand, return. */
export const PLAYER_STAY_TIME = 0.9
const PLAYER_WALK_SPEED = 4.317
/** Duration (s) of sit_down / stand_up. */
export const PLAYER_SIT_TIME = 1.2
/** Height of the seat above the ground (blocks): top of the cushion of the Handcrafted bench, measured in S0.glb. */
export const PLAYER_SEAT_DEFAULT = 0.75
/** Hip of the model above the feet (12 px x scale 0.9375) and half thickness of the thigh (2 px x 0.9375). */
const HIP_HEIGHT = (12 * 0.9375) / 16
const THIGH_HALF = (2 * 0.9375) / 16
/**
 * Render offset of the crouch in the game (PlayerRenderer.getRenderOffset: -2/16 of a block). The literal port
 * sinks the feet by 0.14 block into the ground: default 0 (feet on the ground), `sneakDrop: 0.125` gives the vanilla value back.
 */
export const PLAYER_SNEAK_DROP_VANILLA = 2 / 16
/** Default duration (s) of a swing movement (vanilla: 6 ticks; here slower, care gesture). */
export const PLAYER_SWING_TIME = 0.8

function playerStand(slim) {
	const ay = slim ? 2.5 : 2
	return {
		head: P(0, 0, 0),
		body: P(0, 0, 0),
		rightArm: P(-5, ay, 0),
		leftArm: P(5, ay, 0),
		rightLeg: P(-1.9, 12, 0, 0, 0.005, 0.005),
		leftLeg: P(1.9, 12, 0, 0, -0.005, -0.005),
	}
}

/**
 * Leans the upper body forward by `a` rad keeping the hips in place (pivot at y = 12 px):
 * the body turns around the neck in the model, so the head, torso and shoulders are moved accordingly.
 */
function leanUpper(p, a) {
	if (!a) return
	const c = Math.cos(a)
	const s = Math.sin(a)
	const dy = 12 * (1 - c)
	const dz = -12 * s
	p.body[1] += dy
	p.body[2] += dz
	p.body[3] += a
	p.head[1] += dy
	p.head[2] += dz
	p.head[3] -= 0.6 * a // the head stays about level
	for (const key of ['rightArm', 'leftArm']) {
		const y0 = p[key][1]
		const z0 = p[key][2]
		p[key][1] = y0 * c - z0 * s + dy
		p[key][2] = y0 * s + z0 * c + dz
		p[key][3] += a
	}
}

/** HumanoidModel.setupAnim, `crouching` branch (vanilla values), offset from the shoulder of the thin arms. */
function crouchPose(slim) {
	const p = playerStand(slim)
	const ay = slim ? 2.5 : 2
	p.body[3] = 0.5
	p.rightArm[3] += 0.4
	p.leftArm[3] += 0.4
	p.rightLeg[2] = 4
	p.leftLeg[2] = 4
	p.rightLeg[1] = 12.2
	p.leftLeg[1] = 12.2
	p.head[1] = 4.2
	p.body[1] = 3.2
	p.rightArm[1] = ay + 3.2
	p.leftArm[1] = ay + 3.2
	return p
}

// ----------------------------------------------------------------------------------------------
// v11 - the "natural" pass (pose.nat, 0..1). Principles: anticipation, overlap (a part follows or leads another), arcs, weight, secondary motion. Every layer is a pure function
// of the pose (and of the two lagged poses `pose.lag.behind` / `pose.lag.ahead` that the scene computes at t -/+ 0.08 s). Each block runs only if nat > 0 and is mixed with the v10b
// value by `nat`: at 0 the expressions are those of v10b, untouched (the freezes are identical to the pixel).
// ----------------------------------------------------------------------------------------------
const natOf = (pose) => (pose.nat > 0 ? clamp(pose.nat, 0, 1) : 0)
/** Crouch share with the anticipation (a small rise first) and the settle (a slight overshoot, then rest) of the crouch of the game, as a pure function of k. */
const shapeK = (k, over, ant) => k + over * Math.sin(PI * clamp((k - 0.55) / 0.45, 0, 1)) ** 2 - ant * Math.sin(PI * clamp(k / 0.35, 0, 1)) ** 2
/** Mixes two poses part by part: ks[part] is the share of b for that part (default ks.all). */
function mixPoseParts(a, b, ks) {
	const out = {}
	for (const key of Object.keys(a)) {
		const k = ks[key] ?? ks.all ?? 0
		out[key] = a[key].map((v, i) => lerp(v, (b[key] ?? a[key])[i], k))
	}
	return out
}
/** Twists the upper body (body, head, arms) about the spine by `a` rad (positive: toward the character's right). The arms follow on their lateral offset. */
function twistUpper(p, a) {
	if (!a) return
	const c = Math.cos(a)
	const s = Math.sin(a)
	for (const key of ['rightArm', 'leftArm']) {
		const x = p[key][0]
		const z = p[key][2]
		p[key][0] = x * c + z * s
		p[key][2] = -x * s + z * c
		p[key][4] += a
	}
	p.body[4] += a
	p.head[4] += a
}
const E = EASE.inOut
const stage = (prog, a, b) => E(clamp((prog - a) / (b - a), 0, 1))
// Lean of the trunk while sitting down: forward first (anticipation), back up, a slight lean back, rest. Stand up: forward first, then straight with a 3 % overshoot.
const LEAN_SIT = track([[0, 0], [0.32, 0.34, 'inOut'], [0.7, 0.1, 'inOut'], [0.88, -0.04, 'inOut'], [1, 0, 'inOut']])
const LEAN_STAND = track([[0, 0], [0.3, 0.32, 'inOut'], [0.72, 0.1, 'inOut'], [0.9, -0.03, 'inOut'], [1, 0, 'inOut']])
/**
 * Sitting down / getting up in stages (v11). `prog` 0..1 is the progress of the clip. Sitting: the arms reach first, the trunk leans forward (anticipation), the hips and the legs follow,
 * the head arrives last; the trunk rises with a slight lean back. Getting up: the arms and the lean come first (the weight goes forward), the legs push, the head and the hips follow.
 */
function sitStaged(pose, slim, prog, down) {
	const st = playerStand(slim)
	const seated = sitTarget(slim, pose)
	// share of the seated pose for each part
	let ks
	if (down) ks = { rightArm: stage(prog, 0, 0.6), leftArm: stage(prog, 0.04, 0.64), body: stage(prog, 0, 0.7), rightLeg: stage(prog, 0.25, 0.85), leftLeg: stage(prog, 0.28, 0.88), head: stage(prog, 0.3, 1) }
	else ks = { rightArm: 1 - stage(prog, 0, 0.5), leftArm: 1 - stage(prog, 0.04, 0.54), body: 1 - stage(prog, 0, 0.7), rightLeg: 1 - stage(prog, 0.3, 0.8), leftLeg: 1 - stage(prog, 0.33, 0.83), head: 1 - stage(prog, 0.2, 0.8) }
	const p = mixPoseParts(st, seated, ks)
	const kHips = down ? stage(prog, 0.2, 0.85) : 1 - stage(prog, 0.3, 0.9)
	const swing = Math.sin(prog * PI) ** 2 // squared: it starts and ends with a zero velocity
	p.rightArm[3] -= 0.3 * swing
	p.leftArm[3] -= 0.3 * swing
	leanUpper(p, (down ? LEAN_SIT : LEAN_STAND)(prog))
	// v11b (blind test: "from standing to sitting, and back, all at once"): the weight is transferred and settles. Sitting: the hips sink 0.05 block into the seat over the last fifth
	// and come back (the settling), the head nods with the impact and the arms rebound. Getting up: the
	// weight goes onto one side (a roll of 3 degrees) and the hips sink 0.03 block before the legs push.
	let dip = 0
	if (down) {
		const u = clamp((prog - 0.78) / 0.22, 0, 1)
		dip = 0.05 * Math.sin(PI * u) ** 2
		p.head[3] += 1.7 * dip
		p.rightArm[3] -= 2.4 * dip
		p.leftArm[3] -= 2.4 * dip
	} else {
		const u = clamp(prog / 0.4, 0, 1)
		const sway = Math.sin(PI * u) ** 2
		p.body[5] += 0.05 * sway
		dip = 0.03 * sway
	}
	return { p, lift: seatLift(pose) * kHips - dip, back: seatBack(pose) * kHips }
}

/** The crouch, staged: the hips and the trunk lead (with the anticipation and the settle), the head follows by 0.06 s, the arms by 0.08 s (the lagged pose gives the delay). */
function crouchStaged(pose, slim, k) {
	const kb = pose.lag?.behind ? clamp(pose.lag.behind.sneakK ?? 0, 0, 1) : k
	const kS = shapeK(k, 0.07, 0.1)
	return mixPoseParts(playerStand(slim), crouchPose(slim), { all: kS, rightArm: shapeK(kb, 0.05, 0.05), leftArm: shapeK(kb, 0.05, 0.05), head: shapeK(lerp(k, kb, 0.75), 0.05, 0.08) })
}

// Placing a log on the fire (clip 'swing'): the arm goes back a little (anticipation), comes forward and down with an arc, holds, returns; no root-of-f start (the v10b stroke
// started at full speed: a 0.375 rad jump of the arm in one frame). Amplitudes keep every joint under 15 rad/s and 360 rad/s2.
const OB05 = EASE.outBack(0.05)
const OB08 = EASE.outBack(0.08, 0.55)
const PLACE_ARM = track([[0, 0], [0.25, 0.1, 'inOut'], [0.6, -0.75, 'inOut'], [1, 0, 'inOut']])
const PLACE_SWAY = track([[0, 0], [0.5, 1, 'inOut'], [1, 0, 'inOut']])
function placePose(p, f, left) {
	if (f <= 0 || f >= 1) return
	const side = left ? -1 : 1
	const arm = left ? p.leftArm : p.rightArm
	arm[3] += PLACE_ARM(f)
	arm[4] += -0.12 * side * PLACE_SWAY(f)
	arm[5] += -0.12 * side * PLACE_SWAY(f)
	// The shoulders turn toward the fire with the arm, the other arm balances a little.
	p.body[4] += 0.08 * side * PLACE_SWAY(f)
	;(left ? p.rightArm : p.leftArm)[3] += 0.12 * PLACE_SWAY(f)
}

/** Walk with weight (v11): bounce (lowest at the contact), counter-rotation of the shoulders, head stabilised, arms late on the legs. `a` = amplitude (speed x gait x nat). */
function walkWeight(p, limb, a) {
	const ph = limb * 0.6662
	const cs = Math.cos(ph)
	const dip = 0.5 + 0.5 * Math.cos(2 * ph) // 1 at the contact (legs apart), 0 when they pass
	const dy = 1.0 * (dip - 0.5) * a // pixels, model space (y down)
	for (const key of ['body', 'head', 'rightArm', 'leftArm']) p[key][1] += dy
	// arms: 0.85 of the swing, 0.08 cycle late, a little outward
	p.rightArm[3] = lerp(p.rightArm[3], Math.cos(ph + PI - 0.5026) * 0.85 * a, 1)
	p.leftArm[3] = lerp(p.leftArm[3], Math.cos(ph - 0.5026) * 0.85 * a, 1)
	p.rightArm[5] += 0.04 * a
	p.leftArm[5] -= 0.04 * a
	const twist = -0.075 * cs * a
	twistUpper(p, twist)
	p.body[5] += 0.02 * cs * a
	p.head[4] -= 0.8 * twist // the head stays on its heading (80 % compensated)
	p.head[5] -= 0.7 * 0.02 * cs * a
	p.head[3] += 0.03 * Math.sin(2 * ph) * a
}

/** Crouch share (0..1) of the `sneakBeats` descents of `sneakPeriod` s; <= 0 beats = held. */
function sneakAmount(pose) {
	if (pose.sneakK != null) return clamp(pose.sneakK, 0, 1) // v8: crouch at a given degree (rise and fall written by the scene)
	const n = pose.sneakBeats ?? 2
	const time = Math.max(0, pose.time ?? 0)
	const ramp = 0.08
	if (n <= 0) return smooth(time / ramp)
	const period = pose.sneakPeriod ?? 0.46
	let k = 0
	for (let i = 0; i < n; i++) {
		const s0 = i * period
		k += smooth((time - s0) / ramp) - smooth((time - s0 - period * 0.5) / ramp)
	}
	return clamp(k, 0, 1)
}

/** Sitting pose: HumanoidModel `riding` (legs and arms), hands resting toward the knees, torso slightly leaning. */
function sitTarget(slim, pose) {
	const p = playerStand(slim)
	const hands = clamp(pose.hands ?? 0.6, 0, 1)
	const leg = pose.legPitch ?? 1.4137167
	p.rightArm[3] = lerp(-PI / 5, -0.95, hands)
	p.leftArm[3] = p.rightArm[3]
	p.rightArm[5] = -0.1 * hands
	p.leftArm[5] = 0.1 * hands
	p.rightLeg = P(-1.9, 12, 0, -leg, PI / 10, 0.07853982)
	p.leftLeg = P(1.9, 12, 0, -leg, -PI / 10, -0.07853982)
	leanUpper(p, pose.lean ?? 0.06)
	return p
}
/** Horizontal setback (blocks, toward the back of the player) of the sitting model: `position` = where he stands. */
const seatBack = (pose) => pose.sitBack ?? 0
/** Vertical offset of the sitting model: the hip rests on `seat` (surface of the seat, blocks above the feet). */
const seatLift = (pose) => (pose.seat ?? PLAYER_SEAT_DEFAULT) + THIGH_HALF - HIP_HEIGHT

/** HumanoidModel.setupAttackAnimation (port), for a stroke at progress `f` (0..1). */
function swingPose(p, f, headX = 0, left = false) {
	if (f <= 0 || f >= 1) return
	const side = left ? -1 : 1
	const by = Math.sin(Math.sqrt(f) * TAU) * 0.2 * side
	p.body[4] = by
	p.rightArm[2] = Math.sin(by) * 5
	p.rightArm[0] = -Math.cos(by) * 5
	p.leftArm[2] = -Math.sin(by) * 5
	p.leftArm[0] = Math.cos(by) * 5
	p.rightArm[4] += by
	p.leftArm[4] += by
	p.leftArm[3] += by
	let g = 1 - f
	g *= g
	g *= g
	g = 1 - g
	const f1 = Math.sin(g * PI)
	const f2 = Math.sin(f * PI) * -(headX - 0.7) * 0.75
	const arm = left ? p.leftArm : p.rightArm
	arm[3] -= f1 * 1.2 + f2
	arm[4] += by * 2
	arm[5] += Math.sin(f * PI) * -0.4
}

/**
 * Angles (Minecraft) of an arm aiming at `target` (scene) from the shoulder `shoulderLocal` (local frame of the character):
 * [xRot, yRot] with xRot = -pi/2 + pitch downward (horizontal arm at -pi/2, like HumanoidModel when aiming a bow).
 */
function armAim(pose, shoulderLocal, target) {
	if (!target) return [-PI / 2 + 0.45, 0]
	const pos = pose.position ?? [0, 0, 0]
	const yaw = pose.yaw ?? 0
	const dx = target[0] - pos[0]
	const dz = target[2] - pos[2]
	const c = Math.cos(yaw)
	const s = Math.sin(yaw)
	const lx = c * dx - s * dz - shoulderLocal[0]
	const lz = s * dx + c * dz - shoulderLocal[2]
	const ly = target[1] - pos[1] - shoulderLocal[1]
	const localYaw = clamp(Math.atan2(lx, lz), -1.1, 1.1)
	const down = clamp(-Math.atan2(ly, Math.hypot(lx, lz)), -0.6, 1.2)
	return [-PI / 2 + down, -localYaw]
}

/** v8: typing on a keyboard (layer `type`), see the header. `sneaking`: crouch degree (0..1) for the pitch. */
function typeLayer(p, pose, T, sneaking) {
	const k = clamp(pose.type ?? 0, 0, 1)
	// v8b: "in front of the character". At 1440 the forearms of v8 (pitch -0.75 / -0.65, spread) aimed at the head of the dog and read as a caress. A Minecraft arm has no
	// elbow: it is brought lower (pitch -0.6 / -0.5 crouching: the hand stays at the belly, under the chin) and tucked in by +/-0.62 rad (both hands meet in front of the torso, above
	// the imaginary keyboard), head leaning toward them (+0.2 rad). Bounce x2.8 and oscillation x2.3 kept (from 2 px of hand to 5-6 px on a phone), nod of the head at every key.
	const pitch = lerp(-0.6, -0.5, sneaking)
	const rate = pose.typeRate ?? 0
	const amp = lerp(0.6, 1, clamp(rate / 12, 0, 1))
	const hit = clamp(pose.typeHit ?? 0, 0, 1) * amp
	const right = (pose.typeSide ?? 0) === 0
	let rightX
	let leftX
	let hitMax = hit
	if (pose.fix > 0 && pose.typeN != null) {
		// v11 (fix): continuous in the key times (see typingFix in scene.js). The oscillation is sin(pi (n + u)); each hand has its own bounce.
		const ta = clamp(pose.typeAmp ?? 0, 0, 1)
		const wob = Math.sin(PI * (pose.typeN + pose.typeU)) * 0.08 * ta
		const am = lerp(0.6, 1, ta)
		const hr = clamp(pose.typeHitR ?? 0, 0, 1.2) * am
		const hl = clamp(pose.typeHitL ?? 0, 0, 1.2) * am
		rightX = pitch + wob + 0.14 * hr - 0.04 * hl
		leftX = pitch - wob + 0.14 * hl - 0.04 * hr
		hitMax = 0.5 * (hr + hl) // a sum, not a max: a max has a corner where the two hands cross
	} else {
		const wobble = Math.sin(TAU * (rate / 2) * T) * 0.14 * clamp(rate / 12, 0, 1)
		rightX = pitch + wobble + (right ? 0.28 * hit : -0.08 * hit)
		leftX = pitch - wobble + (right ? -0.08 * hit : 0.28 * hit)
	}
	const nat = natOf(pose)
	// v11: the right hand leads, the left follows by 0.08 s (the lagged pose gives it), the weight overshoots by 5 % and settles; the head follows by 0.06 s.
	let kR = k
	let kL = k
	let kH = k
	if (nat > 0) {
		const kb = pose.lag?.behind ? clamp(pose.lag.behind.type ?? 0, 0, 1) : k
		const shape = (x) => x + 0.05 * Math.sin(PI * clamp((x - 0.5) / 0.5, 0, 1)) ** 2
		kR = lerp(k, shape(k), nat)
		kL = lerp(k, shape(kb), nat)
		kH = lerp(k, lerp(k, kb, 0.75), nat)
	}
	p.rightArm[3] = lerp(p.rightArm[3], rightX, kR)
	p.leftArm[3] = lerp(p.leftArm[3], leftX, kL)
	p.rightArm[4] = lerp(p.rightArm[4], -0.62, kR) // tucked in: both hands meet in front of the torso
	p.leftArm[4] = lerp(p.leftArm[4], 0.62, kL)
	p.head[3] += 0.2 * kH + 0.06 * hitMax * k
	if (nat > 0) {
		// Bursts of keys: the shoulders rise a little and the head leans in with a delay; between bursts the hands drift and the head lifts to reread; the "enter" lifts both hands.
		const burst = clamp(pose.typeBurst ?? 0, 0, 1)
		const burstD = pose.lag?.behind ? clamp(pose.lag.behind.typeBurst ?? 0, 0, 1) : burst
		const pause = clamp(pose.typePause ?? 0, 0, 1)
		const send = clamp(pose.typeSend ?? 0, 0, 1)
		const sendL = pose.lag?.behind ? clamp(pose.lag.behind.typeSend ?? 0, 0, 1) : send
		p.rightArm[1] -= 0.3 * burst * nat * k
		p.leftArm[1] -= 0.3 * burst * nat * k
		p.head[3] += 0.03 * burstD * nat * k
		p.rightArm[3] += Math.sin(TAU * 0.37 * T) * 0.03 * pause * nat
		p.leftArm[3] += Math.sin(TAU * 0.31 * T + 1.3) * 0.03 * pause * nat
		p.head[3] -= 0.05 * pause * nat
		p.rightArm[3] -= 0.08 * send * nat
		p.leftArm[3] -= 0.08 * sendL * nat
	}
}

/** v8: held screen (layer `gui`), see the header: the right hand aims at a point of the plane of the screen. */
function guiLayer(p, pose, slim) {
	const k = clamp(pose.gui, 0, 1)
	const [u, v] = pose.guiCursor ?? [0, 0]
	const pos = pose.position ?? [0, 0, 0]
	const yaw = pose.yaw ?? 0
	const c = Math.cos(yaw)
	const sn = Math.sin(yaw)
	const lx = u * GUI_PLANE.w
	const lz = GUI_PLANE.forward
	const target = [pos[0] + c * lx + sn * lz, pos[1] + GUI_PLANE.height - v * GUI_PLANE.h, pos[2] - sn * lx + c * lz]
	const arm = p.rightArm
	const [ax, ay] = armAim(pose, modelToLocal(arm[0], arm[1], arm[2], 0.9375), target)
	const click = clamp(pose.guiClick ?? 0, 0, 1)
	arm[3] = lerp(arm[3], ax + 0.08 * click, k)
	arm[4] = lerp(arm[4], ay, k)
	arm[5] = lerp(arm[5], 0.05, k)
	p.leftArm[3] = lerp(p.leftArm[3], -0.55, k)
	p.leftArm[4] = lerp(p.leftArm[4], 0.2, k)
	leanUpper(p, 0.04 * k)
	const nat = natOf(pose)
	if (nat > 0) {
		// v11: the hand hesitates over the button (a slow micro-drift), the left hand holds the "screen" with a slow drift, the shoulders rise with the breath before the click and fall
		// after it (guiBreath), the head follows the cursor by 25 % with a 0.08 s delay.
		const T = pose.t ?? 0
		const hover = clamp(pose.guiHover ?? 0, 0, 1)
		const kn = k * nat
		arm[3] += Math.sin(TAU * 0.8 * T) * 0.02 * hover * kn
		arm[4] += Math.sin(TAU * 0.63 * T + 0.7) * 0.02 * hover * kn
		p.leftArm[3] += Math.sin(TAU * 0.3 * T) * 0.02 * kn
		const br = clamp(pose.guiBreath ?? 0, -1, 1)
		p.rightArm[1] -= 0.4 * br * kn
		p.leftArm[1] -= 0.4 * br * kn
		const b = pose.lag?.behind
		if (b?.guiCursor) {
			const aimOf = (ps, cur) => {
				const q = ps.position ?? [0, 0, 0]
				const cb = Math.cos(ps.yaw ?? 0)
				const sb = Math.sin(ps.yaw ?? 0)
				const tg = [q[0] + cb * cur[0] * GUI_PLANE.w + sb * GUI_PLANE.forward, q[1] + GUI_PLANE.height - cur[1] * GUI_PLANE.h, q[2] - sb * cur[0] * GUI_PLANE.w + cb * GUI_PLANE.forward]
				return armAim(ps, modelToLocal(arm[0], arm[1], arm[2], 0.9375), tg)
			}
			const bk = clamp(b.gui ?? 0, 0, 1) // the lagged hand only counts as much as the lagged screen is held
			const [bx, by] = aimOf(b, b.guiCursor)
			const [cx] = aimOf(b, [0, 0])
			p.head[4] += 0.25 * by * kn * bk
			p.head[3] += 0.25 * (bx - cx) * kn * bk
		}
	}
}

/** A clip of the player: { p: pose of the pieces, lift: vertical offset of the model (blocks) }. */
function playerClip(name, pose, slim) {
	const nat = natOf(pose)
	let p = playerStand(slim)
	let lift = 0
	let back = 0
	const time = pose.time ?? 0
	if (name === 'walk') {
		const speed = pose.speed ?? PLAYER_WALK_SPEED
		let amount = clamp((speed * 4) / 20, 0, 1)
		if (pose.fix > 0 && pose.gait != null) amount *= pose.gait // v11 (fix): envelope of the stride over the first and last half step
		const limb = 4 * (pose.distance ?? time * speed)
		p.rightArm[3] = Math.cos(limb * 0.6662 + PI) * 2 * amount * 0.5
		p.leftArm[3] = Math.cos(limb * 0.6662) * 2 * amount * 0.5
		p.rightLeg[3] = Math.cos(limb * 0.6662) * 1.4 * amount
		p.leftLeg[3] = Math.cos(limb * 0.6662 + PI) * 1.4 * amount
		if (nat > 0) {
			const q = clonePose(p)
			walkWeight(q, limb, amount)
			p = mixPose(p, q, nat)
		}
	} else if (name === 'sneak') {
		const k = sneakAmount(pose)
		p = mixPose(p, crouchPose(slim), k)
		lift = -(pose.sneakDrop ?? 0) * k
		if (nat > 0 && pose.sneakK != null) p = mixPose(p, crouchStaged(pose, slim, k), nat)
	} else if (name === 'sit') {
		p = sitTarget(slim, pose)
		lift = seatLift(pose)
		back = seatBack(pose)
	} else if (name === 'sit_down' || name === 'stand_up') {
		const prog = pose.blend != null ? clamp(pose.blend, 0, 1) : clamp(time / PLAYER_SIT_TIME, 0, 1)
		const k = name === 'sit_down' ? smooth(prog) : 1 - smooth(prog)
		p = mixPose(p, sitTarget(slim, pose), k)
		// In between: the torso leans forward and the arms swing (sitting down, getting up).
		const bump = Math.sin(prog * PI)
		leanUpper(p, 0.3 * bump)
		p.rightArm[3] -= 0.35 * bump
		p.leftArm[3] -= 0.35 * bump
		lift = seatLift(pose) * k
		back = seatBack(pose) * k
		if (nat > 0) {
			const q = sitStaged(pose, slim, prog, name === 'sit_down')
			p = mixPose(p, q.p, nat)
			lift = lerp(lift, q.lift, nat)
			back = lerp(back, q.back, nat)
		}
	} else if (name === 'swing') {
		const dur = pose.swingDuration ?? PLAYER_SWING_TIME
		const n = pose.swings ?? 1
		const u = time / dur
		if (u >= 0 && u < n) swingPose(p, u - Math.floor(u), 0, pose.swingArm === 'left')
		if (nat > 0) {
			// v11: placing a log (see placePose) instead of the stroke of the game; the trunk leans toward the fire over the whole gesture.
			const q = playerStand(slim)
			if (u >= 0 && u < n) placePose(q, u - Math.floor(u), pose.swingArm === 'left')
			leanUpper(q, 0.12 * window4(u, 0, 0.3, n - 0.3, n))
			p = mixPose(p, q, nat)
		}
	} else if (name === 'stay' || name === 'point') {
		// "Stay" (v4): the arm extends toward the dog, the hand pushes once toward the ground, held, then falls back.
		// Not the attack stroke of 'swing': the gesture aims and settles.
		const dur = pose.stayDuration ?? PLAYER_STAY_TIME
		const u = time / dur
		const raise = smooth(u / 0.3) * (1 - smooth((u - 0.8) / 0.2))
		const pat = bump((u - 0.34) / 0.3)
		const left = pose.stayArm === 'left'
		const key = left ? 'leftArm' : 'rightArm'
		const arm = p[key]
		const shoulder = modelToLocal(arm[0], arm[1], arm[2], 0.9375)
		const [ax, ay] = armAim(pose, shoulder, pose.pointAt ?? pose.lookAt)
		arm[3] = lerp(arm[3], ax + 0.4 * pat, raise)
		arm[4] = lerp(arm[4], ay, raise)
		arm[5] = lerp(arm[5], left ? -0.05 : 0.05, raise)
		// The torso follows: slight lean and shoulder toward the dog.
		leanUpper(p, 0.1 * raise + 0.05 * pat)
		p.body[4] += 0.25 * ay * raise
		if (nat > 0) {
			// v11: the arm goes back a little first (anticipation), rises, the hand pushes down with a 8 % overshoot, holds, falls by gravity and settles.
			const q = playerStand(slim)
			const qa = q[key]
			const anti = 0.06 * Math.sin(PI * clamp(u / 0.14, 0, 1)) ** 2
			const raiseN = 0.78 * E(clamp(u / 0.34, 0, 1)) * (1 - E(clamp((u - 0.7) / 0.3, 0, 1)))
			const patN = OB08(clamp((u - 0.3) / 0.36, 0, 1)) * (1 - E(clamp((u - 0.6) / 0.32, 0, 1)))
			qa[3] = lerp(qa[3] + anti, ax + 0.4 * patN, raiseN)
			qa[4] = lerp(qa[4], ay, raiseN)
			qa[5] = lerp(qa[5], left ? -0.05 : 0.05, raiseN)
			leanUpper(q, 0.1 * raiseN + 0.05 * patN)
			q.body[4] += 0.25 * ay * raiseN
			p = mixPose(p, q, nat)
		}
	} else if (name === 'wave') {
		const dur = pose.waveDuration ?? 1.8
		const k = smooth(time / 0.3) * (1 - smooth((time - (dur - 0.3)) / 0.3))
		p.rightArm[5] += k * (2.5 + Math.sin(TAU * 2.4 * time) * 0.32)
		p.rightArm[3] -= k * 0.15
		p.body[4] += k * 0.08
	}
	return { p, lift, back }
}

const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]
/** v11 - layers of the player that need the lagged poses: steps when turning on the spot, the head that leads, laughing shoulders. `stand` = 1 when not walking. */
function playerNatural(p, pose, nat, moving, T, lookW) {
	const lag = pose.lag
	const sitW = clamp(pose.sit ?? 0, 0, 1)
	// Not gated by the clip alone (a switch would jump): the stride amplitude (`gait`, 0 at the ends of a walk) hands over to the steps of a turn, so a walk along a curve has none.
	const stand = 1 - moving * clamp(pose.gait ?? 1, 0, 1)
	if (lag?.behind && lag?.ahead) {
		// The yaw rate comes from the two lagged poses. The legs step in turn (a lift of 0.4 rad per step, one step per 36 degrees: sin(5 yaw) has the period of two steps and
		// wraps at 2 pi), gated by the rate: nothing moves when the heading is steady.
		// The legs swing in turn while he pivots (`stepSwing` -1..1, written by the scene over each pivot: a window times sin(2 pi u), so one swing per leg); 0.18 rad.
		const sn = 0.18 * clamp(pose.stepSwing ?? 0, -1, 1) * nat
		p.rightLeg[3] += sn
		p.leftLeg[3] -= sn
		// The head leads the turn: it looks where the body will face 0.08 s later (less when it already looks at something).
		const dY = 0.7 * Math.tanh(wrapPi((lag.ahead.yaw ?? 0) - (pose.yaw ?? 0)) / 0.7)
		p.head[4] -= 0.8 * dY * stand * (1 - 0.6 * sitW) * (1 - 0.7 * lookW) * nat
	}
	const lf = clamp(pose.laugh ?? 0, 0, 1) * nat
	if (lf > 0) {
		const b = 0.5 - 0.5 * Math.cos((TAU * T) / 0.22)
		p.rightArm[1] -= 0.5 * lf * b
		p.leftArm[1] -= 0.5 * lf * b
		p.head[1] += 0.15 * lf * b
	}
}

/**
 * v11b - the greeting of Efe when he is back (blind test: "he stays frozen on the bench"): seen sitting, he reaches toward the dog with the right arm, pats down twice (a "come here")
 * and nods. `greet` 0..1 (the envelope of the whole gesture), `greetPat` 0..1 (the two pats), `greetNod` 0..1 (the head); all three are exactly 0 outside the window of the scene.
 * The arm aims at what the head looks at (`lookAt`, scene coordinates): the shoulder is lowered by the seat (`lift`).
 */
function greetLayer(p, pose, lift, nat) {
	p.head[3] += 0.3 * clamp(pose.greetNod ?? 0, 0, 1) * nat // the nod starts a tenth of a second before the arm
	const g = clamp(pose.greet ?? 0, 0, 1) * nat
	if (!(g > 0)) return
	const shoulder = modelToLocal(p.rightArm[0], p.rightArm[1], p.rightArm[2], 0.9375)
	const [ax, ay] = armAim(pose, [shoulder[0], shoulder[1] + lift, shoulder[2]], pose.lookAt)
	const pat = clamp(pose.greetPat ?? 0, 0, 1)
	// the hand is held higher than the dog (a beckoning, not a hand on the knee: the seated arm already points 0.8 rad down) and falls by 0.55 rad at every pat
	p.rightArm[3] = lerp(p.rightArm[3], ax - 0.5 + 0.55 * pat, 0.95 * g)
	p.rightArm[4] = lerp(p.rightArm[4], ay, 0.95 * g)
	p.rightArm[5] = lerp(p.rightArm[5], 0.06, 0.95 * g)
	leanUpper(p, 0.1 * g)
}

export function createPlayer({ skin, slim = true, seed = 2 } = {}) {
	prepareTexture(skin)
	const [tw, th] = texSize(skin, 64, 64)
	const mainMat = makeMaterial('player / skin', skin)
	mainMat.userData.mmRole = 'skin'
	// Outer layers (hat, jacket, sleeves, leggings): without face culling, like
	// the entityTranslucent RenderType of the player, to see the inside of the hat from below.
	const overMat = makeMaterial('player / skin_overlay', skin, { side: THREE.DoubleSide })
	const fade = makeFade([tw, th], 1.9)
	fade.install(mainMat)
	fade.install(overMat)
	rememberBase(mainMat)
	rememberBase(overMat)
	const flipY = !!skin?.flipY
	const layers = {
		main: [{ material: mainMat, texW: tw, texH: th, flipY }],
		overlay: [{ material: overMat, texW: tw, texH: th, flipY, renderOrder: 1 }],
	}
	const { object3d, model, scaler } = makeRoot('player', 0.9375)
	const parts = {}
	const geometries = new Map()
	buildParts(playerSpec(slim), model, layers, parts, geometries)
	const _v = new THREE.Vector3()
	/** Last computed values (read-only, for the host and the probe). */
	const live = { exhale: 0, gazeDeg: null, avoided: false, lift: 0 }

	function update(state, pose = {}) {
		placeRoot(object3d, pose)
		fade.apply(object3d, pose.fade)
		const T = pose.t ?? state?.t ?? pose.time ?? 0
		const clip = pose.clip ?? 'idle'
		const life = clamp(pose.life ?? 1, 0, 1)
		const still = clamp(pose.still ?? 0, 0, 1)
		let { p, lift, back } = playerClip(clip, pose, slim)
		const blending = pose.from && pose.from !== clip && pose.blend != null && clip !== 'sit_down' && clip !== 'stand_up'
		let kb = 1
		if (blending) {
			kb = smooth(pose.blend)
			const prev = playerClip(pose.from, { ...pose, speed: pose.fromSpeed ?? pose.speed, time: pose.fromTime ?? pose.time }, slim)
			p = mixPose(prev.p, p, kb)
			lift = lerp(prev.lift, lift, kb)
			back = lerp(prev.back, back, kb)
		}
		// v8: optional layers (absent: the pose is that of v7c).
		// v11: the left hand follows the lagged pose, so the layer still runs for the 0.08 s after `type` has fallen to 0 on the pose itself.
		if (pose.type > 0 || (pose.nat > 0 && (pose.lag?.behind?.type > 0 || pose.typeSend > 0 || pose.lag?.behind?.typeSend > 0 || pose.typeBurst > 0 || pose.lag?.behind?.typeBurst > 0))) typeLayer(p, pose, T, clip === 'sneak' ? sneakAmount(pose) : 0)
		if (pose.gui > 0) guiLayer(p, pose, slim)
		if (pose.waveK > 0) {
			const wk = clamp(pose.waveK, 0, 1)
			p.rightArm[5] += wk * (2.5 + Math.sin(TAU * 2.4 * T) * 0.32)
			p.rightArm[3] -= wk * 0.15
			p.body[4] += wk * 0.08
		}
		scaler.position.y = lift
		scaler.position.z = -back
		let afk = clip === 'afk' ? 1 : 0
		if (blending) afk = lerp(pose.from === 'afk' ? 1 : 0, afk, kb)
		if (pose.afk != null) afk = clamp(pose.afk, 0, 1)
		let moving = clip === 'walk' ? 1 : 0
		if (blending) moving = lerp(pose.from === 'walk' ? 1 : 0, moving, kb)
		// v11 (fix): the shoulders' breathing was cut by `moving` in one frame when a walk started; it now fades with the stride envelope
		if (pose.fix > 0 && pose.gait != null) moving *= clamp(pose.gait, 0, 1)

		// AnimationUtils.bobModelPart: arms that breathe (ageInTicks = T x 20). `still` freezes them (paused game).
		const age = T * 20
		const bobZ = (Math.cos(age * 0.09) * 0.05 + 0.05) * (1 - still)
		const bobX = Math.sin(age * 0.067) * 0.05 * (1 - still)
		p.rightArm[5] += bobZ
		p.rightArm[3] += bobX
		p.leftArm[5] -= bobZ
		p.leftArm[3] -= bobX

		// Breathing (torso) and, in AFK, head that droops a little and light sway.
		const breathAmp = pose.breath ?? 1
		const bph = 0.5 - 0.5 * Math.cos((TAU * T) / 3.6)
		const chest = 1 + breathAmp * bph * (0.012 + 0.018 * afk)
		p.body[8] *= chest
		p.body[6] *= 1 + (chest - 1) * 0.5
		p.head[1] -= breathAmp * bph * 0.15 * (0.5 + afk)
		const calm = 1 - still
		if (afk > 0) {
			p.head[3] += afk * (0.22 + Math.sin(TAU * T * 0.11 + seed) * 0.05 * calm)
			p.head[4] += afk * Math.sin(TAU * T * 0.07 + seed * 2) * 0.12 * calm
			p.body[5] += afk * Math.sin(TAU * T * 0.09 + seed) * 0.012 * calm
			p.rightArm[5] += afk * 0.02
			p.leftArm[5] -= afk * 0.02
		}

		// Life: small glances around, weight that shifts, shoulders that rise with the breath.
		const lookW = clamp(pose.lookWeight ?? (pose.lookAt ? 1 : 0), 0, 1)
		const lifeK = life * calm * (1 - moving)
		const g = glance(T, seed + 4, 0.8 * lifeK * (1 - lookW))
		p.head[4] += g.yaw
		p.head[3] += g.pitch
		p.body[5] += Math.sin(T * 0.23 + seed) * 0.012 * lifeK
		p.rightArm[1] -= bph * 0.12 * lifeK
		p.leftArm[1] -= bph * 0.12 * lifeK

		// v11: steps when turning on the spot, the head leads the turn, shoulders that laugh.
		const nat = natOf(pose)
		if (nat > 0) playerNatural(p, pose, nat, moving, T, lookW)
		if (nat > 0 && (pose.greet > 0 || pose.greetNod > 0)) greetLayer(p, pose, lift, nat) // v11b

		// Gaze: 'lookAt' or any clip with pose.lookAt. Eye about 4.5 px above the neck.
		const eye = modelToLocal(p.head[0], p.head[1] - 4.5, p.head[2] - 2, 0.9375)
		eye[1] += lift
		eye[2] -= back
		// v11: the gaze follows its target 0.08 s late (the lagged pose gives the target and its weight): the head is not magnetised.
		const behind = pose.lag?.behind
		let gazePose = pose
		if (nat > 0 && behind && (pose.lookAt || behind.lookAt)) {
			// a missing target is a weight of 0: the gaze fades in and out instead of switching when the lagged pose gains or loses its target
			const wNow = pose.lookAt ? (pose.lookWeight ?? 1) : 0
			const wBack = behind.lookAt ? (behind.lookWeight ?? 1) : 0
			gazePose = { ...pose, lookAt: pose.lookAt && behind.lookAt ? lerp3(pose.lookAt, behind.lookAt, 0.75 * nat) : pose.lookAt ?? behind.lookAt, lookWeight: lerp(wNow, wBack, 0.75 * nat) }
		}
		const [ly, lx] = lookAngles(gazePose, eye, { yaw: 1.3, up: 1.2, down: 1.2 })
		p.head[4] += ly
		p.head[3] += lx

		// Never toward the camera: always measures, corrects if pose.avoidCamera (minimum gap in deg).
		const camPos = pose.cameraPos ?? (state?.camera?.position ? state.camera.position.toArray() : null)
		live.gazeDeg = null
		live.avoided = false
		if (camPos && pose.position) {
			const pos = pose.position
			const c = Math.cos(pose.yaw ?? 0)
			const sn = Math.sin(pose.yaw ?? 0)
			const headW = [pos[0] + c * eye[0] + sn * eye[2], pos[1] + eye[1], pos[2] - sn * eye[0] + c * eye[2]]
			const r = gazeVsCamera(pose, headW, p.head[4], p.head[3], camPos, pose.avoidCamera, 1.3, pose.fix > 0 ? 1 : 0)
			p.head[4] = r.yRot
			live.gazeDeg = r.deg
			live.avoided = r.avoided
		}

		if (pose.mocap) applyClipLayers(p, pose.mocap)
		applyPose(parts, p)
		applyGlow([mainMat, overMat], pose.glow, { tint: pose.glowTint, kind: 'player', fade })
		live.exhale = Math.max(0, -Math.sin((TAU * T) / 3.6)) * breathAmp * 0.7
		live.lift = lift
	}

	update(null, { clip: 'idle', time: 0 })

	/** World anchor points (breath mist): 'mouth', 'head'. */
	function anchor(name, out = new THREE.Vector3()) {
		object3d.updateMatrixWorld(true)
		const local = { mouth: [0, -2, -4.1], head: [0, -4, 0] }[name]
		if (!local) return out.set(NaN, NaN, NaN)
		_v.set(local[0] / 16, local[1] / 16, local[2] / 16)
		return out.copy(_v).applyMatrix4(parts.head.group.matrixWorld)
	}

	function dispose() {
		for (const g of geometries.values()) g.dispose()
		mainMat.dispose()
		overMat.dispose()
		object3d.removeFromParent()
	}

	return { object3d, update, parts, dispose, anchor, live }
}
