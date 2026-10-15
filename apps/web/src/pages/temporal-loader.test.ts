import type { TemporalFrame } from '@minemories/api-contract'
import { expect, test, vi } from 'vitest'
import { TemporalLoader } from './temporal-loader'

const frame = (id: string) => ({ id }) as TemporalFrame

function fixture() {
	const jobs: Array<{
		frame: TemporalFrame
		signal: AbortSignal
		resolve: () => void
		reject: (error: Error) => void
	}> = []
	const ready = vi.fn()
	const failed = vi.fn()
	const busy = vi.fn()
	const loader = new TemporalLoader(
		(selected, signal) =>
			new Promise<void>((resolve, reject) => {
				jobs.push({ frame: selected, signal, resolve, reject })
			}),
		ready,
		failed,
		busy
	)
	return { jobs, ready, failed, busy, loader }
}

test('scrubbing aborts the active request and retains only the latest pending capture until parsing settles', async () => {
	const f = fixture()
	f.loader.select(frame('first'))
	for (let index = 0; index < 300; index++) f.loader.select(frame(`next-${index}`))
	expect(f.jobs).toHaveLength(1)
	expect(f.jobs[0]?.signal.aborted).toBe(true)
	f.jobs[0]?.resolve()
	await vi.waitFor(() => expect(f.jobs).toHaveLength(2))
	expect(f.jobs[1]?.frame.id).toBe('next-299')
	expect(f.ready).not.toHaveBeenCalled()
	f.jobs[1]?.resolve()
	await vi.waitFor(() => expect(f.ready).toHaveBeenCalledWith(frame('next-299')))
	expect(f.busy.mock.calls).toEqual([[true], [false]])
})

test('a failed capture reports an error; an explicit retry can succeed', async () => {
	const f = fixture()
	f.loader.select(frame('broken'))
	const error = new Error('Download unavailable')
	f.jobs[0]?.reject(error)
	await vi.waitFor(() => expect(f.failed).toHaveBeenCalledWith(error))
	expect(f.ready).not.toHaveBeenCalled()
	f.loader.select(frame('broken'))
	f.jobs[1]?.resolve()
	await vi.waitFor(() => expect(f.ready).toHaveBeenCalledOnce())
})

test('disposal drops pending captures and prevents callbacks or future downloads after an aborted parser fails', async () => {
	const f = fixture()
	f.loader.select(frame('first'))
	f.loader.select(frame('pending'))
	f.loader.dispose()
	f.loader.select(frame('after-close'))
	f.jobs[0]?.reject(new Error('Aborted'))
	await new Promise(resolve => setTimeout(resolve, 0))
	expect(f.jobs).toHaveLength(1)
	expect(f.jobs[0]?.signal.aborted).toBe(true)
	expect(f.ready).not.toHaveBeenCalled()
	expect(f.failed).not.toHaveBeenCalled()
	expect(f.busy.mock.calls).toEqual([[true]])
})
