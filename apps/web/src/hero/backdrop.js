// Minemories, scene V1: horizon of voxel hills around the captured area (see MODULES.md, "backdrop.js").
//
// createBackdrop({ origin, bounds, groundY, seed, quality, captureRoot, viewEye })
//   → { object3d, update(state), dispose(), surfaceAt(x, z), stats }
//
// - origin      : [x, y, z] world, captureOrigin of the capture JSON (scene space = world - origin).
// - bounds      : captureBounds of the JSON ({ minX, minZ, maxX, maxZ, ... } in world blocks, bounds included).
// - groundY     : world Y of the ground block of the flat (the grass block, -61 in v0 as in v1); the surface is at groundY + 1.
// - seed        : number or text, makes the relief deterministic.
// - quality     : 'high' (default) or 'low' (shorter ring, fewer trees, no shimmer).
// - captureRoot : optional, the root of the GLB loaded in scene space (parent matrices = identity). Used to read the
//                 real height of the columns at the edge of the capture (v1 hills to the north and west) to connect
//                 without a step or a gap. Without it, the edge is assumed flat at groundY.
// - viewEye     : optional, camera eye in world [x, y, z]. The relief is compressed above an elevation angle
//                 (~12 deg) seen from here, to keep a low horizon where the sun and the moon pass.
//
// Rendering: two meshes (near ring that casts and receives shadows, far ring that only receives them), a single
// MeshStandardMaterial in vertex colours. The "pixel" textures come from a small procedural atlas
// (no Mojang asset), applied in world coordinates in the shader: each block keeps its 16x16 pixels even on the
// large merged faces of the far cells (2, 4 then 8 blocks).
// The material carries userData.backdrop = true: look.patchMaterials must not patch it (the wind is already included).

import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const QUALITY = {
	high: { radius: 240, tiers: [40, 96, 160], trees: 1, sway: true },
	low: { radius: 176, tiers: [24, 64, 120], trees: 0.55, sway: false },
}

// Average visible colours in sRGB (texture x tint), measured on the 1.21.1 textures of the capture when
// possible: grass_block_top (linear average 0.30) x taiga tint #86B783, dirt 0.254/0.126/0.061, stone 0.209,
// spruce_leaves 0.228 x #619961. Each vertex colour is divided by the average of its atlas tile, so that
// the backdrop lands on the same value as the capture at the seam.
const PALETTE = {
	grass: 0x4a6748,
	dirt: 0x8a6446,
	coarse: 0x77553b,
	podzol: 0x5c4126,
	moss: 0x566b2e,
	stone: 0x7e7e7e,
	gravel: 0x837f7e,
	spruceLeaves: 0x2e4c2e,
	spruceBark: 0x3b2a18,
	birchLeaves: 0x3f5427,
	rock: 0x767676,
}

// Atlas: 8 tiles of 16x16 side by side.
const TILE = { noise: 0, grassSide: 1, leaves: 2, bark: 3, birch: 4, stone: 5, coarse: 6, podzol: 7 }
const TILES = 8
const TS = 16
// Width (blocks) of the near band that casts shadows: the shadow map of look.js is tight on the chalet.
const CAST_BAND = 16

// ---------------------------------------------------------------------------
// Deterministic noise
// ---------------------------------------------------------------------------

function seedOf(seed) {
	if (typeof seed === 'number' && Number.isFinite(seed)) return seed | 0
	let h = 0x811c9dc5
	for (const ch of String(seed ?? 'minemories')) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193)
	return h | 0
}

function hash(seed, x, z) {
	let h = seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1)
	h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
	h ^= h >>> 16
	return (h >>> 0) / 4294967296
}

function valueNoise(seed, x, z) {
	const xi = Math.floor(x)
	const zi = Math.floor(z)
	const fx = x - xi
	const fz = z - zi
	const u = fx * fx * (3 - 2 * fx)
	const v = fz * fz * (3 - 2 * fz)
	const a = hash(seed, xi, zi)
	const b = hash(seed, xi + 1, zi)
	const c = hash(seed, xi, zi + 1)
	const d = hash(seed, xi + 1, zi + 1)
	return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1
}

function fbm(seed, x, z, octaves) {
	let sum = 0
	let amp = 1
	let norm = 0
	for (let i = 0; i < octaves; i++) {
		sum += valueNoise(seed + i * 1013, x, z) * amp
		norm += amp
		amp *= 0.5
		x *= 2.03
		z *= 2.03
	}
	return sum / norm
}

const smooth = (e0, e1, x) => {
	const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1)
	return t * t * (3 - 2 * t)
}

// ---------------------------------------------------------------------------
// Procedural atlas (sRGB, decoded by the hardware)
// ---------------------------------------------------------------------------

const toSrgb8 = (linear) => {
	const c = Math.min(Math.max(linear, 0), 1)
	return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255)
}

