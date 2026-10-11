import {
	type Accessor,
	integer,
	type JsonObject,
	MAX_GLB_DRAW_ELEMENTS,
	object,
	objects,
	reference,
} from './glb-layout'

export const MAX_GLB_NODES = 4096
export const MAX_GLB_NODE_DEPTH = 128
const instanceTypes = new Map([
	['TRANSLATION', 'VEC3'],
	['ROTATION', 'VEC4'],
	['SCALE', 'VEC3'],
])

export function validSceneGeometry(document: JsonObject, meshes: number[], accessors: Accessor[]): boolean {
	const nodes = objects(document.nodes)
	const scenes = objects(document.scenes)
	if (!(nodes && scenes) || nodes.length > MAX_GLB_NODES) return false
	if (document.scene !== undefined && !reference(document.scene, scenes)) return false
	const graph = sceneNodes(nodes, meshes, accessors)
	if (!(graph && validForest(graph.children, graph.parents))) return false
	return scenes.every(
		scene => references(scene.nodes, nodes.length)?.every(index => graph.parents[index] === 0) === true
	)
}
function sceneNodes(
	nodes: JsonObject[],
	meshes: number[],
	accessors: Accessor[]
): { children: number[][]; parents: number[] } | null {
	const parents = new Array<number>(nodes.length).fill(0)
	const children: number[][] = []
	let drawCount = 0
	for (const node of nodes) {
		if (!transform(node)) return null
		const instances = instanceCount(node, accessors)
		const mesh = reference(node.mesh, meshes)
		if (instances === null || (node.mesh !== undefined && mesh === undefined)) return null
		drawCount += (mesh ?? 0) * instances
		if (drawCount > MAX_GLB_DRAW_ELEMENTS) return null
		const indices = references(node.children, nodes.length)
		if (!(indices && addParents(indices, parents))) return null
		children.push(indices)
	}
	return { children, parents }
}
function addParents(indices: number[], parents: number[]): boolean {
	for (const child of indices) {
		const count = parents[child] ?? 0
		parents[child] = count + 1
		if (count > 0) return false
	}
	return true
}
function references(value: unknown, length: number): number[] | null {
	if (value === undefined) return []
	if (!Array.isArray(value) || value.length > length) return null
	if (!value.every(index => integer(index) && index < length)) return null
	return new Set(value).size === value.length ? value : null
}
function transform(node: JsonObject): boolean {
	if (node.matrix !== undefined) {
		if (node.translation !== undefined || node.rotation !== undefined || node.scale !== undefined) return false
		return vector(node.matrix, 16)
	}
	return optionalVector(node.translation, 3) && optionalVector(node.rotation, 4) && optionalVector(node.scale, 3)
}
function optionalVector(value: unknown, size: number): boolean {
	return value === undefined || vector(value, size)
}
function vector(value: unknown, size: number): boolean {
	return (
		Array.isArray(value) &&
		value.length === size &&
		value.every(
			component =>
				typeof component === 'number' && Number.isFinite(component) && Math.abs(component) <= 3.4028234663852886e38
		)
	)
}
function validForest(children: number[][], parents: number[]): boolean {
	const queue = parents.flatMap((parent, index) => (parent === 0 ? [{ index, depth: 1 }] : []))
	let offset = 0
	while (offset < queue.length) {
		const entry = queue[offset++]
		if (!entry || entry.depth > MAX_GLB_NODE_DEPTH) return false
		for (const child of children[entry.index] ?? []) queue.push({ index: child, depth: entry.depth + 1 })
	}
	return queue.length === children.length
}
function instanceCount(node: JsonObject, accessors: Accessor[]): number | null {
	const extensions = node.extensions
	if (!object(extensions) || extensions.EXT_mesh_gpu_instancing === undefined) return 1
	const instances = extensions.EXT_mesh_gpu_instancing
	if (!(object(instances) && object(instances.attributes)) || node.mesh === undefined) return null
	const entries = Object.entries(instances.attributes)
	if (entries.length === 0) return null
	let count: number | undefined
	for (const [name, index] of entries) {
		const accessor = reference(index, accessors)
		if (!accessor || (count !== undefined && count !== accessor.count)) return null
		if (!instanceAttribute(name, accessor)) return null
		count = accessor.count
	}
	return count ?? null
}
function instanceAttribute(name: string, accessor: Accessor): boolean {
	const type = instanceTypes.get(name)
	if (type !== undefined) return accessor.type === type && accessor.componentType === 5126
	return name.startsWith('_') && !accessor.type.startsWith('MAT')
}
