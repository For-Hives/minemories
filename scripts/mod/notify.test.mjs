import assert from 'node:assert/strict'
import test from 'node:test'
import { run } from './commands/notify.mjs'
import { buildPayload, formatLogTail, LIMITS, notify, redactSecrets } from './notify.mjs'

const LEAK_HOME = /~\/repo/
const FAILED_B = /ÉCHEC · b/
const MISSING_WEBHOOK = /MOD_DISCORD_WEBHOOK_URL/
const NOT_SENT = /non envoyée/
const noop = () => undefined
const WEBHOOK = 'https://discord.com/api/webhooks/123456789/abcDEF_secret-token'
const env = { HOME: '/home/alice', MOD_DISCORD_WEBHOOK_URL: WEBHOOK, S3_SECRET_KEY: 'supersecretvalue' }
const response = (status, body = {}, headers = {}) => ({
	ok: status >= 200 && status < 300,
	status,
	headers: { get: name => headers[name.toLowerCase()] ?? null },
	json: async () => body,
})
const total = embed =>
	embed.title.length +
	embed.description.length +
	embed.footer.text.length +
	embed.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0)

test('redactSecrets masks webhooks, tokens, secret env values and home paths', () => {
	const text = `post ${WEBHOOK} MODRINTH_TOKEN=abc123xyz Authorization: Bearer abcdefghijklmnop ghp_${'a'.repeat(30)} key supersecretvalue in /home/alice/repo and /home/bob/x`
	const out = redactSecrets(text, env)
	for (const leak of [
		'abcDEF_secret',
		'abc123xyz',
		'abcdefghijklmnop',
		'ghp_aaaa',
		'supersecretvalue',
		'alice',
		'bob',
	]) {
		assert.ok(!out.includes(leak), `${leak} fuite dans : ${out}`)
	}
	assert.match(out, LEAK_HOME)
})

test('formatLogTail keeps the last lines in a closed, bounded code block', () => {
	const log = Array.from({ length: 100 }, (_, i) => `ligne ${i} ${'x'.repeat(40)}`).join('\n')
	const out = formatLogTail(log)
	assert.ok(out.length <= LIMITS.fieldValue)
	assert.ok(out.startsWith('```\n…\n'))
	assert.ok(out.endsWith('\n```'))
	assert.ok(out.includes('ligne 99'))
	assert.ok(!out.includes('ligne 0 '))
	assert.equal(formatLogTail('a\nb\n\n'), '```\na\nb\n```')
	assert.ok(!formatLogTail('``` danger').slice(3, -3).includes('```'))
})

test('formatLogTail truncates a single huge line from its start', () => {
	const out = formatLogTail(`${'a'.repeat(5000)}FIN`)
	assert.ok(out.length <= LIMITS.fieldValue)
	assert.ok(out.includes('FIN'))
})

test('success payload summarizes each target in green', () => {
	const payload = buildPayload(
		{
			kind: 'release-success',
			title: 'Release 1.2.3-beta.1',
			summary: 'ok',
			version: '1.2.3-beta.1',
			commit: 'abcdef0123456789',
			targets: [{ id: 'fabric-mc1.21.1', status: 'passed', bytes: 2 * 1024 * 1024, seconds: 61.4 }],
		},
		env
	)
	const embed = payload.embeds[0]
	assert.equal(embed.color, 0x2ecc71)
	assert.deepEqual(payload.allowed_mentions, { parse: [] })
	assert.ok(embed.fields.some(field => field.name === 'Commit' && field.value === 'abcdef0'))
	const target = embed.fields.find(field => field.name.includes('fabric-mc1.21.1'))
	assert.equal(target.value, '1.2.3-beta.1 · 2.0 Mo · 61 s')
})

test('failure payload is red with failing targets first, log tail and link', () => {
	const embed = buildPayload(
		{
			kind: 'build-failure',
			title: 't',
			summary: 's',
			targets: [
				{ id: 'a', status: 'passed' },
				{ id: 'b', status: 'failed', message: 'compileJava' },
			],
			logTail: 'oops /home/alice/x\nTOKEN=zzzzzzzz',
			logUrl: 'https://logs.example/1',
		},
		env
	).embeds[0]
	assert.equal(embed.color, 0xe74c3c)
	assert.match(embed.fields[0].name, FAILED_B)
	assert.equal(embed.fields[0].value, 'ÉCHEC : compileJava')
	assert.ok(embed.fields.some(field => field.name === 'Journal (fin)' && !field.value.includes('alice')))
	assert.ok(!JSON.stringify(embed).includes('zzzzzzzz'))
	assert.equal(embed.fields.at(-1).value, 'https://logs.example/1')
})

test('colors per kind and unknown kinds', () => {
	assert.equal(buildPayload({ kind: 'storage-warning' }, env).embeds[0].color, 0xe67e22)
	assert.equal(buildPayload({ kind: 'publish-failure' }, env).embeds[0].color, 0xe74c3c)
	assert.equal(buildPayload({ kind: 'nope' }, env).embeds[0].footer.text, 'minemories · build-failure')
	assert.equal(buildPayload({ kind: 'test-failure' }, env).embeds[0].title, 'test-failure')
})

