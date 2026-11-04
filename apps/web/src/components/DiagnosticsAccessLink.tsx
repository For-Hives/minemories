import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { apiClient } from '../api-client'
import { useI18n } from '../i18n/I18n'

export function DiagnosticsAccessLink() {
	const { t } = useI18n()
	const [allowed, setAllowed] = useState(false)
	useEffect(() => {
		let current = true
		void Promise.resolve()
			.then(() => apiClient.diagnostics.access())
			.then(result => {
				if (current) setAllowed(result.allowed)
			})
			.catch(() => {
				/* No link without confirmed permission. */
			})
		return () => {
			current = false
		}
	}, [])
	return allowed ? <Link to="/admin/diagnostics">{t('Diagnostics')}</Link> : null
}
