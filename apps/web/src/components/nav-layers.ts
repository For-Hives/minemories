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

/** The elements Tab can reach inside a container, in order (the hidden ones aside). */
export function focusables(container: HTMLElement | null): HTMLElement[] {
	if (!container) return []
	return [
		...container.querySelectorAll<HTMLElement>(
			'a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]'
		),
	].filter(element => !(element.closest('[hidden]') || element.closest('[inert]')))
}
