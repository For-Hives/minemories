import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
	appShellMarker,
	checkResponse,
	classifyLocation,
	expectations,
	firstAssetPath,
	hopFailures,
	locationTarget,
	parseArguments,
	runSmoke,
} from './smoke-web.mjs'

const base = 'https://example.org'
const blocked = { 'x-robots-tag': 'noindex, nofollow' }
const find = path => expectations.find(expectation => expectation.path === path)
const lockedHome = '<meta name="robots" content="noindex,nofollow" /><main>Home</main>'
const openHome = '<meta name="robots" content="index,follow" /><main>Home</main>'
const htmlHeaders = { 'cache-control': 'no-cache' }

test('redirects must stay on the requesting host', () => {
	assert.equal(classifyLocation(undefined, base), 'none')
	assert.equal(classifyLocation('/concept?a=b', base), 'relative')
	assert.equal(classifyLocation('https://example.org/concept', base), 'same-origin')
	assert.equal(classifyLocation('http://example.org/concept', base), 'foreign')
	assert.equal(classifyLocation('//evil.example/', base), 'foreign')
	assert.equal(classifyLocation('/\\evil.example', base), 'foreign')
	assert.equal(classifyLocation('not a url', base), 'foreign')
	assert.equal(locationTarget('https://example.org/concept?x=1', base), '/concept?x=1')
	assert.equal(locationTarget('/installation', base), '/installation')
})

test('pre-launch: every public response must carry noindex, private routes and 404s always', () => {
	const home = find('/')
	const page = { status: 200, headers: { ...blocked, ...htmlHeaders }, body: lockedHome }
	assert.deepEqual(checkResponse(home, page, { base }), [])
	assert.deepEqual(checkResponse(home, { ...page, headers: htmlHeaders }, { base }), [
		'pre-launch public response without X-Robots-Tag noindex',
	])
	assert.deepEqual(
		checkResponse(find('/nope-xyz'), { status: 404, headers: {}, body: '' }, { base, indexable: true }),
		['missing X-Robots-Tag noindex on a private or 404 response']
	)
})

test('after launch: public pages must not be blocked, private ones still are', () => {
	const home = find('/')
	const page = { status: 200, headers: htmlHeaders, body: openHome }
	assert.deepEqual(checkResponse(home, page, { base, indexable: true }), [])
	assert.deepEqual(
		checkResponse(home, { ...page, headers: { ...blocked, ...htmlHeaders } }, { base, indexable: true }),
		['public response still sends X-Robots-Tag: noindex, nofollow']
	)
	const gallery = find('/gallery')
	assert.deepEqual(
		checkResponse(gallery, { status: 200, headers: blocked, body: appShellMarker }, { base, indexable: true }),
		[]
	)
})

test('private routes serve the app shell, public pages never do', () => {
	assert.deepEqual(
		checkResponse(find('/gallery'), { status: 200, headers: blocked, body: '<h1>Home</h1>' }, { base }),
		['body is not the app.html shell']
	)
	assert.deepEqual(
		checkResponse(find('/installation'), { status: 200, headers: blocked, body: appShellMarker }, { base }),
		['body is the app.html shell instead of the prerendered page']
	)
})

test('status, Location, Cache-Control and Content-Type are compared with the expectation', () => {
	const slash = find('/installation/')
	assert.deepEqual(
		checkResponse(slash, { status: 301, headers: { location: '/installation' }, body: '' }, { base }),
		[]
	)
	assert.deepEqual(
		checkResponse(
			slash,
			{ status: 301, headers: { location: 'https://example.org/installation' }, body: '' },
			{ base }
		),
		[]
	)
	assert.deepEqual(checkResponse(slash, { status: 200, headers: {}, body: '' }, { base }), [
		'expected status 301, got 200',
		'expected Location /installation, got none',
	])
	assert.deepEqual(checkResponse(slash, { status: 301, headers: { location: '/installation/' }, body: '' }, { base }), [
		'expected Location /installation, got /installation/',
	])
	assert.deepEqual(
		checkResponse(
			find('//evil.example/'),
			{ status: 301, headers: { location: '//evil.example' }, body: '' },
			{ base }
		),
		['redirect leaves the host: //evil.example']
	)
	const og = find('/brand/og-image.png')
	assert.deepEqual(checkResponse(og, { status: 200, headers: blocked, body: '' }, { base }), [
		'unexpected Cache-Control: none',
		'unexpected Content-Type: none',
	])
	const ok = { ...blocked, 'cache-control': 'public, max-age=86400', 'content-type': 'image/png' }
	assert.deepEqual(checkResponse(og, { status: 200, headers: ok, body: '' }, { base }), [])
})

test('a retired URL goes to its final page in one hop', () => {
	assert.deepEqual(hopFailures({ status: 200 }), [])
	assert.deepEqual(hopFailures({ status: 301 }), ['redirect target answers 301, not 200 (redirect chain or dead page)'])
	assert.deepEqual(hopFailures({ status: 404 }), ['redirect target answers 404, not 200 (redirect chain or dead page)'])
	for (const path of ['/discover', '/nostalgia', '/open-source', '/ranking?demo=1', '/changelog', '/blog/premier-souvenir'])
		assert.equal(find(path)?.status, 301, path)
})

