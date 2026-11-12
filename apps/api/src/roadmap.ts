import {
	ROADMAP_COLUMN_LIMIT,
	ROADMAP_DONE_DAYS,
	type RoadmapArea,
	type RoadmapColumn,
	type RoadmapItem,
	type RoadmapLatestRelease,
	type RoadmapResponse,
	roadmapArea,
	roadmapResponse,
} from '@minemories/api-contract'
import { Hono } from 'hono'
import * as z from 'zod'
import { GITHUB_API, type GithubFetch, githubGet } from './github'
import { fetchLatestModRelease } from './mod-release'
import type { RoadmapSnapshotStore, StoredRoadmap } from './roadmap-snapshot'
import { logApiFailure } from './safe-errors'

export type RoadmapFetch = GithubFetch

const ISSUES_URL = `${GITHUB_API}/issues`
const PAGE_SIZE = 100
const MAX_PAGES = 5
const CACHE_MS = 10 * 60_000
/** After a failed refresh, GitHub is not called again for a minute (60 requests/hour without a token). */
const RETRY_MS = 60_000
const DAY_MS = 86_400_000
/** Browsers and proxies may keep a copy but must revalidate it (ETag) before every use. */
const REVALIDATE_CACHE = 'public, no-cache'
/** With the GitHub webhook pushing changes, the timed refresh only covers missed deliveries. */
export const WEBHOOK_CACHE_MS = 30 * 60_000
const DEBOUNCE_MS = 2000
const WEAK_PREFIX = /^W\//
const DONE_REASONS = new Set<string | null>(['completed', null])

const githubLabel = z.union([z.string(), z.object({ name: z.string().nullish() })])
const githubIssue = z.object({
	number: z.number().int().positive(),
	title: z.string(),
	html_url: z.string(),
	state: z.string(),
	state_reason: z.string().nullish(),
	labels: z.array(githubLabel),
	updated_at: z.string(),
	closed_at: z.string().nullish(),
	pull_request: z.unknown().optional(),
})
const githubIssues = z.array(githubIssue)
export type GithubIssue = z.infer<typeof githubIssue>

function issuesUrl(page: number): string {
	const url = new URL(ISSUES_URL)
	url.search = new URLSearchParams({
		labels: 'roadmap',
		state: 'all',
		per_page: String(PAGE_SIZE),
		page: String(page),
	}).toString()
	return url.toString()
}

/** Reads the roadmap issues (pull requests included, filtered later), at most five pages of 100. */
export async function fetchRoadmapIssues(fetcher: RoadmapFetch, token?: string): Promise<GithubIssue[]> {
	const issues: GithubIssue[] = []
	for (let page = 1; page <= MAX_PAGES; page++) {
		// biome-ignore lint/performance/noAwaitInLoops: GitHub pagination stops on the first short page.
		const { body } = await githubGet(fetcher, issuesUrl(page), token)
		const batch = githubIssues.parse(body)
		issues.push(...batch)
		if (batch.length < PAGE_SIZE) break
	}
	return issues
}

function labelNames(issue: GithubIssue): Set<string> {
	return new Set(issue.labels.map(label => (typeof label === 'string' ? label : (label.name ?? ''))))
}

function isDone(issue: GithubIssue, doneSince: number): boolean {
	if (!(issue.closed_at && DONE_REASONS.has(issue.state_reason ?? null))) return false
	return Date.parse(issue.closed_at) >= doneSince
}

function toItem(issue: GithubIssue, labels: Set<string>): RoadmapItem {
	return {
		number: issue.number,
		title: issue.title,
		url: issue.html_url,
		areas: roadmapArea.options.filter((area: RoadmapArea) => labels.has(area)),
		updatedAt: issue.updated_at,
		closedAt: issue.closed_at ?? null,
	}
}

function column(items: RoadmapItem[], date: (item: RoadmapItem) => string | null): RoadmapColumn {
	const time = (item: RoadmapItem) => Date.parse(date(item) ?? '') || 0
	const sorted = items.toSorted((left, right) => time(right) - time(left) || right.number - left.number)
	return {
		items: sorted.slice(0, ROADMAP_COLUMN_LIMIT),
		more: Math.max(0, sorted.length - ROADMAP_COLUMN_LIMIT),
	}
}

