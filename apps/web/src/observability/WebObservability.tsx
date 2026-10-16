import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'
import { diagnosticDsn, preferenceKey, publicDiagnosticRoute, type WebFailure } from './policy'

const preferenceEvent = 'minemories-web-diagnostics-change'
let preferenceBlocked = false
let report: (code: WebFailure) => void = () => undefined
export function reportWebFailure(code: WebFailure) {
	report(code)
}
function consented() {
	if (typeof window === 'undefined') return false
	try {
		return !preferenceBlocked && localStorage.getItem(preferenceKey) === 'enabled'
	} catch {
		return false
	}
}
function useConsent() {
	const [enabled, setEnabled] = useState(consented)
	useEffect(() => {
		const update = () => setEnabled(consented())
		window.addEventListener(preferenceEvent, update)
		window.addEventListener('storage', update)
		return () => {
			window.removeEventListener(preferenceEvent, update)
			window.removeEventListener('storage', update)
		}
	}, [])
	return enabled
}
export function WebObservability() {
	const { pathname } = useLocation()
	const enabled = useConsent()
	useEffect(() => {
		const dsn = diagnosticDsn(import.meta.env.VITE_WEB_DIAGNOSTICS_DSN)
		const route = publicDiagnosticRoute(pathname)
		if (!(dsn && route && enabled)) return
		let stopped = false
		let stop: () => void = () => undefined
		const allowed = () => !stopped && consented() && window.location.pathname === route
		const runtime = () => reportWebFailure('runtime')
		const rejection = () => reportWebFailure('unhandled-promise')
		void import('./sentry')
			.then(module => {
				if (!allowed()) return
				const reporter = module.createReporter(dsn, route, allowed)
				report = reporter.report
				stop = reporter.stop
				window.addEventListener('error', runtime)
				window.addEventListener('unhandledrejection', rejection)
			})
			.catch(() => undefined)
		return () => {
			stopped = true
			report = () => undefined
			window.removeEventListener('error', runtime)
			window.removeEventListener('unhandledrejection', rejection)
			stop()
		}
	}, [pathname, enabled])
	return null
}
export function WebDiagnosticsPreference() {
	const { copy } = useLocalizedCopy()
	const enabled = useConsent()
	const [failed, setFailed] = useState(false)
	if (!diagnosticDsn(import.meta.env.VITE_WEB_DIAGNOSTICS_DSN)) return null
	return (
		<div>
			<label>
				<input
					type="checkbox"
					checked={enabled}
					onChange={event => {
						try {
							localStorage.setItem(preferenceKey, event.target.checked ? 'enabled' : 'disabled')
							preferenceBlocked = false
							setFailed(false)
							window.dispatchEvent(new Event(preferenceEvent))
						} catch {
							preferenceBlocked = true
							window.dispatchEvent(new Event(preferenceEvent))
							setFailed(true)
						}
					}}
				/>
				{copy('Autoriser les diagnostics des pages publiques', 'Allow public-page diagnostics')}
			</label>
			{failed && (
				<p role="alert">
					{copy(
						'Préférence non enregistrée. Les diagnostics sont interrompus dans cet onglet.',
						'Preference not saved. Diagnostics are stopped in this tab.'
					)}
				</p>
			)}
		</div>
	)
}
