import { fileURLToPath } from 'node:url'

/**
 * Post-deployment smoke test of the static front end served by `deploy/nginx.web.conf`.
 * Usage: `node scripts/smoke-web.mjs <base URL> [--indexable]`. Without `--indexable` (pre-launch), every response must
 * carry `X-Robots-Tag: noindex`; with it, public pages must not, while private routes and 404s still must. The two other
 * indexing locks of the build are checked the same way: `robots.txt` (`Disallow: /`) and the home page's meta robots.
 */

export const appShellMarker = '<div id="app"></div>'
const noindexPattern = /noindex/i
const assetScriptPattern = /\/assets\/[\w.-]+\.js/
const immutablePattern = /immutable/
const disallowAllPattern = /^Disallow: \/\s*$/m
const metaRobotsPattern = /<meta name="robots" content="([^"]*)"/

/**
 * `robots`: 'private' = always noindex, 'public' = follows the indexing switch, 'any' = not checked.
 * `lock`: 'robots.txt' or 'meta' = this body carries one of the build's indexing locks, which must follow the switch too.
 */
export const expectations = [
	{ path: '/', status: 200, robots: 'public', notAppShell: true, cache: /no-cache/, lock: 'meta' },
	{ path: '/installation', status: 200, robots: 'public', notAppShell: true },
	{ path: '/concept', status: 200, robots: 'public', notAppShell: true },
	{ path: '/sharing', status: 200, robots: 'public', notAppShell: true },
	{ path: '/server-closing', status: 200, robots: 'public', notAppShell: true },
	{ path: '/safety', status: 200, robots: 'public', notAppShell: true },
	{ path: '/guides/minecraft-blender', status: 200, robots: 'public', notAppShell: true },
	{ path: '/explore', status: 200, robots: 'public', notAppShell: true },
	{ path: '/how-it-works', status: 200, robots: 'public', notAppShell: true },
	{ path: '/versions', status: 200, robots: 'public', notAppShell: true },
	{ path: '/downloads', status: 200, robots: 'public', notAppShell: true },
	{ path: '/legal', status: 200, robots: 'public', notAppShell: true },
	{ path: '/installation/', status: 301, location: '/installation', robots: 'any' },
	{ path: '/concept/?a=b', status: 301, location: '/concept?a=b', robots: 'any' },
	{ path: '/index.html', status: 301, location: '/', robots: 'any' },
	{ path: '/concept/index.html', status: 301, location: '/concept', robots: 'any' },
	// Retired pages and former French slugs (apps/web/src/content/legacy-paths.ts): one hop to the final page, query kept.
	{ path: '/discover', status: 301, location: '/concept', robots: 'any' },
	{ path: '/decouvrir?x=1', status: 301, location: '/concept?x=1', robots: 'any' },
	{ path: '/nostalgia', status: 301, location: '/concept', robots: 'any' },
	{ path: '/nostalgie/', status: 301, location: '/concept', robots: 'any' },
	{ path: '/open-source', status: 301, location: '/legal', robots: 'any' },
	{ path: '/ranking?demo=1', status: 301, location: '/explore?demo=1', robots: 'any' },
	{ path: '/classement', status: 301, location: '/explore', robots: 'any' },
	{ path: '/explorer', status: 301, location: '/explore', robots: 'any' },
	{ path: '/changelog', status: 301, location: '/versions', robots: 'any' },
	{ path: '/blog', status: 301, location: '/how-it-works', robots: 'any' },
	{ path: '/blog/premier-souvenir', status: 301, location: '/how-it-works', robots: 'any' },
	{ path: '/fonctionnement', status: 301, location: '/how-it-works', robots: 'any' },
	{ path: '/partager', status: 301, location: '/sharing', robots: 'any' },
	{ path: '/telechargements', status: 301, location: '/downloads', robots: 'any' },
	{ path: '/gallery', status: 200, robots: 'private', appShell: true },
	{ path: '/gallery/abc', status: 200, robots: 'private', appShell: true },
	{ path: '/public/abc', status: 200, robots: 'private', appShell: true },
	{ path: '/share/abc', status: 200, robots: 'private', appShell: true },
	{ path: '/login', status: 200, robots: 'private', appShell: true },
	{ path: '/register', status: 200, robots: 'private', appShell: true },
	{ path: '/account', status: 200, robots: 'private', appShell: true },
	{ path: '/viewer', status: 200, robots: 'private', appShell: true },
	{ path: '/moderation', status: 200, robots: 'private', appShell: true },
	{ path: '/admin/users', status: 200, robots: 'private', appShell: true },
	{ path: '/nope-xyz', status: 404, robots: 'private' },
	{ path: '/CONCEPT', status: 404, robots: 'private' },
	{ path: '/app.html', status: 404, robots: 'private' },
	{ path: '/brand/og-image.png', status: 200, robots: 'public', cache: /max-age=/, contentType: /^image\/png/ },
	{ path: '/favicon.svg', status: 200, robots: 'public', cache: /max-age=/, contentType: /^image\/svg\+xml/ },
	{ path: '/hero/posters/poster-phone.jpg', status: 200, robots: 'public', cache: /max-age=/ },
	{ path: '/hero/clips/walk.mp4', status: 200, robots: 'public', cache: /max-age=/, contentType: /^video\/mp4/ },
	{ path: '/textures/minecraft-clouds.png', status: 200, robots: 'public', cache: /max-age=/ },
	{ path: '/site.webmanifest', status: 200, robots: 'public', contentType: /^application\/manifest\+json/ },
	{ path: '/robots.txt', status: 200, robots: 'any', contentType: /^text\/plain/, lock: 'robots.txt' },
	{ path: '/sitemap.xml', status: 200, robots: 'any' },
	{ path: '//evil.example/', status: 'any', robots: 'any', sameOrigin: true },
	{ path: '/%5Cevil.example/', status: 'any', robots: 'any', sameOrigin: true },
]

