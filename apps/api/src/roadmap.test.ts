import { afterAll, expect, spyOn, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { roadmapResponse } from '@minemories/api-contract'

const directory = mkdtempSync(join(tmpdir(), 'minemories-roadmap-'))
process.env.DATABASE_PATH = join(directory, 'test.sqlite')
process.env.LOCAL_OBJECTS_PATH = join(directory, 'objects')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.TRUSTED_PROXY_IPS = ''
process.env.BETTER_AUTH_SECRET = 'test-auth-secret-at-least-32-characters'
process.env.PAIRING_PEPPER = 'test-pairing-pepper-at-least-32-characters'
process.env.GITHUB_TOKEN = ''

const { buildRoadmap, createRoadmap, fetchRoadmapIssues } = await import('./roadmap')
const { app } = await import('./index')
const { database } = await import('./database')

afterAll(() => {
	database.close()
	rmSync(directory, { recursive: true, force: true })
})

const NOW = Date.parse('2026-11-07T12:00:00Z')
const DAY = 86_400_000
const iso = (time: number) => new Date(time).toISOString()

interface IssueFields {
	state?: string
	state_reason?: string | null
	labels?: (string | { name?: string | null })[]
	updated_at?: string
	closed_at?: string | null
	pull_request?: unknown
}
function issue(number: number, fields: IssueFields = {}) {
	return {
		number,
		title: `Issue ${number}`,
		html_url: `https://github.com/For-Hives/minemories/issues/${number}`,
		state: 'open',
		state_reason: null,
		labels: [{ name: 'roadmap' }],
		updated_at: iso(NOW - number * 1000),
		closed_at: null,
		...fields,
	}
}

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function headersOf(init: RequestInit | undefined) {
	return (init?.headers ?? {}) as Record<string, string>
}

const ISSUES = 'https://api.github.com/repos/For-Hives/minemories/issues?'

/** Records GitHub issue requests; release requests (tags, commits) go to `releases`, by default no mod tag. */
function recorder(
	pages: unknown[][] | (() => Promise<Response>),
	releases: (url: string) => Promise<Response> = () => Promise.resolve(json([]))
) {
	const calls: { url: string; init: RequestInit }[] = []
	const fetcher = (url: string, init: RequestInit) => {
		if (!url.startsWith(ISSUES)) return releases(url)
		calls.push({ url, init })
		if (typeof pages === 'function') return pages()
		return Promise.resolve(json(pages[calls.length - 1] ?? []))
	}
	return { calls, fetcher }
}

test('classifies open, in-progress and recently completed issues and drops the rest', () => {
	const roadmap = buildRoadmap(
		[
			issue(1, { labels: ['roadmap', 'socials', 'front', 'mod'] }),
			issue(2, { labels: [{ name: 'roadmap' }, { name: 'in-progress' }, { name: 'api' }] }),
			issue(3, { state: 'closed', state_reason: 'completed', closed_at: iso(NOW - 2 * DAY) }),
			issue(4, { state: 'closed', state_reason: null, closed_at: iso(NOW - 30 * DAY) }),
			issue(5, { state: 'closed', state_reason: 'not_planned', closed_at: iso(NOW - DAY) }),
			issue(6, { state: 'closed', state_reason: 'completed', closed_at: iso(NOW - 31 * DAY) }),
			issue(7, { pull_request: { url: 'https://api.github.com/pulls/7' } }),
			issue(8, { labels: [{ name: 'front' }, { name: null }] }),
			issue(9, { state: 'closed', state_reason: 'completed', closed_at: null }),
			issue(10, { state: 'closed', state_reason: 'duplicate', closed_at: iso(NOW - DAY) }),
			issue(11, { state: 'locked' }),
		],
		NOW
	)
	expect(roadmapResponse.parse(roadmap)).toEqual(roadmap)
	expect(roadmap.latestRelease).toBeNull()
	expect(roadmap.updatedAt).toBe(iso(NOW))
	expect(roadmap.columns.planned.items.map(item => item.number)).toEqual([1])
	expect(roadmap.columns.planned.items[0]).toEqual({
		number: 1,
		title: 'Issue 1',
		url: 'https://github.com/For-Hives/minemories/issues/1',
		areas: ['mod', 'front', 'socials'],
		updatedAt: iso(NOW - 1000),
		closedAt: null,
	})
	expect(roadmap.columns.inProgress.items.map(item => [item.number, item.areas])).toEqual([[2, ['api']]])
	expect(roadmap.columns.done.items.map(item => [item.number, item.closedAt])).toEqual([
		[3, iso(NOW - 2 * DAY)],
		[4, iso(NOW - 30 * DAY)],
	])
})

test('sorts by most recent activity, caps each column at 25 and counts the rest', () => {
	const open = Array.from({ length: 30 }, (_, index) =>
		issue(index + 1, { updated_at: iso(NOW - ((index * 7) % 30) * DAY) })
	)
	const closed = Array.from({ length: 3 }, (_, index) =>
		issue(100 + index, { state: 'closed', closed_at: iso(NOW - (index + 1) * DAY), updated_at: iso(NOW) })
	)
	const sameTime = [issue(200, { updated_at: 'not a date', labels: ['roadmap', 'in-progress'] })]
	sameTime.push(issue(201, { updated_at: 'not a date', labels: ['roadmap', 'in-progress'] }))
	const roadmap = buildRoadmap([...open, ...closed.toReversed(), ...sameTime], NOW)
	const planned = roadmap.columns.planned
	expect(planned.items).toHaveLength(25)
	expect(planned.more).toBe(5)
	const times = planned.items.map(item => Date.parse(item.updatedAt))
	expect(times).toEqual(times.toSorted((left, right) => right - left))
	expect(roadmap.columns.done).toEqual({
		items: closed.map(item => expect.objectContaining({ number: item.number })),
		more: 0,
	})
	expect(roadmap.columns.inProgress.items.map(item => item.number)).toEqual([201, 200])
})

test('requests GitHub with the expected headers and follows at most five full pages', async () => {
	const full = (offset: number) => Array.from({ length: 100 }, (_, index) => issue(offset + index + 1))
	const { calls, fetcher } = recorder([full(0), full(100), full(200), full(300), full(400), full(500)])
	const issues = await fetchRoadmapIssues(fetcher, 'secret-token')
	expect(issues).toHaveLength(500)
	expect(calls).toHaveLength(5)
	const first = new URL(calls[0]?.url ?? '')
	expect(`${first.origin}${first.pathname}`).toBe('https://api.github.com/repos/For-Hives/minemories/issues')
	expect(Object.fromEntries(first.searchParams)).toEqual({
		labels: 'roadmap',
		state: 'all',
		per_page: '100',
		page: '1',
	})
	expect(new URL(calls[4]?.url ?? '').searchParams.get('page')).toBe('5')
	const headers = headersOf(calls[0]?.init)
	expect(headers.Accept).toBe('application/vnd.github+json')
	expect(headers['User-Agent']).toBe('minemories-api')
	expect(headers.Authorization).toBe('Bearer secret-token')
	expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal)
})

