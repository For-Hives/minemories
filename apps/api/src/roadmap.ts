import {
	ROADMAP_COLUMN_LIMIT,
	ROADMAP_DONE_DAYS,
	type RoadmapArea,
	type RoadmapColumn,
	type RoadmapItem,
	type RoadmapLatestRelease,
	type RoadmapResponse,
	roadmapArea,
} from '@minemories/api-contract'
import { Hono } from 'hono'
import * as z from 'zod'
import { GITHUB_API, type GithubFetch, githubGet, githubToken } from './github'
import { fetchLatestModRelease } from './mod-release'
import { logApiFailure } from './safe-errors'

export type RoadmapFetch = GithubFetch
export { githubToken }

const ISSUES_URL = `${GITHUB_API}/issues`
const PAGE_SIZE = 100
const MAX_PAGES = 5
const CACHE_MS = 10 * 60_000
/** After a failed refresh, GitHub is not called again for a minute (60 requests/hour without a token). */
const RETRY_MS = 60_000
const DAY_MS = 86_400_000
const PUBLIC_CACHE = 'public, max-age=300'
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

export interface RoadmapOptions {
	fetch?: RoadmapFetch
	now?: () => number
	token?: string | undefined
	ttlMs?: number
	retryMs?: number
}

/**
 * `GET /api/roadmap`: public roadmap read from GitHub issues, with the latest mod release. Cached 10 minutes in
 * memory, one GitHub refresh at a time shared by concurrent requests, last good data served when GitHub fails, 503
 * when nothing was ever fetched.
 */
export function createRoadmap(options: RoadmapOptions = {}) {
	const fetcher: RoadmapFetch = options.fetch ?? ((url, init) => fetch(url, init))
	const now = options.now ?? Date.now
	const ttlMs = options.ttlMs ?? CACHE_MS
	const retryMs = options.retryMs ?? RETRY_MS
	let cached: { body: RoadmapResponse; at: number } | null = null
	let failedAt: number | null = null
	let pending: Promise<RoadmapResponse | null> | null = null
	let latestRelease: RoadmapLatestRelease | null = null

	/** Never rejects: a release failure keeps the last good release (or null) and the board is still served. */
	async function refreshRelease(correlationId?: string): Promise<RoadmapLatestRelease | null> {
		try {
			latestRelease = await fetchLatestModRelease(fetcher, options.token, () =>
				logApiFailure('release_notes_unavailable', correlationId)
			)
		} catch {
			logApiFailure('mod_release_unavailable', correlationId)
		}
		return latestRelease
	}

	async function refresh(correlationId?: string): Promise<RoadmapResponse | null> {
		try {
			const [issues, release] = await Promise.all([
				fetchRoadmapIssues(fetcher, options.token),
				refreshRelease(correlationId),
			])
			const at = now()
			cached = { body: buildRoadmap(issues, at, release), at }
			failedAt = null
		} catch {
			failedAt = now()
			logApiFailure('roadmap_unavailable', correlationId)
		}
		return cached?.body ?? null
	}

	/** Current roadmap, refreshed when the cache expired; never rejects. */
	function current(correlationId?: string): Promise<RoadmapResponse | null> {
		const time = now()
		if (cached && time - cached.at < ttlMs) return Promise.resolve(cached.body)
		if (failedAt !== null && time - failedAt < retryMs) return Promise.resolve(cached?.body ?? null)
		pending ??= refresh(correlationId).finally(() => {
			pending = null
		})
		return pending
	}

	const router = new Hono<{ Variables: { correlationId: string } }>()
	router.get('/', async context => {
		const body = await current(context.get('correlationId'))
		if (!body) return context.json({ error: 'roadmap_unavailable' }, 503, { 'Cache-Control': 'no-store' })
		return context.json(body, 200, { 'Cache-Control': PUBLIC_CACHE })
	})
	return Object.assign(router, { current })
}

export const roadmap = createRoadmap({ token: githubToken(process.env) })
