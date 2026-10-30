// JSON inventory of GLB captures: what weighs what, and what the files share.
import { sha256 } from './equivalence.mjs'
import { meshoptExtension, parseGlb } from './glb.mjs'

/** @param {Uint8Array} bytes */
export function inventoryOf(bytes) {
	const { json, bin } = parseGlb(bytes)
	const views = json.bufferViews ?? []
	const imageViews = new Set((json.images ?? []).map(image => image.bufferView))
	let geometryBytes = 0
	let textureBytes = 0
	const imageHashes = []
	for (const [index, view] of views.entries()) {
		const extension = meshoptExtension(view)
		if (extension) geometryBytes += extension.byteLength
		else if (view.buffer === 0 && imageViews.has(index)) {
			textureBytes += view.byteLength
			imageHashes.push(sha256(bin.subarray(view.byteOffset, view.byteOffset + view.byteLength)))
		}
	}
	const positions = (json.meshes ?? []).flatMap(mesh =>
		mesh.primitives.map(primitive => json.accessors[primitive.attributes.POSITION])
	)
	return {
		bytes: bytes.length,
		sha256: sha256(bytes),
		jsonBytes: new TextEncoder().encode(JSON.stringify(json)).length,
		geometryBytes,
		textureBytes,
		vertices: positions.reduce((sum, accessor) => sum + accessor.count, 0),
		primitives: positions.length,
		images: imageHashes.length,
		extensionsUsed: json.extensionsUsed ?? [],
		imageHashes,
	}
}

/** Inventory of several named captures, plus the images shared between files. */
export function inventoryOfAll(files) {
	const captures = {}
	const owners = new Map()
	for (const [name, bytes] of Object.entries(files)) {
		const { imageHashes, ...rest } = inventoryOf(bytes)
		captures[name] = { ...rest, uniqueImages: new Set(imageHashes).size }
		for (const hash of new Set(imageHashes)) owners.set(hash, [...(owners.get(hash) ?? []), name])
	}
	const shared = [...owners.values()].filter(names => names.length > 1).length
	return { captures, images: { unique: owners.size, sharedBetweenFiles: shared } }
}
