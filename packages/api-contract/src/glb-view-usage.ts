import { type Accessor, type BufferView, type JsonObject, object, objects, reference } from './glb-layout'

type Usage = { kind: 'image' | 'index' | 'vertex'; accessors: Set<Accessor> }
/** A vertex view can only carry vertex data; shared attributes require an explicit stride. */
export function consistentViewUsage(document: JsonObject, views: BufferView[], entries: Accessor[]): boolean {
	const usage = new Map<BufferView, Usage>()
	for (const image of objects(document.images) ?? []) {
		const view = reference(image.bufferView, views)
		if (view && !claim(usage, view, 'image')) return false
	}
	if (!(objects(document.meshes) ?? []).every(mesh => meshUsage(mesh, entries, usage))) return false
	for (const node of objects(document.nodes) ?? []) {
		const instances = object(node.extensions) ? node.extensions.EXT_mesh_gpu_instancing : undefined
		if (object(instances) && !attributesUsage(instances.attributes, entries, usage)) return false
	}
	return true
}
function primitiveUsage(primitive: JsonObject, entries: Accessor[], usage: Map<BufferView, Usage>): boolean {
	if (!attributesUsage(primitive.attributes, entries, usage)) return false
	for (const target of objects(primitive.targets) ?? []) if (!attributesUsage(target, entries, usage)) return false
	const indices = reference(primitive.indices, entries)
	return !indices?.view || claim(usage, indices.view, 'index', indices)
}
function attributesUsage(attributes: unknown, entries: Accessor[], usage: Map<BufferView, Usage>): boolean {
	if (!object(attributes)) return false
	return Object.values(attributes).every(index => {
		const accessor = reference(index, entries)
		return !accessor?.view || claim(usage, accessor.view, 'vertex', accessor)
	})
}
function claim(usage: Map<BufferView, Usage>, view: BufferView, kind: Usage['kind'], accessor?: Accessor): boolean {
	const entry = usage.get(view) ?? { kind, accessors: new Set<Accessor>() }
	if (entry.kind !== kind) return false
	if (accessor) entry.accessors.add(accessor)
	if (kind === 'vertex' && entry.accessors.size > 1 && view.stride === undefined) return false
	usage.set(view, entry)
	return true
}

function meshUsage(mesh: JsonObject, entries: Accessor[], usage: Map<BufferView, Usage>): boolean {
	return (objects(mesh.primitives) ?? []).every(primitive => primitiveUsage(primitive, entries, usage))
}
