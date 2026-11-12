import { expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import {
	createGithubWebhook,
	GITHUB_WEBHOOK_BODY_BYTES,
	githubWebhookSecret,
	roadmapChange,
	validGithubSignature,
} from './github-webhook'

const SECRET = 'test-webhook-secret'

function sign(body: string | Uint8Array, secret = SECRET) {
	return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

function webhook(secret: string | null = SECRET) {
	const changes: { release: boolean }[] = []
	const router = createGithubWebhook({ secret: secret ?? undefined, onChange: change => changes.push(change) })
	const deliver = (event: string, payload: unknown, headers: Record<string, string> = {}) => {
		const body = JSON.stringify(payload)
		return router.request('/', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-GitHub-Event': event,
				'X-Hub-Signature-256': sign(body),
				...headers,
			},
			body,
		})
	}
	return { changes, router, deliver }
}

test('reads the secret trimmed and treats an empty value as absent', () => {
	expect(githubWebhookSecret({})).toBeUndefined()
	expect(githubWebhookSecret({ GITHUB_WEBHOOK_SECRET: '  ' })).toBeUndefined()
	expect(githubWebhookSecret({ GITHUB_WEBHOOK_SECRET: ' value ' })).toBe('value')
})

test('checks the signature of the raw body in constant time', () => {
	const body = new TextEncoder().encode('{"a":1}')
	expect(validGithubSignature(SECRET, body, sign(body))).toBe(true)
	expect(validGithubSignature(SECRET, body, sign(body).toUpperCase().replace('SHA256=', 'sha256='))).toBe(true)
	expect(validGithubSignature(SECRET, body, sign(body, 'other-secret'))).toBe(false)
	expect(validGithubSignature(SECRET, body, sign('{"a":2}'))).toBe(false)
	expect(validGithubSignature(SECRET, body, undefined)).toBe(false)
	expect(validGithubSignature(SECRET, body, sign(body).replace('sha256=', 'sha1='))).toBe(false)
	expect(validGithubSignature(SECRET, body, `${sign(body)}00`)).toBe(false)
})

test('a signed issue, label or milestone event schedules a roadmap refresh without the release', async () => {
	const { changes, deliver } = webhook()
	for (const event of ['issues', 'label', 'milestone']) {
		// biome-ignore lint/performance/noAwaitInLoops: deliveries are checked in order against the recorded changes.
		const response = await deliver(event, { action: 'labeled' })
		expect(response.status).toBe(202)
		expect(await response.json()).toEqual({ status: 'accepted' })
	}
	expect(changes).toEqual([{ release: false }, { release: false }, { release: false }])
})

test('mod tag creation, deletion and mod releases refresh the release too; other refs are ignored', async () => {
	const { changes, deliver } = webhook()
	expect((await deliver('create', { ref_type: 'tag', ref: 'mod-v0.37.0' })).status).toBe(202)
	expect((await deliver('delete', { ref_type: 'tag', ref: 'mod-v0.37.0-beta.1' })).status).toBe(202)
	expect((await deliver('release', { action: 'published', release: { tag_name: 'mod-v0.37.0' } })).status).toBe(202)
	expect(changes).toEqual([{ release: true }, { release: true }, { release: true }])
	for (const [event, payload] of [
		['create', { ref_type: 'tag', ref: 'web-v1.0.0' }],
		['create', { ref_type: 'branch', ref: 'mod-v-branch' }],
		['delete', { ref_type: 'tag', ref: 42 }],
		['release', { release: { tag_name: 'v2.0.0' } }],
		['release', {}],
		['push', { ref: 'refs/heads/main' }],
		['', {}],
	] as const) {
		// biome-ignore lint/performance/noAwaitInLoops: one delivery at a time keeps the failing case readable.
		const response = await deliver(event, payload)
		expect(response.status).toBe(202)
		expect(await response.json()).toEqual({ status: 'ignored' })
	}
	expect(changes).toHaveLength(3)
})

test('ping answers 200 and changes nothing', async () => {
	const { changes, deliver } = webhook()
	const response = await deliver('ping', { zen: 'Keep it logically awesome.' })
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ status: 'ok' })
	expect(changes).toEqual([])
})

