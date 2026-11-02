/**
 * EXT_meshopt_compression for Minemories GLB files, shared by the API (compress) and the viewer (expand).
 * The codecs are injected so this package carries no WebAssembly. A compressed file is only a transport
 * format: the viewer expands it back into an ordinary self-contained GLB and validates that GLB with the
 * unchanged validator, so decoded sizes and values stay bounded by the existing budgets.
 */
export interface MeshoptEncoderLike {
	encodeGltfBuffer(source: Uint8Array, count: number, size: number, mode: string): Uint8Array
}
export interface MeshoptDecoderLike {
	decodeGltfBuffer(
		target: Uint8Array,
		count: number,
		size: number,
		source: Uint8Array,
		mode: string,
		filter?: string
	): void
}

const EXTENSION = 'EXT_meshopt_compression'
const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const MAX_JSON_BYTES = 4 * 1024 * 1024
/** Same ceiling as the geometry budget of the validator: nothing larger is ever expanded. */
export const MAX_EXPANDED_BYTES = 256 * 1024 * 1024
const MODES = new Set(['ATTRIBUTES', 'TRIANGLES', 'INDICES'])
const COMPONENT_BYTES = new Map([
	[5120, 1],
	[5121, 1],
	[5122, 2],
	[5123, 2],
	[5125, 4],
	[5126, 4],
])
const TYPE_COMPONENTS = new Map([
	['SCALAR', 1],
	['VEC2', 2],
	['VEC3', 3],
	['VEC4', 4],
])

type Json = Record<string, unknown>
interface Container {
	json: Json
	bin: Uint8Array
}

