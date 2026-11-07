import { parseArgs } from '../args.mjs'
import { buildTargets, summarize, targetState } from '../build.mjs'
import { enabledTargets, selectTargets } from '../config.mjs'
import { readModVersion } from '../version.mjs'

export const name = 'build'
export const summary = 'Builds targets (JAR, .sha256 and manifest in build/mod-dist/<version>/<id>/)'
export const usage =
	'bun mod build [<loader> <minecraft> | <id>…] [--all] [--missing] [--dev] [--verbose] [--no-jdk-download] [--loader-version <v>]\n' +
	'  --all      every enabled target           --missing  those without an up-to-date build\n' +
	'  --dev      development build (-Pminemories.prod=false), prod by default'

async function missingTargets(config, root, version) {
	const missing = []
	for (const target of enabledTargets(config))
		if ((await targetState(root, target, version)).state !== 'current') missing.push(target)
	return missing
}

export async function run(args, { config, env, log, root }) {
	const { positionals, flags } = parseArgs(args, ['loader-version'])
	const version = await readModVersion(root)
	let targets
	if (flags.missing) targets = await missingTargets(config, root, version)
	else targets = selectTargets(config, positionals, { all: Boolean(flags.all) })
	if (flags.missing && targets.length === 0) {
		log.info('Everything is already built for the current version.')
		return 0
	}
	if (targets.length === 0) throw new Error(`No target. Usage: ${usage.split('\n')[0]}`)
	const results = await buildTargets(targets, {
		root,
		env,
		log,
		version,
		prod: !flags.dev,
		verbose: Boolean(flags.verbose) || targets.length === 1,
		downloadJdk: !flags['no-jdk-download'],
		loaderVersion: flags['loader-version'],
	})
	log.info(`\nMod ${version}${flags.dev ? ' (dev)' : ''}\n${summarize(results)}`)
	for (const failed of results.filter(r => r.status === 'failed' && r.logTail && targets.length > 1))
		log.error(
			`\n--- ${failed.targetId}: end of the Gradle log ---\n${failed.logTail.split('\n').slice(-25).join('\n')}`
		)
	return results.some(r => r.status === 'failed') ? 1 : 0
}
