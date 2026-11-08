import { expect, test, vi } from 'vitest'
import { BOOT_PROGRESS_EVENT, BOOT_STEPS, reportBootProgress, signalPageReady, withBootProgress } from './boot-progress'
import type { LoadedGlb } from './capture-delta'

test('a report is a mm:boot-progress event carrying the floor', () => {
	const target = new EventTarget()
	const seen: unknown[] = []
	target.addEventListener(BOOT_PROGRESS_EVENT, event => seen.push((event as CustomEvent).detail))
	reportBootProgress(BOOT_STEPS.film, target)
	expect(BOOT_PROGRESS_EVENT).toBe('mm:boot-progress')
	expect(seen).toEqual([0.3])
})

test('the milestones only go up', () => {
	const steps = [BOOT_STEPS.app, BOOT_STEPS.film, BOOT_STEPS.scene, BOOT_STEPS.captures]
	expect(steps).toEqual([...steps].sort((a, b) => a - b))
	expect(Math.max(...steps)).toBeLessThan(1) // 100 % belongs to mm:ready
})

test('the capture downloader reports the first request once, then the arrival of S0, and returns what it fetched', async () => {
	const base = new URL('https://example.test/hero/captures/')
	const loaded = (name: string): LoadedGlb => ({ buffer: new ArrayBuffer(1), url: new URL(`${name}.glb`, base) })
	const fetchGlb = vi.fn(async (_base: URL, name: string) => loaded(name))
	const report = vi.fn()
	const tracked = withBootProgress(fetchGlb, report)
	const first = tracked(base, 'S0')
	expect(report.mock.calls).toEqual([[BOOT_STEPS.scene]])
	expect((await first).url.href).toBe('https://example.test/hero/captures/S0.glb')
	expect(report.mock.calls).toEqual([[BOOT_STEPS.scene], [BOOT_STEPS.captures]])
	await tracked(base, 'S1')
	expect(report.mock.calls).toEqual([[BOOT_STEPS.scene], [BOOT_STEPS.captures]])
	expect(fetchGlb).toHaveBeenCalledTimes(2)
})

test('a landing opened on a section reports the arrival of whichever capture comes first', async () => {
	const base = new URL('https://example.test/hero/captures/')
	const report = vi.fn()
	const tracked = withBootProgress(
		async (_base, name) => ({ buffer: new ArrayBuffer(1), url: new URL(name, base) }),
		report
	)
	await tracked(base, 'S4')
	expect(report.mock.calls).toEqual([[BOOT_STEPS.scene], [BOOT_STEPS.captures]])
})

test('signalling the page ready marks <html> and sends mm:ready, as the film does', () => {
	const root = { dataset: {} as DOMStringMap }
	const target = new EventTarget()
	const seen = vi.fn()
	target.addEventListener('mm:ready', seen)
	signalPageReady(root, target)
	expect(root.dataset.mmReady).toBe('1')
	expect(seen).toHaveBeenCalledTimes(1)
})

test('a failed download reports nothing more and still fails', async () => {
	const report = vi.fn()
	const tracked = withBootProgress(() => Promise.reject(new Error('offline')), report)
	await expect(tracked(new URL('https://example.test/'), 'S0')).rejects.toThrow('offline')
	expect(report.mock.calls).toEqual([[BOOT_STEPS.scene]])
})
