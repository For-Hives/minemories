import { useEffect, useState } from 'react'
import { fetchReleasePage, type ModRelease, mergeReleases } from './mod-releases'

interface ReleaseState {
	releases: ModRelease[]
	status: 'loading' | 'ready' | 'error'
	hasMore: boolean
}
export function useModReleases() {
	const [page, setPage] = useState(1)
	const [attempt, setAttempt] = useState(0)
	const [state, setState] = useState<ReleaseState>({ releases: [], status: 'loading', hasMore: false })
	useEffect(() => {
		const controller = new AbortController()
		setState(previous => ({ ...previous, status: 'loading' }))
		const timeout = window.setTimeout(() => {
			controller.abort()
			setState(previous => ({ ...previous, status: 'error' }))
		}, 15000)
		void fetchReleasePage(page, controller.signal)
			.then(result => {
				if (controller.signal.aborted) return
				setState(previous => ({
					releases: mergeReleases(previous.releases, result.releases),
					hasMore: result.hasMore,
					status: 'ready',
				}))
			})
			.catch(() => {
				if (!controller.signal.aborted) setState(previous => ({ ...previous, status: 'error' }))
			})
			.finally(() => window.clearTimeout(timeout))
		return () => {
			controller.abort()
			window.clearTimeout(timeout)
		}
	}, [page, attempt])
	return {
		...state,
		retry: () => setAttempt(value => value + 1),
		loadMore: () => setPage(value => value + 1),
	}
}
