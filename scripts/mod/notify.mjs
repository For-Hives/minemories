// Discord notifications for the mod build/release tool. `notify(event)` never throws: a failed notification must
// never fail (or mask the failure of) the build it reports on.
import { homedir } from 'node:os'

export const LIMITS = { title: 256, description: 4096, fields: 25, fieldName: 256, fieldValue: 1024, total: 6000 }
export const COLORS = { success: 0x2ecc71, failure: 0xe74c3c, warning: 0xe67e22 }
export const KINDS = [
	'release-success',
	'release-failure',
	'build-failure',
	'test-failure',
	'publish-failure',
	'storage-warning',
]
const STATUS_LABEL = { passed: 'OK', failed: 'ÉCHEC', skipped: 'ignorée' }
const LOG_LINES = 30
const MAX_ATTEMPTS = 4
const MAX_WAIT_MS = 30_000

const WEBHOOK_URL = /https?:\/\/(?:[\w-]+\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/[^\s"'<>)]+/gi
const BEARER = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi
const KEY_VALUE =
	/\b([A-Za-z0-9_.-]*(?:token|secret|password|passwd|api[_-]?key|authorization|webhook)[A-Za-z0-9_.-]*)(\s*[=:]\s*)((?:(?:Bearer|Basic|Token)\s+)?(?:"[^"]*"|'[^']*'|\S+))/gi
const KNOWN_TOKENS =
	/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|mrp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g
const HOME_PATHS = /(?:\/home\/[^/\s"']+|\/Users\/[^/\s"']+|[A-Za-z]:\\Users\\[^\\\s"']+)/g
const SECRET_NAME = /(?:TOKEN|SECRET|KEY|PASSWORD|PASSWD|WEBHOOK|CREDENTIAL)/i
const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g

/** Values of the environment variables that look like secrets (never shown, only used to mask them). */
function secretValues(env) {
	return Object.entries(env ?? {})
		.filter(([name, value]) => SECRET_NAME.test(name) && typeof value === 'string' && value.length >= 6)
		.map(([, value]) => value)
}

function safeHome() {
	try {
		return homedir()
	} catch {
		return ''
	}
}

/** Masks tokens, webhook URLs, secret-looking assignments and personal paths in a message. */
export function redactSecrets(text, env = process.env) {
	let out = String(text ?? '')
	for (const value of secretValues(env).sort((a, b) => b.length - a.length)) {
		out = out.replace(new RegExp(value.replace(REGEXP_SPECIALS, '\\$&'), 'g'), '[masqué]')
	}
	out = out.replace(WEBHOOK_URL, '[webhook masqué]')
	out = out.replace(KEY_VALUE, (_, name, separator) => `${name}${separator}[masqué]`)
	out = out.replace(BEARER, (_, scheme) => `${scheme} [masqué]`)
	out = out.replace(KNOWN_TOKENS, '[masqué]')
	const home = env?.HOME ?? safeHome()
	if (home && home.length > 1) out = out.split(home).join('~')
	return out.replace(HOME_PATHS, '~')
}

/** Cuts text to `max` characters, ending with an ellipsis. */
export function clip(text, max) {
	const value = String(text ?? '')
	if (value.length <= max) return value
	return `${value.slice(0, Math.max(0, max - 1))}…`
}

/** Last `lines` lines of a log, in a code block that never exceeds `max` characters (oldest lines dropped first). */
export function formatLogTail(logTail, { lines = LOG_LINES, max = LIMITS.fieldValue } = {}) {
	const source = String(logTail ?? '')
		.replace(/\r/g, '')
		.replace(/```/g, "'''")
		.split('\n')
	while (source.length > 0 && source.at(-1).trim() === '') source.pop()
	let kept = source.slice(-lines)
	let cut = kept.length < source.length
	const wrap = () => `\`\`\`\n${cut ? '…\n' : ''}${kept.join('\n')}\n\`\`\``
	while (kept.length > 1 && wrap().length > max) {
		kept = kept.slice(1)
		cut = true
	}
	if (wrap().length > max) {
		// A single very long line: keep its end, where the error usually is.
		const room = max - '```\n…\n\n```'.length
		kept = [kept[0].slice(Math.max(0, kept[0].length - room))]
		cut = true
	}
	return wrap()
}

function describeTarget(target, version) {
	if (target.status === 'failed' || target.status === 'skipped') {
		const base = STATUS_LABEL[target.status]
		return target.message ? `${base} : ${target.message}` : base
	}
	const parts = []
	if (version) parts.push(version)
	if (typeof target.bytes === 'number') parts.push(`${(target.bytes / (1024 * 1024)).toFixed(1)} Mo`)
	if (typeof target.seconds === 'number') parts.push(`${Math.round(target.seconds)} s`)
	return parts.length > 0 ? parts.join(' · ') : STATUS_LABEL.passed
}

function embedSize(embed) {
	let size = (embed.title?.length ?? 0) + (embed.description?.length ?? 0) + (embed.footer?.text?.length ?? 0)
	for (const field of embed.fields ?? []) size += field.name.length + field.value.length
	return size
}

function colorFor(kind) {
	if (kind === 'release-success') return COLORS.success
	if (kind === 'storage-warning') return COLORS.warning
	return COLORS.failure
}

function targetFields(event, clean) {
	const targets = Array.isArray(event.targets) ? event.targets : []
	const fields = targets.map(target => ({
		name: clean(`${STATUS_LABEL[target.status] ?? target.status} · ${target.id}`, LIMITS.fieldName),
		value: clean(describeTarget(target, event.version), LIMITS.fieldValue),
		inline: true,
		failed: target.status === 'failed',
	}))
	// Failing targets come first so they survive any truncation.
	return fields.toSorted((a, b) => Number(b.failed) - Number(a.failed)).map(({ failed, ...field }) => field)
}

/** Builds the Discord webhook payload for an event, with every Discord limit enforced and secrets masked. */
export function buildPayload(event, env = process.env) {
	const clean = (text, max) => clip(redactSecrets(text, env), max)
	const kind = KINDS.includes(event?.kind) ? event.kind : 'build-failure'
	const fields = []
	if (event.version) fields.push({ name: 'Version', value: clean(event.version, LIMITS.fieldValue), inline: true })
	if (event.commit) fields.push({ name: 'Commit', value: clean(String(event.commit).slice(0, 7), 64), inline: true })
	const tail = []
	if (event.logTail) {
		tail.push({ name: 'Journal (fin)', value: formatLogTail(redactSecrets(event.logTail, env)), inline: false })
	}
	if (event.logUrl) tail.push({ name: 'Journal complet', value: clean(event.logUrl, LIMITS.fieldValue), inline: false })
	let targets = targetFields(event, clean)
	const room = Math.max(0, LIMITS.fields - fields.length - tail.length)
	if (targets.length > room) {
		const shown = Math.max(0, room - 1)
		const more = { name: 'Autres cibles', value: `… et ${targets.length - shown} de plus`, inline: false }
		targets = [...targets.slice(0, shown), more].slice(0, room)
	}
	const embed = {
		title: clean(event.title || kind, LIMITS.title),
		description: clean(event.summary || '', LIMITS.description),
		color: colorFor(kind),
		fields: [...fields, ...targets, ...tail],
		footer: { text: `minemories · ${kind}` },
		timestamp: new Date().toISOString(),
	}
	// 6000 characters in total: drop target fields (never the log tail) from the end, then shorten the summary.
	while (embedSize(embed) > LIMITS.total && targets.length > 0) {
		const last = embed.fields.findLastIndex(field => targets.some(target => target.name === field.name))
		embed.fields.splice(last, 1)
		targets.pop()
	}
	if (embedSize(embed) > LIMITS.total) {
		embed.description = clip(
			embed.description,
			Math.max(0, embed.description.length - (embedSize(embed) - LIMITS.total))
		)
	}
	return { username: 'Minemories', allowed_mentions: { parse: [] }, embeds: [embed] }
}

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function retryDelay(response, body, attempt) {
	const fromBody = Number(body?.retry_after)
	const header = response.headers?.get?.('retry-after')
	const fromHeader = header ? Number(header) : Number.NaN
	const seconds = [fromBody, fromHeader].find(value => Number.isFinite(value) && value >= 0)
	const wait = seconds === undefined ? 500 * 2 ** attempt : seconds * 1000
	return Math.min(wait, MAX_WAIT_MS)
}

async function readJson(response) {
	try {
		return await response.json()
	} catch {
		return null
	}
}

/** One attempt. Returns { done, result?, delay? }. */
async function attemptOnce(url, payload, fetchImpl, attempt) {
	const response = await fetchImpl(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload),
	})
	if (response.ok) return { done: true, result: { sent: true, status: response.status } }
	const reason = `HTTP ${response.status}`
	if (response.status === 429) {
		return { done: false, reason, delay: retryDelay(response, await readJson(response), attempt) }
	}
	if (response.status >= 500) return { done: false, reason, delay: retryDelay(response, null, attempt) }
	return { done: true, result: { sent: false, status: response.status, reason } }
}

/** Sends one payload with bounded retries. Returns { sent, status?, reason? }; never throws. */
async function deliver(url, payload, { fetchImpl, sleep, env }) {
	let reason = 'inconnu'
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
		let outcome
		try {
			// biome-ignore lint/performance/noAwaitInLoops: retries are sequential by design (rate limits).
			outcome = await attemptOnce(url, payload, fetchImpl, attempt)
		} catch (error) {
			outcome = {
				done: false,
				reason: redactSecrets(error?.message ?? String(error), env),
				delay: retryDelay({}, null, attempt),
			}
		}
		if (outcome.done) return outcome.result
		reason = outcome.reason
		if (attempt < MAX_ATTEMPTS - 1) await sleep(outcome.delay)
	}
	return { sent: false, reason }
}

/**
 * Sends an embed to MOD_DISCORD_WEBHOOK_URL. Never throws. `options` allows injecting fetch, sleep, env and the
 * warning sink for tests.
 */
export async function notify(event, options = {}) {
	const env = options.env ?? process.env
	const warn = options.warn ?? (message => console.warn(message))
	try {
		const url = env.MOD_DISCORD_WEBHOOK_URL
		if (!url) {
			warn('notify : MOD_DISCORD_WEBHOOK_URL absente, aucune notification Discord envoyée.')
			return { sent: false, reason: 'webhook absent' }
		}
		const payload = buildPayload(event ?? {}, env)
		const result = await deliver(url, payload, {
			fetchImpl: options.fetch ?? globalThis.fetch,
			sleep: options.sleep ?? defaultSleep,
			env,
		})
		if (!result.sent) warn(`notify : envoi Discord abandonné (${result.reason}).`)
		return result
	} catch (error) {
		const reason = redactSecrets(error?.message ?? String(error), env)
		try {
			warn(`notify : échec inattendu (${reason}).`)
		} catch {
			// Nothing left to do: notifications are best effort.
		}
		return { sent: false, reason }
	}
}
