import { validGeometry } from './glb-geometry'

export const MAX_GLB_JSON_BYTES = 4 * 1024 * 1024
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const BUFFER_DATA_URI = /^data:application\/(octet-stream|gltf-buffer);base64,[A-Za-z0-9+/]*={0,2}$/i
const IMAGE_DATA_URI = /^data:image\/(png|jpeg|webp|avif|ktx2)(;[^,\s]*)?,[^\s]*$/i
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/ktx2'])

export function glbJsonLength(header: Uint8Array, size: number): number | null {
	if (header.byteLength < 20 || size < 20 || size % 4 !== 0) return null
	const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
	if (
		view.getUint32(0, true) !== 0x46546c67 ||
		view.getUint32(4, true) !== 2 ||
		view.getUint32(8, true) !== size ||
		view.getUint32(16, true) !== JSON_CHUNK
	)
		return null
	const length = view.getUint32(12, true)
	if (length === 0 || length % 4 !== 0 || length > MAX_GLB_JSON_BYTES || length > size - 20) return null
	return length
}

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function embeddedBuffers(value: unknown, binaryLength: number | null): boolean {
	if (value === undefined) return true
	if (!Array.isArray(value)) return false
	return value.every((resource, index) => {
		if (!record(resource)) return false
		const length = resource.byteLength
		if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 1) return false
		if (resource.uri !== undefined)
			return (
				typeof resource.uri === 'string' &&
				BUFFER_DATA_URI.test(resource.uri) &&
				bufferDataLength(resource.uri) === length
			)
		return index === 0 && binaryLength !== null && binaryLength >= length && binaryLength <= length + 3
	})
}

function bufferDataLength(uri: string): number {
	const bytes = uri.slice(uri.indexOf(',') + 1)
	if (bytes.length % 4 === 1 || (bytes.endsWith('=') && bytes.length % 4 !== 0)) return -1
	let padding = 0
	if (bytes.endsWith('==')) padding = 2
	else if (bytes.endsWith('=')) padding = 1
	return Math.floor((bytes.length * 3) / 4) - padding
}

function embeddedImages(value: unknown): boolean {
	if (value === undefined) return true
	if (!Array.isArray(value)) return false
	return value.every(resource => {
		if (!record(resource)) return false
		if (
			resource.mimeType !== undefined &&
			(typeof resource.mimeType !== 'string' || !IMAGE_MIME_TYPES.has(resource.mimeType.toLowerCase()))
		)
			return false
		if (resource.uri === undefined) {
			return (
				typeof resource.bufferView === 'number' &&
				Number.isSafeInteger(resource.bufferView) &&
				resource.bufferView >= 0 &&
				typeof resource.mimeType === 'string'
			)
		}
		return resource.bufferView === undefined && typeof resource.uri === 'string' && IMAGE_DATA_URI.test(resource.uri)
	})
}

export function embeddedGltfJson(json: Uint8Array, binaryLength: number | null = null): boolean {
	try {
		const document: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json))
		return (
			record(document) &&
			record(document.asset) &&
			document.asset.version === '2.0' &&
			embeddedBuffers(document.buffers, binaryLength) &&
			embeddedImages(document.images) &&
			validGeometry(document)
		)
	} catch {
		return false
	}
}

export function glbChunk(
	header: Uint8Array,
	index: number,
	remaining: number
): { length: number; binary: boolean } | null {
	if (index >= 64 || header.byteLength < 8 || remaining < 8) return null
	const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
	const length = view.getUint32(0, true)
	const type = view.getUint32(4, true)
	if (length % 4 !== 0 || length > remaining - 8 || type === JSON_CHUNK || (type === BIN_CHUNK && index !== 0))
		return null
	return { length, binary: type === BIN_CHUNK }
}

export function isSelfContainedGlb(contents: Uint8Array): boolean {
	const jsonLength = glbJsonLength(contents, contents.byteLength)
	if (jsonLength === null) return false
	let offset = 20 + jsonLength
	let index = 0
	let binaryLength: number | null = null
	while (offset < contents.byteLength) {
		const chunk = glbChunk(contents.subarray(offset, offset + 8), index++, contents.byteLength - offset)
		if (chunk === null) return false
		if (chunk.binary) binaryLength = chunk.length
		offset += 8 + chunk.length
	}
	return embeddedGltfJson(contents.subarray(20, 20 + jsonLength), binaryLength)
}
