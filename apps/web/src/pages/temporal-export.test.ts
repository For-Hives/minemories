// @vitest-environment jsdom
import type { TemporalFrame, TileList } from '@minemories/api-contract'
import { validateSelfContainedGlb } from '@minemories/api-contract/glb'
import { describe, expect, test, vi } from 'vitest'
import { exportFileName } from '../lib/glb-merge'
import type { TileSummary } from '../lib/tiles'
import { exportFrameGlb, type FrameExportOptions, saveBlob } from './temporal-export'

const PNG = Uint8Array.from(
	atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
	character => character.charCodeAt(0)
)
const CHUNK_HEADER = 8
const origin = { x: 10, y: 64, z: 20 }

// biome-ignore lint/suspicious/noExplicitAny: test-only JSON documents
type Doc = Record<string, any>

const align4 = (length: number) => Math.ceil(length / 4) * 4

function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0))
	let offset = 0
	for (const part of parts) {
		out.set(part, offset)
		offset += part.byteLength
	}
	return out
}

function container(json: Doc, bin: Uint8Array): Uint8Array<ArrayBuffer> {
	const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
	const jsonLength = align4(jsonBytes.byteLength)
	const output = new Uint8Array(20 + jsonLength + CHUNK_HEADER + align4(bin.byteLength))
	output.fill(0x20, 20, 20 + jsonLength)
	const view = new DataView(output.buffer)
	view.setUint32(0, 0x46546c67, true)
	view.setUint32(4, 2, true)
	view.setUint32(8, output.byteLength, true)
	view.setUint32(12, jsonLength, true)
	view.setUint32(16, 0x4e4f534a, true)
	output.set(jsonBytes, 20)
	const start = 20 + jsonLength
	view.setUint32(start, align4(bin.byteLength), true)
	view.setUint32(start + 4, 0x004e4942, true)
	output.set(bin, start + CHUNK_HEADER)
	return output
}

/** One triangle, an embedded 1x1 PNG, and optionally a point light. */
function tileGlb(lit = false): Uint8Array<ArrayBuffer> {
	const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1])
	const indices = new Uint16Array([0, 1, 2])
	const bin = concat([new Uint8Array(positions.buffer), new Uint8Array(indices.buffer), PNG])
	const json: Doc = {
		asset: { version: '2.0' },
		scene: 0,
		scenes: [{ nodes: lit ? [0, 1] : [0] }],
		nodes: lit ? [{ mesh: 0 }, { extensions: { KHR_lights_punctual: { light: 0 } } }] : [{ mesh: 0 }],
		meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0, mode: 4 }] }],
		materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, emissiveTexture: { index: 0 } }],
		textures: [{ sampler: 0, source: 0 }],
		images: [{ bufferView: 2, mimeType: 'image/png' }],
		samplers: [{ magFilter: 9728, minFilter: 9728, wrapS: 10497, wrapT: 10497 }],
		accessors: [
			{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 0, 1] },
			{ bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
		],
		bufferViews: [
			{ buffer: 0, byteOffset: 0, byteLength: 36 },
			{ buffer: 0, byteOffset: 36, byteLength: 6 },
			{ buffer: 0, byteOffset: 42, byteLength: PNG.byteLength },
		],
		buffers: [{ byteLength: bin.byteLength }],
	}
	if (lit) {
		json.extensionsUsed = ['KHR_lights_punctual']
		json.extensions = { KHR_lights_punctual: { lights: [{ type: 'point', color: [1, 1, 1], intensity: 10 }] } }
	}
	return container(json, bin)
}

function frame(overrides: Partial<TemporalFrame> = {}): TemporalFrame {
	return {
		id: '11111111-1111-4111-8111-000000000001',
		name: 'My village',
		size: 3,
		at: '2026-10-01T12:00:00Z',
		timeSource: 'capture',
		captureStartedAt: null,
		captureFinishedAt: null,
		origin,
		bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
		dayTime: 6000,
		biome: 'minecraft:plains',
		seed: null,
		tileCount: 3,
		...overrides,
	}
}

function tile(x: number, z: number, size = 1): TileSummary {
	return { x, z, size, sha256: `${x}:${z}`, quads: 1 }
}

function listOf(tiles: TileSummary[]): TileList {
	return { memoryId: frame().id, tileChunks: 8, tiles }
}

function readJson(glb: Uint8Array): Doc {
	const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
	const length = view.getUint32(12, true)
	return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + length)))
}

function bytesOf(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
		reader.onerror = () => reject(reader.error)
		reader.readAsArrayBuffer(blob)
	})
}

