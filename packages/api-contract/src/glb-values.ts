import { type Accessor, accessors, type BufferView, bufferViews, type JsonObject, object, objects } from './glb-layout'

export const GLB_VALUE_WINDOW_BYTES = 64 * 1024
export type GlbBufferReader = (buffer: number, offset: number, length: number) => Promise<Uint8Array | null>

function dataView(bytes: Uint8Array): DataView {
	return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}
function component(view: DataView, offset: number, type: number): number {
	switch (type) {
		case 5120:
			return view.getInt8(offset)
		case 5121:
			return view.getUint8(offset)
		case 5122:
			return view.getInt16(offset, true)
		case 5123:
			return view.getUint16(offset, true)
		case 5125:
			return view.getUint32(offset, true)
		default:
			return view.getFloat32(offset, true)
	}
}
function componentOffsets(accessor: Accessor): number[] {
	const columns = accessor.type.startsWith('MAT') ? Math.sqrt(accessor.components) : 1
	const columnBytes = Math.ceil((columns * accessor.componentBytes) / 4) * 4
	return Array.from({ length: accessor.components }, (_, index) =>
		columns === 1
			? index * accessor.componentBytes
			: Math.floor(index / columns) * columnBytes + (index % columns) * accessor.componentBytes
	)
}

class Bounds {
	readonly min: number[]
	readonly max: number[]
	readonly offsets: number[]
	constructor(
		readonly accessor: Accessor,
		readonly indexLimit: number | undefined
	) {
		this.min = Array<number>(accessor.components).fill(Number.POSITIVE_INFINITY)
		this.max = Array<number>(accessor.components).fill(Number.NEGATIVE_INFINITY)
		this.offsets = componentOffsets(accessor)
	}
	add(view: DataView, offset: number, effective = true): boolean {
		for (let index = 0; index < this.offsets.length; index++) {
			const value = component(view, offset + (this.offsets[index] as number), this.accessor.componentType)
			if (!Number.isFinite(value)) return false
			if (!effective) continue
			if (this.indexLimit !== undefined && value >= this.indexLimit) return false
			this.min[index] = Math.min(this.min[index] as number, value)
			this.max[index] = Math.max(this.max[index] as number, value)
		}
		return true
	}
	addZero() {
		for (let index = 0; index < this.min.length; index++) {
			this.min[index] = Math.min(this.min[index] as number, 0)
			this.max[index] = Math.max(this.max[index] as number, 0)
		}
	}
	matches(): boolean {
		return (
			this.boundMatches(this.accessor.source.min, this.min) && this.boundMatches(this.accessor.source.max, this.max)
		)
	}
	private boundMatches(declared: unknown, actual: number[]): boolean {
		if (!Array.isArray(declared)) return true
		return declared.every((value: number, index) =>
			this.accessor.componentType === 5126 ? Math.fround(value) === actual[index] : value === actual[index]
		)
	}
}

class SparseCursor {
	indices: number[] = []
	values: DataView = new DataView(new ArrayBuffer(0))
	position = 0
	readCount = 0
	previous = -1
	readonly count: number
	readonly indexSource: JsonObject
	readonly valueSource: JsonObject
	constructor(
		readonly accessor: Accessor,
		readonly views: BufferView[],
		readonly read: GlbBufferReader,
		sparse: JsonObject
	) {
		// Layout validation has already checked these objects, counts and references.
		this.count = sparse.count as number
		this.indexSource = sparse.indices as JsonObject
		this.valueSource = sparse.values as JsonObject
	}
	get exhausted() {
		return this.position === this.indices.length
	}
	get finished() {
		return this.exhausted && this.readCount === this.count
	}
	get nextIndex() {
		return this.indices[this.position] ?? Number.POSITIVE_INFINITY
	}
	async load(): Promise<boolean> {
		const type = this.indexSource.componentType as number
		const bytes = indexComponentBytes(type)
		const count = Math.min(
			this.count - this.readCount,
			Math.floor(GLB_VALUE_WINDOW_BYTES / Math.max(bytes, this.accessor.elementBytes))
		)
		const [indices, values] = await Promise.all([
			this.range(this.indexSource, bytes, count),
			this.range(this.valueSource, this.accessor.elementBytes, count),
		])
		if (!(indices && values)) return false
		const view = dataView(indices)
		this.indices = []
		for (let index = 0; index < count; index++) {
			const value = component(view, index * bytes, type)
			if (value <= this.previous || value >= this.accessor.count) return false
			this.indices.push(value)
			this.previous = value
		}
		this.values = dataView(values)
		this.position = 0
		this.readCount += count
		return true
	}
	private async range(source: JsonObject, bytes: number, count: number): Promise<Uint8Array | null> {
		const view = this.views[source.bufferView as number] as BufferView
		const length = count * bytes
		const result = await this.read(
			view.buffer,
			view.offset + ((source.byteOffset ?? 0) as number) + this.readCount * bytes,
			length
		)
		return result?.byteLength === length ? result : null
	}
}

