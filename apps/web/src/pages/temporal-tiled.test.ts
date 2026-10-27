import type { TemporalFrame, TileList } from '@minemories/api-contract'
import { describe, expect, test, vi } from 'vitest'
import type { TileSummary } from '../lib/tiles'
import type { ViewerTileOptions } from '../viewer-scene'
import { showTiledFrame, type TiledFrameOptions, type TiledViewer } from './temporal-tiled'

const origin = { x: 10, y: 64, z: 20 }
const base = { x: 10, y: 64, z: 20 }

function frame(): TemporalFrame {
	return {
		id: '11111111-1111-4111-8111-000000000001',
		name: 'Capture 1',
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
		tileCount: 2,
	}
}

function tile(x: number, z: number, sha256: string): TileSummary {
	return { x, z, size: 1, sha256, quads: 1 }
}

function listOf(tiles: TileSummary[]): TileList {
	return { memoryId: frame().id, tileChunks: 8, tiles }
}

function fakeViewer() {
	const tiles = new Map<string, ArrayBuffer>()
	const setTile = vi.fn(async (id: string, data: ArrayBuffer, _options: ViewerTileOptions) => {
		tiles.set(id, data)
	})
	const removeTile = vi.fn((id: string) => {
		tiles.delete(id)
	})
	const tileIds = vi.fn(() => [...tiles.keys()])
	const frameTiles = vi.fn()
	const viewer: TiledViewer = { setTile, removeTile, tileIds, frameTiles }
	return { viewer, setTile, removeTile, frameTiles, tiles }
}

function options(overrides: Partial<TiledFrameOptions> & Pick<TiledFrameOptions, 'viewer'>): TiledFrameOptions {
	return {
		frame: frame(),
		displayed: new Map(),
		base,
		signal: new AbortController().signal,
		restore: run => run(),
		onProgress: () => undefined,
		listTiles: async () => listOf([]),
		fetchTile: async () => new ArrayBuffer(1),
		...overrides,
	}
}

