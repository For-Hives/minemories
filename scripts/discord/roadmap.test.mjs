import assert from 'node:assert/strict'
import test from 'node:test'
import { embedSize, LIMITS, payloadSize } from './discord.mjs'
import {
	buildRoadmapPayload,
	COLUMN_CAP,
	classify,
	columnOf,
	DONE_WINDOW_MS,
	fetchRoadmapIssues,
	formatItem,
	syncRoadmap,
} from './roadmap.mjs'

const NOW = Date.parse('2026-11-07T12:00:00Z')
const WEBHOOK = 'https://discord.com/api/webhooks/123456789/fakeToken_for-tests'
const DAY = 24 * 60 * 60 * 1000
const iso = ms => new Date(ms).toISOString()
let counter = 0
const issue = (overrides = {}) => {
	counter += 1
	return {
		number: counter,
		title: `Issue ${counter}`,
		html_url: `https://github.com/For-Hives/minemories/issues/${counter}`,
		state: 'open',
		state_reason: null,
		labels: [{ name: 'roadmap' }],
		updated_at: iso(NOW - counter * 1000),
		closed_at: null,
		...overrides,
	}
}
const closed = (daysAgo, reason = 'completed', extra = {}) =>
	issue({ state: 'closed', state_reason: reason, closed_at: iso(NOW - daysAgo * DAY), ...extra })
const response = (status, body, headers = {}) => ({
	ok: status >= 200 && status < 300,
	status,
	headers: { get: name => headers[name.toLowerCase()] ?? null },
	json: async () => body,
})
const emptyColumns = {
	planned: { items: [], more: 0 },
	inProgress: { items: [], more: 0 },
	done: { items: [], more: 0 },
}

test('columnOf follows the shared spec', () => {
	assert.equal(columnOf(issue(), NOW), 'planned')
	assert.equal(columnOf(issue({ labels: ['roadmap', 'in-progress'] }), NOW), 'inProgress')
	assert.equal(columnOf(issue({ labels: [{ name: 'in-progress' }] }), NOW), null)
	assert.equal(columnOf(issue({ pull_request: { url: 'x' } }), NOW), null)
	assert.equal(columnOf(closed(1), NOW), 'done')
	assert.equal(columnOf(closed(1, null), NOW), 'done')
	assert.equal(columnOf(closed(1, 'not_planned'), NOW), null)
	assert.equal(columnOf(closed(1, 'duplicate'), NOW), null)
	assert.equal(columnOf(closed(31), NOW), null)
	assert.equal(columnOf(issue({ state: 'closed', closed_at: iso(NOW - DONE_WINDOW_MS) }), NOW), 'done')
	assert.equal(columnOf(issue({ state: 'closed', closed_at: iso(NOW - DONE_WINDOW_MS - 1) }), NOW), null)
	assert.equal(columnOf(issue({ state: 'closed', closed_at: null }), NOW), null)
	assert.equal(columnOf(issue({ state: 'weird' }), NOW), null)
	assert.equal(columnOf(issue({ labels: undefined }), NOW), null)
	assert.equal(columnOf(null, NOW), null)
	assert.equal(columnOf(issue({ state_reason: undefined, state: 'closed', closed_at: iso(NOW) })), 'done')
})

test('classify sorts, caps at 25 per column and maps items', () => {
	const planned = Array.from({ length: 30 }, () => issue({ labels: ['roadmap', 'front', 'mod', 'bug'] }))
	const old = issue({ updated_at: iso(NOW - 99 * DAY) })
	const recent = issue({ updated_at: iso(NOW + 1000) })
	const doneOld = closed(10)
	const doneNew = closed(2)
	const result = classify([...planned, old, recent, doneOld, doneNew, closed(1, 'not_planned')], NOW)
	assert.equal(result.planned.items.length, COLUMN_CAP)
	assert.equal(result.planned.more, 32 - COLUMN_CAP)
	assert.equal(result.planned.items[0].number, recent.number)
	assert.deepEqual(result.planned.items[1].areas, ['mod', 'front'])
	assert.deepEqual(
		result.done.items.map(item => item.number),
		[doneNew.number, doneOld.number]
	)
	assert.deepEqual(Object.keys(result.done.items[0]), ['number', 'title', 'url', 'areas', 'updatedAt', 'closedAt'])
	assert.equal(result.inProgress.more, 0)
	assert.deepEqual(classify(undefined, NOW), emptyColumns)
	const noDate = classify([issue({ updated_at: 'not a date' }), issue()], NOW)
	assert.equal(noDate.planned.items.at(-1).updatedAt, 'not a date')
	assert.equal(classify([issue({ title: undefined })], NOW).planned.items[0].title, '')
})

