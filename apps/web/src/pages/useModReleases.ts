import { useEffect, useState } from 'react'
import { fetchModReleases, type ModRelease } from './mod-releases'

interface ReleaseState {
	releases: ModRelease[]
	status: 'loading' | 'ready' | 'error'
}
export function useModReleases() {
	const [attempt, setAttempt] = useState(0)
	const [state, setState] = useState<ReleaseState>({ releases: [], status: 'loading' })
	useEffect(() => {
		const controller = new AbortController()
		setState(previous => ({ ...previous, status: 'loading' }))
		const timeout = window.setTimeout(() => {
			controller.abort()
			setState(previous => ({ ...previous, status: 'error' }))
		}, 15000)
		void fetchModReleases(controller.signal)
			.then(releases => {
				if (!controller.signal.aborted) setState({ releases, status: 'ready' })
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
