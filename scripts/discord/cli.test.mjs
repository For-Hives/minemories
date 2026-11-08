import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { main, parseArgs, postChangelog, validArguments } from './cli.mjs'
import { releaseNotesUrl } from './release-info.mjs'

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
	text: async () => String(body),
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

const API = 'https://api.github.com/repos/For-Hives/minemories'
const GITHUB_ROUTES = {
	[`${API}/tags?per_page=100`]: [
		{ name: 'mod-v1.0.0-beta.2', commit: { sha: 'new' } },
		{ name: 'mod-v1.0.0-beta.1', commit: { sha: 'old' } },
	],
	[`${API}/commits/new`]: { sha: 'new', commit: { message: 'x', committer: { date: '2026-11-06T08:00:00Z' } } },
	[`${API}/commits/old`]: { sha: 'old', commit: { message: 'x', committer: { date: '2026-11-01T00:00:00Z' } } },
	[`${API}/commits?sha=new&path=mod&per_page=100`]: [
		{ sha: 'c', commit: { message: 'fix(mod): crash (#5)', committer: { date: '2026-11-05T00:00:00Z' } } },
	],
}

/** The harness, with GitHub answered from `routes` (raw notes included) and Discord from `discord`. */
function releaseHarness({ routes = GITHUB_ROUTES, discord = [], env = { DISCORD_WEBHOOK_URL: WEBHOOK } } = {}) {
	const h = harness({ env, discord })
	h.github = []
	h.options.fetch = (url, init = {}) => {
		if (!url.startsWith('https://discord.com/')) {
			h.github.push(url)
			return Promise.resolve(url in routes ? response(200, routes[url]) : response(404, 'Not Found'))
		}
		h.calls.push({ url, init })
		return Promise.resolve(discord.shift())
	}
	return h
}

test('changelog release dry-run prints the release card from GitHub and sends nothing', async () => {
	const h = releaseHarness()
	const code = await main(['changelog', 'release', '--tag', 'mod-v1.0.0-beta.2', '--dry-run'], h.options)
	assert.equal(code, 0)
	assert.equal(h.calls.length, 0)
	const [embed] = JSON.parse(h.out[0]).embeds
	assert.equal(embed.title, 'Minemories mod 1.0.0-beta.2')
	assert.ok(embed.description.includes('- **Fixed:** crash ([#5](https://github.com/For-Hives/minemories/pull/5))'))
	assert.ok(embed.description.includes('[Compare](https://github.com/For-Hives/minemories/compare/mod-v1.0.0-beta.1'))
	assert.ok(h.github.includes(releaseNotesUrl('1.0.0-beta.2')))
})

test('changelog release reads curated notes from GitHub, --notes-dir or DISCORD_RELEASE_NOTES_DIR', async () => {
	const remote = releaseHarness({
		routes: { ...GITHUB_ROUTES, [releaseNotesUrl('1.0.0-beta.2')]: '- New: remote note' },
	})
	await main(['changelog', 'release', '--tag', 'mod-v1.0.0-beta.2', '--dry-run'], remote.options)
	assert.ok(JSON.parse(remote.out[0]).embeds[0].description.includes('- **New:** remote note'))
	assert.ok(!remote.github.some(url => url.includes('path=mod')))

	const dir = await mkdtemp(join(tmpdir(), 'minemories-cli-notes-'))
	try {
		await writeFile(join(dir, '1.0.0-beta.2.md'), '- Changed: local note (#9)\n')
		const flag = releaseHarness()
		await main(['changelog', 'release', '--tag', 'mod-v1.0.0-beta.2', '--notes-dir', dir, '--dry-run'], flag.options)
		assert.ok(JSON.parse(flag.out[0]).embeds[0].description.includes('- **Changed:** local note'))
		assert.ok(!flag.github.includes(releaseNotesUrl('1.0.0-beta.2')))
		const fromEnv = releaseHarness({ env: { DISCORD_RELEASE_NOTES_DIR: dir } })
		await main(['changelog', 'release', '--tag', 'mod-v1.0.0-beta.2', '--dry-run'], fromEnv.options)
		assert.ok(JSON.parse(fromEnv.out[0]).embeds[0].description.includes('local note'))
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('changelog release posts the card, and skips or warns without failing the workflow', async () => {
	const posted = releaseHarness({ discord: [response(204)] })
	assert.equal(await main(['changelog', 'release', '--tag', 'mod-v1.0.0-beta.2'], posted.options), 0)
	assert.equal(posted.calls.length, 1)
	assert.equal(JSON.parse(posted.calls[0].init.body).embeds[0].title, 'Minemories mod 1.0.0-beta.2')
	assert.match(posted.warnings.at(-1), /posted/)

	const unknown = releaseHarness()
	assert.equal(await main(['changelog', 'release', '--tag', 'mod-v9.0.0', '--dry-run'], unknown.options), 0)
	assert.deepEqual(unknown.out, [])
	assert.match(unknown.warnings[0], /not a mod release tag listed on GitHub/)

	const env = { DISCORD_WEBHOOK_URL: WEBHOOK, GITHUB_TOKEN: 'ghs_secretvalue' }
	const down = releaseHarness({ env })
	down.options.fetch = () => Promise.reject(new Error(`network down ghs_secretvalue ${WEBHOOK}`))
	assert.equal(await main(['changelog', 'release', '--tag', 'mod-v1.0.0-beta.2'], down.options), 0)
	assert.equal(down.calls.length, 0)
	assert.ok(!down.warnings.join('\n').includes('ghs_secretvalue'))
	assert.ok(!down.warnings.join('\n').includes('fakeToken'))
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
	assert.equal(JSON.parse(h.out[0]).embeds.length, 2)
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
