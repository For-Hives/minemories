/** How long the pointer rests on a menu's button before it takes over from the menu already open. */
export const HOVER_OPEN_MS = 100
/** How long the pointer rests on a menu's button before the first menu opens, when none is open: a pointer on its way somewhere else opens nothing. */
export const HOVER_FIRST_OPEN_MS = 200
/** A pointer that moves further than this (px) is not resting: the wait starts again from where it is. */
export const HOVER_REST_PX = 4
/** How long an open menu waits once the pointer has left its button and its panel: a diagonal move into the panel never closes it. */
export const HOVER_CLOSE_MS = 280

/** A screen whose main pointer hovers and aims finely (a mouse or a trackpad), never a phone or a tablet. */
export const FINE_POINTER = '(hover: hover) and (pointer: fine)'

const mediaMatches = (query: string) => globalThis.matchMedia?.(query)?.matches ?? false

/** Whether a pointer may open a menu by resting on it: a mouse on a fine-pointer screen; a touch, a pen or a phone never does. */
export function canHoverOpen(pointerType: string, matches: (query: string) => boolean = mediaMatches): boolean {
	return pointerType === 'mouse' && matches(FINE_POINTER)
}

export type HoverMenus<K> = {
	/** The menu open now, or null. */
	open: () => K | null
	/** Whether the open menu was opened by a click or a key: the pointer leaving never closes it. */
	pinned: () => boolean
	/** Opens a menu for the hovering pointer (unpinned). */
	show: (key: K) => void
	hide: () => void
}

export type HoverIntent<K> = {
	/** The pointer entered a menu (its button or its panel), at (x, y). */
	enter: (key: K, x?: number, y?: number) => void
	/** The pointer moved to (x, y) inside a menu: unless it is resting, a pending open waits again. */
	move: (x: number, y: number) => void
	/** The pointer left a menu's button and panel. */
	leave: () => void
	/** Forgets what was about to open or close (a click, a key, the menu closed another way). */
	cancel: () => void
}

export interface HoverDelays {
	/** Rest before the first menu opens. */
	readonly firstOpenMs: number
	/** Rest before a menu takes over from the open one. */
	readonly openMs: number
	/** Grace before a menu the pointer left closes. */
	readonly closeMs: number
}

const delays: HoverDelays = { firstOpenMs: HOVER_FIRST_OPEN_MS, openMs: HOVER_OPEN_MS, closeMs: HOVER_CLOSE_MS }

/**
 * Hover intent for a bar of menus: a pointer that rests on a button opens its menu, after `firstOpenMs` when none is open and `openMs` to switch
 * from the open one; any move of more than HOVER_REST_PX restarts the wait, so a pointer crossing the bar opens nothing, whatever its speed. Leaving
 * a menu closes it after `closeMs` unless the pointer comes back to it, or it was pinned by a click or a key. One timer each for the whole bar:
 * entering any menu cancels a pending close.
 */
export function hoverIntent<K>(menus: HoverMenus<K>, { firstOpenMs, openMs, closeMs } = delays): HoverIntent<K> {
	let opening: ReturnType<typeof setTimeout> | undefined
	let closing: ReturnType<typeof setTimeout> | undefined
	let pending: { key: K; x: number; y: number } | undefined
	const cancel = () => {
		clearTimeout(opening)
		clearTimeout(closing)
		opening = closing = undefined
		pending = undefined
	}
	const arm = (key: K) => {
		clearTimeout(opening)
		opening = setTimeout(
			() => {
				opening = pending = undefined
				menus.show(key)
			},
			menus.open() === null ? firstOpenMs : openMs
		)
	}
	return {
		enter(key, x = 0, y = 0) {
			cancel()
			if (menus.open() === key) return
			pending = { key, x, y }
			arm(key)
		},
		move(x, y) {
			if (!pending || Math.hypot(x - pending.x, y - pending.y) <= HOVER_REST_PX) return
			pending = { key: pending.key, x, y }
			arm(pending.key)
		},
		leave() {
			cancel()
			if (menus.open() === null || menus.pinned()) return
			closing = setTimeout(() => {
				closing = undefined
				if (!menus.pinned()) menus.hide()
			}, closeMs)
		},
		cancel,
	}
}