/**
 * Groups roadmap issues: open with `in-progress` -> inProgress, other open -> planned, closed as completed
 * (or without a reason) during the last 30 days -> done. Pull requests and `not_planned` closures are dropped.
 */
export function buildRoadmap(
	issues: readonly GithubIssue[],
	now: number,
	latestRelease: RoadmapLatestRelease | null = null
): RoadmapResponse {
	const planned: RoadmapItem[] = []
	const inProgress: RoadmapItem[] = []
	const done: RoadmapItem[] = []
	const doneSince = now - ROADMAP_DONE_DAYS * DAY_MS
	for (const issue of issues) {
		const labels = labelNames(issue)
		if (issue.pull_request !== undefined || !labels.has('roadmap')) continue
		if (issue.state === 'open') (labels.has('in-progress') ? inProgress : planned).push(toItem(issue, labels))
		else if (issue.state === 'closed' && isDone(issue, doneSince)) done.push(toItem(issue, labels))
	}
	return {
		updatedAt: new Date(now).toISOString(),
		columns: {
			planned: column(planned, item => item.updatedAt),
			inProgress: column(inProgress, item => item.updatedAt),
			done: column(done, item => item.closedAt),
		},
		latestRelease,
	}
}

export type Cancel = () => void
/** Runs `task` once after `ms`; returns a cancel function. The default timer never keeps the process alive. */
export type Schedule = (task: () => void, ms: number) => Cancel

const defaultSchedule: Schedule = (task, ms) => {
	const timer = setTimeout(task, ms)
	timer.unref?.()
	return () => clearTimeout(timer)
}

export interface RoadmapOptions {
	fetch?: RoadmapFetch
	now?: () => number
	token?: string | undefined
	ttlMs?: number
	retryMs?: number
	/** Last good roadmap kept across restarts (SQLite in production). */
	store?: RoadmapSnapshotStore | undefined
	/** Delay that coalesces a burst of GitHub webhook deliveries into one refresh. */
	debounceMs?: number
	schedule?: Schedule
}

function etagFor(at: number): string {
	return `W/"roadmap-${at}"`
}

function matchesEtag(header: string | undefined, etag: string): boolean {
	if (!header) return false
	const strip = (tag: string) => tag.trim().replace(WEAK_PREFIX, '')
	return header.split(',').some(tag => tag.trim() === '*' || strip(tag) === strip(etag))
}

/**
 * `GET /api/roadmap`: public roadmap read from GitHub issues, with the latest mod release.
 * - Kept in memory for `ttlMs` (10 minutes, 30 when the GitHub webhook pushes changes), then served stale while one
 *   background refresh runs; concurrent requests share that single GitHub refresh.
 * - `refreshSoon` (GitHub webhook) coalesces deliveries during `debounceMs`, then refreshes the issues (and the release
 *   when asked); a delivery that lands during a refresh queues exactly one more.
 * - Every good roadmap is saved to `store`; on start the stored one is served at once and revalidated in the background.
 * - After a GitHub failure, requests wait `retryMs` before trying again; 503 only when nothing was ever fetched or stored.
 */
