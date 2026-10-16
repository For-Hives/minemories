import { BrowserClient, defaultStackParser, makeFetchTransport, Scope } from '@sentry/browser'
import { diagnosticEvent, type WebFailure } from './policy'

/** No default integrations: no breadcrumbs, sessions, replay, tracing or global exception collection. */
export function createReporter(dsn: string, route: string, allowed: () => boolean) {
	let active = true
	const requests = new Set<AbortController>()
	const client = new BrowserClient({
		dsn,
		integrations: [],
		stackParser: defaultStackParser,
		attachStacktrace: false,
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpHeaders: false,
			httpBodies: [],
			urlQueryParams: false,
			graphQL: { document: false, variables: false },
			genAI: { inputs: false, outputs: false },
			databaseQueryData: false,
			queues: false,
			stackFrameVariables: false,
			frameContextLines: 0,
		},
		sendClientReports: false,
		transport: options =>
			makeFetchTransport(options, async (url, init) => {
				if (!(active && allowed())) throw new DOMException('Diagnostics disabled', 'AbortError')
				const controller = new AbortController()
				requests.add(controller)
				try {
					return await fetch(url, {
						...init,
						credentials: 'omit',
						referrerPolicy: 'no-referrer',
						redirect: 'error',
						keepalive: false,
						signal: controller.signal,
					})
				} finally {
					requests.delete(controller)
				}
			}),
		beforeSend: event => {
			if (!(active && allowed())) return null
			const safe = diagnosticEvent(String(event.tags?.code), String(event.tags?.route))
			return safe ? { ...safe, type: undefined, ...(event.event_id ? { event_id: event.event_id } : {}) } : null
		},
	})
	const scope = new Scope()
	scope.setClient(client)
	client.init()
	const sent = new Set<WebFailure>()
	return {
		report(code: WebFailure) {
			if (!(active && allowed()) || sent.has(code)) return
			const event = diagnosticEvent(code, route)
			if (!event) return
			sent.add(code)
			scope.captureEvent(event)
		},
		stop() {
			active = false
			for (const request of requests) request.abort()
			requests.clear()
			// Do not flush a queue when consent is withdrawn or a private page opens.
			void client.close(0)
		},
	}
}
