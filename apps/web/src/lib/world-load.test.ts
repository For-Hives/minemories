import { expect, it, vi } from 'vitest'
import { type FrameStatus, plannedFrames, RestorationNeeded, WorldLoader } from './world-load'

function deferred<T>() {
	let resolve!: (value: T) => void, reject!: (error: unknown) => void
	const promise = new Promise<T>((done, fail) => {
		resolve = done
		reject = fail
	})
	return { promise, resolve, reject }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

it('plans the most recent captures within the frame and byte budget', () => {
	expect(plannedFrames([5, 5, 5], { maxFrames: 2, maxBytes: 100 })).toEqual([false, true, true])
	expect(plannedFrames([5, 50, 5], { maxFrames: 9, maxBytes: 20 })).toEqual([false, false, true])
	expect(plannedFrames([1, 2])).toEqual([true, true])
	expect(plannedFrames([])).toEqual([])
})

it('downloads oldest first with bounded concurrency and attaches one capture at a time in completion order', async () => {
	const downloads = [0, 1, 2, 3].map(() => deferred<File>())
	const attachments: number[] = []
	const statuses: [number, FrameStatus][] = []
	const attachGate = deferred<void>()
	const loader = new WorldLoader(['a', 'b', 'c', 'd', 'e'], [true, true, true, true, false], {
		concurrency: 2,
		download: vi.fn((frame: string) => downloads['abcd'.indexOf(frame)]?.promise as Promise<File>),
		attach: vi.fn(async (_frame: string, position: number) => {
			attachments.push(position)
			if (position === 1) await attachGate.promise
		}),
		onStatus: (position, status) => statuses.push([position, status]),
	})
	expect(statuses).toEqual([
		[0, 'waiting'],
		[1, 'waiting'],
		[2, 'waiting'],
		[3, 'waiting'],
		[4, 'skipped'],
	])
	loader.start()
	expect(statuses.slice(5)).toEqual([
		[0, 'loading'],
		[1, 'loading'],
	])
	downloads[1]?.resolve(new File([], 'b.glb'))
	downloads[0]?.resolve(new File([], 'a.glb'))
	await flush()
	expect(attachments).toEqual([1])
	attachGate.resolve()
	await flush()
	expect(attachments).toEqual([1, 0])
	expect(statuses).toContainEqual([1, 'ready'])
	expect(statuses).toContainEqual([2, 'loading'])
	downloads[2]?.reject(new RestorationNeeded())
	downloads[3]?.reject(new Error('offline'))
	await flush()
	expect(statuses).toContainEqual([2, 'archived'])
	expect(statuses).toContainEqual([3, 'failed'])
	downloads[3] = deferred<File>()
	loader.retry(3)
	loader.retry(9)
	expect(statuses.at(-1)).toEqual([3, 'loading'])
	downloads[3]?.resolve(new File([], 'd.glb'))
	await flush()
	expect(statuses.at(-1)).toEqual([3, 'ready'])
})

it('a failed attachment does not block the next one and cancellation silences pending work', async () => {
	const statuses: [number, FrameStatus][] = []
	const second = deferred<File>()
	const attach = vi.fn().mockRejectedValueOnce(new Error('gpu')).mockResolvedValue(undefined)
	const loader = new WorldLoader(['a', 'b', 'c'], [true, true, true], {
		concurrency: 1,
		download: vi.fn().mockResolvedValueOnce(new File([], 'a.glb')).mockReturnValueOnce(second.promise),
		attach,
		onStatus: (position, status) => statuses.push([position, status]),
	})
	loader.start()
	await flush()
	expect(statuses).toContainEqual([0, 'failed'])
	expect(statuses.at(-1)).toEqual([1, 'loading'])
	loader.dispose()
	second.resolve(new File([], 'b.glb'))
	await flush()
	expect(attach).toHaveBeenCalledTimes(1)
	expect(statuses.at(-1)).toEqual([1, 'loading'])
	loader.retry(0)
	loader.start()
	expect(statuses.at(-1)).toEqual([1, 'loading'])
})
