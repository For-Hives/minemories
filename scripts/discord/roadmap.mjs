// #roadmap message: the repository's open GitHub issues (except `dependencies` / `no-roadmap`), rendered as one webhook message that is edited in place
// (PATCH {webhook}/messages/{DISCORD_ROADMAP_MESSAGE_ID}). The classification mirrors GET /api/roadmap so Discord and
// the site always agree; Discord only shows the In progress and Planned columns. Mod releases go to #changelog.
import {
	COLORS,
	embedSize,
	escapeClipped,
	fitLines,
	isMessageId,
	LIMITS,
	REPOSITORY,
	REPOSITORY_URL,
	redactSecrets,
	resolveWebhook,
	SITE_URL,
	sendWebhook,
	webhookUrl,
} from './discord.mjs'

/** Issues kept off the roadmap: Renovate's dashboard and anything marked by hand (same list as apps/api/src/roadmap.ts). */
export const EXCLUDED_LABELS = ['dependencies', 'no-roadmap']
export const IN_PROGRESS_LABEL = 'in-progress'
export const AREAS = ['mod', 'api', 'front', 'socials']
export const DONE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
export const COLUMN_CAP = 25
/** The columns shown on Discord. `classify` still computes `done` like the site (tracked by issue #243). */
export const COLUMNS = [
	{ key: 'inProgress', title: 'In progress' },
	{ key: 'planned', title: 'Planned' },
]
const DONE_REASONS = new Set(['completed', null])
const TITLE_MAX = 90
const TOTAL_BUDGET = LIMITS.total - 100
const PAGE_LIMIT = 20
const NEXT_LINK = /<([^>]+)>;\s*rel="next"/
const ISSUES_URL = `https://api.github.com/repos/${REPOSITORY}/issues?per_page=100`

const labelNames = issue => (issue.labels ?? []).map(label => (typeof label === 'string' ? label : label?.name))
const time = value => {
	const parsed = Date.parse(value ?? '')
	return Number.isFinite(parsed) ? parsed : 0
}

function toItem(issue) {
	const labels = labelNames(issue)
	return {
		number: issue.number,
		title: String(issue.title ?? ''),
		url: issue.html_url,
		areas: AREAS.filter(area => labels.includes(area)),
		updatedAt: issue.updated_at,
		closedAt: issue.closed_at ?? null,
	}
}

function column(items, sortKey) {
	const sorted = items.toSorted((a, b) => time(b[sortKey]) - time(a[sortKey]) || b.number - a.number)
	return { items: sorted.slice(0, COLUMN_CAP), more: Math.max(0, sorted.length - COLUMN_CAP) }
}

/** Which column an issue belongs to, or null when it is not on the roadmap. */
export function columnOf(issue, now = Date.now()) {
	if (!issue || issue.pull_request) return null
	const labels = labelNames(issue)
	if (labels.some(label => EXCLUDED_LABELS.includes(label))) return null
	if (issue.state === 'open') return labels.includes(IN_PROGRESS_LABEL) ? 'inProgress' : 'planned'
	if (issue.state !== 'closed' || !DONE_REASONS.has(issue.state_reason ?? null)) return null
	const closed = time(issue.closed_at)
	return closed > 0 && now - closed <= DONE_WINDOW_MS ? 'done' : null
}

/** Sorts roadmap issues into { planned, inProgress, done }, each { items, more }. Pure: `now` is injected. */
export function classify(issues, now = Date.now()) {
	const buckets = { planned: [], inProgress: [], done: [] }
	for (const issue of issues ?? []) {
		const key = columnOf(issue, now)
		if (key) buckets[key].push(toItem(issue))
	}
	return {
		planned: column(buckets.planned, 'updatedAt'),
		inProgress: column(buckets.inProgress, 'updatedAt'),
		done: column(buckets.done, 'closedAt'),
	}
}

/** One Markdown line per issue: an escaped link, then its areas. */
export function formatItem(item) {
	const text = `#${Number(item.number)} ${escapeClipped(item.title, TITLE_MAX)}`
	const link = `[${text}](${REPOSITORY_URL}/issues/${Number(item.number)})`
	return item.areas.length > 0 ? `${link} — ${item.areas.join(', ')}` : link
}

function describe(lines, more) {
	if (lines.length === 0 && more === 0) return 'Nothing here right now.'
	return fitLines(lines, LIMITS.description, dropped => {
		const hidden = dropped + more
		return hidden > 0 ? `+${hidden} more` : ''
	})
}

/**
 * Builds the message: one embed per Discord column. Past Discord's limits it drops lines from the longest column
 * (counted in its "+N more") until the message fits.
 */
export function buildRoadmapPayload(columns, now = Date.now()) {
	const state = COLUMNS.map(({ key, title }) => ({
		title,
		lines: columns[key].items.map(formatItem),
		more: columns[key].more,
		total: columns[key].items.length + columns[key].more,
	}))
	const last = state.length - 1
	const render = () =>
		state.map(({ title, lines, more, total }, index) => ({
			title: `${title} (${total})`,
			...(index === 0 ? { url: `${SITE_URL}/roadmap` } : {}),
			description: describe(lines, more),
			color: COLORS.roadmap,
			...(index === last ? { footer: { text: 'Minemories roadmap · open GitHub issues' } } : {}),
			...(index === last ? { timestamp: new Date(now).toISOString() } : {}),
		}))
	let embeds = render()
	while (embeds.reduce((sum, embed) => sum + embedSize(embed), 0) > TOTAL_BUDGET) {
		const sizes = embeds.map((embed, index) => (state[index].lines.length > 0 ? embedSize(embed) : -1))
		const longest = state[sizes.indexOf(Math.max(...sizes))]
		if (longest.lines.length === 0) break
		longest.lines = longest.lines.slice(0, -1)
		longest.more += 1
		embeds = render()
	}
	return {
		username: 'Minemories',
		content: `**Minemories roadmap**: <${SITE_URL}/roadmap>`,
		allowed_mentions: { parse: [] },
		embeds,
	}
}