test('formatItem escapes titles and links the issue', () => {
	const line = formatItem({ number: 5, title: '@everyone [x](http://evil) **b**', areas: ['api'] })
	assert.ok(line.startsWith('[#5 @​everyone \\[x\\]\\(http://evil\\) \\*\\*b\\*\\*]('))
	assert.ok(line.endsWith('](https://github.com/For-Hives/minemories/issues/5) — api'))
	assert.equal(
		formatItem({ number: 6, title: 't', areas: [] }),
		'[#6 t](https://github.com/For-Hives/minemories/issues/6)'
	)
})

test('buildRoadmapPayload renders three embeds, empty columns and "+N more"', () => {
	const columns = classify(
		[issue({ labels: ['roadmap', 'in-progress'] }), ...Array.from({ length: 27 }, () => issue())],
		NOW
	)
	const payload = buildRoadmapPayload(columns, NOW)
	assert.deepEqual(payload.allowed_mentions, { parse: [] })
	assert.equal(payload.embeds.length, 3)
	assert.deepEqual(
		payload.embeds.map(embed => embed.title),
		['In progress (1)', 'Planned (27)', 'Done, last 30 days (0)']
	)
	assert.equal(payload.embeds[0].url, 'https://minemories.xenos.lightin.io/roadmap')
	assert.ok(payload.content.includes('https://minemories.xenos.lightin.io/roadmap'))
	assert.ok(payload.embeds[1].description.endsWith('+2 more'))
	assert.equal(payload.embeds[2].description, 'Nothing here right now.')
	assert.equal(payload.embeds[2].timestamp, iso(NOW))
})

test('buildRoadmapPayload fits 75 long titles into the 6000-character message limit', () => {
	const long = 'L'.repeat(256)
	const issues = [
		...Array.from({ length: 30 }, () =>
			issue({ title: long, labels: ['roadmap', 'in-progress', 'mod', 'api', 'front'] })
		),
		...Array.from({ length: 30 }, () => issue({ title: `**${long}**`, labels: ['roadmap', 'api'] })),
		...Array.from({ length: 30 }, () => closed(1, 'completed', { title: `@everyone ${long}` })),
	]
	const columns = classify(issues, NOW)
	const payload = buildRoadmapPayload(columns, NOW)
	assert.ok(payloadSize(payload) <= LIMITS.total, `size ${payloadSize(payload)}`)
	assert.ok(payload.embeds.length <= LIMITS.embeds)
	for (const [index, embed] of payload.embeds.entries()) {
		assert.ok(embed.description.length <= LIMITS.description)
		assert.ok(embed.title.length <= LIMITS.title)
		assert.ok(embedSize(embed) > 0)
		const shown = embed.description.split('\n').filter(line => line.startsWith('[#')).length
		const more = Number(/\+(\d+) more$/.exec(embed.description)[1])
		assert.equal(shown + more, 30, `column ${index}`)
	}
})

test('fetchRoadmapIssues follows Link pages and sends the token when present', async () => {
	const calls = []
	const pages = [
		response(200, [issue()], { link: '<https://api.github.com/next?page=2>; rel="next", <x>; rel="last"' }),
		response(200, [issue(), issue()]),
	]
	const fetchImpl = (url, init) => {
		calls.push({ url, init })
		return Promise.resolve(pages.shift())
	}
	const issues = await fetchRoadmapIssues({ fetchImpl, token: 'ghs_test' })
	assert.equal(issues.length, 3)
	assert.ok(calls[0].url.includes('labels=roadmap&state=all&per_page=100'))
	assert.equal(calls[1].url, 'https://api.github.com/next?page=2')
	assert.equal(calls[0].init.headers.authorization, 'Bearer ghs_test')
	await fetchRoadmapIssues({ fetchImpl: () => Promise.resolve(response(200, [])) })
	await assert.rejects(fetchRoadmapIssues({ fetchImpl: () => Promise.resolve(response(403, {})) }), /HTTP 403/)
	await assert.rejects(fetchRoadmapIssues({ fetchImpl: () => Promise.resolve(response(200, {})) }), /unexpected/)
})

/** A fetch that answers GitHub with `issues` and Discord with the queued responses. */
function fakeFetch(issues, discord) {
	const calls = []
	const fetchImpl = (url, init = {}) => {
		calls.push({ url, method: init.method ?? 'GET', body: init.body })
		if (url.startsWith('https://api.github.com/')) return Promise.resolve(response(200, issues))
		return Promise.resolve(discord.shift())
	}
	return { calls, fetchImpl }
}
const run = async (env, discord, extra = {}) => {
	const out = []
	const warnings = []
	const fake = fakeFetch([issue()], discord)
	const code = await syncRoadmap({
		env,
		fetch: fake.fetchImpl,
		sleep: () => undefined,
		now: NOW,
		out: text => out.push(text),
		warn: text => warnings.push(text),
		...extra,
	})
	return { code, out, warnings, calls: fake.calls.filter(call => !call.url.startsWith('https://api.github.com/')) }
}

