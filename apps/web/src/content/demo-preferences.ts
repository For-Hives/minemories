import { useEffect, useState } from 'react'
import { demoMemories } from './discovery'

export interface DemoPreferences {
	favorites: string[]
	votes: string[]
}
export const emptyPreferences: DemoPreferences = { favorites: [], votes: [] }
const key = 'minemories-demo-v1'
export function parseDemoPreferences(raw: string | null): DemoPreferences {
	try {
		const data: unknown = JSON.parse(raw ?? '{}')
		if (!data || typeof data !== 'object') return emptyPreferences
		const record = data as Record<string, unknown>
		const ids = new Set(demoMemories.map(memory => memory.id))
		function validIds(value: unknown) {
			return Array.isArray(value)
				? [...new Set(value.filter((id): id is string => typeof id === 'string' && ids.has(id)))]
				: []
		}
		return { favorites: validIds(record.favorites), votes: validIds(record.votes) }
	} catch {
		return emptyPreferences
	}
}
export function toggleId(ids: string[], id: string) {
	return ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]
}
export function useDemoPreferences() {
	const [preferences, setPreferences] = useState(emptyPreferences)
	const [restored, setRestored] = useState(false)
	useEffect(() => {
		try {
			setPreferences(parseDemoPreferences(localStorage.getItem(key)))
		} catch {
			/* Optional local preferences. */
		}
		setRestored(true)
	}, [])
	useEffect(() => {
		if (!restored) return
		try {
			localStorage.setItem(key, JSON.stringify(preferences))
		} catch {
			/* Interactions still work in memory. */
		}
	}, [preferences, restored])
	function toggle(kind: keyof DemoPreferences, id: string) {
		setPreferences(previous => ({ ...previous, [kind]: toggleId(previous[kind], id) }))
	}
	return { preferences, toggle, reset: () => setPreferences(emptyPreferences) }
}