function options(overrides: Partial<FrameExportOptions> = {}): FrameExportOptions {
	return {
		frame: frame(),
		signal: new AbortController().signal,
		restore: run => run(),
		onProgress: () => undefined,
		listTiles: async () => listOf([tile(1, 0), tile(0, 1), tile(0, 0)]),
		fetchTile: async (_frame, item) => {
			const bytes = tileGlb(item.x === 1)
			return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
		},
		fetchFile: async () => new File([tileGlb()], 'whole.glb', { type: 'model/gltf-binary' }),
		...overrides,
	}
}

describe('exportFrameGlb', () => {
	test('a tiled capture merges every tile into one valid GLB, ordered by x then z, centred on the frame origin', async () => {
		const result = await exportFrameGlb(options())
		const bytes = await bytesOf(result.blob)
		expect(result.blob.type).toBe('model/gltf-binary')
		expect(result.fileName).toBe(exportFileName('My village', '2026-10-01T12:00:00Z'))
		expect(await validateSelfContainedGlb(bytes)).toBe(true)
		const nodes = readJson(bytes).nodes as Doc[]
		const placed = nodes.filter(node => typeof node.name === 'string' && node.name.startsWith('tile-'))
		expect(placed.map(node => node.translation)).toEqual([
			[-10, -64, -20],
			[-10, -64, 108],
			[118, -64, -20],
		])
	})

	test('reports progress for every tile and fetches the first tile alone through restore', async () => {
		const log: string[] = []
		const progress: [number, number][] = []
		await exportFrameGlb(
			options({
				restore: async run => {
					log.push('restore')
					return run()
				},
				fetchTile: async (_frame, item) => {
					log.push(`tile ${item.x}/${item.z}`)
					return tileGlb().buffer.slice(0)
				},
				onProgress: (done, total) => progress.push([done, total]),
			})
		)
		expect(progress).toEqual([
			[0, 3],
			[1, 3],
			[2, 3],
			[3, 3],
		])
		expect(log.filter(entry => entry === 'restore')).toHaveLength(1)
		expect(log[0]).toBe('restore')
		expect(log.slice(1)).toHaveLength(3)
	})

	test('a whole-GLB capture downloads the original file and keeps its dated name', async () => {
		const file = new File([tileGlb()], 'whole.glb', { type: 'model/gltf-binary' })
		const fetchFile = vi.fn(async () => file)
		let restored = 0
		const fetchTile = vi.fn()
		const result = await exportFrameGlb(
			options({
				frame: frame({ tileCount: undefined }),
				fetchFile,
				restore: run => {
					restored += 1
					return run()
				},
				fetchTile,
			})
		)
		expect(result).toEqual({ blob: file, fileName: 'my-village-20261001-120000.glb' })
		expect(restored).toBe(1)
		expect(fetchFile).toHaveBeenCalledOnce()
		expect(fetchTile).not.toHaveBeenCalled()
	})

	test('refuses a merged capture larger than 450 MiB before fetching any tile', async () => {
		const fetchTile = vi.fn()
		const size = 450 * 1024 * 1024
		await expect(
			exportFrameGlb(options({ listTiles: async () => listOf([tile(0, 0, size), tile(1, 0, 1)]), fetchTile }))
		).rejects.toThrow('The merged capture is too large to export as one file')
		expect(fetchTile).not.toHaveBeenCalled()
	})

	test('invalid tile bytes reject instead of producing a file', async () => {
		await expect(
			exportFrameGlb(options({ fetchTile: async () => new TextEncoder().encode('not a glb').buffer }))
		).rejects.toThrow()
	})

	test('an aborted export rejects and fetches nothing', async () => {
		const controller = new AbortController()
		controller.abort()
		const fetchTile = vi.fn()
		await expect(exportFrameGlb(options({ signal: controller.signal, fetchTile }))).rejects.toThrow()
		expect(fetchTile).not.toHaveBeenCalled()
	})

	test('saveBlob clicks a temporary download link and revokes its object URL', async () => {
		const createObjectURL = vi.fn(() => 'blob:minemories-export')
		const revokeObjectURL = vi.fn()
		vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
		const clicks: { href: string; download: string }[] = []
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
			clicks.push({ href: this.href, download: this.download })
		})
		const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'model/gltf-binary' })
		saveBlob(blob, 'my-village-20261001-120000.glb')
		expect(createObjectURL).toHaveBeenCalledWith(blob)
		expect(clicks).toEqual([{ href: 'blob:minemories-export', download: 'my-village-20261001-120000.glb' }])
		expect(document.querySelector('a[download]')).toBeNull()
		await vi.waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:minemories-export'))
		click.mockRestore()
		vi.unstubAllGlobals()
	})
})