test('runSmoke follows each expected redirect once and fails when its target redirects again', async () => {
	const fakeFetch = async url => {
		if (url === `${base}/changelog`) return new Response('', { status: 301, headers: { location: '/versions', ...blocked } })
		if (url === `${base}/versions`) return new Response('', { status: 301, headers: { location: '/elsewhere' } })
		return new Response('<script src="/assets/app-1.js"></script>', { status: 200, headers: blocked })
	}
	const results = await runSmoke({ base, indexable: false }, fakeFetch)
	const changelog = results.find(result => result.path === '/changelog')
	assert.deepEqual(changelog?.failures, ['redirect target answers 301, not 200 (redirect chain or dead page)'])
})

test('arguments: a base URL is required and reduced to its origin', () => {
	assert.deepEqual(parseArguments(['https://example.org/some/path']), { base, indexable: false })
	assert.deepEqual(parseArguments(['--indexable', 'http://127.0.0.1:8080']), {
		base: 'http://127.0.0.1:8080',
		indexable: true,
	})
	assert.throws(() => parseArguments([]), /usage/)
	assert.throws(() => parseArguments(['ftp://example.org']), /not an http/)
})

test('runSmoke checks every expectation plus a hashed asset found in the home page', async () => {
	assert.equal(firstAssetPath('<script src="/assets/index-Ab_1.js"></script>'), '/assets/index-Ab_1.js')
	assert.equal(firstAssetPath('<p>none</p>'), undefined)
	const requested = []
	const fakeFetch = async (url, init) => {
		requested.push(url)
		assert.equal(init.redirect, 'manual')
		return new Response('<script src="/assets/app-1.js"></script>', { status: 200, headers: blocked })
	}
	const results = await runSmoke({ base, indexable: false }, fakeFetch)
	assert.equal(results.length, expectations.length + 1)
	assert.ok(requested.includes(`${base}//evil.example/`), 'raw paths are sent as is')
	assert.deepEqual(results.at(-1), {
		path: '/assets/app-1.js',
		status: 200,
		failures: ['unexpected Cache-Control: none'],
	})
	const empty = await runSmoke({ base, indexable: false }, async () => new Response('', { status: 200 }))
	assert.deepEqual(empty[0].failures, ['no /assets/*.js script found in the home page'])
	assert.equal(empty.length, expectations.length + 1)
})

test('the build locks (robots.txt, meta robots) must follow the same switch as the header', () => {
	const robots = find('/robots.txt')
	const txt = { 'content-type': 'text/plain' }
	const closed = { status: 200, headers: txt, body: 'User-agent: *\nDisallow: /\n' }
	const open = { status: 200, headers: txt, body: 'User-agent: *\nAllow: /\nDisallow: /gallery\nDisallow: /share/\n' }
	assert.deepEqual(checkResponse(robots, closed, { base }), [])
	assert.deepEqual(checkResponse(robots, open, { base }), ['pre-launch robots.txt without "Disallow: /"'])
	assert.deepEqual(checkResponse(robots, open, { base, indexable: true }), [])
	assert.deepEqual(checkResponse(robots, closed, { base, indexable: true }), [
		'robots.txt still disallows everything (build made without VITE_INDEXABLE=true)',
	])
	const home = find('/')
	const headers = { ...blocked, ...htmlHeaders }
	assert.deepEqual(checkResponse(home, { status: 200, headers, body: openHome }, { base }), [
		'pre-launch page with meta robots index,follow',
	])
	assert.deepEqual(checkResponse(home, { status: 200, headers, body: '<main>Home</main>' }, { base }), [
		'pre-launch page with meta robots none',
	])
	assert.deepEqual(
		checkResponse(home, { status: 200, headers: htmlHeaders, body: lockedHome }, { base, indexable: true }),
		['meta robots still noindex,nofollow (build made without VITE_INDEXABLE=true)']
	)
})

test('the private routes are the same in nginx (shell + noindex), the indexable robots.txt and the smoke checks', () => {
	const config = readFileSync(new URL('../deploy/nginx.web.conf', import.meta.url), 'utf8')
	const alternations = [...config.matchAll(/\^\/\(([a-z|]+)\)\(\/\|\$\)/g)].map(match => match[1].split('|').sort())
	assert.equal(alternations.length, 2, 'the location regex and the $mm_robots regex')
	const prerender = readFileSync(new URL('./prerender-web.mjs', import.meta.url), 'utf8')
	const disallowed = [...prerender.matchAll(/Disallow: \/([a-z]+)\/?\\n/g)].map(match => match[1]).sort()
	assert.deepEqual(alternations[0], disallowed)
	assert.deepEqual(alternations[1], disallowed)
	const smoked = new Set(
		expectations.filter(expectation => expectation.appShell).map(expectation => expectation.path.split('/')[1])
	)
	assert.deepEqual([...smoked].sort(), disallowed)
})