test('Discord limits hold for huge events', () => {
	const targets = Array.from({ length: 60 }, (_, i) => ({ id: `t${i}`, status: 'failed', message: 'm'.repeat(2000) }))
	const embed = buildPayload(
		{
			kind: 'release-failure',
			title: 'T'.repeat(1000),
			summary: 'S'.repeat(9000),
			version: 'v'.repeat(3000),
			targets,
			logTail: 'l'.repeat(9000),
			logUrl: 'u'.repeat(3000),
		},
		env
	).embeds[0]
	assert.ok(embed.title.length <= LIMITS.title)
	assert.ok(embed.description.length <= LIMITS.description)
	assert.ok(embed.fields.length <= LIMITS.fields)
	for (const field of embed.fields) {
		assert.ok(field.name.length <= LIMITS.fieldName)
		assert.ok(field.value.length <= LIMITS.fieldValue)
	}
	assert.ok(total(embed) <= LIMITS.total, `total ${total(embed)}`)
})

test('overflowing targets collapse into one summary field', () => {
	const targets = Array.from({ length: 40 }, (_, i) => ({ id: `t${i}`, status: 'passed' }))
	const embed = buildPayload({ kind: 'release-success', version: '1', targets }, env).embeds[0]
	assert.equal(embed.fields.length, 25)
	assert.equal(embed.fields.at(-1).name, 'Autres cibles')
})

test('notify without webhook warns and does not call fetch', async () => {
	const warnings = []
	const result = await notify(
		{ kind: 'build-failure' },
		{
			env: {},
			warn: m => warnings.push(m),
			fetch: () => assert.fail('fetch'),
		}
	)
	assert.equal(result.sent, false)
	assert.match(warnings[0], MISSING_WEBHOOK)
})

test('notify posts the payload to the webhook', async () => {
	const calls = []
	const result = await notify(
		{ kind: 'release-success', title: 'ok' },
		{
			env,
			fetch: (url, init) => {
				calls.push({ url, init })
				return Promise.resolve(response(204))
			},
		}
	)
	assert.equal(result.sent, true)
	assert.equal(calls[0].url, WEBHOOK)
	assert.equal(JSON.parse(calls[0].init.body).embeds[0].title, 'ok')
})

test('notify honors 429 retry_after then succeeds', async () => {
	const sleeps = []
	const replies = [response(429, { retry_after: 1.5 }), response(502), response(204)]
	const result = await notify(
		{ kind: 'build-failure' },
		{ env, sleep: ms => Promise.resolve(sleeps.push(ms)), fetch: () => Promise.resolve(replies.shift()) }
	)
	assert.equal(result.sent, true)
	assert.equal(sleeps[0], 1500)
	assert.equal(sleeps[1], 1000)
})

test('notify caps waits, uses the Retry-After header and gives up after bounded attempts', async () => {
	const sleeps = []
	let calls = 0
	const result = await notify(
		{ kind: 'build-failure' },
		{
			env,
			warn: noop,
			sleep: ms => Promise.resolve(sleeps.push(ms)),
			fetch: () => {
				calls += 1
				return Promise.resolve(response(429, null, { 'retry-after': '999' }))
			},
		}
	)
	assert.equal(result.sent, false)
	assert.equal(calls, 4)
	assert.deepEqual(sleeps, [30_000, 30_000, 30_000])
})

test('notify retries network errors, never throws and hides the secret in the reason', async () => {
	const warnings = []
	const result = await notify(
		{ kind: 'build-failure' },
		{
			env,
			warn: m => warnings.push(m),
			sleep: () => Promise.resolve(),
			fetch: () => {
				return Promise.reject(new Error(`connect failed for ${WEBHOOK}`))
			},
		}
	)
	assert.equal(result.sent, false)
	assert.ok(!JSON.stringify([result, warnings]).includes('abcDEF_secret'))
})

test('notify stops on a 4xx other than 429', async () => {
	let calls = 0
	const result = await notify(
		{ kind: 'build-failure' },
		{
			env,
			warn: noop,
			fetch: () => {
				calls += 1
				return Promise.resolve(response(404))
			},
		}
	)
	assert.equal(calls, 1)
	assert.equal(result.status, 404)
})

test('notify survives a broken warn sink and an unreadable 429 body', async () => {
	const broken = await notify({ kind: 'x' }, { env: {}, warn: () => assert.fail('warn') })
	assert.equal(broken.sent, false)
	const result = await notify(
		{ kind: 'build-failure' },
		{
			env,
			warn: noop,
			sleep: () => Promise.resolve(),
			fetch: async () => ({ ok: false, status: 429, headers: {}, json: async () => Promise.reject(new Error('x')) }),
		}
	)
	assert.equal(result.sent, false)
})

test('command: --test --dry-run prints JSON without sending', async () => {
	const lines = []
	const code = await run(['--test', '--dry-run'], { env, log: m => lines.push(m) })
	assert.equal(code, 0)
	assert.equal(JSON.parse(lines[0]).embeds[0].title, 'Test de notification Minemories')
	assert.ok(!lines[0].includes('abcDEF_secret'))
})

test('command: usage without arguments, --kind dry-run, and a missing webhook', async () => {
	const lines = []
	const ctx = { env: {}, log: m => lines.push(m) }
	assert.equal(await run([], ctx), 1)
	assert.equal(await run(['--kind', 'storage-warning', '--title', 'Disque', '--dry-run'], ctx), 0)
	assert.equal(JSON.parse(lines.at(-1)).embeds[0].title, 'Disque')
	assert.equal(await run(['--test'], ctx), 0)
	assert.match(lines.at(-1), NOT_SENT)
})
