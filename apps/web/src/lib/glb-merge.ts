import { MAX_GLB_JSON_BYTES } from '@minemories/api-contract/glb'

export type GlbTilePart = { data: Uint8Array; translation: { x: number; y: number; z: number } }

export class GlbMergeError extends Error {}

type Json = Record<string, unknown>

type PreparedTile = { bin: Uint8Array; json: Json; translation: number[] }

type Bases = {
	accessor: number
	image: number
	light: number
	material: number
	mesh: number
	node: number
	sampler: number
	texture: number
	view: number
}

type Merged = {
	accessors: Json[]
	bufferViews: Json[]
	images: Json[]
	lights: Json[]
	materials: Json[]
	meshes: Json[]
	nodes: Json[]
	roots: number[]
	samplers: Json[]
	textures: Json[]
}

const GLB_MAGIC = 0x46546c67
const GLB_VERSION = 2
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const JSON_START = 20
const CHUNK_HEADER = 8
const FILE_NAME_SLUG_MAX = 48
const TRAILING_DASH = /-+$/

export function mergeGlbTiles(parts: readonly GlbTilePart[]): Uint8Array {
	if (parts.length === 0) throw new GlbMergeError('No GLB tiles to merge')
	const tiles = parts.map(prepareTile)
	const binLength = tiles.reduce((total, tile) => total + align4(tile.bin.byteLength), 0)
	const bin = new Uint8Array(binLength)
	const merged = emptyMerged()
	let binBase = 0
	for (const [index, tile] of tiles.entries()) {
		bin.set(tile.bin, binBase)
		appendTile(merged, tile, binBase, index)
		binBase += align4(tile.bin.byteLength)
	}
	return container(documentOf(merged, binLength), bin)
}

export function exportFileName(name: string, at: string): string {
	return `${slug(name)}-${timestamp(at)}.glb`
}

function slug(name: string): string {
	const slugged = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, FILE_NAME_SLUG_MAX)
		.replace(TRAILING_DASH, '')
	return slugged === '' ? 'capture' : slugged
}

function timestamp(at: string): string {
	const date = new Date(at)
	if (Number.isNaN(date.getTime())) return 'undated'
	const pad = (value: number, size = 2) => String(value).padStart(size, '0')
	const day = `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
	return `${day}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
}

function invalidTile(): never {
	throw new GlbMergeError('Invalid GLB tile')
}

function align4(length: number): number {
	return Math.ceil(length / 4) * 4
}

