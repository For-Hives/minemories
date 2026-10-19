import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { apiClient } from '../api-client'
import { useAppContext } from '../app-context'
import { useI18n } from '../i18n/I18n'

export function AdminAccessLink() {
	const { session } = useAppContext(),
		{ t } = useI18n(),
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
			{t('Open administration dashboard')} →
		</Link>
	) : null
}