describe('showTiledFrame', () => {
	test('first display fetches and applies every tile with its translation, framing after the first and once at the end', async () => {
		const fake = fakeViewer()
		const displayed = new Map<string, string>()
		const fetchTile = vi.fn(async () => new ArrayBuffer(1))
		await showTiledFrame(
			options({
				viewer: fake.viewer,
				displayed,
				fetchTile,
				listTiles: async () => listOf([tile(1, 2, 'a'), tile(0, 0, 'b')]),
			})
		)
		expect(fetchTile).toHaveBeenCalledTimes(2)
		expect(fake.setTile).toHaveBeenCalledTimes(2)
		expect(fake.setTile.mock.calls.map(call => call[0]).sort()).toEqual(['0:0', '1:2'])
		expect(fake.setTile.mock.calls.find(call => call[0] === '1:2')?.[2].translation).toEqual({
			x: 128 - base.x,
			y: -base.y,
			z: 256 - base.z,
		})
		expect(displayed).toEqual(
			new Map([
				['1:2', 'a'],
				['0:0', 'b'],
			])
		)
		expect(fake.frameTiles).toHaveBeenCalledTimes(2)
		const applied: number[] = fake.setTile.mock.invocationCallOrder
		const framed: number[] = fake.frameTiles.mock.invocationCallOrder
		expect(framed).toHaveLength(2)
		expect(framed[0]).toBeGreaterThan(applied[0] ?? 0)
		expect(framed[1]).toBeGreaterThan(applied[1] ?? 0)
		expect(fake.frameTiles).toHaveBeenLastCalledWith({ preserveView: false })
	})

	test('a later frame fetches only the changed tile, replaces it, removes the vanished one and keeps displayed in sync', async () => {
		const fake = fakeViewer()
		const displayed = new Map([
			['0:0', 'a'],
			['1:0', 'b'],
			['2:0', 'c'],
		])
		fake.tiles.set('0:0', new ArrayBuffer(1))
		fake.tiles.set('1:0', new ArrayBuffer(1))
		fake.tiles.set('2:0', new ArrayBuffer(1))
		const fetchTile = vi.fn(
			async (_frame: TemporalFrame, _tile: TileSummary, _signal: AbortSignal) => new ArrayBuffer(2)
		)
		await showTiledFrame(
			options({
				viewer: fake.viewer,
				displayed,
				fetchTile,
				listTiles: async () => listOf([tile(0, 0, 'a'), tile(1, 0, 'changed')]),
			})
		)
		expect(fetchTile).toHaveBeenCalledOnce()
		expect(fetchTile.mock.calls[0]?.[1]).toMatchObject({ x: 1, z: 0, sha256: 'changed' })
		expect(fake.setTile).toHaveBeenCalledOnce()
		expect(fake.setTile.mock.calls[0]?.[0]).toBe('1:0')
		expect(fake.removeTile).toHaveBeenCalledWith('2:0')
		expect(fake.frameTiles).not.toHaveBeenCalled()
		expect(displayed).toEqual(
			new Map([
				['0:0', 'a'],
				['1:0', 'changed'],
			])
		)
		expect(fake.viewer.tileIds().sort()).toEqual(['0:0', '1:0'])
	})

	test('a tile the viewer holds but the series does not track is removed', async () => {
		const fake = fakeViewer()
		fake.tiles.set('9:9', new ArrayBuffer(1))
		const displayed = new Map<string, string>()
		await showTiledFrame(options({ viewer: fake.viewer, displayed, listTiles: async () => listOf([tile(0, 0, 'a')]) }))
		expect(fake.removeTile).toHaveBeenCalledWith('9:9')
		expect([...displayed.keys()]).toEqual(['0:0'])
		expect(fake.viewer.tileIds()).toEqual(['0:0'])
	})

	test('an unchanged frame fetches nothing and changes nothing', async () => {
		const fake = fakeViewer()
		const displayed = new Map([['0:0', 'a']])
		const fetchTile = vi.fn(async () => new ArrayBuffer(1))
		await showTiledFrame(
			options({ viewer: fake.viewer, displayed, fetchTile, listTiles: async () => listOf([tile(0, 0, 'a')]) })
		)
		expect(fetchTile).not.toHaveBeenCalled()
		expect(fake.setTile).not.toHaveBeenCalled()
		expect(fake.removeTile).not.toHaveBeenCalled()
		expect(fake.frameTiles).not.toHaveBeenCalled()
	})

	test('restoration runs once for the first tile, and no other tile request starts before it completes', async () => {
		const fake = fakeViewer()
		const events: string[] = []
		let restores = 0
		const restore = async <T>(run: () => Promise<T>): Promise<T> => {
			restores += 1
			events.push('restore:start')
			const value = await run()
			events.push('restore:done')
			return value
		}
		const fetchTile = vi.fn(async (_frame: TemporalFrame, summary: TileSummary) => {
			events.push(`fetch:${summary.x}:${summary.z}`)
			return new ArrayBuffer(1)
		})
		await showTiledFrame(
			options({
				viewer: fake.viewer,
				restore,
				fetchTile,
				listTiles: async () => listOf([tile(0, 0, 'a'), tile(1, 0, 'b'), tile(0, 1, 'c')]),
			})
		)
		expect(restores).toBe(1)
		expect(fetchTile).toHaveBeenCalledTimes(3)
		const done = events.indexOf('restore:done')
		expect(events[0]).toBe('restore:start')
		expect(events.slice(1, done).filter(event => event.startsWith('fetch:'))).toHaveLength(1)
		expect(events.slice(done + 1).every(event => event.startsWith('fetch:'))).toBe(true)
	})

	test('a failing first request propagates its error and starts no other tile request', async () => {
		const fake = fakeViewer()
		const failure = new Error('Cold bundle unavailable')
		const fetchTile = vi.fn(async () => {
			throw failure
		})
		fetchTile.mockRejectedValueOnce(failure)
		const run = showTiledFrame(
			options({
				viewer: fake.viewer,
				fetchTile,
				listTiles: async () => listOf([tile(0, 0, 'a'), tile(1, 0, 'b'), tile(0, 1, 'c')]),
			})
		)
		await expect(run).rejects.toBe(failure)
		expect(fetchTile).toHaveBeenCalledOnce()
		expect(fake.setTile).not.toHaveBeenCalled()
	})

	test('an abort mid-stream leaves displayed matching exactly the tiles that were applied', async () => {
		const fake = fakeViewer()
		const controller = new AbortController()
		const displayed = new Map<string, string>()
		fake.setTile.mockImplementationOnce(async (id: string, data: ArrayBuffer) => {
			fake.tiles.set(id, data)
		})
		fake.setTile.mockImplementationOnce(async () => {
			controller.abort()
			throw new DOMException('Aborted', 'AbortError')
		})
		const run = showTiledFrame(
			options({
				viewer: fake.viewer,
				displayed,
				signal: controller.signal,
				listTiles: async () => listOf([tile(0, 0, 'a'), tile(1, 0, 'b'), tile(0, 1, 'c')]),
			})
		)
		await expect(run).rejects.toThrow()
		expect(displayed.size).toBe(1)
		expect([...displayed.keys()]).toEqual(fake.viewer.tileIds())
	})

	test('an empty tile list resolves without fetching or framing anything', async () => {
		const fake = fakeViewer()
		const displayed = new Map<string, string>()
		const onProgress = vi.fn()
		await expect(
			showTiledFrame(options({ viewer: fake.viewer, displayed, onProgress, listTiles: async () => listOf([]) }))
		).resolves.toBeUndefined()
		expect(fake.setTile).not.toHaveBeenCalled()
		expect(fake.frameTiles).not.toHaveBeenCalled()
		expect(onProgress).not.toHaveBeenCalled()
		expect(displayed.size).toBe(0)
	})

	test('progress reports zero, then each applied tile, against the total', async () => {
		const fake = fakeViewer()
		const onProgress = vi.fn()
		await showTiledFrame(
			options({
				viewer: fake.viewer,
				onProgress,
				listTiles: async () => listOf([tile(0, 0, 'a'), tile(1, 0, 'b')]),
			})
		)
		expect(onProgress.mock.calls).toEqual([
			[0, 2],
			[1, 2],
			[2, 2],
		])
	})

	test('a failing tile list request propagates without touching the viewer', async () => {
		const fake = fakeViewer()
		const failure = new Error('Forbidden')
		const run = showTiledFrame(
			options({
				viewer: fake.viewer,
				listTiles: async () => {
					throw failure
				},
			})
		)
		await expect(run).rejects.toBe(failure)
		expect(fake.setTile).not.toHaveBeenCalled()
	})
})
