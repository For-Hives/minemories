// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { HeroClip, type HeroClipProps } from './HeroClip'

/** The IntersectionObserver of the page, driven by hand: `show(true)` puts every observed clip on screen. */
const observers: { callback: IntersectionObserverCallback; elements: Element[]; ahead: boolean }[] = []
function show(isIntersecting: boolean, intersectionRatio = isIntersecting ? 1 : 0, only?: Element) {
	act(() => {
		for (const observer of observers) {
			const targets = observer.elements.filter(target => !only || target === only)
			if (targets.length === 0) continue
			observer.callback(
				targets.map(target => ({ target, isIntersecting, intersectionRatio }) as IntersectionObserverEntry),
				{} as IntersectionObserver
			)
		}
	})
}
/** Only the observers that look half a screen ahead: the clip is near, not yet on screen. */
function approach(isIntersecting: boolean) {
	act(() => {
		for (const observer of observers.filter(entry => entry.ahead))
			observer.callback(
				observer.elements.map(
					target =>
						({ target, isIntersecting, intersectionRatio: isIntersecting ? 0.01 : 0 }) as IntersectionObserverEntry
				),
				{} as IntersectionObserver
			)
	})
}
let reduced = false
const motionListeners = new Set<() => void>()
const play = vi.fn(() => Promise.resolve())
const pause = vi.fn()

beforeEach(() => {
	observers.length = 0
	reduced = false
	motionListeners.clear()
	play.mockClear()
	pause.mockClear()
	vi.stubGlobal(
		'IntersectionObserver',
		class {
			readonly entry: (typeof observers)[number]
			constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
				this.entry = { callback, elements: [], ahead: Boolean(options?.rootMargin) }
				observers.push(this.entry)
			}
			observe(element: Element) {
				this.entry.elements.push(element)
			}
			disconnect() {
				this.entry.elements = []
			}
		}
	)
	vi.stubGlobal('matchMedia', (query: string) => ({
		get matches() {
			return query.includes('reduce') && reduced
		},
		addEventListener: (_: string, listener: () => void) => motionListeners.add(listener),
		removeEventListener: (_: string, listener: () => void) => motionListeners.delete(listener),
	}))
	Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
	Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause })
	const root = document.documentElement
	root.lang = 'en'
	root.dataset.phase = 'site'
	delete root.dataset.mcMotion
	delete root.dataset.mmBootFull
	document.getElementById('boot')?.remove()
})

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined })
	Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})

const menu = { fr: 'menu-fr', en: 'menu-en' }
function mount(props: Partial<HeroClipProps> = {}) {
	const view = render(<HeroClip name={menu} width={720} height={720} alt="Play the clip" {...props} />)
	const clip = view.container.querySelector('.mm-clip') as HTMLElement
	return {
		clip,
		video: () => clip.querySelector('video'),
		posters: () => [...clip.querySelectorAll('img')].map(image => image.getAttribute('src')),
		toggle: () => clip.querySelector('.mm-clip__toggle') as HTMLButtonElement,
	}
}

test('nothing loads before the clip is seen after the film; it plays on screen and pauses off screen or in a hidden tab', async () => {
	document.documentElement.dataset.phase = 'film'
	const { clip, video, posters } = mount()
	// both lazy posters hold the place (CSS shows the page language's one); the video has no file yet
	expect(posters()).toEqual(['/hero/clips/menu-fr.webp', '/hero/clips/menu-en.webp'])
	for (const image of clip.querySelectorAll('img')) expect(image.getAttribute('loading')).toBe('lazy')
	expect(video()).toBeNull()
	// on screen while the film runs: still no video
	show(true)
	expect(video()).toBeNull()
	// the film hands over to the page: the clip loads and plays, muted, inline, looping, hidden from screen readers
	act(() => {
		document.documentElement.dataset.phase = 'site'
	})
	await waitFor(() => expect(video()).not.toBeNull())
	const element = video() as HTMLVideoElement
	expect(element.getAttribute('src')).toBe('/hero/clips/menu-en.mp4')
	expect(element.muted).toBe(true)
	expect(element.loop).toBe(true)
	expect(element.hasAttribute('playsinline')).toBe(true)
	expect(element.getAttribute('preload')).toBe('auto')
	expect(element.getAttribute('aria-hidden')).toBe('true')
	expect(play).toHaveBeenCalled()
	// the video shows over the poster only once it really plays
	expect(clip.dataset.state).toBe('still')
	fireEvent.playing(element)
	expect(clip.dataset.state).toBe('playing')
	// off screen: paused
	pause.mockClear()
	show(false)
	expect(pause).toHaveBeenCalled()
	expect(clip.dataset.state).toBe('still')
	// back on screen, then the tab is hidden: paused again
	show(true)
	pause.mockClear()
	act(() => {
		Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
		document.dispatchEvent(new Event('visibilitychange'))
	})
	expect(pause).toHaveBeenCalled()
})

