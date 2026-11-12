import { useEffect, useRef, useState } from 'react'
import { apiBase } from '../api-client'
import { parseRoadmap, type Roadmap } from '../lib/roadmap'

export const roadmapUrl = `${apiBase}/api/roadmap`
const REQUEST_TIMEOUT_MS = 15000
/** Coming back to the tab reloads the board quietly, at most once every 30 seconds. */
export const VISIBLE_REFRESH_MS = 30000

/** `no-cache`: the browser may keep a copy but always revalidates it (ETag), so a reload shows GitHub's latest state. */
export async function fetchRoadmap(signal: AbortSignal) {
	const response = await fetch(roadmapUrl, { signal, cache: 'no-cache', headers: { Accept: 'application/json' } })
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
	const loadedAt = useRef(0)
	useEffect(() => {
		const controller = new AbortController()
		setState(previous => ({ ...previous, status: 'loading' }))
		const timeout = window.setTimeout(() => {
			controller.abort()
			setState(previous => ({ ...previous, status: 'error' }))
		}, REQUEST_TIMEOUT_MS)
		void fetchRoadmap(controller.signal)
			.then(roadmap => {
				if (controller.signal.aborted) return
				loadedAt.current = Date.now()
				setState({ roadmap, status: 'ready' })
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
	useEffect(() => {
		let running: AbortController | null = null
		function refreshQuietly() {
			if (document.visibilityState !== 'visible' || running) return
			if (Date.now() - loadedAt.current < VISIBLE_REFRESH_MS) return
			const controller = new AbortController()
			running = controller
			const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
			// No loading state: the board stays on screen and only changes when the new copy arrives.
			void fetchRoadmap(controller.signal)
				.then(roadmap => {
					if (controller.signal.aborted) return
					loadedAt.current = Date.now()
					setState({ roadmap, status: 'ready' })
				})
				.catch(() => undefined)
				.finally(() => {
					window.clearTimeout(timeout)
					if (running === controller) running = null
				})
		}
		document.addEventListener('visibilitychange', refreshQuietly)
		return () => {
			document.removeEventListener('visibilitychange', refreshQuietly)
			running?.abort()
		}
	}, [])
	return { ...state, retry: () => setAttempt(value => value + 1) }
}
