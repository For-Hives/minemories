// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { HeroClip } from './HeroClip'

/** The IntersectionObserver of the page, driven by hand: `show(true)` puts every observed clip on screen. */
const observers: { callback: IntersectionObserverCallback; elements: Element[] }[] = []
function show(isIntersecting: boolean) {
	act(() => {
		for (const observer of observers)
			observer.callback(
				observer.elements.map(target => ({ target, isIntersecting }) as IntersectionObserverEntry),
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
			constructor(callback: IntersectionObserverCallback) {
				this.entry = { callback, elements: [] }
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
})

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined })
	Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})

const menu = { fr: 'menu-fr', en: 'menu-en' }
function mount() {
	const view = render(<HeroClip name={menu} width={720} height={720} alt="Play the clip" />)
	const clip = view.container.querySelector('.mm-clip') as HTMLElement
	return {
		clip,
		video: () => clip.querySelector('video'),
		poster: () => clip.querySelector('img') as HTMLImageElement,
		toggle: () => clip.querySelector('.mm-clip__toggle') as HTMLButtonElement,
	}
}

test('nothing loads before the clip is seen after the film; it plays on screen and pauses off screen or in a hidden tab', async () => {
	document.documentElement.dataset.phase = 'film'
	const { clip, video, poster } = mount()
	// the poster holds the place, lazily, without a file until it comes close (this clip has a French and an English take); the video has no file yet
	expect(poster().getAttribute('src')).toBeNull()
	expect(poster().getAttribute('loading')).toBe('lazy')
	expect(video()).toBeNull()
	// on screen while the film runs: the poster of the page's language, still no video
	show(true)
	expect(poster().getAttribute('src')).toBe('/hero/clips/menu-en.webp')
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
	expect(element.getAttribute('preload')).toBe('none')
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
	const { video, poster } = mount()
	show(true)
	await waitFor(() => expect(video()?.getAttribute('src')).toBe('/hero/clips/menu-fr.mp4'))
	expect(poster().getAttribute('src')).toBe('/hero/clips/menu-fr.webp')
	play.mockClear()
	act(() => {
		document.documentElement.lang = 'de'
	})
	await waitFor(() => expect(video()?.getAttribute('src')).toBe('/hero/clips/menu-en.mp4'))
	expect(poster().getAttribute('src')).toBe('/hero/clips/menu-en.webp')
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
