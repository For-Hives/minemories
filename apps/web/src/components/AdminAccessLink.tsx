import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { apiClient } from '../api-client'
import { useAppContext } from '../app-context'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'

export function AdminAccessLink() {
	const { session } = useAppContext(),
		{ copy } = useLocalizedCopy(),
		[allowed, setAllowed] = useState(false),
		userId = session?.user.id
	useEffect(() => {
		const controller = new AbortController()
		setAllowed(false)
		if (userId)
			void apiClient.admin
				.access(undefined, { signal: controller.signal })
				.then(result => {
					if (!controller.signal.aborted) setAllowed(result.allowed)
				})
				.catch(() => undefined)
		return () => controller.abort()
	}, [userId])
	return allowed ? (
		<Link className="mm-admin-entry" to="/admin">
			{copy('Ouvrir le panneau d’administration', 'Open administration dashboard')} →
		</Link>
	) : null
}
