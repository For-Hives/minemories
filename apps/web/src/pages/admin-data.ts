import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '../api-client'

export type AdminDataset = {
	summary: Awaited<ReturnType<typeof apiClient.admin.summary>>
	directory: Awaited<ReturnType<typeof apiClient.admin.users>>
	audit: Awaited<ReturnType<typeof apiClient.admin.audit>>
}
type State = { kind: 'loading' | 'denied' | 'error' } | { kind: 'ready'; data: AdminDataset }
export function useAdminData(filters: {
	hours: 24 | 168 | 720
	query: string
	role: 'all' | 'user' | 'admin'
	page: number
}) {
	const [state, setState] = useState<State>({ kind: 'loading' }),
		[revision, setRevision] = useState(0)
	const reload = useCallback(() => setRevision(value => value + 1), [])
	const { hours, query, role, page } = filters
	useEffect(() => {
		const controller = new AbortController()
		let active = true
		setState({ kind: 'loading' })
		void readData({ hours, query, role, page }, controller.signal)
			.then(result => {
				if (active) setState(result)
			})
			.catch(cause => {
				if (active) setState(failure(cause))
			})
		return () => {
			active = false
			controller.abort()
		}
	}, [hours, query, role, page, revision])
	return { ...state, reload }
}

function failure(cause: unknown): State {
	const code = cause !== null && typeof cause === 'object' && 'code' in cause ? cause.code : ''
	return { kind: code === 'FORBIDDEN' || code === 'UNAUTHORIZED' ? 'denied' : 'error' }
}
async function readData(
	filters: { hours: 24 | 168 | 720; query: string; role: 'all' | 'user' | 'admin'; page: number },
	signal: AbortSignal
): Promise<State> {
	const options = { signal }
	const access = await apiClient.admin.access(undefined, options)
	signal.throwIfAborted()
	if (!access.allowed) return { kind: 'denied' }
	const { hours, query, role, page } = filters
	const [summary, directory, audit] = await Promise.all([
		apiClient.admin.summary({ hours }, options),
		apiClient.admin.users({ query, role, page }, options),
		apiClient.admin.audit(undefined, options),
	])
	signal.throwIfAborted()
	return { kind: 'ready', data: { summary, directory, audit } }
}