function makeAtlas(seed) {
	const W = TS * TILES
	const data = new Uint8Array(W * TS * 4)
	const put = (tile, x, y, rgb) => {
		const i = (y * W + tile * TS + x) * 4
		data[i] = rgb[0]
		data[i + 1] = rgb[1]
		data[i + 2] = rgb[2]
		data[i + 3] = 255
	}
	const grey = (l) => {
		const v = toSrgb8(l)
		return [v, v, v]
	}
	const srgb = (hex, k = 1) => {
		const c = new THREE.Color(hex)
		return [toSrgb8(c.r * k), toSrgb8(c.g * k), toSrgb8(c.b * k)]
	}
	const grass = new THREE.Color(PALETTE.grass)
	for (let y = 0; y < TS; y++) {
		for (let x = 0; x < TS; x++) {
			const r = (k) => hash(seed + k * 7919, x, y)
			// 0: fine noise (grass, dirt) - average about 0.8 in linear.
			put(TILE.noise, x, y, grey(0.62 + r(1) * 0.3 + (r(2) > 0.86 ? 0.12 : 0)))
			// 1: grass side, irregular green fringe on top, dirt below.
			const fringe = TS - 5 - Math.floor(hash(seed + 31, x, 0) * 3)
			const n = 0.8 + r(3) * 0.4
			if (y >= fringe) put(TILE.grassSide, x, y, [toSrgb8(grass.r * n), toSrgb8(grass.g * n), toSrgb8(grass.b * n)])
			else put(TILE.grassSide, x, y, srgb(PALETTE.dirt, 0.78 + r(4) * 0.44))
			// 2: leaves, speckled with dark holes.
			put(TILE.leaves, x, y, grey(r(5) > 0.78 ? 0.28 : 0.55 + r(6) * 0.4))
			// 3: spruce bark, vertical stripes.
			const stripe = hash(seed + 47, x, 0)
			put(TILE.bark, x, y, grey(0.55 + stripe * 0.35 + r(7) * 0.12))
			// 4: birch bark, white with black dashes (full colour, white vertices).
			const mark = hash(seed + 53, Math.floor(x / 4), y) > 0.82 && hash(seed + 59, x, y) > 0.25
			put(TILE.birch, x, y, mark ? [40, 38, 34] : grey(0.7 + r(8) * 0.22))
			// 5: stone, grey patches in clusters.
			const blob = hash(seed + 61, x >> 1, y >> 1)
			put(TILE.stone, x, y, grey(0.68 + blob * 0.2 + r(9) * 0.1 - (r(10) > 0.9 ? 0.18 : 0)))
			// 6: coarse dirt, gravel (bigger grains).
			put(TILE.coarse, x, y, grey(0.5 + hash(seed + 67, x >> 1, y) * 0.45))
			// 7: podzol top, needles as strokes.
			put(TILE.podzol, x, y, grey(0.6 + hash(seed + 71, x, y >> 1) * 0.38))
		}
	}
	const texture = new THREE.DataTexture(data, W, TS, THREE.RGBAFormat, THREE.UnsignedByteType)
	texture.colorSpace = THREE.SRGBColorSpace
	texture.magFilter = THREE.NearestFilter
	texture.minFilter = THREE.LinearMipmapLinearFilter
	texture.generateMipmaps = true
	texture.wrapS = THREE.ClampToEdgeWrapping
	texture.wrapT = THREE.ClampToEdgeWrapping
	texture.needsUpdate = true
	// Linear average of each tile (luminance), to normalise the vertex colours.
	const means = Array.from({ length: TILES }, (_, tile) => {
		let sum = 0
		for (let y = 0; y < TS; y++)
			for (let x = 0; x < TS; x++) {
				const i = (y * W + tile * TS + x) * 4
				for (let k = 0; k < 3; k++) {
					const v = data[i + k] / 255
					sum += v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
				}
			}
		return sum / (TS * TS * 3)
	})
	return { texture, means }
}

// ---------------------------------------------------------------------------
// Geometry buffer (indexed quads)
// ---------------------------------------------------------------------------

class Builder {
	constructor() {
		this.pos = []
		this.nor = []
		this.col = []
		this.tile = []
		this.idx = []
		this.count = 0
	}