function isObject(value: unknown): value is Json {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function align4(value: number): number {
	return (value + 3) & ~3
}

function readContainer(glb: Uint8Array): Container | null {
	if (glb.byteLength < 28) return null
	const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
	if (
		view.getUint32(0, true) !== GLB_MAGIC ||
		view.getUint32(4, true) !== 2 ||
		view.getUint32(8, true) !== glb.byteLength
	)
		return null
	const jsonLength = view.getUint32(12, true)
	if (view.getUint32(16, true) !== JSON_CHUNK || jsonLength > MAX_JSON_BYTES || 20 + jsonLength + 8 > glb.byteLength)
		return null
	const binLength = view.getUint32(20 + jsonLength, true)
	if (view.getUint32(24 + jsonLength, true) !== BIN_CHUNK || 28 + jsonLength + binLength > glb.byteLength) return null
	try {
		const json: unknown = JSON.parse(
			new TextDecoder('utf-8', { fatal: true }).decode(glb.subarray(20, 20 + jsonLength))
		)
		if (!isObject(json)) return null
		return { json, bin: glb.subarray(28 + jsonLength, 28 + jsonLength + binLength) }
	} catch {
		return null
	}
}

function writeContainer(json: Json, bin: Uint8Array): Uint8Array {
	const text = new TextEncoder().encode(JSON.stringify(json))
	const jsonLength = align4(text.byteLength)
	const binLength = align4(bin.byteLength)
	const out = new Uint8Array(28 + jsonLength + binLength)
	const view = new DataView(out.buffer)
	view.setUint32(0, GLB_MAGIC, true)
	view.setUint32(4, 2, true)
	view.setUint32(8, out.byteLength, true)
	view.setUint32(12, jsonLength, true)
	view.setUint32(16, JSON_CHUNK, true)
	out.set(text, 20)
	out.fill(0x20, 20 + text.byteLength, 20 + jsonLength)
	view.setUint32(20 + jsonLength, binLength, true)
	view.setUint32(24 + jsonLength, BIN_CHUNK, true)
	out.set(bin, 28 + jsonLength)
	return out
}

function records(value: unknown): Json[] {
	return Array.isArray(value) && value.every(isObject) ? value : []
}

function integer(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

interface Plan {
	view: Json
	mode: 'ATTRIBUTES' | 'TRIANGLES'
	count: number
	size: number
	/** An 8-bit index accessor is widened to 16 bits: TRIANGLES only accepts 2 or 4 bytes. */
	widen: boolean
	accessor: Json
}

/** One accessor per vertex view and per index view, as the Minemories writers emit them. */
function plans(json: Json): Map<number, Plan> {
	const views = records(json.bufferViews)
	const accessors = records(json.accessors)
	const found = new Map<number, Plan>()
	const taken = new Set<number>()
	const add = (accessorIndex: unknown, mode: 'ATTRIBUTES' | 'TRIANGLES') => {
		const accessor = integer(accessorIndex) ? accessors[accessorIndex] : undefined
		if (!(accessor && integer(accessor.bufferView))) return
		const index = accessor.bufferView
		if (taken.has(index)) {
			found.delete(index)
			return
		}
		taken.add(index)
		const plan = planFor(views[index], accessor, mode)
		if (plan) found.set(index, plan)
	}
	for (const mesh of records(json.meshes)) {
		for (const primitive of records(mesh.primitives)) {
			if (primitive.mode !== undefined && primitive.mode !== 4) continue
			if (isObject(primitive.attributes))
				for (const value of Object.values(primitive.attributes)) add(value, 'ATTRIBUTES')
			add(primitive.indices, 'TRIANGLES')
		}
	}
	return found
}

function sizeOf(view: Json, accessor: Json, mode: 'ATTRIBUTES' | 'TRIANGLES') {
	const components = TYPE_COMPONENTS.get(accessor.type as string)
	const componentBytes = COMPONENT_BYTES.get(accessor.componentType as number)
	if (!(components && componentBytes)) return null
	const widen = mode === 'TRIANGLES' && accessor.componentType === 5121
	const stride = integer(view.byteStride) ? view.byteStride : components * componentBytes
	const size = widen ? 2 : stride
	const indices = mode === 'TRIANGLES' && components === 1 && (size === 2 || size === 4)
	const attributes = mode === 'ATTRIBUTES' && size % 4 === 0 && size <= 256
	return indices || attributes ? { size, stride, widen } : null
}

function planFor(view: Json | undefined, accessor: Json, mode: 'ATTRIBUTES' | 'TRIANGLES'): Plan | null {
	if (!(view && integer(accessor.count) && accessor.count > 0 && integer(view.byteLength))) return null
	if (accessor.byteOffset !== undefined && accessor.byteOffset !== 0) return null
	if (view.extensions !== undefined || accessor.sparse !== undefined) return null
	const layout = sizeOf(view, accessor, mode)
	if (!layout || view.byteLength !== accessor.count * layout.stride) return null
	return { view, mode, count: accessor.count, size: layout.size, widen: layout.widen, accessor }
}

function widened(source: Uint8Array): Uint8Array {
	const out = new Uint8Array(source.byteLength * 2)
	const view = new DataView(out.buffer)
	for (let index = 0; index < source.byteLength; index++) view.setUint16(index * 2, source[index] as number, true)
	return out
}

interface Packed {
	views: Json[]
	body: Uint8Array
	fallback: number
}

function compressedView(view: Json, plan: Plan, source: Uint8Array, start: number, length: number, at: number): Json {
	return {
		...view,
		buffer: 1,
		byteOffset: at,
		byteLength: source.byteLength,
		byteStride: plan.mode === 'ATTRIBUTES' ? plan.size : undefined,
		extensions: {
			[EXTENSION]: {
				buffer: 0,
				byteOffset: start,
				byteLength: length,
				byteStride: plan.size,
				mode: plan.mode,
				filter: 'NONE',
				count: plan.count,
			},
		},
	}
}

interface Cursor {
	packed: number
	fallback: number
	parts: { at: number; bytes: Uint8Array }[]
}

function packOne(
	view: Json,
	raw: Uint8Array,
	plan: Plan | undefined,
	encoder: MeshoptEncoderLike,
	cursor: Cursor
): Json {
	const start = align4(cursor.packed)
	if (!plan) {
		cursor.parts.push({ at: start, bytes: raw })
		cursor.packed = start + raw.byteLength
		return { ...view, buffer: 0, byteOffset: start }
	}
	const source = plan.widen ? widened(raw) : raw
	const compressed = encoder.encodeGltfBuffer(source, plan.count, plan.size, plan.mode)
	cursor.parts.push({ at: start, bytes: compressed })
	cursor.packed = start + compressed.byteLength
	const at = align4(cursor.fallback)
	cursor.fallback = at + source.byteLength
	if (plan.widen) plan.accessor.componentType = 5123
	return compressedView(view, plan, source, start, compressed.byteLength, at)
}

function packViews(bin: Uint8Array, views: Json[], chosen: Map<number, Plan>, encoder: MeshoptEncoderLike): Packed {
	const cursor: Cursor = { packed: 0, fallback: 0, parts: [] }
	const next = views.map((view, index) => {
		const offset = integer(view.byteOffset) ? view.byteOffset : 0
		const raw = bin.subarray(offset, offset + (view.byteLength as number))
		return packOne(view, raw, chosen.get(index), encoder, cursor)
	})
	const body = new Uint8Array(align4(cursor.packed))
	for (const part of cursor.parts) body.set(part.bytes, part.at)
	return { views: next, body, fallback: align4(cursor.fallback) }
}

function withExtension(names: unknown): unknown[] {
	return [...new Set([...(Array.isArray(names) ? names : []), EXTENSION])]
}

/**
 * Compresses the vertex and index views with EXT_meshopt_compression, keeping the order of the triangles.
 * Returns null when the file is not a plain Minemories GLB or when nothing would be gained.
 */
export function compressGlb(glb: Uint8Array, encoder: MeshoptEncoderLike): Uint8Array | null {
	const container = readContainer(glb)
	if (!container) return null
	const { json, bin } = container
	if (JSON.stringify(json).includes(EXTENSION)) return null
	const chosen = plans(json)
	const views = records(json.bufferViews)
	if (chosen.size === 0 || views.length === 0) return null
	const packed = packViews(bin, views, chosen, encoder)
	const output: Json = {
		...json,
		bufferViews: packed.views,
		buffers: [
			{ byteLength: packed.body.byteLength },
			{ byteLength: packed.fallback, extensions: { [EXTENSION]: { fallback: true } } },
		],
		extensionsUsed: withExtension(json.extensionsUsed),
		extensionsRequired: withExtension(json.extensionsRequired),
	}
	const result = writeContainer(output, packed.body)
	return result.byteLength < glb.byteLength ? result : null
}

function withoutExtensions(view: Json): Json {
	const copy = { ...view }
	delete copy.extensions
	return copy
}

interface Compressed {
	buffer: number
	byteOffset: number
	byteLength: number
	byteStride: number
	mode: string
	filter: string
	count: number
}

function compression(view: Json): Compressed | null {
	const extension = isObject(view.extensions) ? view.extensions[EXTENSION] : undefined
	if (!isObject(extension)) return null
	const { buffer, byteOffset, byteLength, byteStride, count, mode } = extension
	const filter = extension.filter === undefined ? 'NONE' : extension.filter
	if (!(buffer === 0 && integer(byteLength) && integer(byteStride) && integer(count) && typeof mode === 'string'))
		return null
	if (!(MODES.has(mode) && typeof filter === 'string' && (byteOffset === undefined || integer(byteOffset)))) return null
	return { buffer, byteOffset: byteOffset ?? 0, byteLength, byteStride, mode, filter, count }
}

function expandedSizes(views: Json[]): number[] | null {
	let total = 0
	const sizes: number[] = []
	for (const view of views) {
		if (!integer(view.byteLength)) return null
		total = align4(total) + view.byteLength
		if (total > MAX_EXPANDED_BYTES) return null
		sizes.push(view.byteLength)
	}
	return sizes
}

/** Copies or decodes one view into `out` at `at`; false when it is inconsistent with the binary chunk. */
function expandView(
	view: Json,
	length: number,
	bin: Uint8Array,
	decoder: MeshoptDecoderLike,
	target: Uint8Array
): boolean {
	const settings = compression(view)
	if (settings) {
		if (settings.byteStride * settings.count !== length) return false
		if (settings.byteOffset + settings.byteLength > bin.byteLength) return false
		const source = bin.subarray(settings.byteOffset, settings.byteOffset + settings.byteLength)
		decoder.decodeGltfBuffer(target, settings.count, settings.byteStride, source, settings.mode, settings.filter)
		return true
	}
	const offset = integer(view.byteOffset) ? view.byteOffset : 0
	if (view.buffer !== 0 || offset + length > bin.byteLength) return false
	target.set(bin.subarray(offset, offset + length))
	return true
}

function withoutExtension(names: unknown): unknown[] {
	return (Array.isArray(names) ? names : []).filter(name => name !== EXTENSION)
}

/**
 * Expands a compressed GLB into an ordinary one. Returns null for anything that is not a well-formed
 * Minemories derivative, never throwing on hostile input: the result is validated like any other GLB.
 */
export function expandGlb(glb: Uint8Array, decoder: MeshoptDecoderLike): Uint8Array | null {
	const container = readContainer(glb)
	if (!container) return null
	const { json, bin } = container
	const views = records(json.bufferViews)
	const buffers = records(json.buffers)
	const [main, fallback] = buffers
	if (buffers.length !== 2 || fallback?.uri !== undefined) return null
	if (!(integer(main?.byteLength) && main.byteLength <= bin.byteLength)) return null
	const sizes = expandedSizes(views)
	if (!sizes) return null
	const out = new Uint8Array(align4(sizes.reduce((total, size) => align4(total) + size, 0)))
	const next: Json[] = []
	let cursor = 0
	try {
		for (const [index, view] of views.entries()) {
			const at = align4(cursor)
			const length = sizes[index] as number
			if (!expandView(view, length, bin, decoder, out.subarray(at, at + length))) return null
			next.push({ ...withoutExtensions(view), buffer: 0, byteOffset: at })
			cursor = at + length
		}
	} catch {
		return null
	}
	const output: Json = {
		...json,
		bufferViews: next,
		buffers: [{ byteLength: out.byteLength }],
		extensionsUsed: withoutExtension(json.extensionsUsed),
		extensionsRequired: withoutExtension(json.extensionsRequired),
	}
	for (const key of ['extensionsUsed', 'extensionsRequired'] as const) {
		if ((output[key] as unknown[]).length === 0) delete output[key]
	}
	return writeContainer(output, out)
}
