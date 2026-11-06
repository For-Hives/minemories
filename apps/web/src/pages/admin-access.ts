import { useEffect, useState } from 'react'
import { apiClient } from '../api-client'
import { useAppContext } from '../app-context'

/** What the signed-in account may open in the administration area, as confirmed by the server (one boolean per capability). */
export type AdminAccess = {
	ready: boolean
	admin: boolean
	moderator: boolean
	operator: boolean
}
export const noAdminAccess: AdminAccess = { ready: false, admin: false, moderator: false, operator: false }
export const hasAnyAdminAccess = (access: AdminAccess) => access.admin || access.moderator || access.operator

/** A refused, failed or malformed answer never grants anything. */
async function confirmed(check: () => Promise<{ allowed: boolean }>, signal: AbortSignal) {
	try {
		const result = await check()
		return !signal.aborted && result.allowed === true
	} catch {
		return false
	}
}

export function useAdminAccess(): AdminAccess {
	const { session } = useAppContext()
	const userId = session?.user.id
	const [access, setAccess] = useState<AdminAccess>(noAdminAccess)
	useEffect(() => {
		const controller = new AbortController()
		const { signal } = controller
		setAccess(noAdminAccess)
		if (!userId) return
		void Promise.all([
			confirmed(() => apiClient.admin.access(undefined, { signal }), signal),
			confirmed(() => apiClient.discovery.moderator(undefined, { signal }), signal),
			confirmed(() => apiClient.diagnostics.access(undefined, { signal }), signal),
		]).then(([admin, moderator, operator]) => {
			if (!signal.aborted) setAccess({ ready: true, admin, moderator, operator })
		})
		return () => controller.abort()
	}, [userId])
	return access
}