function isRecord(value: unknown): value is Json {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonNegativeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function extend(target: Json[], values: Json[]): void {
	for (const value of values) target.push(value)
}

function emptyMerged(): Merged {
	return {
		accessors: [],
		bufferViews: [],
		images: [],
		lights: [],
		materials: [],
		meshes: [],
		nodes: [],
		roots: [],
		samplers: [],
		textures: [],
	}
}

function basesOf(merged: Merged): Bases {
	return {
		accessor: merged.accessors.length,
		image: merged.images.length,
		light: merged.lights.length,
		material: merged.materials.length,
		mesh: merged.meshes.length,
		node: merged.nodes.length,
		sampler: merged.samplers.length,
		texture: merged.textures.length,
		view: merged.bufferViews.length,
	}
}

function items(document: Json, key: string): Json[] {
	const value = document[key]
	if (value === undefined) return []
	if (!(Array.isArray(value) && value.every(isRecord))) invalidTile()
	return value
}

function shiftIndex(value: unknown, base: number): number {
	if (!nonNegativeInteger(value)) invalidTile()
	return value + base
}

function shiftList(value: unknown, base: number): number[] {
	if (!Array.isArray(value)) invalidTile()
	return value.map(item => shiftIndex(item, base))
}

function shiftField(target: Json, key: string, base: number): Json {
	const value = target[key]
	return value === undefined ? target : { ...target, [key]: shiftIndex(value, base) }
}

function mapValues(target: Json, change: (value: unknown) => unknown): Json {
	return Object.fromEntries(Object.entries(target).map(([key, value]) => [key, change(value)]))
}

function shiftMap(value: unknown, base: number): Json {
	if (!isRecord(value)) invalidTile()
	return mapValues(value, item => shiftIndex(item, base))
}

function isTextureRef(value: unknown): value is Json {
	return isRecord(value) && typeof value.index === 'number'
}

function remapTextureRefs(target: Json, base: number): Json {
	return mapValues(target, value => (isTextureRef(value) ? { ...value, index: shiftIndex(value.index, base) } : value))
}

function remapMaterial(material: Json, base: number): Json {
	const next = remapTextureRefs(material, base)
	const pbr = material.pbrMetallicRoughness
	return isRecord(pbr) ? { ...next, pbrMetallicRoughness: remapTextureRefs(pbr, base) } : next
}

function remapTexture(texture: Json, bases: Bases): Json {
	return shiftField(shiftField(texture, 'source', bases.image), 'sampler', bases.sampler)
}

function remapAccessor(accessor: Json, viewBase: number): Json {
	if (accessor.sparse !== undefined) invalidTile()
	return shiftField(accessor, 'bufferView', viewBase)
}

function remapBufferView(view: Json, tile: PreparedTile, binBase: number): Json {
	const offset = view.byteOffset ?? 0
	const length = view.byteLength
	if (!(nonNegativeInteger(offset) && nonNegativeInteger(length)) || offset + length > tile.bin.byteLength) {
		invalidTile()
	}
	return { ...view, buffer: 0, byteOffset: offset + binBase }
}

function remapPrimitive(primitive: Json, bases: Bases): Json {
	const remapped = shiftField(shiftField(primitive, 'indices', bases.accessor), 'material', bases.material)
	const attributes = shiftMap(primitive.attributes, bases.accessor)
	if (primitive.targets === undefined) return { ...remapped, attributes }
	const targets = items(primitive, 'targets').map(target => shiftMap(target, bases.accessor))
	return { ...remapped, attributes, targets }
}

function remapMesh(mesh: Json, bases: Bases): Json {
	return { ...mesh, primitives: items(mesh, 'primitives').map(primitive => remapPrimitive(primitive, bases)) }
}

function remapLight(node: Json, base: number): Json {
	const extensions = node.extensions
	if (!(isRecord(extensions) && isRecord(extensions.KHR_lights_punctual))) return node
	const light = shiftField(extensions.KHR_lights_punctual, 'light', base)
	return { ...node, extensions: { ...extensions, KHR_lights_punctual: light } }
}

function remapNode(node: Json, bases: Bases): Json {
	const mesh = shiftField(node, 'mesh', bases.mesh)
	const withChildren = node.children === undefined ? mesh : { ...mesh, children: shiftList(node.children, bases.node) }
	return remapLight(withChildren, bases.light)
}

function lightsOf(json: Json): Json[] {
	const extensions = json.extensions
	if (!(isRecord(extensions) && isRecord(extensions.KHR_lights_punctual))) return []
	return items(extensions.KHR_lights_punctual, 'lights')
}

function rootNodes(json: Json, base: number): number[] {
	const scenes = items(json, 'scenes')
	const index = json.scene ?? 0
	const scene = nonNegativeInteger(index) ? scenes[index] : undefined
	if (scene === undefined) invalidTile()
	return shiftList(scene.nodes ?? [], base)
}

function appendTile(merged: Merged, tile: PreparedTile, binBase: number, index: number): void {
	const bases = basesOf(merged)
	const { json } = tile
	extend(
		merged.bufferViews,
		items(json, 'bufferViews').map(view => remapBufferView(view, tile, binBase))
	)
	extend(
		merged.accessors,
		items(json, 'accessors').map(accessor => remapAccessor(accessor, bases.view))
	)
	extend(
		merged.images,
		items(json, 'images').map(image => shiftField(image, 'bufferView', bases.view))
	)
	extend(merged.samplers, items(json, 'samplers'))
	extend(
		merged.textures,
		items(json, 'textures').map(texture => remapTexture(texture, bases))
	)
	extend(
		merged.materials,
		items(json, 'materials').map(material => remapMaterial(material, bases.texture))
	)
	extend(
		merged.meshes,
		items(json, 'meshes').map(mesh => remapMesh(mesh, bases))
	)
	extend(
		merged.nodes,
		items(json, 'nodes').map(node => remapNode(node, bases))
	)
	extend(merged.lights, lightsOf(json))
	merged.nodes.push({ name: `tile-${index}`, translation: tile.translation, children: rootNodes(json, bases.node) })
	merged.roots.push(merged.nodes.length - 1)
}

function documentOf(merged: Merged, binLength: number): Json {
	const lit = merged.lights.length > 0
	const document: Json = {
		asset: { version: '2.0', generator: 'Minemories' },
		scene: 0,
		scenes: [{ nodes: merged.roots }],
		nodes: merged.nodes,
		meshes: merged.meshes,
		materials: merged.materials,
		textures: merged.textures,
		images: merged.images,
		samplers: merged.samplers,
		accessors: merged.accessors,
		bufferViews: merged.bufferViews,
		buffers: [{ byteLength: binLength }],
		extensionsUsed: lit ? ['KHR_lights_punctual'] : undefined,
		extensions: lit ? { KHR_lights_punctual: { lights: merged.lights } } : undefined,
	}
	return Object.fromEntries(Object.entries(document).filter(([, value]) => !Array.isArray(value) || value.length > 0))
}

function container(json: Json, bin: Uint8Array): Uint8Array {
	const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
	const jsonLength = align4(jsonBytes.byteLength)
	if (jsonLength > MAX_GLB_JSON_BYTES) {
		throw new GlbMergeError('The merged capture is too large to export as one file')
	}
	const binStart = JSON_START + jsonLength
	const output = new Uint8Array(binStart + CHUNK_HEADER + bin.byteLength)
	const view = new DataView(output.buffer)
	view.setUint32(0, GLB_MAGIC, true)
	view.setUint32(4, GLB_VERSION, true)
	view.setUint32(8, output.byteLength, true)
	view.setUint32(12, jsonLength, true)
	view.setUint32(16, JSON_CHUNK, true)
	output.set(jsonBytes, JSON_START)
	output.fill(0x20, JSON_START + jsonBytes.byteLength, binStart)
	view.setUint32(binStart, bin.byteLength, true)
	view.setUint32(binStart + 4, BIN_CHUNK, true)
	output.set(bin, binStart + CHUNK_HEADER)
	return output
}

function translationOf(translation: { x: number; y: number; z: number }): number[] {
	const values = [translation.x, translation.y, translation.z]
	if (!values.every(Number.isFinite)) throw new GlbMergeError('Invalid GLB tile translation')
	return values
}

function prepareTile(part: GlbTilePart): PreparedTile {
	const { json, bin } = parseTile(part.data)
	const length = bufferLength(json, bin)
	return { bin: bin.subarray(0, length), json, translation: translationOf(part.translation) }
}

function parseTile(data: Uint8Array): { bin: Uint8Array; json: Json } {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
	if (
		data.byteLength < JSON_START ||
		view.getUint32(0, true) !== GLB_MAGIC ||
		view.getUint32(4, true) !== GLB_VERSION ||
		view.getUint32(8, true) !== data.byteLength ||
		view.getUint32(16, true) !== JSON_CHUNK
	)
		invalidTile()
	const jsonLength = view.getUint32(12, true)
	const binStart = JSON_START + jsonLength
	if (jsonLength % 4 !== 0 || binStart > data.byteLength) invalidTile()
	return { bin: binChunk(data, view, binStart), json: parseJson(data.subarray(JSON_START, binStart)) }
}

function binChunk(data: Uint8Array, view: DataView, start: number): Uint8Array {
	if (data.byteLength - start < CHUNK_HEADER || view.getUint32(start + 4, true) !== BIN_CHUNK) invalidTile()
	const length = view.getUint32(start, true)
	if (length % 4 !== 0 || start + CHUNK_HEADER + length !== data.byteLength) invalidTile()
	return data.subarray(start + CHUNK_HEADER)
}

function parseJson(bytes: Uint8Array): Json {
	let end = bytes.byteLength
	while (end > 0 && (bytes[end - 1] === 0x20 || bytes[end - 1] === 0)) end -= 1
	let value: unknown
	try {
		value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, end)))
	} catch {
		invalidTile()
	}
	if (!isRecord(value)) invalidTile()
	return value
}

function bufferLength(json: Json, bin: Uint8Array): number {
	const buffers = items(json, 'buffers')
	const [buffer] = buffers
	if (buffers.length !== 1 || buffer === undefined || buffer.uri !== undefined) invalidTile()
	const length = buffer.byteLength
	if (!nonNegativeInteger(length) || length > bin.byteLength) invalidTile()
	return length
}