export function createRoadmap(options: RoadmapOptions = {}) {
	const fetcher: RoadmapFetch = options.fetch ?? ((url, init) => fetch(url, init))
	const now = options.now ?? Date.now
	const ttlMs = options.ttlMs ?? CACHE_MS
	const retryMs = options.retryMs ?? RETRY_MS
	const debounceMs = options.debounceMs ?? DEBOUNCE_MS
	const schedule = options.schedule ?? defaultSchedule
	const store = options.store
	let cached: { body: RoadmapResponse; at: number } | null = null
	let failedAt: number | null = null
	let pending: Promise<RoadmapResponse | null> | null = null
	let latestRelease: RoadmapLatestRelease | null = null
	let releaseKnown = false
	/** The stored snapshot may predate deliveries missed while the API was down: revalidate it on first use. */
	let revalidate = false
	/** Refresh requested by the webhook and not started yet; true when the release must be read again too. */
	let queued: boolean | null = null
	let cancelTimer: Cancel | null = null

	function restore(): void {
		let stored: StoredRoadmap | null = null
		try {
			stored = store?.load() ?? null
		} catch {
			logApiFailure('roadmap_snapshot_failed')
		}
		const parsed = roadmapResponse.safeParse(stored?.body)
		if (!(stored && parsed.success && Number.isFinite(stored.fetchedAt))) return
		cached = { body: parsed.data, at: stored.fetchedAt }
		latestRelease = parsed.data.latestRelease
		releaseKnown = true
		revalidate = true
	}
	restore()

	/** Never rejects: a release failure keeps the last good release (or null) and the board is still served. */
	async function refreshRelease(correlationId?: string): Promise<RoadmapLatestRelease | null> {
		try {
			latestRelease = await fetchLatestModRelease(fetcher, options.token, () =>
				logApiFailure('release_notes_unavailable', correlationId)
			)
		} catch {
			logApiFailure('mod_release_unavailable', correlationId)
		}
		releaseKnown = true
		return latestRelease
	}

	function persist(body: RoadmapResponse, at: number, correlationId?: string): void {
		try {
			store?.save(body, at)
		} catch {
			logApiFailure('roadmap_snapshot_failed', correlationId)
		}
	}

	async function refresh(release: boolean, correlationId?: string): Promise<RoadmapResponse | null> {
		try {
			const [issues, latest] = await Promise.all([
				fetchRoadmapIssues(fetcher, options.token),
				release || !releaseKnown ? refreshRelease(correlationId) : Promise.resolve(latestRelease),
			])
			const at = now()
			cached = { body: buildRoadmap(issues, at, latest), at }
			failedAt = null
			revalidate = false
			persist(cached.body, at, correlationId)
		} catch {
			failedAt = now()
			// A failed webhook refresh must not hide the change until the TTL: the first request after the backoff retries.
			revalidate = true
			logApiFailure('roadmap_unavailable', correlationId)
		}
		return cached?.body ?? null
	}

	/** Starts one refresh unless one is running; a queued webhook refresh runs right after it settles. */
	function start(release: boolean, correlationId?: string): Promise<RoadmapResponse | null> {
		pending ??= refresh(release, correlationId).finally(() => {
			pending = null
			runQueued()
		})
		return pending
	}

	/** Milliseconds left in the failure backoff (0 when GitHub last answered). */
	function backoffLeft(): number {
		return failedAt === null ? 0 : Math.max(0, failedAt + retryMs - now())
	}

	function arm(ms: number): void {
		cancelTimer = schedule(() => {
			cancelTimer = null
			runQueued()
		}, ms)
	}

	/** Runs the queued webhook refresh unless one is running or a timer is pending; waits out the failure backoff. */
	function runQueued(): void {
		if (queued === null || pending || cancelTimer) return
		const wait = backoffLeft()
		if (wait > 0) {
			arm(wait)
			return
		}
		const release = queued
		queued = null
		void start(release)
	}

	/**
	 * Webhook entry point: refresh soon, once per burst, whatever the TTL. After a GitHub failure the refresh waits for
	 * the backoff, so a burst of deliveries cannot keep hitting a rate-limited API.
	 */
	function refreshSoon(change: { release: boolean }): void {
		queued = (queued ?? false) || change.release
		if (!cancelTimer) arm(Math.max(debounceMs, backoffLeft()))
	}

	/** Current roadmap; never rejects. Stale data is served at once while a background refresh runs. */
	function current(correlationId?: string): Promise<RoadmapResponse | null> {
		const time = now()
		if (cached && !revalidate && time - cached.at < ttlMs) return Promise.resolve(cached.body)
		const backingOff = failedAt !== null && time - failedAt < retryMs
		const refreshing = backingOff ? pending : start(true, correlationId)
		if (cached) return Promise.resolve(cached.body)
		return refreshing ?? Promise.resolve(null)
	}

	/** Resolves once no refresh is running (tests and shutdown). */
	async function settled(): Promise<void> {
		while (pending) {
			// biome-ignore lint/performance/noAwaitInLoops: a queued refresh starts when the previous one settles.
			await pending
		}
	}

	const router = new Hono<{ Variables: { correlationId: string } }>()
	router.get('/', async context => {
		const body = await current(context.get('correlationId'))
		if (!(body && cached)) return context.json({ error: 'roadmap_unavailable' }, 503, { 'Cache-Control': 'no-store' })
		const headers = { 'Cache-Control': REVALIDATE_CACHE, ETag: etagFor(cached.at) }
		if (matchesEtag(context.req.header('If-None-Match'), headers.ETag)) return context.body(null, 304, headers)
		return context.json(cached.body, 200, headers)
	})
	return Object.assign(router, { current, refreshSoon, settled })
}
