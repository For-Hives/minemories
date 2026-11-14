// Reads a Minemories GLB and counts its triangles per world block, by category, without a 3D engine.
//
// A triangle belongs to the block holding its centroid. Positions are decoded as glTF says (float or quantized
// integers, normalized or not, any byte stride), then moved by the node's scale and translation and by the capture
// origin from capture.json: world = local + origin. Minemories writes flat, unrotated mesh nodes; a rotated or
// nested one is refused rather than misplaced. Names are not used: the
// capture groups geometry by material under the first model that used it, so a block can sit in a primitive named
// after another one; positions are the only reliable owner.
//
// "Duplicates" are triangles that repeat another triangle of the same block exactly, corners, winding, material and
// texture coordinates alike: the signature of geometry drawn twice, which a count alone hides. The same face with
// another texture is an "overlap": a layer drawn on purpose (the tinted overlay on a grass block's side) or a face
// drawn twice through two paths; reported, not judged.

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

const COMPONENTS = {
	5120: { size: 1, read: 'getInt8', max: 127 },
	5121: { size: 1, read: 'getUint8', max: 255 },
	5122: { size: 2, read: 'getInt16', max: 32767 },
	5123: { size: 2, read: 'getUint16', max: 65535 },
	5125: { size: 4, read: 'getUint32', max: 4294967295 },
	5126: { size: 4, read: 'getFloat32', max: 1 },
}

/** The GLB's JSON and binary chunk. */
export function parseGlb(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	if (bytes.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) throw new Error('Not a GLB file')
	let offset = 12
	let json
	let bin = new Uint8Array(0)
	while (offset + 8 <= bytes.byteLength) {
		const length = view.getUint32(offset, true)
		const type = view.getUint32(offset + 4, true)
		const chunk = bytes.subarray(offset + 8, offset + 8 + length)
		if (type === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(chunk))
		if (type === BIN_CHUNK) bin = chunk
		offset += 8 + length
	}
	if (!json) throw new Error('GLB without a JSON chunk')
	return { json, bin }
}

/** Reads accessor `index` as an array of numbers tuples (`size` numbers each). */
export function readAccessor(glb, index) {
	const accessor = glb.json.accessors[index]
	const component = COMPONENTS[accessor.componentType]
	if (!component) throw new Error(`Unsupported component type ${accessor.componentType}`)
	const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type]
	if (!size) throw new Error(`Unsupported accessor type ${accessor.type}`)
	const bufferView = glb.json.bufferViews[accessor.bufferView]
	const stride = bufferView.byteStride ?? component.size * size
	const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
	const view = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength)
	const scale = accessor.normalized ? 1 / component.max : 1
	const out = new Array(accessor.count)
	for (let i = 0; i < accessor.count; i++) {
		const tuple = new Array(size)
		for (let k = 0; k < size; k++) {
			const raw = view[component.read](start + i * stride + k * component.size, true)
			tuple[k] = accessor.normalized ? Math.max(raw * scale, -1) : raw
		}
		out[i] = tuple
	}
	return out
}

function triangles(primitive, positions, indices) {
	const mode = primitive.mode ?? 4
	if (mode !== 4) return []
	const order = indices ?? positions.map((_, i) => i)
	const out = []
	for (let i = 0; i + 2 < order.length; i += 3) out.push([order[i], order[i + 1], order[i + 2]])
	return out
}

const key = (x, y, z) => `${x},${y},${z}`

/**
 * The block a triangle belongs to: its centroid, moved a hair against its normal so a face lying on a block
 * boundary (a grass top, a cube's own faces) counts for the block it covers, not the one beyond it.
 */
function inside(points) {
	const [a, b, c] = points
	const u = [0, 1, 2].map(k => b[k] - a[k])
	const v = [0, 1, 2].map(k => c[k] - a[k])
	const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
	const length = Math.hypot(...normal) || 1
	return [0, 1, 2].map(k => Math.floor((a[k] + b[k] + c[k]) / 3 - (normal[k] / length) * 0.001))
}
const corner = point => point.map(value => Math.round(value * 4096)).join(':')

