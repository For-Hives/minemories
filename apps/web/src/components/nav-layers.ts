import { type RefObject, useEffect, useRef } from 'react'

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
