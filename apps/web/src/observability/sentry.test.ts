// @vitest-environment jsdom

import { getGlobalScope } from '@sentry/browser'
import { afterEach, expect, test, vi } from 'vitest'
import { createReporter } from './sentry'

afterEach(() => {
	vi.unstubAllGlobals()
	getGlobalScope().setUser(null)
	getGlobalScope().setExtra('token', undefined)
	getGlobalScope().clearBreadcrumbs()
})
test('real SDK sends only allowlisted fields and no cookies or referrer, deduplicating categories', async () => {
	getGlobalScope().setUser({ email: 'secret@example.com', id: 'private-user' })
	getGlobalScope().setExtra('token', 'private-token')
	getGlobalScope().addBreadcrumb({ message: 'pair code 123456 /share/private' })
	const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
	vi.stubGlobal('fetch', fetchMock)
	const reporter = createReporter('https://public@ingest.example/12', '/concept', () => true)
	reporter.report('runtime')
	reporter.report('runtime')
	await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
	const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
	expect(url).toContain('https://ingest.example/api/12/envelope/')
	expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: false })
	const lines = String(init.body).split('\n')
	expect(Object.keys(JSON.parse(lines[0] ?? '')).sort()).toEqual(['event_id', 'sent_at', 'sdk'].sort())
	expect(String(init.body)).not.toMatch(/secret@example|private-user|private-token|123456|\/share\/private/)
	const event = JSON.parse(lines[2] ?? '')
	expect(event.sdk.settings.infer_ip).toBe('never')
	expect(event).toMatchObject({
		message: 'Minemories public page: runtime',
		tags: { code: 'runtime', route: '/concept' },
	})
	expect(Object.keys(event).sort()).toEqual(
		['event_id', 'fingerprint', 'level', 'message', 'platform', 'tags', 'sdk'].sort()
	)
	for (const key of ['user', 'request', 'breadcrumbs', 'exception', 'contexts', 'extra', 'transaction'])
		expect(event).not.toHaveProperty(key)
	reporter.stop()
})
test('disabled or stopped reporters never send', async () => {
	const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
	vi.stubGlobal('fetch', fetchMock)
	let allowed = false
	const reporter = createReporter('https://public@ingest.example/12', '/', () => allowed)
	reporter.report('runtime')
	reporter.stop()
	allowed = true
	reporter.report('page-render')
	reporter.report('unhandled-promise')
	await Promise.resolve()
	expect(fetchMock).not.toHaveBeenCalled()
})
test('withdrawal aborts pending requests and failed network requests do not retry or break the page', async () => {
	const fetchMock = vi.fn().mockImplementation(() => Promise.reject(new Error('network unavailable')))
	vi.stubGlobal('fetch', fetchMock)
	const reporter = createReporter('https://public@ingest.example/12', '/', () => true)
	reporter.report('runtime')
	await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
	reporter.report('runtime')
	expect(fetchMock).toHaveBeenCalledTimes(1)
	reporter.stop()
	const pending = vi.fn().mockImplementation(() => new Promise(() => undefined))
	vi.stubGlobal('fetch', pending)
	const next = createReporter('https://public@ingest.example/12', '/', () => true)
	next.report('page-render')
	await vi.waitFor(() => expect(pending).toHaveBeenCalledTimes(1))
	const init = pending.mock.calls[0]?.[1] as RequestInit
	expect(init.signal?.aborted).toBe(false)
	next.stop()
	expect(init.signal?.aborted).toBe(true)
})