/**
 * A triangle's corners in their winding order, starting from the smallest: the same face drawn twice matches, its
 * back face (same corners, reversed winding) does not.
 */
function facing(corners) {
	let first = 0
	for (let i = 1; i < 3; i++) if (corners[i] < corners[first]) first = i
	const indices = [0, 1, 2].map(k => (first + k) % 3)
	return { corners: indices.map(i => corners[i]).join('|'), indices }
}

/** A vertex's material and texture coordinates: what tells a drawn-twice face from a layer drawn on purpose. */
function surfaceKeys(glb, primitive) {
	const uvs = primitive.attributes.TEXCOORD_0 == null ? null : readAccessor(glb, primitive.attributes.TEXCOORD_0)
	const material = primitive.material ?? 'none'
	return index => (uvs ? `${material}:${uvs[index].map(value => Math.round(value * 65536)).join(',')}` : `${material}`)
}

const IDENTITY_ROTATION = [0, 0, 0, 1]

/** Positions are read with each mesh node's own scale and translation only: anything else is refused. */
function requireFlatNodes(nodes) {
	const parents = new Set(nodes.flatMap(node => node.children ?? []))
	for (const [index, node] of nodes.entries()) {
		if (node.mesh == null) continue
		const rotated = node.rotation?.some((value, k) => value !== IDENTITY_ROTATION[k])
		if (node.matrix || rotated || node.children?.length || parents.has(index))
			throw new Error(`Node ${node.name ?? index} is rotated or nested: the bench reads flat nodes only`)
	}
}

const primitiveIndices = (glb, primitive) =>
	primitive.indices == null ? null : readAccessor(glb, primitive.indices).map(([i]) => i)

/**
 * Counts one triangle (world positions) in its block. The same face already there with the same surface is a
 * duplicate (drawn twice); with another surface it is an overlap (a layer on purpose, or the same face drawn by two
 * paths with different textures: the bench cannot tell, so overlaps are reported, not judged).
 */
function addTriangle(cells, seen, points, surface, category) {
	const cellKey = key(...inside(points))
	const cell = cells.get(cellKey) ?? { triangles: 0, duplicates: 0, overlaps: 0, categories: {} }
	cell.triangles++
	cell.categories[category] = (cell.categories[category] ?? 0) + 1
	const order = facing(points.map(corner))
	const geometry = `${cellKey}|${order.corners}`
	const look = order.indices.map(i => surface[i]).join('|')
	const looks = seen.get(geometry)
	if (!looks) seen.set(geometry, new Set([look]))
	else if (looks.has(look)) cell.duplicates++
	else {
		cell.overlaps++
		looks.add(look)
	}
	cells.set(cellKey, cell)
}

/**
 * Triangles per world block: Map "x,y,z" → { triangles, duplicates, overlaps, categories: { name: count } }. `origin` is
 * capture.json's captureOrigin.
 */
export function cellTriangles(glb, origin) {
	const cells = new Map()
	const seen = new Map()
	const offset = [origin.x, origin.y, origin.z]
	requireFlatNodes(glb.json.nodes ?? [])
	for (const node of glb.json.nodes ?? []) {
		if (node.mesh == null) continue
		const scale = node.scale ?? [1, 1, 1]
		const move = node.translation ?? [0, 0, 0]
		const world = point => [0, 1, 2].map(k => point[k] * scale[k] + move[k] + offset[k])
		for (const primitive of glb.json.meshes[node.mesh].primitives) {
			if (primitive.attributes?.POSITION == null) continue
			const positions = readAccessor(glb, primitive.attributes.POSITION).map(world)
			const surface = surfaceKeys(glb, primitive)
			for (const [a, b, c] of triangles(primitive, positions, primitiveIndices(glb, primitive)))
				addTriangle(
					cells,
					seen,
					[positions[a], positions[b], positions[c]],
					[surface(a), surface(b), surface(c)],
					node.name
				)
		}
	}
	return cells
}