test('stops on the first short page and sends no authorization without a token', async () => {
	const { calls, fetcher } = recorder([Array.from({ length: 100 }, (_, index) => issue(index + 1)), [issue(101)]])
	expect(await fetchRoadmapIssues(fetcher)).toHaveLength(101)
	expect(calls).toHaveLength(2)
	expect(headersOf(calls[0]?.init).Authorization).toBeUndefined()
})

test('rejects GitHub errors and malformed pages', async () => {
	await expect(fetchRoadmapIssues(recorder(() => Promise.resolve(json({}, 403))).fetcher)).rejects.toThrow('status 403')
	await expect(fetchRoadmapIssues(recorder(() => Promise.resolve(json({ message: 'x' }))).fetcher)).rejects.toThrow()
})

function silenced() {
	return spyOn(console, 'error').mockImplementation(() => {})
}

test('caches for ten minutes, then refreshes', async () => {
	let now = NOW
	const { calls, fetcher } = recorder(() => Promise.resolve(json([issue(1)])))
	const roadmap = createRoadmap({ fetch: fetcher, now: () => now })
	const first = await roadmap.current()
	now += 10 * 60_000 - 1
	expect(await roadmap.current()).toBe(first)
	expect(calls).toHaveLength(1)
	now += 1
	const second = await roadmap.current()
	expect(calls).toHaveLength(2)
	expect(second?.updatedAt).toBe(iso(now))
})

test('concurrent requests share a single GitHub refresh', async () => {
	let release: (response: Response) => void = () => {}
	const { calls, fetcher } = recorder(
		() =>
			new Promise<Response>(resolve => {
				release = resolve
			})
	)
	const roadmap = createRoadmap({ fetch: fetcher, now: () => NOW })
	const first = roadmap.current()
	const second = roadmap.current()
	const response = roadmap.request('/')
	expect(calls).toHaveLength(1)
	release(json([issue(1)]))
	expect(await second).toBe(await first)
	const body = roadmapResponse.parse(await (await response).json())
	expect(body.columns.planned.items.map(item => item.number)).toEqual([1])
	expect(calls).toHaveLength(1)
})

test('serves the last good roadmap when GitHub fails and waits before retrying', async () => {
	const errors = silenced()
	let now = NOW
	let healthy = true
	const { calls, fetcher } = recorder(() =>
		healthy ? Promise.resolve(json([issue(1)])) : Promise.reject(new Error('network down'))
	)
	const roadmap = createRoadmap({ fetch: fetcher, now: () => now })
	const good = await roadmap.current()
	healthy = false
	now += 11 * 60_000
	expect(await roadmap.current()).toBe(good)
	expect(calls).toHaveLength(2)
	now += 59_999
	expect(await roadmap.current()).toBe(good)
	expect(calls).toHaveLength(2)
	now += 1
	healthy = true
	const fresh = await roadmap.current()
	expect(calls).toHaveLength(3)
	expect(fresh?.updatedAt).toBe(iso(now))
	expect(errors.mock.calls[0]?.[0]).toContain('roadmap_unavailable')
	errors.mockRestore()
})