	// a, b, c, d: corners in the order of the outline; n: wanted normal; shade: 4 factors (AO); color: THREE.Color.
	quad(a, b, c, d, n, color, tile, shade = null) {
		const ux = b[0] - a[0]
		const uy = b[1] - a[1]
		const uz = b[2] - a[2]
		const vx = c[0] - a[0]
		const vy = c[1] - a[1]
		const vz = c[2] - a[2]
		const cross = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2]
		const corners = cross >= 0 ? [a, b, c, d] : [a, d, c, b]
		const shades = shade ? (cross >= 0 ? shade : [shade[0], shade[3], shade[2], shade[1]]) : [1, 1, 1, 1]
		const base = this.count
		for (let i = 0; i < 4; i++) {
			const p = corners[i]
			this.pos.push(p[0], p[1], p[2])
			this.nor.push(n[0], n[1], n[2])
			const s = shades[i]
			this.col.push(color.r * s, color.g * s, color.b * s)
			this.tile.push(tile)
		}
		// Diagonal chosen according to the occlusion, like the smoothing of Minecraft (avoids skewed gradients).
		if (shades[0] + shades[2] >= shades[1] + shades[3]) this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
		else this.idx.push(base, base + 1, base + 3, base + 1, base + 2, base + 3)
		this.count += 4
	}

	// Box [x0,x1]x[y0,y1]x[z0,z1]; colors = { top, side, bottom }; optional hidden faces.
	box(x0, y0, z0, x1, y1, z1, colors, tile, opts = {}) {
		const top = opts.topTile ?? tile
		const sideShade = opts.sideShade ?? null
		this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], colors.top, top)
		if (!opts.noBottom)
			this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], colors.bottom ?? colors.side, tile)
		this.quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0], colors.side, tile, sideShade)
		this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], colors.side, tile, sideShade)
		this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], colors.side, tile, sideShade)
		this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], colors.side, tile, sideShade)
	}

	toGeometry() {
		const g = new THREE.BufferGeometry()
		g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
		g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
		g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
		g.setAttribute('aTile', new THREE.Float32BufferAttribute(this.tile, 1))
		g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1))
		g.computeBoundingSphere()
		g.computeBoundingBox()
		return g
	}
}

// ---------------------------------------------------------------------------
// Edge of the capture: real height of the columns of the outline
// ---------------------------------------------------------------------------

const GROUND_BLOCKS = new Set(
	[
		'grass_block',
		'dirt',
		'coarse_dirt',
		'podzol',
		'rooted_dirt',
		'dirt_path',
		'moss_block',
		'mycelium',
		'mud',
		'stone',
		'andesite',
		'granite',
		'diorite',
		'tuff',
		'gravel',
		'sand',
		'clay',
		'snow_block',
		'water',
	].map((b) => `minecraft:${b}`),
)