/** A redirect must stay on the same host: a relative path, or an absolute URL with the same origin. */
export function classifyLocation(location, base) {
	if (!location) return 'none'
	if (location.startsWith('//') || location.startsWith('/\\')) return 'foreign'
	if (location.startsWith('/')) return 'relative'
	try {
		return new URL(location).origin === new URL(base).origin ? 'same-origin' : 'foreign'
	} catch {
		return 'foreign'
	}
}

/** Path + query of a Location, resolved against the base (for comparison with the expected target). */
export function locationTarget(location, base) {
	const url = new URL(location, base)
	return `${url.pathname}${url.search}`
}

function robotsFailures(expectation, robotsHeader, indexable) {
	const blocked = noindexPattern.test(robotsHeader ?? '')
	if (expectation.robots === 'private' && !blocked) return ['missing X-Robots-Tag noindex on a private or 404 response']
	if (expectation.robots !== 'public') return []
	if (indexable && blocked) return [`public response still sends X-Robots-Tag: ${robotsHeader}`]
	if (!(indexable || blocked)) return ['pre-launch public response without X-Robots-Tag noindex']
	return []
}

function locationFailures(expectation, response, base) {
	const location = response.headers.location
	const kind = classifyLocation(location, base)
	if (kind === 'foreign') return [`redirect leaves the host: ${location}`]
	if (expectation.location === undefined) return []
	if (kind === 'none') return [`expected Location ${expectation.location}, got none`]
	const target = locationTarget(location, base)
	return target === expectation.location ? [] : [`expected Location ${expectation.location}, got ${location}`]
}

function bodyFailures(expectation, response) {
	const failures = []
	const isShell = response.body.includes(appShellMarker)
	if (expectation.appShell && !isShell) failures.push('body is not the app.html shell')
	if (expectation.notAppShell && isShell) failures.push('body is the app.html shell instead of the prerendered page')
	return failures
}

function lockFailures(expectation, response, indexable) {
	if (expectation.lock === 'robots.txt') {
		const blocked = disallowAllPattern.test(response.body)
		if (indexable && blocked) return ['robots.txt still disallows everything (build made without VITE_INDEXABLE=true)']
		if (!(indexable || blocked)) return ['pre-launch robots.txt without "Disallow: /"']
	}
	if (expectation.lock === 'meta') {
		const content = response.body.match(metaRobotsPattern)?.[1] ?? 'none'
		const blocked = noindexPattern.test(content)
		if (indexable && blocked) return [`meta robots still ${content} (build made without VITE_INDEXABLE=true)`]
		if (!(indexable || blocked)) return [`pre-launch page with meta robots ${content}`]
	}
	return []
}

