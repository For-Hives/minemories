import { useEffect, useState } from 'react'
import { apiBase } from '../api-client'
import { parseRoadmap, type Roadmap } from '../lib/roadmap'

export const roadmapUrl = `${apiBase}/api/roadmap`

export async function fetchRoadmap(signal: AbortSignal) {
	const response = await fetch(roadmapUrl, { signal, headers: { Accept: 'application/json' } })
	if (!response.ok) throw new Error('Roadmap unavailable')
	return parseRoadmap(await response.json())
}

interface RoadmapState {
	roadmap: Roadmap | null
	status: 'loading' | 'ready' | 'error'
}
export function useRoadmap() {
	const [attempt, setAttempt] = useState(0)
	const [state, setState] = useState<RoadmapState>({ roadmap: null, status: 'loading' })
	useEffect(() => {
		const controller = new AbortController()
		setState(previous => ({ ...previous, status: 'loading' }))
		const timeout = window.setTimeout(() => {
			controller.abort()
			setState(previous => ({ ...previous, status: 'error' }))
		}, 15000)
		void fetchRoadmap(controller.signal)
			.then(roadmap => {
				if (!controller.signal.aborted) setState({ roadmap, status: 'ready' })
			})
			.catch(() => {
				if (!controller.signal.aborted) setState(previous => ({ ...previous, status: 'error' }))
			})
			.finally(() => window.clearTimeout(timeout))
		return () => {
			controller.abort()
			window.clearTimeout(timeout)
		}
	}, [attempt])
	return { ...state, retry: () => setAttempt(value => value + 1) }
}
