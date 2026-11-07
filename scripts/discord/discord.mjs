// Shared Discord helpers for the changelog and roadmap posts: markdown escaping, Discord limits and a webhook client
// that retries like `scripts/mod/notify.mjs` (429 with `retry_after` capped at 30 s, 5xx and network errors) and never
// throws. The webhook URL never appears in a message: every error goes through `redactSecrets`.
import { clip, redactSecrets } from '../mod/notify.mjs'

export { clip, redactSecrets }

export const REPOSITORY = 'For-Hives/minemories'
export const REPOSITORY_URL = `https://github.com/${REPOSITORY}`
export const SITE_URL = 'https://minemories.xenos.lightin.io'
export const LIMITS = { title: 256, description: 4096, fieldValue: 1024, embeds: 10, total: 6000, content: 2000 }
export const COLORS = { changelog: 0x5865f2, release: 0x2ecc71, roadmap: 0xe67e22 }

const MAX_ATTEMPTS = 4
const MAX_WAIT_MS = 30_000
const MARKDOWN = /[\\*_~`|>[\]()#<-]/g
const MENTION = /@(everyone|here)/gi
const WHITESPACE = /\s+/g
const TRAILING_SLASHES = /\/+$/
const MESSAGE_ID = /^\d{1,25}$/

/** Escapes Discord markdown, links and mentions so user text renders literally on a single line. */
export function escapeMarkdown(text) {
	return String(text ?? '')
		.replace(WHITESPACE, ' ')
		.trim()
		.replace(MARKDOWN, '\\$&')
		.replace(MENTION, '@​$1')
}

/** Clips then escapes, without ever cutting an escape sequence in half. */
export function escapeClipped(text, max) {
	const clean = String(text ?? '')
		.replace(WHITESPACE, ' ')
		.trim()
	return escapeMarkdown(clip(clean, max))
}

/** Characters Discord counts towards the 6000 limit of a message. */
export function embedSize(embed) {
	let size = (embed.title?.length ?? 0) + (embed.description?.length ?? 0) + (embed.footer?.text?.length ?? 0)
	size += embed.author?.name?.length ?? 0
	for (const field of embed.fields ?? []) size += field.name.length + field.value.length
	return size
}

export function payloadSize(payload) {
	return (payload.embeds ?? []).reduce((sum, embed) => sum + embedSize(embed), 0)
}

/**
 * Joins lines into a description of at most `max` characters, dropping whole lines from the end. `suffix(dropped)`
 * returns the closing line (for example "+3 more"), or an empty string when nothing was dropped.
 */
export function fitLines(lines, max, suffix) {
	let kept = [...lines]
	const render = () => {
		const tail = suffix(lines.length - kept.length)
		return [...kept, ...(tail ? [tail] : [])].join('\n')
	}
	while (kept.length > 0 && render().length > max) kept = kept.slice(0, -1)
	return clip(render(), max)
}

export function isMessageId(value) {
	return MESSAGE_ID.test(String(value ?? ''))
}

const WEBHOOK_BASE = 'https://discord.com/api/webhooks/'
const ID_AND_TOKEN = /^\d{5,25}\/[\w-]{20,}$/
const TOKEN_ONLY = /^[\w-]{20,}$/
const WEBHOOK_ID = /^\d{5,25}$/

/**
 * The webhook URL from DISCORD_WEBHOOK_URL, which may hold the full URL, `<id>/<token>` or only the token (then
 * DISCORD_WEBHOOK_ID, not a secret, gives the id). Null when nothing usable is configured.
 */
export function resolveWebhook(env = {}) {
	const value = String(env.DISCORD_WEBHOOK_URL ?? '').trim()
	if (!value) return null
	if (value.startsWith('https://')) return value
	if (ID_AND_TOKEN.test(value)) return `${WEBHOOK_BASE}${value}`
	const id = String(env.DISCORD_WEBHOOK_ID ?? '').trim()
	if (TOKEN_ONLY.test(value) && WEBHOOK_ID.test(id)) return `${WEBHOOK_BASE}${id}/${value}`
	return null
}

/** Builds the URL of a webhook call; keeps any query the webhook already carries (`thread_id`). */
export function webhookUrl(base, { messageId, wait } = {}) {
	const url = new URL(base)
	if (messageId !== undefined) {
		if (!isMessageId(messageId)) throw new Error('Invalid Discord message id.')
		url.pathname = `${url.pathname.replace(TRAILING_SLASHES, '')}/messages/${messageId}`
	}
	if (wait) url.searchParams.set('wait', 'true')
	return url.toString()
}

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function readJson(response) {
	try {
		return await response.json()
	} catch {
		return null
	}
}

function retryDelay(response, body, attempt) {
	const header = response.headers?.get?.('retry-after')
	const seconds = [Number(body?.retry_after), header ? Number(header) : Number.NaN].find(
		value => Number.isFinite(value) && value >= 0
	)
	const wait = seconds === undefined ? 500 * 2 ** attempt : seconds * 1000
	return Math.min(wait, MAX_WAIT_MS)
}

async function attemptOnce(url, method, payload, fetchImpl, attempt) {
	const response = await fetchImpl(url, {
		method,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload),
	})
	const body = await readJson(response)
	if (response.ok) return { done: true, result: { ok: true, status: response.status, body } }
	const reason = `HTTP ${response.status}`
	if (response.status === 429 || response.status >= 500) {
		return { done: false, reason, status: response.status, delay: retryDelay(response, body, attempt) }
	}
	return { done: true, result: { ok: false, status: response.status, reason, body } }
}

/**
 * Sends one webhook request with bounded retries. Resolves to { ok, status?, body?, reason? } and never throws; the
 * reason never contains the webhook URL.
 */
export async function sendWebhook(url, payload, options = {}) {
	const { method = 'POST', fetchImpl = globalThis.fetch, sleep = defaultSleep, env = process.env } = options
	let last = { ok: false, reason: 'unknown' }
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
		let outcome
		try {
			// biome-ignore lint/performance/noAwaitInLoops: retries are sequential by design (rate limits).
			outcome = await attemptOnce(url, method, payload, fetchImpl, attempt)
		} catch (error) {
			const reason = redactSecrets(error?.message ?? String(error), env)
			outcome = { done: false, reason, delay: retryDelay({}, null, attempt) }
		}
		if (outcome.done) {
			const { result } = outcome
			return result.reason ? { ...result, reason: redactSecrets(result.reason, env) } : result
		}
		last = { ok: false, reason: redactSecrets(outcome.reason, env), status: outcome.status }
		if (attempt < MAX_ATTEMPTS - 1) await sleep(outcome.delay)
	}
	return last
}