test('syncRoadmap edits the existing message without a username', async () => {
	const result = await run({ DISCORD_WEBHOOK_URL: WEBHOOK, DISCORD_ROADMAP_MESSAGE_ID: '111' }, [response(200, {})])
	assert.equal(result.code, 0)
	assert.deepEqual(result.out, [])
	assert.equal(result.calls[0].method, 'PATCH')
	assert.equal(result.calls[0].url, `${WEBHOOK}/messages/111`)
	const body = JSON.parse(result.calls[0].body)
	assert.equal(body.username, undefined)
	assert.deepEqual(body.allowed_mentions, { parse: [] })
})

test('syncRoadmap posts a first message and prints only its id', async () => {
	const result = await run({ DISCORD_WEBHOOK_URL: WEBHOOK, DISCORD_ROADMAP_MESSAGE_ID: ' ' }, [
		response(200, { id: '222' }),
	])
	assert.equal(result.code, 0)
	assert.deepEqual(result.out, ['222'])
	assert.equal(result.calls[0].url, `${WEBHOOK}?wait=true`)
	const failed = await run({ DISCORD_WEBHOOK_URL: WEBHOOK }, [response(400, {})])
	assert.equal(failed.code, 1)
	assert.deepEqual(failed.out, [])
})

test('syncRoadmap reposts after a 404, prints the new id and fails visibly', async () => {
	const env = { DISCORD_WEBHOOK_URL: WEBHOOK, DISCORD_ROADMAP_MESSAGE_ID: '111', DISCORD_ROADMAP_ALLOW_REPOST: 'true' }
	const result = await run(env, [response(404, {}), response(200, { id: '333' })])
	assert.equal(result.code, 1)
	assert.deepEqual(result.out, ['333'])
	assert.deepEqual(
		result.calls.map(call => call.method),
		['PATCH', 'POST']
	)
	assert.match(result.warnings.join('\n'), /DISCORD_ROADMAP_MESSAGE_ID/)
	const lost = await run(env, [response(404, {}), response(403, {})])
	assert.equal(lost.code, 1)
	assert.deepEqual(lost.out, [])
})

test('syncRoadmap never reposts after a 404 on an automatic run', async () => {
	const result = await run({ DISCORD_WEBHOOK_URL: WEBHOOK, DISCORD_ROADMAP_MESSAGE_ID: '111' }, [response(404, {})])
	assert.equal(result.code, 1)
	assert.deepEqual(result.out, [])
	assert.deepEqual(
		result.calls.map(call => call.method),
		['PATCH']
	)
	assert.match(result.warnings.join('\n'), /run the workflow manually/)
})

test('syncRoadmap retries 5xx then reports failure without the webhook', async () => {
	const env = { DISCORD_WEBHOOK_URL: WEBHOOK, DISCORD_ROADMAP_MESSAGE_ID: '111' }
	const result = await run(env, [response(500), response(500), response(500), response(500)])
	assert.equal(result.code, 1)
	assert.equal(result.calls.length, 4)
	assert.ok(!result.warnings.join('\n').includes('fakeToken'))
})

test('syncRoadmap dry-run, missing webhook, bad id and GitHub failure', async () => {
	const dry = await run({ DISCORD_WEBHOOK_URL: WEBHOOK }, [], { dryRun: true })
	assert.equal(dry.code, 0)
	assert.equal(dry.calls.length, 0)
	assert.equal(JSON.parse(dry.out[0]).embeds.length, 3)
	const missing = await run({}, [])
	assert.equal(missing.code, 0)
	assert.match(missing.warnings[0], /not set/)
	const bad = await run({ DISCORD_WEBHOOK_URL: WEBHOOK, DISCORD_ROADMAP_MESSAGE_ID: 'abc' }, [])
	assert.equal(bad.code, 1)
	const warnings = []
	const code = await syncRoadmap({
		env: { DISCORD_WEBHOOK_URL: WEBHOOK, GITHUB_TOKEN: 'ghs_secretvalue' },
		fetch: () => Promise.reject(new Error(`boom ${WEBHOOK} ghs_secretvalue`)),
		warn: text => warnings.push(text),
		out: () => undefined,
	})
	assert.equal(code, 1)
	assert.ok(!warnings[0].includes('fakeToken'))
	assert.ok(!warnings[0].includes('ghs_secretvalue'))
})
