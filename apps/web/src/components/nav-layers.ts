import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useMemo, useRef } from 'react'
import { canHoverOpen, hoverIntent } from '../lib/hover-intent'

/*
 * The bar's popups (a menu, the language list, the phones' panel) are layers: Escape closes the most recent one only, and goes no
 * further (on the landing the film would otherwise read it as "leave the film"); a press outside a layer closes it.
 */
type Layer = { close: (focus: boolean) => void }
const stack: Layer[] = []

function onEscape(event: KeyboardEvent) {
	if (event.key !== 'Escape' || stack.length === 0) return
	event.preventDefault()
	event.stopPropagation()
	stack.at(-1)?.close(true)
}

/** Registers an open layer: Escape (the latest layer first) and a press outside `roots` close it. */
export function useLayer(
	open: boolean,
	close: (focus: boolean) => void,
	roots: ReadonlyArray<RefObject<HTMLElement | null>>
) {
	const latest = useRef(close)
	latest.current = close
	const kept = useRef(roots)
	kept.current = roots
	useEffect(() => {
		if (!open) return
		const layer: Layer = { close: focus => latest.current(focus) }
		stack.push(layer)
		if (stack.length === 1) document.addEventListener('keydown', onEscape, true)
		const onPointer = (event: PointerEvent) => {
			const target = event.target
			if (target instanceof Node && kept.current.some(root => root.current?.contains(target))) return
			latest.current(false)
		}
		document.addEventListener('pointerdown', onPointer, true)
		return () => {
			stack.splice(stack.indexOf(layer), 1)
			if (stack.length === 0) document.removeEventListener('keydown', onEscape, true)
			document.removeEventListener('pointerdown', onPointer, true)
		}
	}, [open])
}

/** The elements Tab can reach inside a container, in order (the hidden ones aside, those a width's rules hide too). */
export function focusables(container: HTMLElement | null): HTMLElement[] {
	if (!container) return []
	return [
		...container.querySelectorAll<HTMLElement>(
			'a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]'
		),
	].filter(element => !(element.closest('[hidden], [inert]') || element.checkVisibility?.() === false))
}

/**
 * While the phones' panel is open the rest of the page is inert (a modal dialog): screen readers' browse mode and Tab stay in the bar.
 * Everything beside the bar's header, up to <body>, is made inert; only what this hook changed is given back on close.
 */
export function useInertOutside(open: boolean, inside: RefObject<HTMLElement | null>) {
	useEffect(() => {
		const anchor = inside.current
		if (!(open && anchor)) return
		const changed = inertAround(anchor.closest('header') ?? anchor)
		return () => {
			for (const element of changed) element.removeAttribute('inert')
		}
	}, [open, inside])
}

/** Makes inert every element beside `kept` and its ancestors up to <body>, and returns those it changed (not those already inert). */
function inertAround(kept: Element): Element[] {
	const changed: Element[] = []
	for (let node: Element | null = kept; node && node !== document.body; node = node.parentElement) {
		const siblings = [...(node.parentElement?.children ?? [])].filter(
			sibling => sibling !== node && !sibling.hasAttribute('inert')
		)
		for (const sibling of siblings) sibling.setAttribute('inert', '')
		changed.push(...siblings)
	}
	return changed
}

/**
 * Hover for the bar's menus (lib/hover-intent.ts), on a mouse with a fine-pointer screen only: resting on a menu opens it, leaving its button
 * and panel closes it after a grace delay. A click or a key pins the menu (`pin`): the pointer leaving no longer closes it. A touch opens
 * nothing; the click and the keys work as before everywhere. `handlers(key)` goes on the element holding a menu's button and panel.
 */
export function useHoverMenus<K>(open: K | null, setOpen: (key: K | null) => void) {
	const pinned = useRef(false)
	const latest = useRef({ open, setOpen })
	latest.current = { open, setOpen }
	const intent = useMemo(
		() =>
			hoverIntent<K>({
				open: () => latest.current.open,
				pinned: () => pinned.current,
				show: key => {
					pinned.current = false
					latest.current.setOpen(key)
				},
				hide: () => latest.current.setOpen(null),
			}),
		[]
	)
	useEffect(() => intent.cancel, [intent])
	// A menu closed another way (Escape, a press outside, a link) forgets its pin and anything pending.
	useEffect(() => {
		if (open !== null) return
		pinned.current = false
		intent.cancel()
	}, [open, intent])
	return {
		handlers: (key: K) => ({
			onPointerEnter: (event: ReactPointerEvent) => {
				if (canHoverOpen(event.pointerType)) intent.enter(key)
			},
			onPointerLeave: (event: ReactPointerEvent) => {
				if (canHoverOpen(event.pointerType)) intent.leave()
			},
		}),
		/** A click or a key opened (or kept) the menu: it stays until closed on purpose. */
		pin: () => {
			intent.cancel()
			pinned.current = true
		},
		/** Whether the open menu was opened by the pointer alone (a click then pins it instead of closing it). */
		hovered: () => !pinned.current,
	}
}
