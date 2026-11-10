/** How long the pointer rests on a menu's button before the menu opens (or takes over from the open one). */
export const HOVER_OPEN_MS = 120
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
	/** The pointer entered a menu (its button or its panel). */
	enter: (key: K) => void
	/** The pointer left a menu's button and panel. */
	leave: () => void
	/** Forgets what was about to open or close (a click, a key, the menu closed another way). */
	cancel: () => void
}

/**
 * Hover intent for a bar of menus: resting on a button opens its menu (or switches from the open one) after `openMs`, so a pointer crossing
 * the bar opens nothing; leaving a menu closes it after `closeMs` unless the pointer comes back to it, or it was pinned by a click or a key.
 * One timer each for the whole bar: entering any menu cancels a pending close.
 */
export function hoverIntent<K>(menus: HoverMenus<K>, openMs = HOVER_OPEN_MS, closeMs = HOVER_CLOSE_MS): HoverIntent<K> {
	let opening: ReturnType<typeof setTimeout> | undefined
	let closing: ReturnType<typeof setTimeout> | undefined
	const cancel = () => {
		clearTimeout(opening)
		clearTimeout(closing)
		opening = closing = undefined
	}
	return {
		enter(key) {
			cancel()
			if (menus.open() === key) return
			opening = setTimeout(() => {
				opening = undefined
				menus.show(key)
			}, openMs)
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
