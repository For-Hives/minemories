// `bun mod storage <status|ls|prune|pin|unpin>`: state and retention of the mod JAR bucket.
import { pruneStorage, readIndex, setPinned, storageReport } from '../storage/index.mjs'

export const DEFAULT_WARN_BYTES = 5 * 1024 ** 3

export const name = 'storage'
export const summary = 'Space, retention and pinning of the JARs stored on S3'
export const usage = `bun mod storage status
bun mod storage ls
bun mod storage prune [--yes] [--keep N]   (dry run by default)
bun mod storage pin <id> <version>
bun mod storage unpin <id> <version>`

export const formatBytes = bytes => {
	if (bytes < 1024) return `${bytes} B`
	const units = ['KiB', 'MiB', 'GiB', 'TiB']
	let value = bytes
	let unit = -1
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024
		unit += 1
	}
	return `${value.toFixed(1)} ${units[unit]}`
}

function writer(log) {
	if (typeof log === 'function') return log
	if (typeof log?.info === 'function') return message => log.info(message)
	return message => console.log(message)
}

export function parsePruneArgs(args) {
	let keep = 3
	let yes = false
	for (let i = 0; i < args.length; i += 1) {
		if (args[i] === '--yes') yes = true
		else if (args[i] === '--keep') {
			i += 1
			keep = Number(args[i])
			if (!(Number.isInteger(keep) && keep >= 1)) throw new Error('--keep expects an integer >= 1.')
		} else throw new Error(`Unknown option: ${args[i]}`)
	}
	return { keep, yes }
}

async function status(out, env, client) {
	const report = await storageReport({ env, client })
	const threshold = Number(env.MOD_STORAGE_WARN_BYTES ?? DEFAULT_WARN_BYTES)
	for (const [id, target] of Object.entries(report.perTarget))
		out(`${id}  ${target.versions} version(s)  ${formatBytes(target.bytes)}  latest ${target.latest}`)
	out(`Total: ${formatBytes(report.totalBytes)}`)
	if (report.totalBytes > threshold) {
		out(`ALERT: storage exceeds ${formatBytes(threshold)} (MOD_STORAGE_WARN_BYTES). Run "bun mod storage prune".`)
		return 1
	}
	return 0
}

async function list(out, env, client) {
	const index = await readIndex({ env, client })
	for (const [id, target] of Object.entries(index.targets)) {
		out(`${id} (Minecraft ${target.minecraft}, ${target.loader} ${target.loaderVersion})`)
		for (const entry of target.versions) {
			const flags = [
				entry.version === target.latest ? 'latest' : '',
				entry.pinned ? 'pinned' : '',
				entry.published ? 'published' : '',
			].filter(Boolean)
			out(`  ${entry.version}  ${formatBytes(entry.bytes)}  ${entry.sha256.slice(0, 12)}  ${flags.join(',')}`)
		}
	}
	return 0
}

async function prune(args, out, env, client) {
	const { keep, yes } = parsePruneArgs(args)
	const result = await pruneStorage({ keep, dryRun: !yes, env, client })
	for (const item of result.deleted) out(`${yes ? 'deleted' : 'to delete'}  ${item.key}  ${formatBytes(item.bytes)}`)
	out(`${result.kept.length} version(s) kept, ${formatBytes(result.freedBytes)} ${yes ? 'freed' : 'can be freed'}.`)
	if (!yes && result.deleted.length > 0) out('Dry run: run again with --yes to delete.')
	return 0
}

async function pin(args, pinned, out, env, client) {
	const [targetId, version] = args
	if (!(targetId && version)) throw new Error(`Usage: bun mod storage ${pinned ? 'pin' : 'unpin'} <id> <version>`)
	await setPinned({ targetId, version, pinned, env, client })
	out(`${targetId} ${version} ${pinned ? 'pinned' : 'unpinned'}.`)
	return 0
}

function dispatch(args, ctx) {
	const out = writer(ctx.log)
	const env = ctx.env ?? process.env
	const [subcommand = 'status', ...rest] = args
	const client = ctx.storageClient
	switch (subcommand) {
		case 'status':
			return status(out, env, client)
		case 'ls':
			return list(out, env, client)
		case 'prune':
			return prune(rest, out, env, client)
		case 'pin':
			return pin(rest, true, out, env, client)
		case 'unpin':
			return pin(rest, false, out, env, client)
		default:
			throw new Error(`Unknown subcommand: ${subcommand}\n${usage}`)
	}
}

export function run(args, ctx) {
	return Promise.resolve().then(() => dispatch(args, ctx))
}

export default { name, summary, usage, run }
