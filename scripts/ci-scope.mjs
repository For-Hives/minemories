import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

/**
 * Which gates of `.github/workflows/quality.yml` a change needs. A front-only change runs the web gate and nothing of the mod or the API; a mod-only change runs no web test.
 * Shared files (lockfile, Biome, the workflow itself) run everything, and so does every push to `main`.
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
	web: [
		/^apps\/web\//,
		/^packages\/api-contract\//,
		// The versions page reads the loader list.
		/^mod\/targets\.json$/,
		/^scripts\/(hero-assets\/|brand\/|boot-screen\/|build-web|prerender-web)/,
		// The brand tests read the canonical logo.
		/^design\/logo\//,
	],
	api: [
		/^apps\/api\//,
		/^packages\/mod-storage\//,
		/^packages\/api-contract\//,
		/^scripts\/(check-api-coverage|garage-integration)/,
		/^docker-compose\.yml$/,
	],
	mod: [/^mod\//, /^packages\/mod-storage\//, /^mod\/targets\.json$/, /^scripts\/(gradle|mod\/)/],
	// The Discord sync scripts reuse the redaction of `scripts/mod/notify.mjs`.
	discord: [/^scripts\/discord\//, /^scripts\/mod\/notify\.mjs$/, /^\.github\/workflows\/discord\.yml$/],
}
const dependencies = [
	/^package\.json$/,
	/^bun\.lock$/,
	/^apps\/[^/]+\/package\.json$/,
	/^packages\/[^/]+\/package\.json$/,
]

const matches = (patterns, file) => patterns.some(pattern => pattern.test(file))

export function scopeOf(files, { everything = false } = {}) {
	if (everything) return { web: true, api: true, mod: true, discord: true, deps: true }
	const everyGate = files.some(file => matches(shared, file))
	return {
		web: everyGate || files.some(file => matches(rules.web, file)),
		api: everyGate || files.some(file => matches(rules.api, file)),
		mod: everyGate || files.some(file => matches(rules.mod, file)),
		discord: everyGate || files.some(file => matches(rules.discord, file)),
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