test('a clip barely on screen waits until a third of it shows', async () => {
	const { video, toggle } = mount()
	show(true, 0.2)
	// near enough to load, not seen enough to play
	expect(play).not.toHaveBeenCalled()
	expect(toggle().dataset.playing).toBe('false')
	show(true, 0.5)
	await waitFor(() => expect(video()).not.toBeNull())
	expect(play).toHaveBeenCalled()
	pause.mockClear()
	show(true, 0.1)
	expect(pause).toHaveBeenCalled()
})

test('reduced motion keeps the poster with a play button, which plays and pauses the clip', async () => {
	reduced = true
	const { video, toggle } = mount()
	show(true)
	expect(video()).toBeNull()
	expect(toggle().dataset.playing).toBe('false')
	expect(toggle().textContent).toContain('Lire la vidéo')
	fireEvent.click(toggle())
	await waitFor(() => expect(video()).not.toBeNull())
	expect(play).toHaveBeenCalled()
	expect(toggle().dataset.playing).toBe('true')
	fireEvent.click(toggle())
	expect(pause).toHaveBeenCalled()
	expect(toggle().dataset.playing).toBe('false')
})

test('turning reduced motion on, by the system or by the site’s option, stops a playing clip', async () => {
	const { video } = mount()
	show(true)
	await waitFor(() => expect(video()).not.toBeNull())
	pause.mockClear()
	act(() => {
		reduced = true
		for (const listener of motionListeners) listener()
	})
	expect(pause).toHaveBeenCalled()
	act(() => {
		reduced = false
		for (const listener of motionListeners) listener()
	})
	pause.mockClear()
	act(() => {
		document.documentElement.dataset.mcMotion = 'reduced'
	})
	await waitFor(() => expect(pause).toHaveBeenCalled())
})

test('Save-Data or a slow connection keeps the poster', () => {
	Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } })
	const { video, toggle } = mount()
	show(true)
	expect(video()).toBeNull()
	expect(toggle().dataset.playing).toBe('false')
})

test('a language switch swaps the in-game take, poster and video, and keeps it playing', async () => {
	document.documentElement.lang = 'fr'
	const { clip, video } = mount()
	show(true)
	await waitFor(() => expect(video()?.getAttribute('src')).toBe('/hero/clips/menu-fr.mp4'))
	// the French poster is the one the page's lang shows
	expect(clip.querySelector('.mm-clip__poster--fr')?.matches(':lang(fr)')).toBe(true)
	play.mockClear()
	act(() => {
		document.documentElement.lang = 'de'
	})
	await waitFor(() => expect(video()?.getAttribute('src')).toBe('/hero/clips/menu-en.mp4'))
	expect(clip.querySelector('.mm-clip__poster--en')?.matches(':lang(fr)')).toBe(false)
	expect(play).toHaveBeenCalled()
	act(() => {
		document.documentElement.lang = 'fr-CA'
	})
	await waitFor(() => expect(video()?.getAttribute('src')).toBe('/hero/clips/menu-fr.mp4'))
})

test('a refused play leaves the poster in place', async () => {
	play.mockImplementationOnce(() => Promise.reject(new Error('NotAllowedError')))
	const { clip, video } = mount()
	show(true)
	await waitFor(() => expect(video()).not.toBeNull())
	await act(async () => undefined)
	expect(clip.dataset.state).toBe('still')
})

test('a link to a section opens under the loading screen: no file, no play until the screen reads 100 %', async () => {
	const boot = document.createElement('div')
	boot.id = 'boot'
	document.body.append(boot)
	const { video } = mount()
	show(true)
	approach(true)
	expect(video()).toBeNull()
	act(() => {
		document.documentElement.dataset.mmBootFull = '1'
		window.dispatchEvent(new Event('mm:boot-full'))
	})
	await waitFor(() => expect(video()).not.toBeNull())
	expect(play).toHaveBeenCalled()
})

