import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { publishThirdParty } from '../publish/index.mjs'

export const name = 'publish'
export const summary =
	'Publie la release sur Modrinth et CurseForge (ignoré tant que les comptes ne sont pas configurés)'
export const usage = 'bun mod publish [--version X] [--dry-run]'

function option(args, flag) {
	const index = args.indexOf(flag)
	return index >= 0 ? args[index + 1] : undefined
}

async function directories(path) {
	try {
		return (await readdir(path, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name)
	} catch {
		return []
	}
}

/** Latest local build version: the most recently written folder of build/mod-dist. */
export async function latestVersion(root) {
	const dist = join(root, 'build', 'mod-dist')
	const versions = await directories(dist)
	const dated = await Promise.all(
		versions.map(async version => ({ version, time: (await stat(join(dist, version))).mtimeMs }))
	)
	return dated.toSorted((a, b) => b.time - a.time)[0]?.version ?? null
}

async function readJson(path) {
	try {
		return JSON.parse(await readFile(path, 'utf8'))
	} catch {
		return null
	}
}

/** Artifacts of build/mod-dist/<version>/<id>/ : the first .jar of each folder, with the manifest's digest if any. */
export async function collectArtifacts(root, version) {
	const base = join(root, 'build', 'mod-dist', version)
	const artifacts = []
	for (const targetId of await directories(base)) {
		// biome-ignore lint/performance/noAwaitInLoops: a handful of small folders.
		const files = await readdir(join(base, targetId))
		const jar = files.filter(file => file.endsWith('.jar') && !file.endsWith('-sources.jar')).sort()[0]
		if (!jar) continue
		const filePath = join(base, targetId, jar)
		const manifest = await readJson(join(base, targetId, 'manifest.json'))
		artifacts.push({ targetId, filePath, bytes: (await stat(filePath)).size, sha256: manifest?.sha256 })
	}
	return artifacts
}

export async function run(args, ctx) {
	const version = option(args, '--version') ?? (await latestVersion(ctx.root))
	if (!version) {
		ctx.log('Aucun build local dans build/mod-dist : lancer `bun mod build` ou passer --version.')
		return 1
	}
	const artifacts = await collectArtifacts(ctx.root, version)
	if (artifacts.length === 0) {
		ctx.log(`Aucun JAR dans build/mod-dist/${version}/<id>/.`)
		return 1
	}
	const dryRun = args.includes('--dry-run')
	const release = { version, commit: option(args, '--commit'), changelog: option(args, '--changelog') ?? '', artifacts }
	const results = await publishThirdParty({ config: ctx.config, release, env: ctx.env, dryRun })
	for (const result of results) {
		ctx.log(`${result.platform} ${result.targetId} : ${result.status}${result.message ? ` — ${result.message}` : ''}`)
		if (result.request) ctx.log(result.request)
	}
	return results.some(result => result.status === 'failed') ? 1 : 0
}