test('a missing or wrong signature is refused with 401 and nothing changes', async () => {
	const { changes, deliver, router } = webhook()
	expect((await deliver('issues', {}, { 'X-Hub-Signature-256': sign('{}', 'wrong') })).status).toBe(401)
	const unsigned = await router.request('/', { method: 'POST', headers: { 'X-GitHub-Event': 'issues' }, body: '{}' })
	expect(unsigned.status).toBe(401)
	expect(await unsigned.json()).toEqual({ error: 'invalid_signature' })
	expect(changes).toEqual([])
})

test('an unsigned or malformed signature is refused with 401 before the body is read', async () => {
	const { changes, router } = webhook()
	// Reading these bodies fails (400), so a 401 shows each request was refused unread.
	const responses = await Promise.all(
		[undefined, 'sha256=nothex', `sha1=${'a'.repeat(40)}`].map(header =>
			router.request('/', {
				method: 'POST',
				headers: { 'X-GitHub-Event': 'issues', ...(header ? { 'X-Hub-Signature-256': header } : {}) },
				body: new ReadableStream({
					pull(controller) {
						controller.error(new Error('must not be read'))
					},
				}),
			})
		)
	)
	expect(responses.map(response => response.status)).toEqual([401, 401, 401])
	expect(changes).toEqual([])
})

test('without a secret the route answers 404 before reading anything', async () => {
	const { changes, deliver } = webhook(null)
	const response = await deliver('issues', {})
	expect(response.status).toBe(404)
	expect(changes).toEqual([])
})

test('an oversized body is refused with 413, declared or streamed', async () => {
	const { changes, router } = webhook()
	const declared = await router.request('/', {
		method: 'POST',
		headers: {
			'Content-Length': String(GITHUB_WEBHOOK_BODY_BYTES + 1),
			'X-GitHub-Event': 'issues',
			'X-Hub-Signature-256': sign('{}'),
		},
		body: '{}',
	})
	expect(declared.status).toBe(413)
	const big = new Uint8Array(GITHUB_WEBHOOK_BODY_BYTES + 1)
	const streamed = await router.request('/', {
		method: 'POST',
		headers: { 'X-GitHub-Event': 'issues', 'X-Hub-Signature-256': sign(big) },
		body: new ReadableStream({
			start(controller) {
				controller.enqueue(big)
				controller.close()
			},
		}),
	})
	expect(streamed.status).toBe(413)
	expect(changes).toEqual([])
})

test('an unreadable body answers 400, an empty or non-JSON signed body is ignored', async () => {
	const { changes, router } = webhook()
	const broken = await router.request('/', {
		method: 'POST',
		headers: { 'X-GitHub-Event': 'issues', 'X-Hub-Signature-256': sign('{}') },
		body: new ReadableStream({
			pull(controller) {
				controller.error(new Error('connection reset'))
			},
		}),
	})
	expect(broken.status).toBe(400)
	const empty = await router.request('/', {
		method: 'POST',
		headers: { 'X-GitHub-Event': 'create', 'X-Hub-Signature-256': sign('') },
	})
	expect(empty.status).toBe(202)
	const form = 'payload=%7B%7D'
	const encoded = await router.request('/', {
		method: 'POST',
		headers: { 'X-GitHub-Event': 'release', 'X-Hub-Signature-256': sign(form) },
		body: form,
	})
	expect(await encoded.json()).toEqual({ status: 'ignored' })
	const scalar = await router.request('/', {
		method: 'POST',
		headers: { 'X-GitHub-Event': 'create', 'X-Hub-Signature-256': sign('null') },
		body: 'null',
	})
	expect(await scalar.json()).toEqual({ status: 'ignored' })
	expect(changes).toEqual([])
})

test('roadmapChange maps events without reading payloads of issue events', () => {
	expect(roadmapChange('issues', null)).toEqual({ release: false })
	expect(roadmapChange('create', null)).toBeNull()
	expect(roadmapChange('release', null)).toBeNull()
})
