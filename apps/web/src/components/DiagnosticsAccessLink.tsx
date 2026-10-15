import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { apiClient } from '../api-client'

export function DiagnosticsAccessLink() {
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
	return allowed ? <Link to="/admin/diagnostics">Diagnostics</Link> : null
}
