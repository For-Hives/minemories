import { useEffect, useRef } from 'react'
import { TURNSTILE_SCRIPT_URL, turnstileSiteKey } from '../lib/turnstile'

interface TurnstileApi {
	render(
		container: HTMLElement,
		options: {
			sitekey: string
			action: string
			theme: 'auto'
			callback(token: string): void
			'expired-callback'(): void
			'error-callback'(): void
		}
	): string | undefined
	reset(widgetId: string): void
	remove(widgetId: string): void
}

declare global {
	interface Window {
		turnstile?: TurnstileApi
	}
}

let loading: Promise<TurnstileApi> | null = null

/** Loads Cloudflare's script once, only on the page that shows the widget. */
function loadTurnstile(): Promise<TurnstileApi> {
	if (window.turnstile) return Promise.resolve(window.turnstile)
	loading ??= new Promise<TurnstileApi>((resolve, reject) => {
		const script = document.createElement('script')
		script.src = TURNSTILE_SCRIPT_URL
		script.async = true
		script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile unavailable')))
		script.onerror = () => {
			loading = null
			script.remove()
			reject(new Error('Turnstile unavailable'))
		}
		document.head.append(script)
	})
	return loading
}

/**
 * Cloudflare Turnstile check for the sign-up form. It hands its token to `onToken` (an empty string once it expires
 * or is used). A token works once: bump `resetKey` after each submit to get a fresh one.
 */
export function HumanCheck({ onToken, resetKey }: { onToken: (token: string) => void; resetKey: number }) {
	const container = useRef<HTMLDivElement>(null)
	const widget = useRef<{ api: TurnstileApi; id: string } | null>(null)
	const report = useRef(onToken)
	report.current = onToken

	useEffect(() => {
		let active = true
		loadTurnstile()
			.then(api => {
				if (!(active && container.current)) return
				const id = api.render(container.current, {
					sitekey: turnstileSiteKey(import.meta.env),
					action: 'sign-up',
					theme: 'auto',
					callback: token => report.current(token),
					'expired-callback': () => report.current(''),
					'error-callback': () => report.current(''),
				})
				if (id) widget.current = { api, id }
			})
			// Blocked script or offline: no token, so submitting explains that the check is missing.
			.catch(() => undefined)
		return () => {
			active = false
			if (widget.current) widget.current.api.remove(widget.current.id)
			widget.current = null
		}
	}, [])

	useEffect(() => {
		if (resetKey === 0 || !widget.current) return
		report.current('')
		widget.current.api.reset(widget.current.id)
	}, [resetKey])

	return <div ref={container} className="auth-human-check" />
}
