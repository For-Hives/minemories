import { afterAll, expect, mock, spyOn, test } from 'bun:test'
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

test('caches for ten minutes, then serves the stale copy while one background refresh runs', async () => {
	let now = NOW
	const { calls, fetcher } = recorder(() => Promise.resolve(json([issue(1)])))
	const roadmap = createRoadmap({ fetch: fetcher, now: () => now })
	const first = await roadmap.current()
	now += 10 * 60_000 - 1
	expect(await roadmap.current()).toBe(first)
	expect(calls).toHaveLength(1)
	now += 1
	expect(await roadmap.current()).toBe(first)
	expect(await roadmap.current()).toBe(first)
	expect(calls).toHaveLength(2)
	await roadmap.settled()
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
	await roadmap.settled()
	expect(calls).toHaveLength(2)
	now += 59_999
	expect(await roadmap.current()).toBe(good)
	expect(calls).toHaveLength(2)
	now += 1
	healthy = true
	expect(await roadmap.current()).toBe(good)
	await roadmap.settled()
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
	expect(ok.headers.get('Cache-Control')).toBe('public, no-cache')
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
		expect(response.headers.get('Cache-Control')).toBe('public, no-cache')
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
	if (url.startsWith('https://raw.githubusercontent.com/'))
		return Promise.resolve(new Response('Not Found', { status: 404 }))
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
		source: 'commits',
		downloadUrl: 'https://minemories.xenos.lightin.io/downloads',
		changelogUrl: 'https://minemories.xenos.lightin.io/versions',
		compareUrl: 'https://github.com/For-Hives/minemories/tree/mod-v0.36.1-beta.1',
	})
	releasesUp = false
	now += 10 * 60_000
	await roadmap.current()
	await roadmap.settled()
	const second = await roadmap.current()
	expect(calls).toHaveLength(2)
	expect(second?.updatedAt).toBe(iso(now))
	expect(second?.latestRelease).toEqual(first.latestRelease)
	expect(errors.mock.calls.map(call => String(call[0]))).toEqual([expect.stringContaining('mod_release_unavailable')])
	errors.mockRestore()
})

