import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { classify, RequestCounters } from './request-counters'

const HOUR = 3_600_000
const DAY = 24 * HOUR

test('requests are classified into fixed labels only', () => {
	expect(classify('GET', '/downloads/neoforge-mc1.21.1/latest', 200)).toEqual([
		{ kind: 'download', key: 'neoforge-mc1.21.1' },
	])
	expect(classify('GET', '/downloads/fabric-mc1.21.1/0.39.0', 200)).toEqual([
		{ kind: 'download', key: 'fabric-mc1.21.1' },
	])
	expect(classify('GET', '/downloads/index.json', 200)).toEqual([])
	expect(classify('GET', '/downloads/neoforge-mc1.21.1/latest', 404)).toEqual([])
	expect(classify('HEAD', '/downloads/neoforge-mc1.21.1/latest', 200)).toEqual([])
	expect(classify('GET', '/downloads/not a target/latest', 200)).toEqual([])
	expect(classify('PUT', '/downloads/upload/x/1', 200)).toEqual([])
	expect(classify('POST', '/api/mod/pair', 200)).toEqual([{ kind: 'pairing', key: 'done' }])
	expect(classify('POST', '/api/mod/pair', 401)).toEqual([{ kind: 'pairing', key: 'rejected' }])
	expect(classify('POST', '/api/mod/pair', 400)).toEqual([{ kind: 'pairing', key: 'rejected' }])
	expect(classify('POST', '/api/mod/pair', 429)).toEqual([{ kind: 'pairing', key: 'limited' }])
	expect(classify('POST', '/rpc/admin/users', 200)).toEqual([{ kind: 'api', key: 'rpc' }])
	expect(classify('POST', '/rpc/admin/users', 500)).toEqual([
		{ kind: 'api', key: 'rpc' },
		{ kind: 'api_error', key: 'rpc' },
	])
	expect(classify('GET', '/api/auth/get-session', 200)).toEqual([{ kind: 'api', key: 'auth' }])
	expect(classify('GET', '/api/memories/secret-id-123/download', 200)).toEqual([{ kind: 'api', key: 'memories' }])
	expect(classify('GET', '/api', 200)).toEqual([])
	expect(classify('GET', '/robots.txt', 200)).toEqual([])
	expect(classify('GET', '/', 200)).toEqual([])
})

test('counters add up per hour, summarize and forget old rows', () => {
	const db = new Database(':memory:')
	let now = 100 * DAY
	const counters = new RequestCounters(db, () => now)
	counters.record('GET', '/downloads/neoforge-mc1.21.1/latest', 200, 5)
	counters.record('GET', '/downloads/neoforge-mc1.21.1/latest', 200, 5)
	counters.record('GET', '/downloads/fabric-mc1.21.1/latest', 200, 5)
	counters.record('POST', '/rpc/x', 200, 100)
	counters.record('POST', '/rpc/x', 500, 300)
	counters.record('GET', '/api/public/list', 200, 10)
	counters.record('POST', '/api/mod/pair', 200, 1)
	counters.record('POST', '/api/mod/pair', 401, 1)
	counters.record('POST', '/api/mod/pair', 429, 1)
	counters.record('GET', '/nothing', 200, 1)
	const summary = counters.summary()
	expect(summary.trackingStartedAt).toBe(100 * DAY)
	expect(summary.downloads).toEqual([
		{ target: 'neoforge-mc1.21.1', count: 2 },
		{ target: 'fabric-mc1.21.1', count: 1 },
	])
	expect(summary.api).toEqual([
		{ route: 'rpc', requests: 2, serverErrors: 1, meanMs: 200 },
		{ route: 'public', requests: 1, serverErrors: 0, meanMs: 10 },
	])
	expect(summary.pairing).toEqual({ done: 1, rejected: 1, limited: 1 })
	// A day and a half later the API figures (24 h) are gone, the downloads (30 days) stay.
	now += DAY + 12 * HOUR
	counters.record('POST', '/rpc/x', 200, 50)
	const later = counters.summary()
	expect(later.api).toEqual([{ route: 'rpc', requests: 1, serverErrors: 0, meanMs: 50 }])
	expect(later.pairing).toEqual({ done: 0, rejected: 0, limited: 0 })
	expect(later.downloads).toHaveLength(2)
	// Rows older than 70 days are pruned when something is recorded.
	now += 80 * DAY
	counters.record('GET', '/downloads/fabric-mc1.21.1/latest', 200, 1)
	expect(counters.summary().downloads).toEqual([{ target: 'fabric-mc1.21.1', count: 1 }])
	db.close()
})

test('two instances share the same tracking start', () => {
	const db = new Database(':memory:')
	new RequestCounters(db, () => 5)
	expect(new RequestCounters(db, () => 9).summary().trackingStartedAt).toBe(5)
	db.close()
})