function readEdgeHeights(root, bounds, origin) {
	const heights = new Map()
	if (!root) return heights
	root.updateMatrixWorld(true)
	const a = new THREE.Vector3()
	const b = new THREE.Vector3()
	const c = new THREE.Vector3()
	const n = new THREE.Vector3()
	const e = new THREE.Vector3()
	root.traverse((mesh) => {
		if (!mesh.isMesh) return
		const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
		const block = (materials[0]?.name || '').split(' / ')[0]
		if (!GROUND_BLOCKS.has(block)) return
		const position = mesh.geometry.attributes.position
		const normals = mesh.geometry.attributes.normal
		const index = mesh.geometry.index
		const triangles = (index ? index.count : position.count) / 3
		for (let t = 0; t < triangles; t++) {
			const i0 = index ? index.getX(t * 3) : t * 3
			const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1
			const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2
			a.fromBufferAttribute(position, i0).applyMatrix4(mesh.matrixWorld)
			b.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld)
			c.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld)
			// Top faces only (not the underside of an overhang): normal of the GLB, otherwise the geometric normal.
			if (normals) {
				n.fromBufferAttribute(normals, i0).add(e.fromBufferAttribute(normals, i1)).add(e.fromBufferAttribute(normals, i2))
				n.transformDirection(mesh.matrixWorld)
			} else n.subVectors(b, a).cross(e.subVectors(c, a)).normalize()
			if (n.y < 0.7) continue
			const x = Math.floor((a.x + b.x + c.x) / 3 + origin[0])
			const z = Math.floor((a.z + b.z + c.z) / 3 + origin[2])
			if (x !== bounds.minX && x !== bounds.maxX && z !== bounds.minZ && z !== bounds.maxZ) continue
			if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue
			const top = Math.round(Math.max(a.y, b.y, c.y) + origin[1]) - 1
			const key = x * 65536 + z
			if (!(heights.get(key) >= top)) heights.set(key, top)
		}
	})
	return heights
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export function createBackdrop({
	origin = [99, -51, 99],
	bounds,
	groundY = -61,
	seed = 'minemories',
	quality = 'high',
	captureRoot = null,
	viewEye = null,
} = {}) {
	if (!bounds) throw new Error('createBackdrop: bounds (captureBounds) missing')
	const Q = QUALITY[quality] ?? QUALITY.high
	const S = seedOf(seed)
	const { minX, maxX, minZ, maxZ } = bounds
	const [ox, oy, oz] = origin
	const R = Q.radius
	const [N1, N2, N3] = Q.tiers
	const started = typeof performance !== 'undefined' ? performance.now() : 0

	// Height grid per block (world Y of the surface block), NaN outside the ring.
	const gx0 = minX - R
	const gz0 = minZ - R
	const W = maxX - minX + 1 + 2 * R
	const D = maxZ - minZ + 1 + 2 * R
	const grid = new Float32Array(W * D).fill(Number.NaN)
	const gi = (x, z) => (x < gx0 || z < gz0 || x >= gx0 + W || z >= gz0 + D ? -1 : (z - gz0) * W + (x - gx0))
	const heightOf = (x, z) => {
		const i = gi(x, z)
		return i < 0 ? Number.NaN : grid[i]
	}
	const inside = (x, z) => x >= minX && x <= maxX && z >= minZ && z <= maxZ

	// Edge of the capture.
	const edge = readEdgeHeights(captureRoot, bounds, origin)
	const edgeHeight = (x, z) => {
		const cx = Math.min(Math.max(x, minX), maxX)
		const cz = Math.min(Math.max(z, minZ), maxZ)
		return edge.get(cx * 65536 + cz) ?? groundY
	}
	for (let x = minX; x <= maxX; x++) {
		grid[gi(x, minZ)] = edgeHeight(x, minZ)
		grid[gi(x, maxZ)] = edgeHeight(x, maxZ)
	}
	for (let z = minZ; z <= maxZ; z++) {
		grid[gi(minX, z)] = edgeHeight(minX, z)
		grid[gi(maxX, z)] = edgeHeight(maxX, z)
	}

	// Relief: soft hills, stronger rise toward the horizon in the north-west, extension of the edge heights.
	const cx = (minX + maxX + 1) / 2
	const cz = (minZ + maxZ + 1) / 2
	const eye = viewEye ?? [cx, groundY + 3.5, cz]
	const tanCap = Math.tan((12 * Math.PI) / 180)
	const tanTree = Math.tan((15 * Math.PI) / 180)
	const distOut = (x, z) => Math.hypot(Math.max(minX - x, x - maxX, 0), Math.max(minZ - z, z - maxZ, 0))
	function rawHeight(x, z) {
		const d = distOut(x, z)
		const vx = x - cx
		const vz = z - cz
		const len = Math.hypot(vx, vz) || 1
		const nw = 0.5 - (0.5 * (vx + vz)) / (len * Math.SQRT2)
		// Warped distance: without it, the rise follows the rectangle and draws concentric contour lines.
		const dw = Math.max(d + fbm(S + 23, x / 70, z / 70, 2) * 26 * smooth(0, 40, d), 0)
		const t = Math.min(dw / R, 1)
		const hills =
			fbm(S, x / 64, z / 64, 3) * (3 + 14 * smooth(0, 60, d)) + fbm(S + 17, x / 21, z / 21, 2) * (1 + 3 * smooth(0, 30, d))
		const rise = t ** 1.8 * (26 + 34 * nw) + smooth(4, 80, dw) * nw * 6
		let h = groundY + hills * smooth(1, 12, d) + rise
		h += (edgeHeight(Math.round(x), Math.round(z)) - groundY) * (1 - smooth(1, 26, d))
		h = Math.max(h, groundY - 3 + rise)
		const cap = eye[1] - 1 + Math.hypot(x - eye[0], z - eye[2]) * tanCap
		if (h > cap) h = h - (h - cap) * 0.7 * smooth(1, 10, d)
		return h
	}

	// Cells: quadtree aligned on 8, step of 1 near the area then 2, 4, 8.
	const stepFor = (c) => (c <= N1 ? 1 : c <= N2 ? 2 : c <= N3 ? 4 : 8)
	const cells = []
	function subdivide(x, z, s) {
		const x1 = x + s - 1
		const z1 = z + s - 1
		if (x >= minX && x1 <= maxX && z >= minZ && z1 <= maxZ) return
		const dx = Math.max(minX - x1, x - maxX, 0)
		const dz = Math.max(minZ - z1, z - maxZ, 0)
		if (Math.hypot(dx, dz) > R) return
		const overlaps = dx === 0 && dz === 0
		if (s > 1 && (overlaps || s > stepFor(Math.max(dx, dz)))) {
			const h = s / 2
			subdivide(x, z, h)
			subdivide(x + h, z, h)
			subdivide(x, z + h, h)
			subdivide(x + h, z + h, h)
			return
		}
		if (s === 1 && inside(x, z)) return
		const h = Math.round(rawHeight(x + s / 2 - 0.5, z + s / 2 - 0.5))
		cells.push({ x, z, s, h, c: Math.max(dx, dz) })
		for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) grid[gi(x + i, z + j)] = h
	}
	for (let z = gz0; z < gz0 + D; z += 8) for (let x = gx0; x < gx0 + W; x += 8) subdivide(x, z, 8)

	// Colours.
	const { texture: atlas, means } = makeAtlas(S)
	const C = (hex, tile = TILE.noise, k = 1) => new THREE.Color(hex).multiplyScalar(k / means[tile])
	const grassTop = C(PALETTE.grass)
	const white = new THREE.Color(1, 1, 1)
	const tmp = new THREE.Color()
	const jitter = (base, x, z, amount = 0.06, salt = 0) => {
		const k = 1 + (hash(S + 211 + salt, x, z) - 0.5) * 2 * amount
		return tmp.copy(base).multiplyScalar(k).clone()
	}

	// Kind of surface ground.
	const near = new Builder()
	const far = new Builder()
	const builderFor = (c) => (c <= CAST_BAND ? near : far)
	function surface(x, z, s, h) {
		let slope = 0
		for (const [dx, dz] of [
			[-1, 0],
			[s, 0],
			[0, -1],
			[0, s],
		]) {
			const n = heightOf(x + dx, z + dz)
			if (Number.isFinite(n)) slope = Math.max(slope, Math.abs(n - h))
		}
		const patch = fbm(S + 401, x / 11, z / 11, 2)
		const high = h - groundY
		if (slope >= 3 + (s > 1 ? s : 0) || (high > 34 && patch > -0.1)) return 'stone'
		if (slope >= 2 && patch > 0.3) return 'coarse'
		if (patch > 0.55) return 'podzol'
		if (patch < -0.68) return 'coarse'
		if (patch > 0.35 && hash(S + 5, x, z) > 0.55) return 'moss'
		return 'grass'
	}
	const TOP = {
		grass: [grassTop, TILE.noise],
		podzol: [C(PALETTE.podzol, TILE.podzol), TILE.podzol],
		coarse: [C(PALETTE.coarse, TILE.coarse), TILE.coarse],
		moss: [C(PALETTE.moss), TILE.noise],
		stone: [C(PALETTE.stone, TILE.stone), TILE.stone],
	}
	const dirt = C(PALETTE.dirt)
	const stone = C(PALETTE.stone, TILE.stone)
	const AO = [0.58, 0.72, 0.86, 1]
	const higher = (x, z, h) => {
		const n = heightOf(x, z)
		return Number.isFinite(n) && n > h ? 1 : 0
	}
	const cornerAo = (x, z, sx, sz, h) => {
		const s1 = higher(x + sx, z, h)
		const s2 = higher(x, z + sz, h)
		const cc = higher(x + sx, z + sz, h)
		return AO[s1 && s2 ? 0 : 3 - (s1 + s2 + cc)]
	}

	const sx = (x) => x - ox
	const sy = (y) => y - oy
	const sz = (z) => z - oz
	const kinds = []

	for (const cell of cells) {
		const { x, z, s, h } = cell
		const b = builderFor(cell.c)
		const kind = surface(x, z, s, h)
		kinds.push(kind)
		const [topColor, topTile] = TOP[kind]
		const yTop = sy(h + 1)
		const x0 = sx(x)
		const x1 = sx(x + s)
		const z0 = sz(z)
		const z1 = sz(z + s)
		const ao = [
			cornerAo(x, z, -1, -1, h),
			cornerAo(x + s - 1, z, 1, -1, h),
			cornerAo(x + s - 1, z + s - 1, 1, 1, h),
			cornerAo(x, z + s - 1, -1, 1, h),
		]
		b.quad([x0, yTop, z0], [x1, yTop, z0], [x1, yTop, z1], [x0, yTop, z1], [0, 1, 0], jitter(topColor, x, z), topTile, ao)

		// Sides: per side, contiguous ranges with the same lower neighbour.
		const sides = [
			{ n: [-1, 0, 0], at: (t) => [x - 1, z + t], line: (t0, t1) => [x0, z0 + t0, x0, z0 + t1] },
			{ n: [1, 0, 0], at: (t) => [x + s, z + t], line: (t0, t1) => [x1, z0 + t0, x1, z0 + t1] },
			{ n: [0, 0, -1], at: (t) => [x + t, z - 1], line: (t0, t1) => [x0 + t0, z0, x0 + t1, z0] },
			{ n: [0, 0, 1], at: (t) => [x + t, z + s], line: (t0, t1) => [x0 + t0, z1, x0 + t1, z1] },
		]
		for (const side of sides) {
			let t = 0
			while (t < s) {
				const [nx, nz] = side.at(t)
				let nb = heightOf(nx, nz)
				if (!Number.isFinite(nb)) nb = inside(nx, nz) ? h : Math.min(h, groundY) - 24
				let t1 = t + 1
				while (t1 < s) {
					const [mx, mz] = side.at(t1)
					let m = heightOf(mx, mz)
					if (!Number.isFinite(m)) m = inside(mx, mz) ? h : Math.min(h, groundY) - 24
					if (m !== nb) break
					t1++
				}
				if (nb < h) {
					const [ax, az, bx, bz] = side.line(t, t1)
					const wall = (yLow, yHigh, color, tile, darkBottom) => {
						if (yHigh <= yLow) return
						const lo = sy(yLow)
						const hi = sy(yHigh)
						// Face shading like Minecraft (sides at 0.8): through the mist, the slopes stay green
						// instead of turning to pink dirt.
						const f = 0.8
						const k = darkBottom ? 0.7 * f : f
						b.quad([ax, lo, az], [bx, lo, bz], [bx, hi, bz], [ax, hi, az], side.n, color, tile, [k, k, f, f])
					}
					const bottom = nb + 1
					const topY = h + 1
					if (kind === 'stone') wall(bottom, topY, jitter(stone, x, z, 0.05, 3), TILE.stone, true)
					else {
						const grassBand = kind === 'grass' || kind === 'moss'
						// In the distance (cells of 2 blocks and more), the high steps stay green on top: seen through
						// the mist, the slopes read as grassy hills and not as dirt cliffs.
						const green = grassBand && s > 1 ? Math.min(s, 3) - 1 : 0
						const dirtTop = grassBand ? topY - 1 - green : topY
						const dirtLow = Math.min(Math.max(bottom, topY - 4 - green), dirtTop)
						if (grassBand) wall(Math.max(bottom, topY - 1), topY, white, TILE.grassSide, bottom >= topY - 1)
						if (green) wall(Math.max(bottom, dirtTop), topY - 1, jitter(grassTop, x, z, 0.05, 6).multiplyScalar(0.82), TILE.noise, bottom >= dirtTop)
						wall(dirtLow, dirtTop, jitter(kind === 'podzol' ? C(PALETTE.podzol, TILE.noise, 1.15) : dirt, x, z, 0.05, 4), TILE.noise, dirtLow === bottom)
						wall(bottom, dirtLow, jitter(stone, x, z, 0.05, 5), TILE.stone, true)
					}
				}
				t = t1
			}
		}
	}

	// ---------------------------------------------------------------------------
	// Trees, rocks, bushes
	// ---------------------------------------------------------------------------

	const spruceLeaves = C(PALETTE.spruceLeaves, TILE.leaves)
	const spruceBark = C(PALETTE.spruceBark, TILE.bark)
	const birchLeaves = C(PALETTE.birchLeaves, TILE.leaves)
	const rockColor = C(PALETTE.rock, TILE.stone)
	const mossColor = C(PALETTE.moss)
	const LAYERS = [0, 1, 0, 1, 2, 1, 2, 3, 2, 3, 2, 3, 3]

	const leafSet = (base, x, z, salt) => {
		const c = jitter(base, x, z, 0.1, salt)
		return { top: c, side: c.clone().multiplyScalar(0.92), bottom: c.clone().multiplyScalar(0.6) }
	}
	// Leaf disc of radius r without the corners (shape of spruces), in three boxes without overlap.
	function leafDisc(b, tx, y, tz, r, colors) {
		if (r === 0) {
			b.box(tx, y, tz, tx + 1, y + 1, tz + 1, colors, TILE.leaves)
			return
		}
		b.box(tx - r, y, tz - r + 1, tx + r + 1, y + 1, tz + r, colors, TILE.leaves)
		b.box(tx - r + 1, y, tz - r, tx + r, y + 1, tz - r + 1, colors, TILE.leaves)
		b.box(tx - r + 1, y, tz + r, tx + r, y + 1, tz + r + 1, colors, TILE.leaves)
	}

	function spruce(b, x, z, h, T, detail) {
		const tx = sx(x)
		const tz = sz(z)
		const y0 = sy(h + 1)
		const leaves = leafSet(spruceLeaves, x, z, 9)
		const maxR = T >= 10 ? 3 : 2
		if (detail === 2) {
			// Distant silhouette: three stacked boxes.
			const w = maxR
			b.box(tx - w, y0 + 2, tz - w, tx + w + 1, y0 + Math.round(T * 0.5), tz + w + 1, leaves, TILE.leaves, { noBottom: true })
			b.box(tx - 1, y0 + Math.round(T * 0.5), tz - 1, tx + 2, y0 + T - 2, tz + 2, leaves, TILE.leaves, { noBottom: true })
			b.box(tx, y0 + T - 2, tz, tx + 1, y0 + T, tz + 1, leaves, TILE.leaves, { noBottom: true })
			return
		}
		const barkColors = { top: spruceBark, side: spruceBark }
		b.box(tx, y0, tz, tx + 1, y0 + T - 1, tz + 1, barkColors, TILE.bark, { noBottom: true })
		const bare = 2 + Math.floor(hash(S + 13, x, z) * 2)
		for (let k = 0; k <= T - 1 - bare; k++) {
			const r = Math.min(LAYERS[Math.min(k, LAYERS.length - 1)], maxR)
			const y = y0 + T - 1 - k
			if (k > 0 && r === 0) continue
			if (detail === 0) leafDisc(b, tx, y, tz, r, leaves)
			else b.box(tx - r, y, tz - r, tx + r + 1, y + 1, tz + r + 1, leaves, TILE.leaves)
		}
	}

	function birch(b, x, z, h, T) {
		const tx = sx(x)
		const tz = sz(z)
		const y0 = sy(h + 1)
		b.box(tx, y0, tz, tx + 1, y0 + T, tz + 1, { top: white, side: white }, TILE.birch, { noBottom: true })
		const leaves = leafSet(birchLeaves, x, z, 11)
		leafDisc(b, tx, y0 + T - 3, tz, 2, leaves)
		leafDisc(b, tx, y0 + T - 2, tz, 2, leaves)
		b.box(tx - 1, y0 + T - 1, tz - 1, tx + 2, y0 + T, tz + 2, leaves, TILE.leaves)
		leafDisc(b, tx, y0 + T, tz, 1, leaves)
	}

	function rock(b, x, z, h, r) {
		const tx = sx(x)
		const tz = sz(z)
		const y0 = sy(h + 1)
		const w = 1 + Math.floor(r * 3)
		const d = 1 + Math.floor(hash(S + 91, x, z) * 2.5)
		const hh = 1 + Math.floor(hash(S + 93, x, z) * 2)
		const colors = { top: jitter(mossColor, x, z, 0.08, 7), side: jitter(rockColor, x, z, 0.08, 8), bottom: rockColor }
		b.box(tx, y0 - 1, tz, tx + w, y0 + hh - 1, tz + d, colors, TILE.stone, { noBottom: true, topTile: TILE.noise })
		if (w > 1 && hh > 1) b.box(tx, y0 + hh - 1, tz, tx + w - 1, y0 + hh, tz + Math.max(1, d - 1), colors, TILE.stone, { noBottom: true, topTile: TILE.noise })
	}

	let treeCount = 0
	const cellAt = new Map()
	for (let i = 0; i < cells.length; i++) if (cells[i].s === 1) cellAt.set(cells[i].x * 65536 + cells[i].z, i)
	const placeSpacing = (c) => (c <= N1 ? 4 : c <= N2 ? 6 : 8)
	for (let gz = gz0; gz < gz0 + D; gz += 2) {
		for (let gx = gx0; gx < gx0 + W; gx += 2) {
			// One candidate per sp x sp cell, wider cell in the distance.
			const c = Math.max(Math.max(minX - gx, gx - maxX, 0), Math.max(minZ - gz, gz - maxZ, 0))
			const sp = placeSpacing(c)
			if ((gx - gx0) % sp !== 0 || (gz - gz0) % sp !== 0) continue
			const x = gx + Math.floor(hash(S + 101, gx, gz) * sp)
			const z = gz + Math.floor(hash(S + 103, gx, gz) * sp)
			const d = distOut(x, z)
			if (d < 5 || d > R - 6) continue
			const h = heightOf(x, z)
			if (!Number.isFinite(h)) continue
			const forest = smooth(-0.25, 0.45, fbm(S + 301, x / 45, z / 45, 3))
			let p = (0.12 + 0.8 * forest) * Q.trees
			if (d < 12) p *= 0.55
			if (hash(S + 107, x, z) > p) continue
			// Slope: the foot and its neighbours at the same height (near), otherwise a step is accepted.
			let flat = true
			for (const [ax, az] of [
				[1, 0],
				[-1, 0],
				[0, 1],
				[0, -1],
			]) {
				const n = heightOf(x + ax, z + az)
				if (!Number.isFinite(n) || Math.abs(n - h) > (c <= N1 ? 1 : 2)) flat = false
			}
			if (!flat) continue
			const idx = cellAt.get(x * 65536 + z)
			if (idx !== undefined && kinds[idx] === 'stone') continue
			const r = hash(S + 109, x, z)
			const b = builderFor(c)
			// Top below ~15 deg of elevation seen from the eye: the tree line does not eat the sky where the sun and the moon pass.
			const maxT = Math.floor(eye[1] + Math.hypot(x - eye[0], z - eye[2]) * tanTree - (h + 1))
			const birchy = fbm(S + 501, x / 30, z / 30, 2) > 0.38 && c <= N2
			const T = birchy && r < 0.7 ? 5 + Math.floor(r * 4) : 7 + Math.floor(r * 7) + (c > N2 ? 3 : 0)
			if (Math.min(T, maxT) < 5) continue
			if (birchy && r < 0.7) birch(b, x, z, h, Math.min(T, maxT))
			else spruce(b, x, z, h, Math.min(T, maxT), c <= N1 ? 0 : c <= N3 ? 1 : 2)
			treeCount++
		}
	}

	// Mossy rocks and bushes, in the near and middle part.
	let rockCount = 0
	for (const cell of cells) {
		if (cell.s !== 1 || cell.c > N2) continue
		const { x, z, h } = cell
		if (distOut(x, z) < 4) continue
		const r = hash(S + 701, x, z)
		if (r < 0.006) {
			rock(builderFor(cell.c), x, z, h, hash(S + 703, x, z))
			rockCount++
		} else if (r > 0.992 && cell.c <= N1) {
			const leaves = leafSet(spruceLeaves, x, z, 13)
			builderFor(cell.c).box(sx(x), sy(h + 1), sz(z), sx(x + 1), sy(h + 2), sz(z + 1), leaves, TILE.leaves, { noBottom: true })
		}
	}

	// ---------------------------------------------------------------------------
	// Material: atlas in world coordinates + leaf shimmer
	// ---------------------------------------------------------------------------

	const uniforms = { uClock: { value: 0 }, uWind: { value: 0.4 } }
	const HAZE = { scale: 0.85, tint: 0.8 }
	const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, name: 'backdrop / terrain' })
	material.userData.backdrop = true
	material.onBeforeCompile = (shader) => {
		shader.uniforms.uAtlas = { value: atlas }
		shader.uniforms.uClock = uniforms.uClock
		shader.uniforms.uWind = uniforms.uWind
		const sway = Q.sway
			? `if (abs(aTile - ${TILE.leaves.toFixed(1)}) < 0.5) {
	float ph = dot(position.xz, vec2(0.37, 0.23)) + position.y * 0.5;
	float gust = 0.6 + 0.4 * sin(uClock * 0.35 + position.x * 0.02);
	transformed.x += sin(uClock * 1.7 + ph) * 0.045 * uWind * gust;
	transformed.z += cos(uClock * 1.3 + ph * 1.3) * 0.035 * uWind * gust;
}`
			: ''
		shader.vertexShader = shader.vertexShader
			.replace(
				'#include <common>',
				`#include <common>
attribute float aTile;
uniform float uClock;
uniform float uWind;
varying float vTile;
varying vec3 vBlock;
varying vec3 vBlockNormal;`,
			)
			.replace(
				'#include <begin_vertex>',
				`#include <begin_vertex>
vTile = aTile;
vBlock = position;
vBlockNormal = normal;
${sway}`,
			)
		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				`#include <common>
uniform sampler2D uAtlas;
varying float vTile;
varying vec3 vBlock;
varying vec3 vBlockNormal;`,
			)
			.replace(
				'#include <map_fragment>',
				`{
	vec3 an = abs(vBlockNormal);
	vec2 buv = an.y > 0.5 ? vBlock.xz : (an.x > 0.5 ? vec2(vBlock.z, vBlock.y) : vBlock.xy);
	vec2 f = fract(buv);
	float tile = floor(vTile + 0.5);
	vec2 auv = vec2((tile + clamp(f.x, 0.5 / ${TS}.0, 1.0 - 0.5 / ${TS}.0)) / ${TILES}.0, f.y);
	vec2 scale = vec2(1.0 / ${TILES}.0, 1.0);
	diffuseColor.rgb *= textureGrad(uAtlas, auv, dFdx(buv) * scale, dFdy(buv) * scale).rgb;
}`,
			)
			// Mist specific to the decor: a bit less dense and pulled toward a darker tone than the horizon, so that
			// the distant hills stay readable silhouettes (and not almost white flat areas).
			.replace(
				'#include <fog_fragment>',
				`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float mmFog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * ${HAZE.scale.toFixed(3)} * ${HAZE.scale.toFixed(3)});
	#else
		float mmFog = smoothstep(fogNear, fogFar, vFogDepth);
	#endif
	gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor * ${HAZE.tint.toFixed(3)}, mmFog);
#endif`,
			)
	}
	material.customProgramCacheKey = () => `backdrop-${Q.sway ? 1 : 0}`

	const object3d = new THREE.Group()
	object3d.name = 'backdrop'
	object3d.userData.backdrop = true
	const meshes = []
	for (const [builder, name, cast] of [
		[near, 'backdrop-near', true],
		[far, 'backdrop-far', false],
	]) {
		if (!builder.count) continue
		const mesh = new THREE.Mesh(builder.toGeometry(), material)
		mesh.name = name
		mesh.castShadow = cast
		mesh.receiveShadow = true
		mesh.matrixAutoUpdate = false
		mesh.updateMatrix()
		object3d.add(mesh)
		meshes.push(mesh)
	}

	const triangles = meshes.reduce((sum, m) => sum + m.geometry.index.count / 3, 0)
	const stats = {
		cells: cells.length,
		trees: treeCount,
		rocks: rockCount,
		triangles,
		drawCalls: meshes.length,
		edgeColumns: edge.size,
		ms: Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - started),
	}

	return {
		object3d,
		stats,
		// Scene Y of the backdrop surface under (x, z) in scene space, or null inside the capture / outside the ring.
		surfaceAt(x, z) {
			const wx = Math.floor(x + ox)
			const wz = Math.floor(z + oz)
			if (inside(wx, wz)) return null
			const h = heightOf(wx, wz)
			return Number.isFinite(h) ? h + 1 - oy : null
		},
		update(state) {
			if (!state) return
			if (Number.isFinite(state.clock)) uniforms.uClock.value = state.reducedMotion ? 0 : state.clock % 3600
			if (Number.isFinite(state.wind)) uniforms.uWind.value = state.wind
		},
		dispose() {
			object3d.removeFromParent()
			for (const m of meshes) m.geometry.dispose()
			material.dispose()
			atlas.dispose()
		},
	}
}