function indexComponentBytes(type: number): number {
	if (type === 5121) return 1
	if (type === 5123) return 2
	return 4
}

async function scanWindow(
	view: DataView,
	first: number,
	count: number,
	stride: number,
	bounds: Bounds,
	sparse: SparseCursor | undefined
): Promise<boolean> {
	for (let index = 0; index < count; index++) {
		if (sparse?.exhausted && !sparse.finished) {
			// biome-ignore lint/performance/noAwaitInLoops: Consume sorted replacements in bounded dependent windows.
			if (!(await sparse.load())) return false
		}
		const replaced = sparse?.nextIndex === first + index
		if (!bounds.add(view, index * stride, !replaced)) return false
		if (replaced && sparse) {
			if (!bounds.add(sparse.values, sparse.position * bounds.accessor.elementBytes)) return false
			sparse.position++
		}
	}
	return true
}

async function scanImplicit(bounds: Bounds, sparse: SparseCursor | undefined): Promise<boolean> {
	// Format-only accessors without a base or replacements may declare arbitrary bounds (glTF 3.6.3.7).
	if (!sparse) return true
	if (sparse.count < bounds.accessor.count) bounds.addZero()
	while (!sparse.finished) {
		// biome-ignore lint/performance/noAwaitInLoops: Keep only one replacement window in memory.
		if (!(await sparse.load())) return false
		for (; sparse.position < sparse.indices.length; sparse.position++) {
			if (!bounds.add(sparse.values, sparse.position * bounds.accessor.elementBytes)) return false
		}
	}
	return bounds.matches()
}

async function scanAccessor(
	accessor: Accessor,
	views: BufferView[],
	read: GlbBufferReader,
	limit: number | undefined
): Promise<boolean> {
	const bounds = new Bounds(accessor, limit)
	const sparse = object(accessor.source.sparse)
		? new SparseCursor(accessor, views, read, accessor.source.sparse)
		: undefined
	if (!accessor.view) return scanImplicit(bounds, sparse)
	const view = accessor.view
	const stride = view.stride ?? accessor.elementBytes
	const windowCount = Math.floor((GLB_VALUE_WINDOW_BYTES - accessor.elementBytes) / stride) + 1
	for (let first = 0; first < accessor.count; first += windowCount) {
		const count = Math.min(windowCount, accessor.count - first)
		const length = (count - 1) * stride + accessor.elementBytes
		// biome-ignore lint/performance/noAwaitInLoops: Read and validate one bounded accessor window at a time.
		const bytes = await read(view.buffer, view.offset + accessor.offset + first * stride, length)
		if (bytes?.byteLength !== length) return false
		if (!(await scanWindow(dataView(bytes), first, count, stride, bounds, sparse))) return false
	}
	return bounds.matches()
}

function indexLimits(document: JsonObject, entries: Accessor[]): Map<number, number> {
	const limits = new Map<number, number>()
	for (const mesh of objects(document.meshes) ?? []) {
		for (const primitive of objects(mesh.primitives) ?? []) {
			if (primitive.indices === undefined || !object(primitive.attributes)) continue
			const index = primitive.indices as number
			const indices = entries[index] as Accessor
			const positions = entries[primitive.attributes.POSITION as number] as Accessor
			const limit = Math.min(positions.count, 2 ** (indices.componentBytes * 8) - 1)
			limits.set(index, Math.min(limits.get(index) ?? limit, limit))
		}
	}
	return limits
}

/** Call only after validating the document's geometry layout and resource ranges. */
export async function validAccessorValues(document: JsonObject, read: GlbBufferReader): Promise<boolean> {
	const views = bufferViews(document)
	const entries = views && accessors(document, views)
	if (!(views && entries)) return false
	const limits = indexLimits(document, entries)
	for (let index = 0; index < entries.length; index++) {
		// biome-ignore lint/performance/noAwaitInLoops: Bound memory independently of accessor count.
		if (!(await scanAccessor(entries[index] as Accessor, views, read, limits.get(index)))) return false
	}
	return true
}
