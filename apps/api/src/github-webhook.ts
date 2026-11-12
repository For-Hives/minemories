import { createHmac, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { boundedRequest } from './body-limits'

/** GitHub caps deliveries at 25 MB; roadmap events are a few KiB, so anything above 1 MiB is refused unread. */
export const GITHUB_WEBHOOK_BODY_BYTES = 1024 * 1024
const SIGNATURE = /^sha256=([0-9a-f]{64})$/i
const MOD_TAG_PREFIX = 'mod-v'
const ROADMAP_EVENTS = new Set(['issues', 'label', 'milestone'])
const REF_EVENTS = new Set(['create', 'delete'])

/** Optional `GITHUB_WEBHOOK_SECRET`: without it the webhook route answers 404 and the roadmap only refreshes on a timer. */
export function githubWebhookSecret(environment: Readonly<Record<string, string | undefined>>): string | undefined {
	return environment.GITHUB_WEBHOOK_SECRET?.trim() || undefined
}

/** Constant-time check of `X-Hub-Signature-256` (HMAC-SHA256 of the raw body). */
export function validGithubSignature(secret: string, body: Uint8Array, header: string | undefined): boolean {
	const match = SIGNATURE.exec(header ?? '')
	if (!match) return false
	const expected = createHmac('sha256', secret).update(body).digest()
	const received = Buffer.from(match[1] as string, 'hex')
	return received.length === expected.length && timingSafeEqual(received, expected)
}

function parseJson(body: Uint8Array): Record<string, unknown> | null {
	try {
		const value: unknown = JSON.parse(new TextDecoder().decode(body))
		return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
	} catch {
		return null
	}
}

function isModTag(value: unknown): boolean {
	return typeof value === 'string' && value.startsWith(MOD_TAG_PREFIX)
}

/** What a verified delivery changes: the roadmap issues, the latest mod release too, or nothing. */
export function roadmapChange(event: string, payload: Record<string, unknown> | null): { release: boolean } | null {
	if (ROADMAP_EVENTS.has(event)) return { release: false }
	if (REF_EVENTS.has(event)) return payload?.ref_type === 'tag' && isModTag(payload.ref) ? { release: true } : null
	if (event !== 'release') return null
	const release = payload?.release as { tag_name?: unknown } | undefined
	return isModTag(release?.tag_name) ? { release: true } : null
}

export interface GithubWebhookOptions {
	secret: string | undefined
	/** Called with each relevant change; it must return at once (the roadmap debounces and refreshes in background). */
	onChange: (change: { release: boolean }) => void
}

/** The raw body of a delivery whose signature matches, or the status refusing it. Unsigned requests are never read. */
async function verifiedBody(
	raw: Request,
	secret: string,
	signature: string | undefined
): Promise<Uint8Array | 400 | 401 | 413> {
	if (!SIGNATURE.test(signature ?? '')) return 401
	let request: Request | null
	try {
		request = await boundedRequest(raw, GITHUB_WEBHOOK_BODY_BYTES)
	} catch {
		return 400
	}
	if (!request) return 413
	const body = new Uint8Array(await request.arrayBuffer())
	return validGithubSignature(secret, body, signature) ? body : 401
}

const REFUSALS = { 400: 'invalid_request_body', 401: 'invalid_signature', 413: 'request_body_too_large' } as const

/**
 * `POST /api/github/webhook`: GitHub pushes issue, label, milestone, tag and release events so `/api/roadmap` changes
 * right away. Signed with `GITHUB_WEBHOOK_SECRET`; the payload, the signature and the secret are never logged.
 */
export function createGithubWebhook(options: GithubWebhookOptions) {
	const router = new Hono()
	router.post('/', async context => {
		const secret = options.secret
		if (!secret) return context.json({ error: 'not_found' }, 404)
		const body = await verifiedBody(context.req.raw, secret, context.req.header('X-Hub-Signature-256'))
		if (typeof body === 'number') return context.json({ error: REFUSALS[body] }, body)
		const event = context.req.header('X-GitHub-Event') ?? ''
		if (event === 'ping') return context.json({ status: 'ok' }, 200)
		const payload = ROADMAP_EVENTS.has(event) ? null : parseJson(body)
		const change = roadmapChange(event, payload)
		if (!change) return context.json({ status: 'ignored' }, 202)
		options.onChange(change)
		return context.json({ status: 'accepted' }, 202)
	})
	return router
}