function headerFailures(expectation, response) {
	const failures = []
	const { 'cache-control': cache = '', 'content-type': contentType = '' } = response.headers
	if (expectation.cache && !expectation.cache.test(cache)) failures.push(`unexpected Cache-Control: ${cache || 'none'}`)
	if (expectation.contentType && !expectation.contentType.test(contentType))
		failures.push(`unexpected Content-Type: ${contentType || 'none'}`)
	return failures
}

/**
 * Failures of one response against its expectation. `response` = { status, headers (lower-case names), body }.
 */
export function checkResponse(expectation, response, { base, indexable = false }) {
	const failures = []
	if (expectation.status !== 'any' && response.status !== expectation.status)
		failures.push(`expected status ${expectation.status}, got ${response.status}`)
	return [
		...failures,
		...locationFailures(expectation, response, base),
		...robotsFailures(expectation, response.headers['x-robots-tag'], indexable),
		...headerFailures(expectation, response),
		...bodyFailures(expectation, response),
		...lockFailures(expectation, response, indexable),
	]
}

/** The response at the end of a redirect: anything but a 200 page means a chain or a dead target. */
export function hopFailures(target) {
	return target.status === 200
		? []
		: [`redirect target answers ${target.status}, not 200 (redirect chain or dead page)`]
}

/** The first hashed script referenced by the home page, to check the immutable cache of /assets/. */
export function firstAssetPath(html) {
	return html.match(assetScriptPattern)?.[0]
}

export function parseArguments(argv) {
	const indexable = argv.includes('--indexable')
	const base = argv.find(argument => !argument.startsWith('--'))
	if (!base) throw new Error('usage: node scripts/smoke-web.mjs <base URL> [--indexable]')
	const url = new URL(base)
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`not an http(s) URL: ${base}`)
	return { base: url.origin, indexable }
}

async function request(base, path, fetchImpl) {
	// A raw path ("//evil.example/") must reach the server as is: build the URL by concatenation, not new URL(path, base).
	const response = await fetchImpl(`${base}${path}`, { redirect: 'manual' })
	const headers = Object.fromEntries([...response.headers].map(([name, value]) => [name.toLowerCase(), value]))
	return { status: response.status, headers, body: await response.text() }
}

export async function runSmoke({ base, indexable }, fetchImpl = fetch) {
	const home = await request(base, '/', fetchImpl)
	const asset = firstAssetPath(home.body)
	const results = asset
		? []
		: [{ path: '/', status: home.status, failures: ['no /assets/*.js script found in the home page'] }]
	const list = asset
		? [...expectations, { path: asset, status: 200, robots: 'public', cache: immutablePattern }]
		: expectations
	const checked = await Promise.all(
		list.map(async expectation => {
			const response = await request(base, expectation.path, fetchImpl)
			const failures = checkResponse(expectation, response, { base, indexable })
			// One hop only: the page a redirect names must answer itself, not redirect again.
			if (expectation.status === 301 && expectation.location && !failures.length) {
				const target = await request(base, expectation.location, fetchImpl)
				failures.push(...hopFailures(target))
			}
			return { path: expectation.path, status: response.status, failures }
		})
	)
	return [...results, ...checked]
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const options = parseArguments(process.argv.slice(2))
	const results = await runSmoke(options)
	for (const { path, status, failures } of results)
		console.log(
			`${failures.length ? 'FAIL' : 'ok  '} ${status} ${path}${failures.length ? ` — ${failures.join('; ')}` : ''}`
		)
	const failed = results.filter(result => result.failures.length).length
	console.log(
		`${results.length - failed}/${results.length} checks passed (${options.indexable ? 'indexable' : 'pre-launch'} mode).`
	)
	process.exitCode = failed ? 1 : 0
}