/** One query's issues, following the Link header (at most PAGE_LIMIT pages). */
async function fetchPages(url, headers, fetchImpl) {
	const issues = []
	for (let page = 0; url && page < PAGE_LIMIT; page += 1) {
		// biome-ignore lint/performance/noAwaitInLoops: pages are sequential (each one names the next).
		const response = await fetchImpl(url, { headers })
		if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`)
		const body = await response.json()
		if (!Array.isArray(body)) throw new Error('GitHub API returned an unexpected body.')
		issues.push(...body)
		url = NEXT_LINK.exec(response.headers?.get?.('link') ?? '')?.[1] ?? null
	}
	return issues
}

/** An issue that changed state between the two reads comes back twice: keep its most recent copy. */
function latestCopies(issues) {
	const latest = new Map()
	for (const issue of issues) {
		const known = latest.get(issue?.number)
		if (!known || time(issue?.updated_at) > time(known.updated_at)) latest.set(issue?.number, issue)
	}
	return [...latest.values()]
}

/** Every open issue, and the issues updated during the done window (pull requests included; `classify` drops them), following the Link headers. */
export async function fetchRoadmapIssues({ fetchImpl = globalThis.fetch, token, now = Date.now() } = {}) {
	const headers = {
		accept: 'application/vnd.github+json',
		'x-github-api-version': '2022-11-28',
		'user-agent': 'minemories-discord-sync',
		...(token ? { authorization: `Bearer ${token}` } : {}),
	}
	const since = new Date(now - DONE_WINDOW_MS).toISOString()
	const open = await fetchPages(`${ISSUES_URL}&state=open`, headers, fetchImpl)
	const closed = await fetchPages(`${ISSUES_URL}&state=closed&since=${since}`, headers, fetchImpl)
	return latestCopies([...open, ...closed])
}

async function postNew(webhook, payload, deps) {
	const result = await sendWebhook(webhookUrl(webhook, { wait: true }), payload, deps)
	return result.ok && isMessageId(result.body?.id) ? result.body.id : null
}

/** Posts the first message: its id goes to stdout, alone, so the workflow (or a human) can store it. */
async function publishFirst(webhook, payload, deps, { out, warn }) {
	const id = await postNew(webhook, payload, deps)
	if (!id) {
		warn('roadmap: could not post the roadmap message.')
		return 1
	}
	out(id)
	warn('roadmap: new message posted; store its id in the DISCORD_ROADMAP_MESSAGE_ID repository variable.')
	return 0
}

/**
 * Edits the message. When it was deleted and `DISCORD_ROADMAP_ALLOW_REPOST` is `true` (manual runs), posts a new one,
 * prints its id and fails so a human updates the variable; otherwise only fails.
 */
async function publishEdit(webhook, messageId, payload, deps, { out, warn }) {
	if (!isMessageId(messageId)) {
		warn('roadmap: DISCORD_ROADMAP_MESSAGE_ID is not a Discord message id.')
		return 1
	}
	const { username, ...edit } = payload
	const result = await sendWebhook(webhookUrl(webhook, { messageId }), edit, { ...deps, method: 'PATCH' })
	if (result.ok) return 0
	if (result.status !== 404) {
		warn(`roadmap: Discord refused the edit (${result.reason}).`)
		return 1
	}
	// Only a manual run reposts: automatic runs would otherwise post one new message each until the variable changes.
	if (!deps.allowRepost) {
		warn('roadmap: the roadmap message was deleted; run the workflow manually to post a new one.')
		return 1
	}
	const id = await postNew(webhook, payload, deps)
	if (!id) {
		warn('roadmap: the roadmap message was deleted and a new one could not be posted.')
		return 1
	}
	out(id)
	warn(
		'roadmap: the roadmap message was deleted; a new one was posted. Set DISCORD_ROADMAP_MESSAGE_ID to the id above.'
	)
	return 1
}

/**
 * Fetches the roadmap and updates the Discord message. Resolves to the exit code: 0 when the message is up to date
 * (or nothing was sent because the webhook is missing), 1 when GitHub or Discord failed, or when the message had been
 * deleted and a new one was posted (its id is printed: the repository variable must be updated).
 */
export async function syncRoadmap(options = {}) {
	const env = options.env ?? process.env
	const io = { out: options.out ?? (text => console.log(text)), warn: options.warn ?? (text => console.error(text)) }
	const deps = {
		fetchImpl: options.fetch ?? globalThis.fetch,
		sleep: options.sleep,
		env,
		allowRepost: env.DISCORD_ROADMAP_ALLOW_REPOST === 'true',
	}
	try {
		const issues = await fetchRoadmapIssues({ fetchImpl: deps.fetchImpl, token: env.GITHUB_TOKEN, now: options.now })
		const payload = buildRoadmapPayload(classify(issues, options.now), options.now)
		if (options.dryRun) {
			io.out(JSON.stringify(payload, null, '\t'))
			return 0
		}
		const webhook = resolveWebhook(env)
		if (!webhook) {
			io.warn('roadmap: DISCORD_WEBHOOK_URL is not set or not a webhook, nothing sent.')
			return 0
		}
		const messageId = String(env.DISCORD_ROADMAP_MESSAGE_ID ?? '').trim()
		if (!messageId) return await publishFirst(webhook, payload, deps, io)
		return await publishEdit(webhook, messageId, payload, deps, io)
	} catch (error) {
		io.warn(`roadmap: ${redactSecrets(error?.message ?? String(error), env)}`)
		return 1
	}
}
