import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

/**
 * Which gates of `.github/workflows/quality.yml` a change needs. A front-only change runs the web gate and nothing of the mod or the API; a mod-only change runs no web test.
 * Shared files (lockfile, Biome, the workflow itself) run everything, and so does every push to `main` (the automatic release waits for the whole workflow).
 */
const shared = [
	/^package\.json$/,
	/^bun\.lock$/,
	/^biome\.json$/,
	/^\.bun-version$/,
	/^\.github\/(actions\/|workflows\/quality\.yml$)/,
	/^scripts\/ci-scope/,
]
const rules = {
	web: [/^apps\/web\//, /^packages\/api-contract\//, /^scripts\/(hero-assets\/|build-web|prerender-web)/],
	api: [
		/^apps\/api\//,
		/^packages\/api-contract\//,
		/^scripts\/(check-api-coverage|garage-integration)/,
		/^docker-compose\.yml$/,
	],
	mod: [
		/^mod\//,
		/^config\/mod-targets\.json$/,
		/^\.github\/workflows\/(automatic-release|mod-release)\.yml$/,
		/^scripts\/(gradle|package-mod|verify-mod|release-|sync-release|build-release|collect-release|download-release|plan-release|prepare-release|publish-release)/,
	],
}
const dependencies = [
	/^package\.json$/,
	/^bun\.lock$/,
	/^apps\/[^/]+\/package\.json$/,
	/^packages\/[^/]+\/package\.json$/,
]

const matches = (patterns, file) => patterns.some(pattern => pattern.test(file))

export function scopeOf(files, { everything = false } = {}) {
	if (everything) return { web: true, api: true, mod: true, deps: true }
	const everyGate = files.some(file => matches(shared, file))
	return {
		web: everyGate || files.some(file => matches(rules.web, file)),
		api: everyGate || files.some(file => matches(rules.api, file)),
		mod: everyGate || files.some(file => matches(rules.mod, file)),
		deps: files.some(file => matches(dependencies, file)),
	}
}

if (process.argv[1]?.endsWith('ci-scope.mjs')) {
	const { GITHUB_EVENT_NAME: event, BASE_SHA: base, GITHUB_OUTPUT: output } = process.env
	const everything = event !== 'pull_request' || !base
	let files = []
	if (!everything) {
		const diff = spawnSync('git', ['diff', '--name-only', base, 'HEAD'], { encoding: 'utf8' })
		if (diff.status !== 0) throw new Error(diff.stderr)
		files = diff.stdout.split('\n').filter(Boolean)
	}
	const scope = scopeOf(files, { everything })
	for (const [name, value] of Object.entries(scope)) {
		console.log(`${name}=${value}`)
		if (output) appendFileSync(output, `${name}=${value}\n`)
	}
	console.log(everything ? 'push or unknown base: every gate runs' : `${files.length} changed files`)
}
