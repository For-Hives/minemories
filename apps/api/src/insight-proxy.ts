import { isIP } from 'node:net'
import { Hono } from 'hono'
import { requestBodyLimit } from './body-limits'

/**
 * Visit statistics proxy: the site's Umami tracker and its collect endpoint, served from this API so that blockers
 * refusing third-party analytics hosts let them through (https://docs.umami.is/docs/bypass-ad-blockers).
 *
 * - `GET  /api/insight/script.js` — Umami's tracker, cached here for an hour.
 * - `POST /api/insight/api/send`  — pageviews, events, identify, Web Vitals and errors, relayed as they are.
 *
 * Only the configured website ids are relayed (this is not an open relay for other Umami sites). No cookie or
 * credential goes upstream: the request is rebuilt with the body, the browser's User-Agent, Umami's own headers and the
 * visitor's IP. The page cleans what it sends first (apps/web/src/lib/insight.ts). docs/features/visit-statistics.md.
 */

/** The tracker's largest payload is an error report (48,000 bytes, Umami's own limit). */
export const INSIGHT_BODY_BYTES = 64 * 1024
const SCRIPT_CACHE_MS = 60 * 60 * 1000
const UPSTREAM_TIMEOUT_MS = 5000
/** Umami's headers the tracker sends and reads back (the visit cache token, the site). */
const umamiHeaders = ['x-umami-cache', 'x-umami-website-id', 'x-umami-hostname'] as const
const trailingSlashes = /\/+$/

export interface InsightProxyOptions {
	/** Umami's origin, e.g. https://umami.wadefade.fr. */
	upstream: string
	/** Website ids this proxy relays. */
	websiteIds: ReadonlySet<string>
	/** The visitor's IP for this request. */
	clientIp: (request: Request, peerAddress: string | undefined) => string | undefined
	fetch?: typeof fetch
	now?: () => number
}

/** Reads INSIGHT_UPSTREAM and INSIGHT_WEBSITE_IDS. `INSIGHT_UPSTREAM=off` turns the proxy off (404). */
export function insightConfiguration(environment: Record<string, string | undefined>) {
	const upstream = (environment.INSIGHT_UPSTREAM ?? 'https://umami.wadefade.fr').trim().replace(trailingSlashes, '')
	if (!upstream || upstream === 'off') return null
	const ids = (environment.INSIGHT_WEBSITE_IDS ?? 'b54859d4-0ee2-4556-b6b5-985c86707a22')
		.split(',')
		.map(id => id.trim())
		.filter(Boolean)
	return { upstream, websiteIds: new Set(ids) }
}

/**
 * The visitor's IP. Coolify's Traefik writes a single-value X-Forwarded-For from the connection (it drops one a client
 * sends); behind the proxies listed in TRUSTED_PROXY_IPS, the last entry is the client's. Otherwise the connection's.
 */
export function insightClientIp(
	request: Request,
	peerAddress: string | undefined,
	trustedProxies: ReadonlySet<string>
): string | undefined {
	const entries = (request.headers.get('x-forwarded-for') ?? '')
		.split(',')
		.map(value => value.trim())
		.filter(Boolean)
	const trusted = peerAddress !== undefined && trustedProxies.has(peerAddress)
	let candidate: string | undefined
	if (trusted) candidate = entries.at(-1)
	else if (entries.length === 1) candidate = entries[0]
	return candidate && isIP(candidate) ? candidate : peerAddress
}

/** The request Umami gets: JSON, the browser's User-Agent, Umami's own headers and the visitor's IP; nothing else. */
function upstreamHeaders(incoming: Headers, ip: string | undefined) {
	const headers = new Headers({ 'Content-Type': 'application/json' })
	for (const name of ['user-agent', ...umamiHeaders]) {
		const value = incoming.get(name)
		if (value) headers.set(name, value)
	}
	// True-Client-IP is the first header Umami reads (src/lib/ip.ts): its own reverse proxy may rewrite
	// X-Forwarded-For with this server's address, and Umami needs the visitor's for sessions and countries.
	if (ip) {
		headers.set('True-Client-IP', ip)
		headers.set('X-Forwarded-For', ip)
	}
	return headers
}

function websiteOf(body: unknown): string | undefined {
	if (!body || typeof body !== 'object') return undefined
	const payload = (body as { payload?: unknown }).payload
	if (!payload || typeof payload !== 'object') return undefined
	const website = (payload as { website?: unknown }).website
	return typeof website === 'string' ? website : undefined
}

export function createInsightProxy(options: InsightProxyOptions) {
	const send = options.fetch ?? fetch
	const now = options.now ?? Date.now
	let script: { body: string; until: number } | null = null
	const proxy = new Hono<{ Bindings: { peerAddress: string | undefined } }>()

	proxy.get('/script.js', async context => {
		if (!script || script.until <= now()) {
			try {
				const response = await send(`${options.upstream}/script.js`, {
					signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
				})
				if (!response.ok) throw new Error('upstream')
				script = { body: await response.text(), until: now() + SCRIPT_CACHE_MS }
			} catch {
				// A stale copy beats no statistics; without one, the page simply loads no tracker.
				if (!script) return context.text('', 502)
			}
		}
		return context.body(script.body, 200, {
			'Content-Type': 'application/javascript; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		})
	})

	proxy.use('/api/send', requestBodyLimit(INSIGHT_BODY_BYTES))
	proxy.post('/api/send', async context => {
		const text = await context.req.text()
		let body: unknown
		try {
			body = JSON.parse(text)
		} catch {
			return context.json({ error: 'invalid_request_body' }, 400)
		}
		const website = websiteOf(body)
		if (!(website && options.websiteIds.has(website))) return context.json({ error: 'unknown_website' }, 403)
		const headers = upstreamHeaders(
			context.req.raw.headers,
			options.clientIp(context.req.raw, context.env?.peerAddress)
		)
		try {
			const response = await send(`${options.upstream}/api/send`, {
				method: 'POST',
				headers,
				body: text,
				signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
			})
			return context.body(await response.text(), response.status as 200, {
				'Content-Type': response.headers.get('content-type') ?? 'application/json',
				'Cache-Control': 'no-store',
			})
		} catch {
			return context.json({ error: 'upstream_unavailable' }, 502)
		}
	})
	return proxy
}