test('logs unreachable curated notes by event name and falls back to commit notes', async () => {
	const errors = silenced()
	const { fetcher } = recorder(
		() => Promise.resolve(json([issue(1)])),
		url =>
			url.startsWith('https://raw.githubusercontent.com/')
				? Promise.resolve(new Response('busy', { status: 503 }))
				: releaseFixtures(url)
	)
	const body = await createRoadmap({ fetch: fetcher, now: () => NOW }).current()
	expect(body?.latestRelease?.source).toBe('commits')
	expect(body?.latestRelease?.notes).toEqual([{ type: 'feature', text: 'faster export', pr: 210 }])
	expect(errors.mock.calls.map(call => String(call[0]))).toEqual([expect.stringContaining('release_notes_unavailable')])
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

function memoryStore(initial: { body: unknown; fetchedAt: number } | null = null) {
	const saves: { body: unknown; fetchedAt: number }[] = []
	return {
		saves,
		load: () => initial,
		save: (body: unknown, fetchedAt: number) => {
			saves.push({ body, fetchedAt })
		},
	}
}

test('starts from the stored snapshot when GitHub is down, revalidates once and never answers 503', async () => {
	const errors = silenced()
	const stored = buildRoadmap([issue(7)], NOW - DAY)
	const store = memoryStore({ body: JSON.parse(JSON.stringify(stored)), fetchedAt: NOW - DAY })
	const { calls, fetcher } = recorder(() => Promise.reject(new Error('network down')))
	const roadmap = createRoadmap({ fetch: fetcher, now: () => NOW, store })
	const response = await roadmap.request('/')
	expect(response.status).toBe(200)
	expect(response.headers.get('ETag')).toBe(`W/"roadmap-${NOW - DAY}"`)
	expect(roadmapResponse.parse(await response.json())).toEqual(stored)
	await roadmap.settled()
	expect(calls).toHaveLength(1)
	expect((await roadmap.request('/')).status).toBe(200)
	expect(calls).toHaveLength(1)
	expect(store.saves).toHaveLength(0)
	expect(errors.mock.calls.map(call => String(call[0]))).toEqual([expect.stringContaining('roadmap_unavailable')])
	errors.mockRestore()
})

test('a fresh stored snapshot is still revalidated in the background and every good refresh is saved', async () => {
	let now = NOW
	const stored = buildRoadmap([issue(7)], NOW, null)
	const store = memoryStore({ body: stored, fetchedAt: NOW })
	const { calls, fetcher } = recorder(() => Promise.resolve(json([issue(1)])), releaseFixtures)
	const roadmap = createRoadmap({ fetch: fetcher, now: () => now, store })
	expect(await roadmap.current()).toEqual(stored)
	await roadmap.settled()
	expect(calls).toHaveLength(1)
	expect(store.saves).toHaveLength(1)
	const saved = store.saves[0]
	expect(saved?.fetchedAt).toBe(NOW)
	expect(roadmapResponse.parse(saved?.body).columns.planned.items.map(item => item.number)).toEqual([1])
	now += 1000
	expect(await roadmap.current()).toBe(saved?.body as never)
	expect(calls).toHaveLength(1)
})

test('ignores an invalid or unreadable snapshot and logs failed snapshot reads and writes', async () => {
	const errors = silenced()
	const { fetcher } = recorder(() => Promise.reject(new Error('network down')))
	const invalid = createRoadmap({
		fetch: fetcher,
		now: () => NOW,
		store: memoryStore({ body: { x: 1 }, fetchedAt: NOW }),
	})
	expect((await invalid.request('/')).status).toBe(503)
	const badTime = createRoadmap({
		fetch: fetcher,
		now: () => NOW,
		store: memoryStore({ body: buildRoadmap([], NOW), fetchedAt: Number.NaN }),
	})
	expect(await badTime.current()).toBeNull()
	const throwing = {
		load: () => {
			throw new Error('database closed')
		},
		save: () => {
			throw new Error('database closed')
		},
	}
	const healthy = recorder(() => Promise.resolve(json([issue(1)])))
	const roadmap = createRoadmap({ fetch: healthy.fetcher, now: () => NOW, store: throwing })
	expect((await roadmap.current())?.columns.planned.items.map(item => item.number)).toEqual([1])
	const events = errors.mock.calls.map(call => String(call[0]))
	expect(events.filter(event => event.includes('roadmap_snapshot_failed'))).toHaveLength(2)
	errors.mockRestore()
})

test('answers 304 to a matching If-None-Match and 200 with the new ETag once the roadmap changed', async () => {
	let now = NOW
	const { fetcher } = recorder(() => Promise.resolve(json([issue(1)])))
	const roadmap = createRoadmap({ fetch: fetcher, now: () => now })
	const first = await roadmap.request('/')
	const etag = first.headers.get('ETag') ?? ''
	expect(etag).toBe(`W/"roadmap-${NOW}"`)
	for (const header of [etag, etag.slice(2), `"other", ${etag}`, '*']) {
		// biome-ignore lint/performance/noAwaitInLoops: one conditional request at a time keeps the failing header readable.
		const cached = await roadmap.request('/', { headers: { 'If-None-Match': header } })
		expect(cached.status).toBe(304)
		expect(cached.headers.get('ETag')).toBe(etag)
		expect(cached.headers.get('Cache-Control')).toBe('public, no-cache')
		expect(await cached.text()).toBe('')
	}
	expect((await roadmap.request('/', { headers: { 'If-None-Match': '"other"' } })).status).toBe(200)
	now += 10 * 60_000
	await roadmap.current()
	await roadmap.settled()
	const changed = await roadmap.request('/', { headers: { 'If-None-Match': etag } })
	expect(changed.status).toBe(200)
	expect(changed.headers.get('ETag')).toBe(`W/"roadmap-${now}"`)
})

/** Lets pending promise callbacks run (no timers) until `condition` holds. */
async function until(condition: () => boolean) {
	for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
		// biome-ignore lint/performance/noAwaitInLoops: each turn lets one more promise callback run.
		await Promise.resolve()
	}
	expect(condition()).toBe(true)
}

function manualSchedule() {
	const tasks: { task: () => void; ms: number; cancelled: boolean }[] = []
	const schedule = (task: () => void, ms: number) => {
		const entry = { task, ms, cancelled: false }
		tasks.push(entry)
		return () => {
			entry.cancelled = true
		}
	}
	const run = () => {
		const entry = tasks.shift()
		if (entry && !entry.cancelled) entry.task()
	}
	return { tasks, schedule, run }
}

function releaseCounter() {
	const urls: string[] = []
	return {
		urls,
		fetch: (url: string) => {
			urls.push(url)
			return releaseFixtures(url)
		},
		tagReads: () => urls.filter(url => url.includes('/tags?')).length,
	}
}

test('webhook refreshes coalesce a burst, skip the release for issue events and refetch it for tags', async () => {
	let now = NOW
	const releases = releaseCounter()
	let open = [issue(1)]
	const { calls, fetcher } = recorder(() => Promise.resolve(json(open)), releases.fetch)
	const timers = manualSchedule()
	const roadmap = createRoadmap({ fetch: fetcher, now: () => now, schedule: timers.schedule, ttlMs: 30 * 60_000 })
	await roadmap.current()
	expect(releases.tagReads()).toBe(1)
	open = [issue(1), issue(2, { labels: ['roadmap', 'in-progress'] })]
	now += 1000
	roadmap.refreshSoon({ release: false })
	roadmap.refreshSoon({ release: false })
	expect(timers.tasks).toHaveLength(1)
	expect(timers.tasks[0]?.ms).toBe(2000)
	timers.run()
	await roadmap.settled()
	expect(calls).toHaveLength(2)
	expect(releases.tagReads()).toBe(1)
	const body = await roadmap.current()
	expect(body?.columns.inProgress.items.map(item => item.number)).toEqual([2])
	expect(body?.latestRelease?.tag).toBe('mod-v0.36.1-beta.1')
	roadmap.refreshSoon({ release: false })
	roadmap.refreshSoon({ release: true })
	timers.run()
	await roadmap.settled()
	expect(calls).toHaveLength(3)
	expect(releases.tagReads()).toBe(2)
})

test('a webhook refresh before any request also reads the release, and one during a refresh queues exactly one more', async () => {
	const releases = releaseCounter()
	let resolveIssues: (response: Response) => void = () => {}
	const { calls, fetcher } = recorder(
		() =>
			new Promise<Response>(resolve => {
				resolveIssues = resolve
			}),
		releases.fetch
	)
	const timers = manualSchedule()
	const roadmap = createRoadmap({ fetch: fetcher, now: () => NOW, schedule: timers.schedule, debounceMs: 10 })
	roadmap.refreshSoon({ release: false })
	expect(timers.tasks[0]?.ms).toBe(10)
	timers.run()
	expect(calls).toHaveLength(1)
	roadmap.refreshSoon({ release: false })
	roadmap.refreshSoon({ release: false })
	timers.run()
	expect(calls).toHaveLength(1)
	resolveIssues(json([issue(1)]))
	await until(() => calls.length === 2)
	resolveIssues(json([issue(1), issue(3)]))
	await roadmap.settled()
	expect(calls).toHaveLength(2)
	expect(releases.tagReads()).toBe(1)
	expect((await roadmap.current())?.columns.planned.items.map(item => item.number)).toEqual([1, 3])
})

test('a delivery whose timer is still pending when a refresh ends waits for that timer', async () => {
	let resolveIssues: (response: Response) => void = () => {}
	const { calls, fetcher } = recorder(
		() =>
			new Promise<Response>(resolve => {
				resolveIssues = resolve
			})
	)
	const timers = manualSchedule()
	const roadmap = createRoadmap({ fetch: fetcher, now: () => NOW, schedule: timers.schedule })
	const first = roadmap.current()
	roadmap.refreshSoon({ release: false })
	resolveIssues(json([issue(1)]))
	await first
	await roadmap.settled()
	expect(calls).toHaveLength(1)
	timers.run()
	resolveIssues(json([issue(2)]))
	await roadmap.settled()
	expect(calls).toHaveLength(2)
	expect((await roadmap.current())?.columns.planned.items.map(item => item.number)).toEqual([2])
})

test('a failed webhook refresh is retried by the first request after the backoff, not after the TTL', async () => {
	const errors = silenced()
	let now = NOW
	let status = 200
	let open = [issue(1)]
	const { calls, fetcher } = recorder(() => Promise.resolve(status === 200 ? json(open) : json({}, status)))
	const timers = manualSchedule()
	const roadmap = createRoadmap({
		fetch: fetcher,
		now: () => now,
		schedule: timers.schedule,
		ttlMs: 30 * 60_000,
		retryMs: 60_000,
	})
	await roadmap.current()
	open = [issue(1), issue(2, { labels: ['roadmap', 'in-progress'] })]
	status = 503
	roadmap.refreshSoon({ release: false })
	timers.run()
	await roadmap.settled()
	expect(calls).toHaveLength(2)
	expect((await roadmap.current())?.columns.inProgress.items).toEqual([])
	expect(calls).toHaveLength(2)
	status = 200
	now += 60_000
	await roadmap.current()
	await roadmap.settled()
	expect(calls).toHaveLength(3)
	expect((await roadmap.current())?.columns.inProgress.items.map(item => item.number)).toEqual([2])
	errors.mockRestore()
})

test('webhook deliveries after a GitHub failure wait for the backoff instead of calling GitHub again', async () => {
	const errors = silenced()
	let now = NOW
	let status = 403
	const { calls, fetcher } = recorder(() => Promise.resolve(status === 200 ? json([issue(1)]) : json({}, status)))
	const timers = manualSchedule()
	const roadmap = createRoadmap({ fetch: fetcher, now: () => now, schedule: timers.schedule, retryMs: 60_000 })
	roadmap.refreshSoon({ release: false })
	timers.run()
	await roadmap.settled()
	expect(calls).toHaveLength(1)
	now += 10_000
	roadmap.refreshSoon({ release: false })
	roadmap.refreshSoon({ release: true })
	expect(timers.tasks).toHaveLength(1)
	expect(timers.tasks[0]?.ms).toBe(50_000)
	now += 20_000
	timers.run()
	expect(calls).toHaveLength(1)
	expect(timers.tasks).toHaveLength(1)
	expect(timers.tasks[0]?.ms).toBe(30_000)
	now += 30_000
	status = 200
	timers.run()
	await roadmap.settled()
	expect(calls).toHaveLength(2)
	expect((await roadmap.current())?.columns.planned.items.map(item => item.number)).toEqual([1])
	errors.mockRestore()
})

test('the default debounce timer runs the refresh and does not keep the process alive', async () => {
	let task: (() => void) | null = null
	const unref = mock(() => undefined)
	const timer = spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void, ms: number) => {
		expect(ms).toBe(0)
		task = callback
		return { unref }
	}) as unknown as typeof setTimeout)
	try {
		const { calls, fetcher } = recorder(() => Promise.resolve(json([issue(1)])))
		const roadmap = createRoadmap({ fetch: fetcher, now: () => NOW, debounceMs: 0 })
		roadmap.refreshSoon({ release: false })
		expect(unref).toHaveBeenCalledTimes(1)
		expect(calls).toHaveLength(0)
		;(task as unknown as () => void)()
		await roadmap.settled()
		expect(calls).toHaveLength(1)
	} finally {
		timer.mockRestore()
	}
})

test('POST /api/github/webhook is off without a secret and carries no CORS headers', async () => {
	const response = await app.request('/api/github/webhook', {
		method: 'POST',
		headers: { Origin: 'http://localhost:5173', 'X-GitHub-Event': 'ping' },
		body: '{}',
	})
	expect(response.status).toBe(404)
	expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
})
