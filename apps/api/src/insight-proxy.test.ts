import { expect, test } from 'bun:test'
import { createInsightProxy, INSIGHT_BODY_BYTES, insightClientIp, insightConfiguration } from './insight-proxy'

const website = 'b54859d4-0ee2-4556-b6b5-985c86707a22'
const upstream = 'https://umami.example.test'

function proxyWith(handler: (url: string, init?: RequestInit) => Response | Promise<Response>, clock = { now: 0 }) {
	const calls: Array<{ url: string; init: RequestInit | undefined }> = []
	const proxy = createInsightProxy({
		upstream,
		websiteIds: new Set([website]),
		clientIp: () => '203.0.113.7',
		now: () => clock.now,
		fetch: (async (input: string | URL | Request, init?: RequestInit) => {
			calls.push({ url: String(input), init })
			return handler(String(input), init)
		}) as unknown as typeof fetch,
	})
	return { proxy, calls }
}
function send(body: unknown, headers: Record<string, string> = {}) {
	return new Request('http://api.test/api/send', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...headers },
		body: typeof body === 'string' ? body : JSON.stringify(body),
	})
}

test('serves the tracker and keeps it for an hour, or a stale copy when Umami is down', async () => {
	const clock = { now: 0 }
	let up = true
	const { proxy, calls } = proxyWith(() => (up ? new Response('tracker();') : new Response('', { status: 503 })), clock)
	const first = await proxy.request('/script.js')
	expect(first.status).toBe(200)
	expect(first.headers.get('content-type')).toContain('application/javascript')
	expect(first.headers.get('cache-control')).toBe('public, max-age=3600')
	expect(await first.text()).toBe('tracker();')
	await proxy.request('/script.js')
	expect(calls).toHaveLength(1)
	expect(calls[0]?.url).toBe(`${upstream}/script.js`)
	clock.now = 2 * 60 * 60 * 1000
	up = false
	const stale = await proxy.request('/script.js')
	expect(await stale.text()).toBe('tracker();')
	expect(calls).toHaveLength(2)
})

test('answers 502 when the tracker was never fetched', async () => {
	const { proxy } = proxyWith(() => {
		throw new Error('offline')
	})
	expect((await proxy.request('/script.js')).status).toBe(502)
})

test('relays a collect request with the visitor’s IP and Umami’s headers, never cookies', async () => {
	const { proxy, calls } = proxyWith(() => Response.json({ cache: 'token', sessionId: 's' }))
	const body = { type: 'event', payload: { website, url: '/faq' } }
	const response = await proxy.request(
		send(body, {
			'User-Agent': 'Mozilla/5.0',
			Cookie: 'better-auth.session_token=secret',
			'x-umami-cache': 'previous',
			'x-umami-website-id': website,
		})
	)
	expect(response.status).toBe(200)
	expect(response.headers.get('cache-control')).toBe('no-store')
	expect(await response.json()).toEqual({ cache: 'token', sessionId: 's' })
	const call = calls[0]
	expect(call?.url).toBe(`${upstream}/api/send`)
	const headers = new Headers(call?.init?.headers)
	expect(headers.get('true-client-ip')).toBe('203.0.113.7')
	expect(headers.get('x-forwarded-for')).toBe('203.0.113.7')
	expect(headers.get('user-agent')).toBe('Mozilla/5.0')
	expect(headers.get('x-umami-cache')).toBe('previous')
	expect(headers.get('cookie')).toBeNull()
	expect(JSON.parse(String(call?.init?.body))).toEqual(body)
})

test('passes Umami’s status through, and refuses other websites and broken bodies', async () => {
	const { proxy, calls } = proxyWith(() => new Response('', { status: 429 }))
	expect((await proxy.request(send({ type: 'error', payload: { website } }))).status).toBe(429)
	expect((await proxy.request(send({ type: 'event', payload: { website: 'other' } }))).status).toBe(403)
	expect((await proxy.request(send({ type: 'event', payload: 'nope' }))).status).toBe(403)
	expect((await proxy.request(send({ type: 'event', payload: { website: 3 } }))).status).toBe(403)
	expect((await proxy.request(send(null))).status).toBe(403)
	expect((await proxy.request(send('{'))).status).toBe(400)
	expect((await proxy.request(send('x'.repeat(INSIGHT_BODY_BYTES + 1)))).status).toBe(413)
	expect(calls).toHaveLength(1)
})

test('answers 502 when Umami cannot be reached, and sends no IP header without one', async () => {
	const proxy = createInsightProxy({
		upstream,
		websiteIds: new Set([website]),
		clientIp: () => undefined,
		fetch: (async (_input: string | URL | Request, init?: RequestInit) => {
			expect(new Headers(init?.headers).get('true-client-ip')).toBeNull()
			throw new Error('offline')
		}) as unknown as typeof fetch,
	})
	expect((await proxy.request(send({ type: 'event', payload: { website } }))).status).toBe(502)
})

test('reads the visitor’s IP from Traefik, a trusted chain, or the connection', () => {
	const request = (forwarded?: string) =>
		new Request('http://api.test/', { headers: forwarded ? { 'X-Forwarded-For': forwarded } : {} })
	const trusted = new Set(['10.0.0.2'])
	expect(insightClientIp(request('198.51.100.4'), '10.0.0.9', new Set())).toBe('198.51.100.4')
	expect(insightClientIp(request('1.1.1.1, 198.51.100.4'), '10.0.0.2', trusted)).toBe('198.51.100.4')
	expect(insightClientIp(request('1.1.1.1, 198.51.100.4'), '10.0.0.9', trusted)).toBe('10.0.0.9')
	expect(insightClientIp(request('not-an-ip'), '10.0.0.9', new Set())).toBe('10.0.0.9')
	expect(insightClientIp(request(), undefined, trusted)).toBeUndefined()
})

test('reads its configuration from the environment', () => {
	expect(insightConfiguration({})).toEqual({ upstream: 'https://umami.wadefade.fr', websiteIds: new Set([website]) })
	expect(insightConfiguration({ INSIGHT_UPSTREAM: 'off' })).toBeNull()
	expect(insightConfiguration({ INSIGHT_UPSTREAM: ' ' })).toBeNull()
	expect(
		insightConfiguration({ INSIGHT_UPSTREAM: 'https://stats.example.test//', INSIGHT_WEBSITE_IDS: 'a, b,' })
	).toEqual({ upstream: 'https://stats.example.test', websiteIds: new Set(['a', 'b']) })
})