test('answers 503 without cache while GitHub is unavailable, then recovers', async () => {
	const errors = silenced()
	let now = NOW
	let status = 500
	const { calls, fetcher } = recorder(() => Promise.resolve(status === 200 ? json([issue(1)]) : json({}, status)))
	const roadmap = createRoadmap({ fetch: fetcher, now: () => now, retryMs: 1000 })
	const failed = await roadmap.request('/')
	expect(failed.status).toBe(503)
	expect(failed.headers.get('Cache-Control')).toBe('no-store')
	expect(await failed.json()).toEqual({ error: 'roadmap_unavailable' })
	expect((await roadmap.request('/')).status).toBe(503)
	expect(calls).toHaveLength(1)
	now += 1000
	status = 200
	const ok = await roadmap.request('/')
	expect(ok.status).toBe(200)
	expect(ok.headers.get('Cache-Control')).toBe('public, max-age=300')
	expect(calls).toHaveLength(2)
	errors.mockRestore()
})

test('GET /api/roadmap is served by the app with CORS for the web origin', async () => {
	const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(((url: string) =>
		Promise.resolve(
			json(url.startsWith(ISSUES) ? [issue(42, { labels: ['roadmap', 'api'] })] : [])
		)) as unknown as typeof fetch)
	try {
		const response = await app.request('/api/roadmap', { headers: { Origin: 'http://localhost:5173' } })
		expect(response.status).toBe(200)
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
		expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
		const body = roadmapResponse.parse(await response.json())
		expect(body.columns.planned.items.map(item => [item.number, item.areas])).toEqual([[42, ['api']]])
		expect(body.latestRelease).toBeNull()
		const headers = headersOf(fetchSpy.mock.calls[0]?.[1])
		expect(headers.Authorization).toBeUndefined()
	} finally {
		fetchSpy.mockRestore()
	}
})

const TAG_SHA = 'a'.repeat(40)
function releaseFixtures(url: string): Promise<Response> {
	if (url.includes('/tags?')) return Promise.resolve(json([{ name: 'mod-v0.36.1-beta.1', commit: { sha: TAG_SHA } }]))
	if (url.includes(`/commits/${TAG_SHA}`))
		return Promise.resolve(json({ sha: TAG_SHA, commit: { message: 'x', committer: { date: iso(NOW - DAY) } } }))
	const commit = { sha: 'b'.repeat(40), commit: { message: 'feat(mod): faster export (#210)', committer: null } }
	return Promise.resolve(json([commit]))
}

test('adds the latest mod release, keeps the last good one when GitHub fails, and still serves the board', async () => {
	const errors = silenced()
	let now = NOW
	let releasesUp = true
	const { calls, fetcher } = recorder(
		() => Promise.resolve(json([issue(1)])),
		url => (releasesUp ? releaseFixtures(url) : Promise.resolve(json({}, 502)))
	)
	const roadmap = createRoadmap({ fetch: fetcher, now: () => now })
	const first = roadmapResponse.parse(await (await roadmap.request('/')).json())
	expect(first.latestRelease).toEqual({
		version: '0.36.1-beta.1',
		tag: 'mod-v0.36.1-beta.1',
		date: iso(NOW - DAY),
		prerelease: true,
		notes: [{ type: 'feature', text: 'faster export', pr: 210 }],
		more: 0,
		downloadUrl: 'https://minemories.xenos.lightin.io/downloads',
		changelogUrl: 'https://minemories.xenos.lightin.io/changelog',
		compareUrl: 'https://github.com/For-Hives/minemories/tree/mod-v0.36.1-beta.1',
	})
	releasesUp = false
	now += 10 * 60_000
	const second = await roadmap.current()
	expect(calls).toHaveLength(2)
	expect(second?.updatedAt).toBe(iso(now))
	expect(second?.latestRelease).toEqual(first.latestRelease)
	expect(errors.mock.calls.map(call => String(call[0]))).toEqual([expect.stringContaining('mod_release_unavailable')])
	errors.mockRestore()
})

test('a release failure without any earlier release serves the board with a null release', async () => {
	const errors = silenced()
	const { fetcher } = recorder(
		() => Promise.resolve(json([issue(1)])),
		() => Promise.reject(new Error('network down'))
	)
	const body = await createRoadmap({ fetch: fetcher, now: () => NOW }).current()
	expect(body?.columns.planned.items.map(item => item.number)).toEqual([1])
	expect(body?.latestRelease).toBeNull()
	errors.mockRestore()
})