test('half a screen ahead the file loads without playing; a still clip never preloads', async () => {
	const { video } = mount()
	approach(true)
	await waitFor(() => expect(video()).not.toBeNull())
	expect(play).not.toHaveBeenCalled()
	cleanup()
	reduced = true
	const still = mount()
	approach(true)
	expect(still.video()).toBeNull()
})

test('the video starts on the poster’s frame', async () => {
	const { video } = mount({ posterAt: 2.4 })
	show(true)
	await waitFor(() => expect(video()).not.toBeNull())
	const element = video() as HTMLVideoElement
	fireEvent.loadedMetadata(element)
	expect(element.currentTime).toBe(2.4)
	// a video already moved on is left where it is
	element.currentTime = 1
	fireEvent.loadedMetadata(element)
	expect(element.currentTime).toBe(1)
})

test('the first clip without a poster time starts at its start', async () => {
	const { video } = mount()
	show(true)
	await waitFor(() => expect(video()).not.toBeNull())
	fireEvent.loadedMetadata(video() as HTMLVideoElement)
	expect((video() as HTMLVideoElement).currentTime).toBe(0)
})

test('a cut clip names the side on screen with a chip that follows the video’s time', async () => {
	const frames: FrameRequestCallback[] = []
	vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
	vi.stubGlobal('cancelAnimationFrame', vi.fn())
	const cut = { at: 2.5, before: 'In Minecraft', after: 'In your browser' }
	const { clip, video } = mount({ cut, toggleAt: 'end' })
	expect(clip.dataset.toggle).toBe('end')
	expect(clip.dataset.side).toBe('before')
	expect(clip.querySelector('.mm-clip__chip')?.getAttribute('aria-hidden')).toBe('true')
	expect(clip.querySelector('.mm-clip__side--before')?.getAttribute('data-i18n')).toBe('In Minecraft')
	show(true)
	await waitFor(() => expect(video()).not.toBeNull())
	const element = video() as HTMLVideoElement
	fireEvent.playing(element)
	element.currentTime = 3
	act(() => frames.shift()?.(0))
	expect(clip.dataset.side).toBe('after')
	// stopped, it shows the poster's side again
	show(false)
	expect(clip.dataset.side).toBe('before')
})

test('of two clips on screen only the most visible plays by itself; the other one waits on its poster', async () => {
	const first = mount()
	const second = mount()
	show(true, 0.5, first.clip)
	show(true, 0.9, second.clip)
	await waitFor(() => expect(second.video()).not.toBeNull())
	await waitFor(() => expect(second.clip.querySelector('.mm-clip__toggle')?.getAttribute('data-playing')).toBe('true'))
	expect(first.toggle().dataset.playing).toBe('false')
	// the visitor's button still plays the other one
	fireEvent.click(first.toggle())
	expect(first.toggle().dataset.playing).toBe('true')
	// scrolling on: the first becomes the most visible and takes over
	show(true, 0.2, second.clip)
	expect(second.clip.querySelector('.mm-clip__toggle')?.getAttribute('data-playing')).toBe('false')
})

test('two whole clips on screen: scrolling hands the play to the one nearest the middle of the screen', async () => {
	const frames: FrameRequestCallback[] = []
	vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
	vi.stubGlobal('cancelAnimationFrame', vi.fn())
	const first = mount()
	const second = mount()
	const place = (clip: HTMLElement, top: number) => {
		clip.getBoundingClientRect = () => ({ top, bottom: top + 200, height: 200 }) as DOMRect
	}
	place(first.clip, 300)
	place(second.clip, 700)
	show(true, 1)
	await waitFor(() => expect(first.toggle().dataset.playing).toBe('true'))
	expect(second.toggle().dataset.playing).toBe('false')
	// the page scrolls: the second clip is now nearer the middle, both still whole
	place(first.clip, 50)
	place(second.clip, 450)
	act(() => {
		window.dispatchEvent(new Event('scroll'))
		window.dispatchEvent(new Event('scroll'))
	})
	// one measure per clip and frame, however many scroll events
	expect(frames).toHaveLength(2)
	act(() => {
		for (const frame of frames.splice(0)) frame(0)
	})
	expect(second.toggle().dataset.playing).toBe('true')
	expect(first.toggle().dataset.playing).toBe('false')
	// a clip without a size yet reports nothing
	second.clip.getBoundingClientRect = () => ({ top: 0, bottom: 0, height: 0 }) as DOMRect
	act(() => window.dispatchEvent(new Event('scroll')))
	act(() => {
		for (const frame of frames.splice(0)) frame(0)
	})
	expect(second.toggle().dataset.playing).toBe('true')
})
