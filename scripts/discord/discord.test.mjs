import assert from 'node:assert/strict'
import test from 'node:test'
import {
	escapeClipped,
	escapeMarkdown,
	fitLines,
	isMessageId,
	resolveWebhook,
	sendWebhook,
	webhookUrl,
} from './discord.mjs'

const WEBHOOK = 'https://discord.com/api/webhooks/123456789/fakeToken_for-tests'
const env = { DISCORD_WEBHOOK_URL: WEBHOOK }
const response = (status, body = {}, headers = {}) => ({
	ok: status >= 200 && status < 300,
	status,
	headers: { get: name => headers[name.toLowerCase()] ?? null },
	json: async () => body,
})
const recorder = responses => {
	const calls = []
	const fetchImpl = (url, init) => {
		calls.push({ url, init })
		const next = responses.shift()
		return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
	}
	return { calls, fetchImpl }
}

test('escapeMarkdown neutralises markdown, links, mentions and line breaks', () => {
	const out = escapeMarkdown(
		'**bold** _it_ `code` [x](http://evil) <@123> @everyone @here\n# heading > quote ~~s~~ |spoiler|'
	)
	assert.ok(!out.includes('\n'))
	assert.ok(out.includes('\\*\\*bold\\*\\*'))
	assert.ok(out.includes('\\[x\\]\\(http://evil\\)'))
	assert.ok(out.includes('\\<@123\\>'))
	assert.ok(out.includes('@​everyone'))
	assert.ok(out.includes('@​here'))
	assert.ok(!/(?<!\\)[*_`[\]]/.test(out.replace(/\\./g, '')))
})

test('escapeClipped clips before escaping so no escape sequence is cut', () => {
	const out = escapeClipped(`${'a'.repeat(9)}*`, 5)
	assert.equal(out, 'aaaa…')
	assert.equal(escapeClipped('  a\n b ', 10), 'a b')
	assert.equal(escapeMarkdown(undefined), '')
})

test('fitLines keeps whole lines and reports what it dropped', () => {
	const lines = ['aaaa', 'bbbb', 'cccc']
	assert.equal(
		fitLines(lines, 100, dropped => (dropped ? `+${dropped}` : '')),
		'aaaa\nbbbb\ncccc'
	)
	assert.equal(
		fitLines(lines, 12, dropped => (dropped ? `+${dropped}` : '')),
		'aaaa\nbbbb\n+1'
	)
	assert.equal(
		fitLines(['x'.repeat(50)], 10, () => ''),
		''
	)
	assert.equal(
		fitLines(['x'.repeat(50)], 10, dropped => `+${dropped}`),
		'+1'
	)
})

test('webhookUrl adds the message path and wait flag and keeps thread_id', () => {
	assert.equal(webhookUrl(`${WEBHOOK}?thread_id=42`, { wait: true }), `${WEBHOOK}?thread_id=42&wait=true`)
	assert.equal(webhookUrl(`${WEBHOOK}/`, { messageId: '987' }), `${WEBHOOK}/messages/987`)
	assert.throws(() => webhookUrl(WEBHOOK, { messageId: '../../x' }))
	assert.equal(isMessageId('123'), true)
	assert.equal(isMessageId(''), false)
	assert.equal(isMessageId(undefined), false)
})

test('sendWebhook retries 429 with retry_after capped at 30 s, then succeeds', async () => {
	const { calls, fetchImpl } = recorder([response(429, { retry_after: 120 }), response(200, { id: '1' })])
	const waits = []
	const result = await sendWebhook(WEBHOOK, { a: 1 }, { fetchImpl, sleep: ms => waits.push(ms), env })
	assert.deepEqual(result, { ok: true, status: 200, body: { id: '1' } })
	assert.deepEqual(waits, [30_000])
	assert.equal(calls[0].init.method, 'POST')
	assert.equal(calls[0].init.body, '{"a":1}')
})

test('sendWebhook uses the Retry-After header and the backoff when no hint is given', async () => {
	const { fetchImpl } = recorder([response(429, null, { 'retry-after': '2' }), response(503), response(204)])
	const waits = []
	const result = await sendWebhook(WEBHOOK, {}, { fetchImpl, sleep: ms => waits.push(ms), env, method: 'PATCH' })
	assert.equal(result.ok, true)
	assert.deepEqual(waits, [2000, 1000])
})

test('sendWebhook gives up after four 5xx or network failures and masks the webhook', async () => {
	const failure = new Error(`connect failed for ${WEBHOOK}`)
	const { calls, fetchImpl } = recorder([response(500), failure, response(502), failure])
	const waits = []
	const result = await sendWebhook(WEBHOOK, {}, { fetchImpl, sleep: ms => waits.push(ms), env })
	assert.equal(calls.length, 4)
	assert.equal(waits.length, 3)
	assert.equal(result.ok, false)
	assert.ok(!result.reason.includes('fakeToken'), result.reason)
})

test('sendWebhook does not retry a 4xx and reports its status', async () => {
	const { calls, fetchImpl } = recorder([response(404, { message: 'Unknown Message' })])
	const result = await sendWebhook(WEBHOOK, {}, { fetchImpl, sleep: () => undefined, env })
	assert.equal(calls.length, 1)
	assert.deepEqual(result, { ok: false, status: 404, reason: 'HTTP 404', body: { message: 'Unknown Message' } })
})

test('sendWebhook survives a body that is not JSON', async () => {
	const fetchImpl = () =>
		Promise.resolve({ ok: true, status: 204, headers: {}, json: () => Promise.reject(new Error('empty')) })
	assert.deepEqual(await sendWebhook(WEBHOOK, {}, { fetchImpl, env }), { ok: true, status: 204, body: null })
})

test('resolveWebhook accepts the full URL, id/token or the token alone with DISCORD_WEBHOOK_ID', () => {
	const token = 'A'.repeat(68)
	const full = `https://discord.com/api/webhooks/123456789012345678/${token}`
	assert.equal(resolveWebhook({ DISCORD_WEBHOOK_URL: ` ${full} ` }), full)
	assert.equal(resolveWebhook({ DISCORD_WEBHOOK_URL: `123456789012345678/${token}` }), full)
	assert.equal(resolveWebhook({ DISCORD_WEBHOOK_URL: token, DISCORD_WEBHOOK_ID: '123456789012345678' }), full)
	// Without an id, a bare token is unusable; garbage and empty values are refused.
	assert.equal(resolveWebhook({ DISCORD_WEBHOOK_URL: token }), null)
	assert.equal(resolveWebhook({ DISCORD_WEBHOOK_URL: 'not a webhook', DISCORD_WEBHOOK_ID: '1' }), null)
	assert.equal(resolveWebhook({ DISCORD_WEBHOOK_URL: '' }), null)
	assert.equal(resolveWebhook(), null)
})
