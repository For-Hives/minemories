import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
	canHoverOpen,
	FINE_POINTER,
	HOVER_CLOSE_MS,
	HOVER_FIRST_OPEN_MS,
	HOVER_OPEN_MS,
	HOVER_REST_PX,
	hoverIntent,
} from './hover-intent'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

function bar(pinned = false) {
	const state = { open: null as string | null, pinned }
	const show = vi.fn((key: string) => {
		state.open = key
		state.pinned = false
	})
	const hide = vi.fn(() => {
		state.open = null
	})
	const intent = hoverIntent({ open: () => state.open, pinned: () => state.pinned, show, hide })
	return { state, show, hide, intent }
}

test('a mouse on a fine-pointer screen may open a menu by resting on it; a touch, a pen or a coarse screen never', () => {
	const fine = (query: string) => query === FINE_POINTER
	expect(canHoverOpen('mouse', fine)).toBe(true)
	expect(canHoverOpen('touch', fine)).toBe(false)
	expect(canHoverOpen('pen', fine)).toBe(false)
	expect(canHoverOpen('mouse', () => false)).toBe(false)
})

test('without a matchMedia argument the screen is asked, and a browser without matchMedia never opens on hover', () => {
	vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === FINE_POINTER }))
	expect(canHoverOpen('mouse')).toBe(true)
	vi.stubGlobal('matchMedia', undefined)
	expect(canHoverOpen('mouse')).toBe(false)
})

test('resting on a button opens its menu after the intent delay; passing over it opens nothing', () => {
	const { state, show, intent } = bar()
	intent.enter('product')
	vi.advanceTimersByTime(HOVER_FIRST_OPEN_MS - 1)
	expect(show).not.toHaveBeenCalled()
	intent.leave()
	vi.advanceTimersByTime(HOVER_FIRST_OPEN_MS)
	expect(show).not.toHaveBeenCalled()
	intent.enter('product')
	vi.advanceTimersByTime(HOVER_FIRST_OPEN_MS)
	expect(state.open).toBe('product')
	// back on the open menu: nothing to do
	intent.enter('product')
	vi.advanceTimersByTime(HOVER_FIRST_OPEN_MS)
	expect(show).toHaveBeenCalledTimes(1)
})

test('moving to a neighbour switches to it; a quick crossing on the way to the panel does not', () => {
	const { state, intent } = bar()
	intent.enter('product')
	vi.advanceTimersByTime(HOVER_FIRST_OPEN_MS)
	// diagonal move: out of Product, across Guides for a moment, into Product's panel
	intent.leave()
	intent.enter('guides')
	vi.advanceTimersByTime(60)
	intent.leave()
	intent.enter('product')
	vi.advanceTimersByTime(HOVER_CLOSE_MS * 2)
	expect(state.open).toBe('product')
	// resting on Guides takes over
	intent.leave()
	intent.enter('guides')
	vi.advanceTimersByTime(HOVER_OPEN_MS)
	expect(state.open).toBe('guides')
})

test('leaving a hover-opened menu closes it after the grace delay, unless the pointer comes back', () => {
	const { state, hide, intent } = bar()
	intent.enter('help')
	vi.advanceTimersByTime(HOVER_FIRST_OPEN_MS)
	intent.leave()
	vi.advanceTimersByTime(HOVER_CLOSE_MS - 1)
	intent.enter('help')
	vi.advanceTimersByTime(HOVER_CLOSE_MS)
	expect(state.open).toBe('help')
	intent.leave()
	vi.advanceTimersByTime(HOVER_CLOSE_MS)
	expect(hide).toHaveBeenCalledTimes(1)
	expect(state.open).toBeNull()
	// nothing open: leaving schedules nothing
	intent.leave()
	vi.advanceTimersByTime(HOVER_CLOSE_MS)
	expect(hide).toHaveBeenCalledTimes(1)
})

test('a pinned menu (a click, a key) stays when the pointer leaves, even if pinned during the grace delay', () => {
	const { state, hide, intent } = bar(true)
	state.open = 'product'
	intent.leave()
	vi.advanceTimersByTime(HOVER_CLOSE_MS)
	expect(hide).not.toHaveBeenCalled()
	state.pinned = false
	intent.leave()
	state.pinned = true
	vi.advanceTimersByTime(HOVER_CLOSE_MS)
	expect(hide).not.toHaveBeenCalled()
	expect(state.open).toBe('product')
})

test('cancel forgets a pending opening and a pending closing', () => {
	const { state, show, hide, intent } = bar()
	intent.enter('guides')
	intent.cancel()
	vi.advanceTimersByTime(HOVER_FIRST_OPEN_MS)
	expect(show).not.toHaveBeenCalled()
	state.open = 'guides'
	intent.leave()
	intent.cancel()
	vi.advanceTimersByTime(HOVER_CLOSE_MS)
	expect(hide).not.toHaveBeenCalled()
})

test('the first menu waits longer than a switch: a pointer passing at a normal speed opens nothing, a menu already open hands over quickly', () => {
	const { state, intent } = bar()
	intent.enter('product', 10, 10)
	vi.advanceTimersByTime(HOVER_OPEN_MS)
	expect(state.open).toBeNull()
	vi.advanceTimersByTime(HOVER_FIRST_OPEN_MS - HOVER_OPEN_MS)
	expect(state.open).toBe('product')
	intent.leave()
	intent.enter('guides', 120, 10)
	vi.advanceTimersByTime(HOVER_OPEN_MS)
	expect(state.open).toBe('guides')
})

test('a pointer that keeps moving over a button restarts the wait; small jitters do not, and a move with nothing pending does nothing', () => {
	const { state, show, intent } = bar()
	intent.move(50, 50)
	intent.enter('product', 0, 0)
	for (let x = 20; x <= 200; x += 20) {
		vi.advanceTimersByTime(HOVER_FIRST_OPEN_MS - 50)
		intent.move(x, 0)
	}
	expect(show).not.toHaveBeenCalled()
	// resting, with a hand's tremor
	intent.move(200 + HOVER_REST_PX, 0)
	vi.advanceTimersByTime(HOVER_FIRST_OPEN_MS)
	expect(state.open).toBe('product')
	// moving inside the open menu changes nothing
	intent.move(400, 400)
	vi.advanceTimersByTime(HOVER_FIRST_OPEN_MS)
	expect(show).toHaveBeenCalledTimes(1)
})

test('custom delays can be passed', () => {
	const state = { open: null as string | null }
	const intent = hoverIntent(
		{ open: () => state.open, pinned: () => false, show: key => (state.open = key), hide: () => (state.open = null) },
		{ firstOpenMs: 5, openMs: 1, closeMs: 1 }
	)
	intent.enter('help')
	vi.advanceTimersByTime(5)
	expect(state.open).toBe('help')
})
