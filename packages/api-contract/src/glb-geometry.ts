import {
	type Accessor,
	accessors,
	type BufferView,
	bufferViews,
	integer,
	type JsonObject,
	MAX_GLB_DRAW_ELEMENTS,
	object,
	objects,
	reference,
} from './glb-layout'
import { validSceneGeometry } from './glb-scenes'
import { consistentViewUsage } from './glb-view-usage'

export const MAX_GLB_PRIMITIVES = 4096
export { MAX_GLB_DRAW_ELEMENTS } from './glb-layout'

const indexedSemantic = /^(TEXCOORD|COLOR|JOINTS|WEIGHTS)_(0|[1-9]\d{0,8})$/
const indexedPrefix = /^(TEXCOORD|COLOR|JOINTS|WEIGHTS)_/
const coreSemantics = new Set(['POSITION', 'NORMAL', 'TANGENT'])
const unsignedSmall = new Set([5121, 5123])
const quantizedComponents = new Set([5120, 5121, 5122, 5123])

export function validGeometry(document: JsonObject): boolean {
	const views = bufferViews(document)
	if (!views) return false
	const entries = accessors(document, views)
	if (!(entries && validImages(document, views))) return false
	const meshes = objects(document.meshes)
	const materials = objects(document.materials)
	if (!(meshes && materials)) return false
	const quantized = Array.isArray(document.extensionsUsed) && document.extensionsUsed.includes('KHR_mesh_quantization')
	const draws = meshElements(meshes, entries, materials, quantized)
	return draws !== null && validSceneGeometry(document, draws, entries) && consistentViewUsage(document, views, entries)
}
function meshElements(
	meshes: JsonObject[],
	entries: Accessor[],
	materials: JsonObject[],
	quantized: boolean
): number[] | null {
	const draws: number[] = []
	let primitiveCount = 0
	let elements = 0
	for (const mesh of meshes) {
		const primitives = objects(mesh.primitives)
		if (!primitives || primitives.length === 0) return null
		primitiveCount += primitives.length
		if (primitiveCount > MAX_GLB_PRIMITIVES) return null
		let drawCount = 0
		for (const primitive of primitives) {
			const count = primitiveElements(primitive, entries, materials, quantized)
			if (count === null) return null
			drawCount += count
		}
		elements += drawCount
		if (elements > MAX_GLB_DRAW_ELEMENTS) return null
		draws.push(drawCount)
	}
	return draws
}
function validImages(document: JsonObject, views: BufferView[]): boolean {
	const images = objects(document.images)
	if (!images) return false
	return images.every(image => {
		if (image.bufferView === undefined) return true
		const view = reference(image.bufferView, views)
		return view !== undefined && view.stride === undefined && view.target === undefined
	})
}
function primitiveElements(
	primitive: JsonObject,
	entries: Accessor[],
	materials: JsonObject[],
	quantized: boolean
): number | null {
	if (compressedPrimitive(primitive)) return null
	if (primitive.material !== undefined && !reference(primitive.material, materials)) return null
	const attributes = primitive.attributes
	if (!object(attributes) || Object.keys(attributes).length === 0) return null
	const position = reference(attributes.POSITION, entries)
	if (!(position && validAttributes(attributes, entries, position.count, quantized, false))) return null
	if (!validTargets(primitive.targets, entries, position.count, quantized)) return null
	const indices = reference(primitive.indices, entries)
	if (primitive.indices !== undefined && !validIndices(indices)) return null
	const count = indices?.count ?? position.count
	return validTopology(primitive.mode === undefined ? 4 : primitive.mode, count) ? count : null
}
function validIndices(accessor: Accessor | undefined): boolean {
	return (
		accessor !== undefined &&
		accessor.type === 'SCALAR' &&
		!accessor.normalized &&
		(unsignedSmall.has(accessor.componentType) || accessor.componentType === 5125) &&
		accessor.view?.stride === undefined &&
		(accessor.view?.target === undefined || accessor.view.target === 34963)
	)
}
function validTopology(mode: unknown, count: number): boolean {
	if (!integer(mode) || mode > 6) return false
	if (mode === 0) return count >= 1
	if (mode === 1) return count >= 2 && count % 2 === 0
	if (mode === 2 || mode === 3) return count >= 2
	if (mode === 4) return count >= 3 && count % 3 === 0
	return count >= 3
}
function validTargets(value: unknown, entries: Accessor[], count: number, quantized: boolean): boolean {
	if (value === undefined) return true
	const targets = objects(value)
	return (
		targets !== null &&
		targets.length <= 64 &&
		targets.every(target => Object.keys(target).length > 0 && validAttributes(target, entries, count, quantized, true))
	)
}
function validAttributes(
	attributes: JsonObject,
	entries: Accessor[],
	count: number,
	quantized: boolean,
	morph: boolean
): boolean {
	return Object.entries(attributes).every(([name, index]) => {
		const accessor = reference(index, entries)
		if (!accessor || accessor.count !== count || !vertexLayout(accessor)) return false
		if (!semanticType(name, accessor, quantized, morph)) return false
		const indexed = indexedSemantic.exec(name)
		return !indexed || validIndexedPairs(attributes, indexed[1], Number(indexed[2]))
	})
}
function vertexLayout(accessor: Accessor): boolean {
	if (accessor.type.startsWith('MAT') || accessor.componentType === 5125) return false
	const view = accessor.view
	if (!view) return true
	return (
		(view.target === undefined || view.target === 34962) &&
		accessor.offset % 4 === 0 &&
		(accessor.componentBytes === 4 || view.stride !== undefined)
	)
}
function validIndexedPairs(attributes: JsonObject, semantic: string | undefined, index: number): boolean {
	if (index > 0 && attributes[`${semantic}_${index - 1}`] === undefined) return false
	if (semantic === 'JOINTS') return attributes[`WEIGHTS_${index}`] !== undefined
	if (semantic === 'WEIGHTS') return attributes[`JOINTS_${index}`] !== undefined
	return true
}
function semanticType(name: string, accessor: Accessor, quantized: boolean, morph: boolean): boolean {
	if (coreSemantics.has(name)) return coreType(name, accessor, quantized, morph)
	const indexed = indexedSemantic.exec(name)
	if (indexed) return indexedType(indexed[1], accessor, quantized, morph)
	return !(indexedPrefix.test(name) || morph) && (name.startsWith('_') || name.includes(':'))
}
function coreType(name: string, accessor: Accessor, quantized: boolean, morph: boolean): boolean {
	const type = name === 'TANGENT' && !morph ? 'VEC4' : 'VEC3'
	if (accessor.type !== type) return false
	if (name === 'POSITION' && (accessor.source.min === undefined || accessor.source.max === undefined)) return false
	if (accessor.componentType === 5126) return true
	if (!(quantized && quantizedComponents.has(accessor.componentType))) return false
	return (
		name === 'POSITION' || ((accessor.componentType === 5120 || accessor.componentType === 5122) && accessor.normalized)
	)
}
function indexedType(semantic: string | undefined, accessor: Accessor, quantized: boolean, morph: boolean): boolean {
	if (morph && (semantic === 'JOINTS' || semantic === 'WEIGHTS')) return false
	if (!indexedShape(semantic, accessor.type)) return false
	if (semantic === 'JOINTS') return unsignedSmall.has(accessor.componentType) && !accessor.normalized
	if (accessor.componentType === 5126) return true
	if (morph) return semantic === 'TEXCOORD' && quantized && quantizedComponents.has(accessor.componentType)
	if (unsignedSmall.has(accessor.componentType) && accessor.normalized) return true
	return semantic === 'TEXCOORD' && quantized && quantizedComponents.has(accessor.componentType)
}
function indexedShape(semantic: string | undefined, type: string): boolean {
	if (semantic === 'TEXCOORD') return type === 'VEC2'
	if (semantic === 'COLOR') return type === 'VEC3' || type === 'VEC4'
	return type === 'VEC4'
}

function compressedPrimitive(primitive: JsonObject): boolean {
	return object(primitive.extensions) && primitive.extensions.KHR_draco_mesh_compression !== undefined
}
