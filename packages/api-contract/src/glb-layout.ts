export type JsonObject = Record<string, unknown>
export const MAX_GLB_DRAW_ELEMENTS = 32_000_000
export const MAX_GLB_ENTRIES = 16_384
export const MAX_GLB_ACCESSOR_ELEMENTS = 32_000_000
export const MAX_GLB_GEOMETRY_BYTES = 256 * 1024 * 1024
const componentSizes = new Map([
	[5120, 1],
	[5121, 1],
	[5122, 2],
	[5123, 2],
	[5125, 4],
	[5126, 4],
])
const componentCounts = new Map([
	['SCALAR', 1],
	['VEC2', 2],
	['VEC3', 3],
	['VEC4', 4],
	['MAT2', 4],
	['MAT3', 9],
	['MAT4', 16],
])

export interface BufferView {
	buffer: number
	offset: number
	length: number
	stride: number | undefined
	target: number | undefined
}
export interface Accessor {
	source: JsonObject
	count: number
	components: number
	componentBytes: number
	elementBytes: number
	componentType: number
	type: string
	normalized: boolean
	offset: number
	view: BufferView | undefined
}
export function object(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function objects(value: unknown): JsonObject[] | null {
	if (value === undefined) return []
	return Array.isArray(value) && value.length <= MAX_GLB_ENTRIES && value.every(object) ? value : null
}
export function integer(value: unknown, minimum = 0): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}
export function reference<T>(value: unknown, entries: readonly T[]): T | undefined {
	return integer(value) ? entries[value] : undefined
}
function optionalInteger(value: unknown, minimum = 0): boolean {
	return value === undefined || integer(value, minimum)
}
export function bufferViews(document: JsonObject): BufferView[] | null {
	const buffers = objects(document.buffers)
	const entries = objects(document.bufferViews)
	if (!(buffers && entries)) return null
	const views: BufferView[] = []
	for (const entry of entries) {
		const buffer = reference(entry.buffer, buffers)
		const offset = entry.byteOffset === undefined ? 0 : entry.byteOffset
		if (!(buffer && integer(buffer.byteLength, 1) && integer(entry.byteLength, 1) && integer(offset))) return null
		if (entry.byteLength > buffer.byteLength - offset || !validStride(entry) || !validTarget(entry.target)) return null
		// The viewer has no meshopt decoder; compressed layouts cannot bypass the byte budgets.
		if (object(entry.extensions) && entry.extensions.EXT_meshopt_compression !== undefined) return null
		views.push({
			buffer: entry.buffer as number,
			offset,
			length: entry.byteLength,
			stride: entry.byteStride as number | undefined,
			target: entry.target as number | undefined,
		})
	}
	return views
}
function validStride(entry: JsonObject): boolean {
	const stride = entry.byteStride
	return (
		stride === undefined ||
		(integer(stride, 4) && stride <= 252 && stride % 4 === 0 && stride <= (entry.byteLength as number))
	)
}
function validTarget(value: unknown): boolean {
	return value === undefined || value === 34962 || value === 34963
}
function elementBytes(type: string, components: number, bytes: number): number {
	if (!type.startsWith('MAT')) return components * bytes
	const columns = Math.sqrt(components)
	return columns * Math.ceil((columns * bytes) / 4) * 4
}
function layout(entry: JsonObject, views: BufferView[]): Accessor | null {
	const componentBytes = componentSizes.get(entry.componentType as number)
	const components = componentCounts.get(entry.type as string)
	const offset = entry.byteOffset === undefined ? 0 : entry.byteOffset
	const view = reference(entry.bufferView, views)
	if (!(componentBytes && components && integer(entry.count, 1) && integer(offset))) return null
	if (entry.bufferView !== undefined && !view) return null
	if (!validNormalization(entry)) return null
	if (!view && offset !== 0) return null
	const accessor: Accessor = {
		source: entry,
		count: entry.count,
		componentBytes,
		components,
		elementBytes: elementBytes(entry.type as string, components, componentBytes),
		componentType: entry.componentType as number,
		type: entry.type as string,
		normalized: entry.normalized === true,
		offset,
		view,
	}
	if (view && !fits(view, offset, accessor.count, accessor.elementBytes, componentBytes)) return null
	return validBounds(accessor) && validSparse(accessor, views) ? accessor : null
}
function validNormalization(entry: JsonObject): boolean {
	if (entry.normalized === undefined) return true
	return (
		typeof entry.normalized === 'boolean' &&
		!(entry.normalized && (entry.componentType === 5125 || entry.componentType === 5126))
	)
}
function fits(view: BufferView, offset: number, count: number, bytes: number, alignment: number): boolean {
	const stride = view.stride ?? bytes
	if (offset % alignment !== 0 || view.offset % alignment !== 0 || stride < bytes) return false
	return offset <= view.length && bytes <= view.length - offset && count - 1 <= (view.length - offset - bytes) / stride
}
function validBounds(accessor: Accessor): boolean {
	const { min, max } = accessor.source
	if (!(bound(min, accessor) && bound(max, accessor))) return false
	return !(Array.isArray(min) && Array.isArray(max)) || min.every((value, index) => value <= max[index])
}
function bound(value: unknown, accessor: Accessor): boolean {
	if (value === undefined) return true
	if (!Array.isArray(value) || value.length !== accessor.components) return false
	const bits = accessor.componentBytes * 8
	const signed = accessor.componentType === 5120 || accessor.componentType === 5122
	const minimum = signed ? -(2 ** (bits - 1)) : 0
	const maximum = signed ? 2 ** (bits - 1) - 1 : 2 ** bits - 1
	return value.every(component => {
		if (typeof component !== 'number' || !Number.isFinite(component)) return false
		if (accessor.componentType === 5126) return Math.abs(component) <= 3.4028234663852886e38
		return Number.isInteger(component) && component >= minimum && component <= maximum
	})
}
function sparseRange(value: unknown, views: BufferView[], count: number, bytes: number, alignment: number): boolean {
	if (!(object(value) && optionalInteger(value.byteOffset))) return false
	const view = reference(value.bufferView, views)
	return (
		view !== undefined &&
		view.stride === undefined &&
		view.target === undefined &&
		fits(view, (value.byteOffset ?? 0) as number, count, bytes, alignment)
	)
}
function validSparse(accessor: Accessor, views: BufferView[]): boolean {
	const sparse = accessor.source.sparse
	if (sparse === undefined) return true
	if (!(object(sparse) && integer(sparse.count, 1)) || sparse.count > accessor.count || !object(sparse.indices))
		return false
	const component = sparse.indices.componentType
	if (component !== 5121 && component !== 5123 && component !== 5125) return false
	const bytes = componentSizes.get(component) as number
	return (
		sparseRange(sparse.indices, views, sparse.count, bytes, bytes) &&
		sparseRange(sparse.values, views, sparse.count, accessor.elementBytes, accessor.componentBytes)
	)
}
export function accessors(document: JsonObject, views: BufferView[]): Accessor[] | null {
	const entries = objects(document.accessors)
	if (!entries) return null
	const parsed: Accessor[] = []
	let elements = 0
	let decodedBytes = 0
	for (const entry of entries) {
		const accessor = layout(entry, views)
		if (!accessor) return null
		elements += accessor.count
		// Reserve float32 expansion even for zero-filled, normalized or sparse attributes.
		decodedBytes += accessor.count * accessor.components * 4
		if (elements > MAX_GLB_ACCESSOR_ELEMENTS || decodedBytes > MAX_GLB_GEOMETRY_BYTES) return null
		parsed.push(accessor)
	}
	return parsed
}
