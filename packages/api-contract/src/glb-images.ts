import { avifCost } from './avif-dimensions'
import { type BufferView, bufferViews, integer, type JsonObject, object, objects } from './glb-layout'
import type { GlbBufferReader } from './glb-values'
import { type ImageCost, ImageReader, ImageWork, MAX_TEXTURE_DECODE_BYTES, MAX_TEXTURE_PIXELS } from './image-reader'
import { ktxCost } from './ktx-dimensions'
import { jpegCost, pngCost, webpCost } from './raster-dimensions'

export const MAX_GLB_IMAGES = 1024
export const MAX_GLB_TEXTURES = 4096
const dimensions = new Map([
	['image/png', pngCost],
	['image/jpeg', jpegCost],
	['image/webp', webpCost],
	['image/avif', avifCost],
	['image/ktx2', ktxCost],
])
const textureExtensions = ['KHR_texture_basisu', 'EXT_texture_webp', 'EXT_texture_avif']
const percentByte = /^[a-f0-9]{2}$/i

function percentBytes(value: string): Uint8Array | null {
	const output = new Uint8Array(value.length)
	let written = 0
	for (let index = 0; index < value.length; index++) {
		if (value[index] === '%') {
			const byte = value.slice(index + 1, index + 3)
			if (!percentByte.test(byte)) return null
			output[written++] = Number.parseInt(byte, 16)
			index += 2
		} else {
			const byte = value.charCodeAt(index)
			if (byte > 127) return null
			output[written++] = byte
		}
	}
	return output.subarray(0, written)
}
function inlineImage(uri: string): { mime: string; bytes: Uint8Array } | null {
	try {
		const comma = uri.indexOf(',')
		const parts = uri.slice(5, comma).toLowerCase().split(';')
		const encoded = percentBytes(uri.slice(comma + 1))
		if (!encoded) return null
		const bytes = parts.includes('base64')
			? Uint8Array.from(atob(new TextDecoder('ascii').decode(encoded)), character => character.charCodeAt(0))
			: encoded
		return { mime: parts[0] as string, bytes }
	} catch {
		return null
	}
}
function imageReader(image: JsonObject, views: BufferView[], read: GlbBufferReader, work: ImageWork) {
	if (typeof image.uri === 'string') {
		const inline = inlineImage(image.uri)
		if (!inline || (image.mimeType !== undefined && (image.mimeType as string).toLowerCase() !== inline.mime))
			return null
		return {
			mime: inline.mime,
			reader: new ImageReader(
				inline.bytes.length,
				(offset, length) => Promise.resolve(inline.bytes.subarray(offset, offset + length)),
				work
			),
		}
	}
	const view = views[image.bufferView as number]
	if (!view) return null
	return {
		mime: (image.mimeType as string).toLowerCase(),
		reader: new ImageReader(view.length, (offset, length) => read(view.buffer, view.offset + offset, length), work),
	}
}
function textureSources(texture: JsonObject): unknown[] {
	const sources: unknown[] = []
	if (texture.source !== undefined) sources.push(texture.source)
	if (object(texture.extensions)) {
		for (const name of textureExtensions) {
			const extension = texture.extensions[name]
			if (object(extension)) sources.push(extension.source)
		}
	}
	return [...new Set(sources)]
}
function totalBudget(document: JsonObject, costs: ImageCost[]): boolean {
	const textures = objects(document.textures)
	if (!textures || textures.length > MAX_GLB_TEXTURES) return false
	const copies = Array<number>(costs.length).fill(0)
	for (const texture of textures) {
		const sources = textureSources(texture)
		if (sources.length === 0) return false
		for (const source of sources) {
			if (!(integer(source) && costs[source])) return false
			copies[source] = (copies[source] as number) + 1
		}
	}
	let pixels = 0
	let bytes = 0
	for (let index = 0; index < costs.length; index++) {
		const cost = costs[index] as ImageCost
		const count = Math.max(1, copies[index] as number)
		pixels += cost.pixels * count
		bytes += cost.bytes * count
		if (pixels > MAX_TEXTURE_PIXELS || bytes > MAX_TEXTURE_DECODE_BYTES) return false
	}
	return true
}
/** Inspect encoded headers before any browser decoder or S3 publication. */
export async function validImageCosts(document: JsonObject, read: GlbBufferReader): Promise<boolean> {
	const images = objects(document.images)
	const views = bufferViews(document)
	if (!(images && views) || images.length > MAX_GLB_IMAGES) return false
	const work = new ImageWork()
	const costs: ImageCost[] = []
	for (const image of images) {
		const parsed = imageReader(image, views, read, work)
		if (!parsed) return false
		const cost = dimensions.get(parsed.mime)
		if (!cost) return false
		// biome-ignore lint/performance/noAwaitInLoops: Inspect one texture at a time, within a shared metadata-work budget.
		const decoded = await cost(parsed.reader)
		if (!decoded) return false
		costs.push(decoded)
	}
	return totalBudget(document, costs)
}
