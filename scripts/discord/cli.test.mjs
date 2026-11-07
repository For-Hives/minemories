import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { main, parseArgs, postChangelog, validArguments } from './cli.mjs'

const WEBHOOK = 'https://discord.com/api/webhooks/123456789/fakeToken_for-tests'
const BEFORE = 'a'.repeat(40)
const AFTER = 'b'.repeat(40)
const ZERO = '0'.repeat(40)
const record = subject => `${'c'.repeat(40)}\u001fp\u001f${subject}\u001e\n`
const response = (status, body = {}) => ({
	ok: status < 300,
	status,
	headers: { get: () => null },
	json: async () => body,
})

function harness({
	exec = () => record('feat: hello (#1)'),
	discord = [],
	env = { DISCORD_WEBHOOK_URL: WEBHOOK },
} = {}) {
	const out = []
	const warnings = []
	const calls = []
	const options = {
		env,
		exec,
		sleep: () => undefined,
		fetch: (url, init) => {
			calls.push({ url, init })
			return Promise.resolve(discord.shift())
		},
		out: text => out.push(text),
		warn: text => warnings.push(text),
	}
	return { options, out, warnings, calls }
}

test('parseArgs reads positionals, values and --dry-run', () => {
	assert.deepEqual(parseArgs(['changelog', 'push', '--before', 'x', '--dry-run', '--after', 'y']), {
		positionals: ['changelog', 'push'],
		flags: { before: 'x', dryRun: true, after: 'y' },
	})
})

test('validArguments checks SHAs and tags', () => {
	assert.equal(validArguments('push', { before: BEFORE, after: AFTER }), true)
	assert.equal(validArguments('push', { before: ZERO, after: AFTER }), true)
	assert.equal(validArguments('push', { before: '--exec=x', after: AFTER }), false)
	assert.equal(validArguments('release', { tag: 'mod-v1.0.0-beta.1' }), true)
	assert.equal(validArguments('release', { tag: 'v1' }), false)
	assert.equal(validArguments('other', {}), false)
})

test('changelog push posts one embed with no mentions', async () => {
	const h = harness({ discord: [response(204)] })
	const code = await main(['changelog', 'push', '--before', BEFORE, '--after', AFTER], h.options)
	assert.equal(code, 0)
	assert.equal(h.calls.length, 1)
	assert.equal(h.calls[0].url, WEBHOOK)
	const body = JSON.parse(h.calls[0].init.body)
	assert.deepEqual(body.allowed_mentions, { parse: [] })
	assert.equal(body.embeds.length, 1)
	assert.match(h.warnings.join('\n'), /posted/)
})

test('changelog push skips a new branch and a push with only release commits', async () => {
	const fresh = harness()
	assert.equal(await main(['changelog', 'push', '--before', ZERO, '--after', AFTER], fresh.options), 0)
	assert.equal(fresh.calls.length, 0)
	const release = harness({ exec: () => record('chore(release): 1.0.0 [skip ci]') })
	assert.equal(await main(['changelog', 'push', '--before', BEFORE, '--after', AFTER], release.options), 0)
	assert.equal(release.calls.length, 0)
	assert.match(release.warnings[0], /nothing to post/)
})

test('changelog never fails the workflow on Discord or git errors, and masks the webhook', async () => {
	const failing = harness({ discord: [response(400)] })
	assert.equal(await main(['changelog', 'push', '--before', BEFORE, '--after', AFTER], failing.options), 0)
	assert.match(failing.warnings.join('\n'), /abandoned \(HTTP 400\)/)
	const broken = harness({
		exec: () => {
			throw new Error(`bad revision ${WEBHOOK}`)
		},
	})
	assert.equal(await main(['changelog', 'push', '--before', BEFORE, '--after', AFTER], broken.options), 0)
	assert.ok(!broken.warnings.join('\n').includes('fakeToken'))
})

test('changelog release dry-run prints the payload and sends nothing', async () => {
	const h = harness({ exec: args => (args[0] === 'describe' ? 'mod-v1.0.0-beta.1' : record('fix(mod): crash')) })
	const code = await main(['changelog', 'release', '--tag', 'mod-v1.0.0-beta.2', '--dry-run'], h.options)
	assert.equal(code, 0)
	assert.equal(h.calls.length, 0)
	assert.equal(JSON.parse(h.out[0]).embeds[0].title, 'Minemories mod 1.0.0-beta.2 released')
})

test('changelog without a webhook sends nothing and succeeds', async () => {
	const h = harness({ env: {} })
	assert.equal(await postChangelog('push', { before: BEFORE, after: AFTER }, h.options), 0)
	assert.match(h.warnings[0], /not set/)
	assert.equal(h.calls.length, 0)
})

test('bad arguments print the usage and exit 2', async () => {
	for (const argv of [[], ['nope'], ['changelog', 'deploy'], ['changelog', 'release', '--tag', 'v1']]) {
		const h = harness()
		// biome-ignore lint/performance/noAwaitInLoops: each case is independent and cheap.
		assert.equal(await main(argv, h.options), 2)
		assert.match(h.warnings[0], /Usage/)
	}
})

test('roadmap dry-run goes through main', async () => {
	const h = harness({ env: {} })
	h.options.fetch = () => Promise.resolve(response(200, []))
	assert.equal(await main(['roadmap', '--dry-run'], h.options), 0)
	assert.equal(JSON.parse(h.out[0]).embeds.length, 3)
})

test('the CLI runs as a script and exits 2 on bad usage', () => {
	const script = fileURLToPath(new URL('./cli.mjs', import.meta.url))
	const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { PATH: process.env.PATH } })
	assert.equal(result.status, 2)
	assert.match(result.stderr, /Usage/)
	const dry = spawnSync(process.execPath, [script, 'changelog', 'push', '--before', ZERO, '--after', AFTER], {
		encoding: 'utf8',
		env: { PATH: process.env.PATH },
	})
	assert.equal(dry.status, 0)
	assert.equal(dry.stdout, '')
})
