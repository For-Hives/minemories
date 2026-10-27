import { createHash } from 'node:crypto'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
	orderTiles,
	planTileUpdate,
	RetryableTileError,
	streamTiles,
	type TilePlan,
	type TileStreamOptions,
	type TileSummary,
	tileId,
	tileTranslation,
	verifyTileDigest,
} from './tiles'

type Deferred<T = void> = { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void }

const tile = (x: number, z: number, sha256 = `${x}-${z}`): TileSummary => ({ x, z, size: 20, sha256, quads: 1 })
const plan = (fetch: TileSummary[], remove: string[] = []): TilePlan => ({ fetch, remove, keep: 0 })
const bytes = (value: number): ArrayBuffer => new Uint8Array([value]).buffer as ArrayBuffer
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0))

function deferred<T = void>(): Deferred<T> {
	let resolve!: (value: T) => void
	let reject!: (reason: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

// Fetches that stay pending until the test settles them; they reject when their own signal aborts.
function gatedFetch() {
	const gates = new Map<number, Deferred<ArrayBuffer>>()
	const starts: number[] = []
	const signals = new Map<number, AbortSignal>()
	const fetchTile = vi.fn((item: TileSummary, signal: AbortSignal) => {
		const gate = deferred<ArrayBuffer>()
		starts.push(item.x)
		gates.set(item.x, gate)
		signals.set(item.x, signal)
		signal.addEventListener('abort', () => gate.reject(signal.reason), { once: true })
		return gate.promise
	})
	const gateFor = (x: number): Deferred<ArrayBuffer> => {
		const gate = gates.get(x)
		if (!gate) throw new Error(`tile ${x} was not started`)
		return gate
	}
	return {
		fetchTile,
		starts,
		signals,
		release: (x: number) => gateFor(x).resolve(bytes(x)),
		fail: (x: number, error: unknown) => gateFor(x).reject(error),
	}
}

function streamOptions(overrides: Partial<TileStreamOptions> = {}): TileStreamOptions {
	return {
		plan: plan([]),
		tileChunks: 1,
		focus: { x: 0, z: 0 },
		fetchTile: () => Promise.resolve(bytes(0)),
		applyTile: () => Promise.resolve(),
		removeTile: () => undefined,
		signal: new AbortController().signal,
		...overrides,
	}
}

afterEach(() => vi.useRealTimers())

describe('planTileUpdate', () => {
	test('classifies new, changed, unchanged and removed tiles', () => {
		const current = new Map([
			['0:0', 'a'],
			['1:0', 'b'],
			['2:0', 'c'],
		])
		const result = planTileUpdate(current, [tile(0, 0, 'a'), tile(1, 0, 'changed'), tile(3, 0, 'd')])
		expect(result).toEqual({ fetch: [tile(1, 0, 'changed'), tile(3, 0, 'd')], remove: ['2:0'], keep: 1 })
	})

	test('sorts removed ids and keeps every unchanged tile', () => {
		const current = new Map([
			['5:5', 'x'],
			['0:0', 'a'],
			['1:1', 'y'],
		])
		const result = planTileUpdate(current, [tile(0, 0, 'a')])
		expect(result).toEqual({ fetch: [], remove: ['1:1', '5:5'], keep: 1 })
	})

	test('an empty current state fetches everything and removes nothing', () => {
		expect(planTileUpdate(new Map(), [])).toEqual({ fetch: [], remove: [], keep: 0 })
		expect(planTileUpdate(new Map(), [tile(2, 2)])).toEqual({ fetch: [tile(2, 2)], remove: [], keep: 0 })
	})

	test('does not mutate its inputs', () => {
		const current = new Map([['9:9', 'old']])
		const next = [tile(0, 0)]
		const currentBefore = [...current]
		const nextBefore = [...next]
		planTileUpdate(current, next)
		expect([...current]).toEqual(currentBefore)
		expect(next).toEqual(nextBefore)
	})
})

test('tileId joins absolute indices with a colon, negatives included', () => {
	expect(tileId(-1, 4)).toBe('-1:4')
})

describe('orderTiles', () => {
	test('sorts by squared distance from the focus to each tile centre', () => {
		// 16 blocks per tile: the centres of (0,0), (1,0), (-3,0) are (8,8), (24,8), (-40,8).
		const ordered = orderTiles([tile(-3, 0), tile(1, 0), tile(0, 0)], 1, { x: 0, z: 0 })
		expect(ordered.map(item => item.x)).toEqual([0, 1, -3])
	})

	test('breaks distance ties by x, then by z', () => {
		// Around the origin, the four tiles of the 2x2 block all sit at the same distance.
		const ordered = orderTiles([tile(0, 0), tile(0, -1), tile(-1, 0), tile(-1, -1)], 1, { x: 0, z: 0 })
		expect(ordered.map(item => [item.x, item.z])).toEqual([
			[-1, -1],
			[-1, 0],
			[0, -1],
			[0, 0],
		])
	})

	test('returns a new array and leaves the input untouched', () => {
		const input = [tile(3, 0), tile(0, 0)]
		const ordered = orderTiles(input, 1, { x: 0, z: 0 })
		expect(ordered).not.toBe(input)
		expect(input.map(item => item.x)).toEqual([3, 0])
	})

	test('uses the tile size to place centres', () => {
		// With 4 chunks a tile is 64 blocks: (1,0) has its centre at (96, 32), (0,0) at (32, 32).
		const ordered = orderTiles([tile(1, 0), tile(0, 0)], 4, { x: 0, z: 0 })
		expect(ordered.map(item => item.x)).toEqual([0, 1])
	})
})

test('tileTranslation places a tile relative to the capture centre', () => {
	expect(tileTranslation(8, { x: -1, z: 2 }, { x: 10, y: 64, z: -5 })).toEqual({ x: -138, y: -64, z: 261 })
})

describe('verifyTileDigest', () => {
	const data = new Uint8Array([1, 2, 3]).buffer as ArrayBuffer
	const digest = createHash('sha256')
		.update(Buffer.from([1, 2, 3]))
		.digest('hex')

	test('accepts the lowercase hex SHA-256 of the bytes', async () => {
		await expect(verifyTileDigest(data, digest)).resolves.toBe(true)
	})

	test('rejects any other digest', async () => {
		await expect(verifyTileDigest(data, '0'.repeat(64))).resolves.toBe(false)
	})
})

describe('streamTiles scheduling and retries', () => {
	test('starts fetches in priority order with at most four in flight', async () => {
		const gated = gatedFetch()
		const done = streamTiles(
			streamOptions({
				plan: plan([3, 0, 5, 1, 2, 4].map(x => tile(x, 0))),
				fetchTile: gated.fetchTile,
			})
		)
		await flush()
		expect(gated.starts).toEqual([0, 1, 2, 3])
		gated.release(0)
		await flush()
		expect(gated.starts).toEqual([0, 1, 2, 3, 4])
		gated.release(1)
		gated.release(2)
		gated.release(3)
		await flush()
		gated.release(4)
		await flush()
		gated.release(5)
		await done
		expect(gated.starts).toEqual([0, 1, 2, 3, 4, 5])
	})

	test('does not fetch more than the prefetch window ahead of a slow apply', async () => {
		const starts: number[] = []
		const applying = deferred()
		const done = streamTiles(
			streamOptions({
				plan: plan(Array.from({ length: 20 }, (_, x) => tile(x, 0))),
				fetchTile: async item => {
					starts.push(item.x)
					return bytes(item.x)
				},
				applyTile: () => applying.promise,
			})
		)
		await flush()
		expect(starts).toHaveLength(8)
		applying.resolve()
		await done
		expect(starts).toHaveLength(20)
	})

	test('never starts tiles beyond the window when an early tile fails', async () => {
		const starts: number[] = []
		await expect(
			streamTiles(
				streamOptions({
					plan: plan(Array.from({ length: 12 }, (_, x) => tile(x, 0))),
					fetchTile: async item => {
						starts.push(item.x)
						throw new Error('boom')
					},
				})
			)
		).rejects.toThrow('boom')
		expect(starts.length).toBeLessThanOrEqual(8)
		expect(starts).not.toContain(11)
	})

	test('never runs more fetches at once than the concurrency limit', async () => {
		let inFlight = 0
		let maxInFlight = 0
		const fetchTile = (): Promise<ArrayBuffer> =>
			new Promise(resolve => {
				inFlight += 1
				maxInFlight = Math.max(maxInFlight, inFlight)
				setTimeout(() => {
					inFlight -= 1
					resolve(bytes(0))
				}, 2)
			})
		const tiles = Array.from({ length: 12 }, (_, index) => tile(index, 0))
		await streamTiles(streamOptions({ plan: plan(tiles), fetchTile }))
		expect(maxInFlight).toBe(4)
		expect(inFlight).toBe(0)
	})

	test('a custom concurrency limit is honoured', async () => {
		const gated = gatedFetch()
		const done = streamTiles(
			streamOptions({
				plan: plan([tile(0, 0), tile(1, 0)]),
				fetchTile: gated.fetchTile,
				concurrency: 1,
			})
		)
		await flush()
		expect(gated.starts).toEqual([0])
		gated.release(0)
		await flush()
		expect(gated.starts).toEqual([0, 1])
		gated.release(1)
		await done
	})

	test('applies never overlap and follow priority even when later tiles finish first', async () => {
		const gated = gatedFetch()
		const applyGates: Deferred[] = []
		const applied: number[] = []
		const done = streamTiles(
			streamOptions({
				plan: plan([tile(0, 0), tile(1, 0), tile(2, 0)]),
				fetchTile: gated.fetchTile,
				applyTile: item => {
					applied.push(item.x)
					const gate = deferred()
					applyGates.push(gate)
					return gate.promise
				},
			})
		)
		await flush()
		gated.release(2)
		gated.release(1)
		await flush()
		expect(applied).toEqual([])
		gated.release(0)
		await flush()
		expect(applied).toEqual([0])
		applyGates[0]?.resolve()
		await flush()
		expect(applied).toEqual([0, 1])
		applyGates[1]?.resolve()
		await flush()
		expect(applied).toEqual([0, 1, 2])
		applyGates[2]?.resolve()
		await done
	})

	test('reports progress from zero through every applied tile', async () => {
		const progress: [number, number][] = []
		await streamTiles(
			streamOptions({
				plan: plan([tile(0, 0), tile(1, 0), tile(2, 0)]),
				onProgress: (done, total) => progress.push([done, total]),
			})
		)
		expect(progress).toEqual([
			[0, 3],
			[1, 3],
			[2, 3],
			[3, 3],
		])
	})

	test('removals run only after every addition has been applied', async () => {
		const events: string[] = []
		await streamTiles(
			streamOptions({
				plan: plan([tile(0, 0), tile(1, 0)], ['9:9', '8:8']),
				applyTile: item => {
					events.push(`apply ${item.x}`)
					return Promise.resolve()
				},
				removeTile: id => events.push(`remove ${id}`),
			})
		)
		expect(events).toEqual(['apply 0', 'apply 1', 'remove 9:9', 'remove 8:8'])
	})

	test('a retryable error is retried with the exact delays and then succeeds', async () => {
		let attempts = 0
		const fetchTile = () => {
			attempts += 1
			return attempts <= 3 ? Promise.reject(new RetryableTileError('busy')) : Promise.resolve(bytes(0))
		}
		const sleep = vi.fn((_ms: number, _signal: AbortSignal) => Promise.resolve())
		const applyTile = vi.fn((_item: TileSummary, _data: ArrayBuffer, _signal: AbortSignal) => Promise.resolve())
		await streamTiles(streamOptions({ plan: plan([tile(0, 0)]), fetchTile, sleep, applyTile }))
		expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([250, 750, 2000])
		expect(attempts).toBe(4)
		expect(applyTile).toHaveBeenCalledOnce()
	})

	test('an exhausted retry budget rejects with the last retryable error', async () => {
		const fetchTile = vi.fn(() => Promise.reject(new RetryableTileError('still busy')))
		const sleep = vi.fn((_ms: number, _signal: AbortSignal) => Promise.resolve())
		const applyTile = vi.fn((_item: TileSummary, _data: ArrayBuffer, _signal: AbortSignal) => Promise.resolve())
		await expect(
			streamTiles(streamOptions({ plan: plan([tile(0, 0)]), fetchTile, sleep, applyTile }))
		).rejects.toBeInstanceOf(RetryableTileError)
		expect(fetchTile).toHaveBeenCalledTimes(4)
		expect(sleep).toHaveBeenCalledTimes(3)
		expect(applyTile).not.toHaveBeenCalled()
	})
})

describe('streamTiles failures and aborts', () => {
	test('a non-retryable error rejects, aborts siblings, and removes nothing', async () => {
		const gated = gatedFetch()
		const removeTile = vi.fn()
		const failure = new Error('boom')
		const done = streamTiles(
			streamOptions({
				plan: plan([tile(0, 0), tile(1, 0)], ['9:9']),
				fetchTile: gated.fetchTile,
				removeTile,
			})
		)
		await flush()
		gated.fail(0, failure)
		await expect(done).rejects.toBe(failure)
		expect(gated.signals.get(1)?.aborted).toBe(true)
		expect(removeTile).not.toHaveBeenCalled()
	})

	test('a failing apply rejects and aborts the remaining fetches', async () => {
		const gated = gatedFetch()
		const failure = new Error('disk full')
		const done = streamTiles(
			streamOptions({
				plan: plan([tile(0, 0), tile(1, 0)]),
				fetchTile: gated.fetchTile,
				applyTile: () => Promise.reject(failure),
			})
		)
		await flush()
		gated.release(0)
		gated.release(1)
		await expect(done).rejects.toBe(failure)
	})

	test('an external abort before starting rejects without fetching', async () => {
		const controller = new AbortController()
		const reason = new Error('cancelled early')
		controller.abort(reason)
		const fetchTile = vi.fn(() => Promise.resolve(bytes(0)))
		await expect(
			streamTiles(streamOptions({ plan: plan([tile(0, 0)]), fetchTile, signal: controller.signal }))
		).rejects.toBe(reason)
		expect(fetchTile).not.toHaveBeenCalled()
	})

	test('an external abort during fetches rejects with the abort reason and applies nothing', async () => {
		const gated = gatedFetch()
		const controller = new AbortController()
		const applyTile = vi.fn(() => Promise.resolve())
		const reason = new Error('user left the page')
		const done = streamTiles(
			streamOptions({
				plan: plan([0, 1, 2, 3, 4, 5].map(x => tile(x, 0))),
				fetchTile: gated.fetchTile,
				applyTile,
				signal: controller.signal,
			})
		)
		await flush()
		controller.abort(reason)
		await expect(done).rejects.toBe(reason)
		expect(gated.starts).toEqual([0, 1, 2, 3])
		expect(applyTile).not.toHaveBeenCalled()
	})

	test('an external abort that lands while applying wins over a resolved apply', async () => {
		const controller = new AbortController()
		const reason = new Error('stopped during apply')
		const applyTile = vi.fn(() => {
			controller.abort(reason)
			return Promise.resolve()
		})
		const removeTile = vi.fn()
		await expect(
			streamTiles(
				streamOptions({
					plan: plan([tile(0, 0), tile(1, 0)], ['9:9']),
					applyTile,
					removeTile,
					signal: controller.signal,
				})
			)
		).rejects.toBe(reason)
		expect(applyTile).toHaveBeenCalledOnce()
		expect(removeTile).not.toHaveBeenCalled()
	})
})

describe('streamTiles removals and default sleep', () => {
	test('an empty plan still performs removals and reports no progress', async () => {
		const removeTile = vi.fn()
		const onProgress = vi.fn()
		const fetchTile = vi.fn(() => Promise.resolve(bytes(0)))
		await streamTiles(streamOptions({ plan: plan([], ['1:1']), removeTile, onProgress, fetchTile }))
		expect(removeTile).toHaveBeenCalledWith('1:1')
		expect(onProgress).not.toHaveBeenCalled()
		expect(fetchTile).not.toHaveBeenCalled()
	})

	test('the default retry sleep waits the delay and then retries', async () => {
		vi.useFakeTimers()
		let attempts = 0
		const fetchTile = () => {
			attempts += 1
			return attempts === 1 ? Promise.reject(new RetryableTileError('busy')) : Promise.resolve(bytes(0))
		}
		const done = streamTiles(streamOptions({ plan: plan([tile(0, 0)]), fetchTile }))
		await vi.advanceTimersByTimeAsync(249)
		expect(attempts).toBe(1)
		await vi.advanceTimersByTimeAsync(1)
		await done
		expect(attempts).toBe(2)
	})

	test('the default retry sleep stops as soon as the caller aborts', async () => {
		vi.useFakeTimers()
		const controller = new AbortController()
		const reason = new Error('cancelled while waiting')
		const fetchTile = vi.fn(() => Promise.reject(new RetryableTileError('busy')))
		const done = streamTiles(streamOptions({ plan: plan([tile(0, 0)]), fetchTile, signal: controller.signal }))
		const outcome = expect(done).rejects.toBe(reason)
		await vi.advanceTimersByTimeAsync(10)
		controller.abort(reason)
		await outcome
		expect(fetchTile).toHaveBeenCalledOnce()
	})
})
