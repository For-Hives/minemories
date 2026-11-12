// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { ChunkLoader } from './ChunkLoader'
import { ViewerLoadState } from './ViewerChrome'

const painted: number[] = []
beforeEach(() => {
	vi.useFakeTimers({
		toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
	})
	// jsdom has no 2D canvas: a context that records the map's paints
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
		() =>
			({
				createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
				putImageData: () => painted.push(performance.now()),
			}) as unknown as CanvasRenderingContext2D
	)
	vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA')
})
afterEach(() => {
	cleanup()
	vi.useRealTimers()
	vi.restoreAllMocks()
	painted.length = 0
	document.getElementById('boot')?.remove()
})

function mount(active: boolean, label = 'Downloading the memory…') {
	const view = render(
		<I18nProvider initialLocale="en">
			<ChunkLoader active={active} label={label} />
		</I18nProvider>
	)
	return {
		...view,
		set: (next: boolean) =>
			view.rerender(
				<I18nProvider initialLocale="en">
					<ChunkLoader active={next} label={label} />
				</I18nProvider>
			),
	}
}
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const loader = () => document.querySelector<HTMLElement>('.mm-chunk')
const percent = () => loader()?.querySelector('.boot-pc')?.textContent

test('a load is announced at once and shows the world-loading screen after a moment, with the dirt of the landing', () => {
	mount(true)
	expect(screen.getByRole('status').textContent).toContain('Downloading the memory…')
	expect(loader()?.classList.contains('is-waiting')).toBe(true)
	expect(loader()?.getAttribute('style')).toContain('--mm-dirt: url(data:image/png;base64,AAAA)')
	advance(200)
	expect(loader()?.classList.contains('is-waiting')).toBe(false)
	advance(5000)
	expect(percent()).toBe('95%') // waits there while the capture is on its way
	expect(painted.length).toBeGreaterThan(0)
})

test('a load that ends before the screen shows leaves without playing it', () => {
	const view = mount(true)
	advance(50)
	view.set(false)
	advance(32)
	expect(loader()).toBeNull()
	expect(painted).toEqual([])
})

test('a scene ready during the fill reaches 100 %, holds, then the screen leaves the stage', () => {
	const view = mount(true)
	advance(1000)
	view.set(false)
	advance(800)
	expect(percent()).toBe('100%')
	advance(400) // the hold: no tile to break without a decoded image, so a short fade
	expect(loader()?.classList.contains('is-done')).toBe(true)
	advance(400)
	expect(loader()).toBeNull()
})

test('the page loading screen covers the first load: the stage one stays out of sight under it, and never plays after it', () => {
	const boot = document.createElement('div')
	boot.id = 'boot'
	document.body.append(boot)
	const view = mount(true)
	advance(3000)
	expect(loader()?.classList.contains('is-waiting')).toBe(true)
	view.set(false)
	advance(32)
	expect(loader()).toBeNull()
})

test('the page loading screen gave up (its safety stop): the stage takes over for a load still running', () => {
	const boot = document.createElement('div')
	boot.id = 'boot'
	document.body.append(boot)
	mount(true)
	advance(1000)
	boot.remove()
	advance(32)
	expect(loader()?.classList.contains('is-waiting')).toBe(false)
})

test('a new load during the reveal starts a new map once the screen is gone', () => {
	const view = mount(true)
	advance(1000)
	view.set(false)
	advance(1200)
	expect(loader()?.classList.contains('is-done')).toBe(true)
	view.set(true)
	advance(400)
	expect(loader()?.classList.contains('is-done')).toBe(false)
	expect(loader()?.classList.contains('is-waiting')).toBe(true)
})

test('reduced motion: the same fill, then a short fade', () => {
	document.documentElement.dataset.mcMotion = 'reduced'
	try {
		const view = mount(true)
		advance(1000)
		view.set(false)
		advance(1200)
		expect(loader()?.classList.contains('is-done')).toBe(true)
		expect(loader()?.classList.contains('is-out')).toBe(false)
	} finally {
		delete document.documentElement.dataset.mcMotion
	}
})

test('the viewer load state: the loading screen while it loads, the card alone for an error', () => {
	const view = render(
		<I18nProvider initialLocale="en">
			<ViewerLoadState loading="Reading the file…" error="" />
		</I18nProvider>
	)
	expect(screen.getByRole('status').querySelector('.boot-map')).toBeTruthy()
	view.rerender(
		<I18nProvider initialLocale="en">
			<ViewerLoadState loading={null} error="Could not load this memory." />
		</I18nProvider>
	)
	expect(loader()).toBeNull() // dropped at once: nothing to reveal
	expect(screen.getByRole('alert').textContent).toContain('This memory will have to wait.')
	view.rerender(
		<I18nProvider initialLocale="en">
			<ViewerLoadState loading={null} error="This link has stopped." final />
		</I18nProvider>
	)
	expect(screen.getByRole('alert').textContent).not.toContain('will have to wait')
	view.rerender(
		<I18nProvider initialLocale="en">
			<ViewerLoadState loading={null} error="" />
		</I18nProvider>
	)
	expect(screen.queryByRole('alert')).toBeNull()
	expect(loader()).toBeNull()
})
