import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppContext } from '../app-context'
import { clearDraft, draftId, isDraftString, readDraft, sameDraftValue, writeDraft } from '../lib/form-drafts'

export interface Draft<T> {
	/** What the field shows: what was typed when there is something, else the saved value. */
	value: T
	setValue: (next: T) => void
	/** True while the value differs from the saved one (it is then kept in this browser). */
	isDraft: boolean
	/** Throws the draft away: the field goes back to the saved value. */
	discard: () => void
	/** Forgets the draft once it has been saved. */
	clear: () => void
}

/**
 * A form value that survives refreshes, closed dialogs and tab switches, stored per form kind, signed-in owner and item.
 * `normalize` says which differences count (a trailing space saved as nothing is no draft); what is typed is still shown
 * exactly. `ready` is false while the saved value is still loading: a restored draft is then never compared with a
 * placeholder, and everything typed is kept.
 */
export function useDraft<T>(
	kind: string,
	item: string,
	saved: T,
	isValid: (value: unknown) => value is T,
	{
		normalize = (value: T): unknown => value,
		ready = true,
	}: { normalize?: (value: T) => unknown; ready?: boolean } = {}
): Draft<T> {
	const { session } = useAppContext()
	const id = draftId(kind, session?.user?.id ?? 'local', item)
	const [state, setState] = useState(() => ({ id, typed: readDraft(id, isValid) }))
	let typed = state.typed
	if (state.id !== id) {
		typed = readDraft(id, isValid)
		setState({ id, typed })
	}
	const same = (value: T) => sameDraftValue(normalize(value), normalize(saved))
	const stale = ready && typed !== null && same(typed)
	const latest = useRef({ id, saved, ready, same })
	latest.current = { id, saved, ready, same }
	useEffect(() => {
		if (!stale) return
		clearDraft(id)
		// A restored draft that is exactly the saved value is forgotten in memory too.
		const base = latest.current.saved
		setState(current =>
			current.id === id && current.typed !== null && sameDraftValue(current.typed, base) ? { id, typed: null } : current
		)
	}, [id, stale])
	const setValue = useCallback((next: T) => {
		const { id: current, saved: base, ready: loaded, same: matches } = latest.current
		if (loaded && matches(next)) clearDraft(current)
		else writeDraft(current, next, loaded ? base : undefined)
		// Exactly the saved value: the field follows the saved one again (a later rename elsewhere shows up).
		setState({ id: current, typed: loaded && sameDraftValue(next, base) ? null : next })
	}, [])
	const discard = useCallback(() => {
		clearDraft(latest.current.id)
		setState({ id: latest.current.id, typed: null })
	}, [])
	return { value: typed ?? saved, setValue, isDraft: typed !== null && !stale, discard, clear: discard }
}

/**
 * Whether unsaved text for this item waits in this browser, read from storage on every render. It serves a "Draft" chip
 * shown outside the form that writes the draft (the server tile while its sheet is closed).
 */
export function useWaitingDraft(kind: string, item: string, saved: string): boolean {
	const { session } = useAppContext()
	const typed = readDraft(draftId(kind, session?.user?.id ?? 'local', item), isDraftString)
	return typed !== null && typed.trim() !== saved.trim()
}

/** Equality of text drafts: surrounding spaces are trimmed on save, so they are no change. */
export function trimText(value: string): string {
	return value.trim()
}

/** A short-lived flag, for a "Saved" confirmation; its timer stops when the component goes away. */
export function useFlash(duration = 2500): [boolean, () => void] {
	const [visible, setVisible] = useState(false)
	const timer = useRef(0)
	useEffect(() => () => window.clearTimeout(timer.current), [])
	const show = useCallback(() => {
		window.clearTimeout(timer.current)
		setVisible(true)
		timer.current = window.setTimeout(() => setVisible(false), duration)
	}, [duration])
	return [visible, show]
}
