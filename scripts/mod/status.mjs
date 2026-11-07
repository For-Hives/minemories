// `bun mod status`: Minecraft x loader grid with the local build state and, when available, what the storage holds.
import { stripVTControlCharacters } from 'node:util'
import { formatBytes, targetState } from './build.mjs'
import { compareVersions, isBuildable } from './config.mjs'

const ansi = { current: '32', stale: '33', todo: '31', planned: '36', none: '2', head: '1' }
const marks = { current: '✓', stale: '⚠', todo: '✗', planned: '○' }

/** One entry per (loader, Minecraft) pair: local state, loader version and optional storage figures. */
export async function collectCells(config, root, version, storage = null) {
	const cells = new Map()
	for (const target of config.targets) {
		if (!isBuildable(target)) continue
		const { state } = await targetState(root, target, version)
		const stored = storage?.perTarget?.[target.id]
		cells.set(`${target.loader}|${target.minecraft}`, {
			id: target.id,
			state: state === 'missing' ? 'todo' : state,
			loaderVersion: target.loaderVersion,
			enabled: target.enabled,
			stored,
		})
	}
	for (const item of config.planned)
		cells.set(`${item.loader}|${item.minecraft}`, { id: item.id, state: 'planned', loaderVersion: item.loaderVersion })
	return cells
}

function describe(cell, paint) {
	const base = paint(ansi[cell.state], `${marks[cell.state]} ${cell.loaderVersion}${cell.enabled === false ? '*' : ''}`)
	if (!cell.stored) return base
	const published = cell.stored.latest ? `↑${cell.stored.latest}` : '↑-'
	return `${base} ${paint(ansi.none, `${published} ${formatBytes(cell.stored.bytes ?? 0)}`)}`
}

export function renderStatus({ config, cells, version, storage, color = false, source = 'Storage' }) {
	const paint = (code, text) => (color ? `\u001b[${code}m${text}\u001b[0m` : text)
	const loaders = [...new Set([...config.targets.filter(isBuildable), ...config.planned].map(t => t.loader))].sort()
	const minecraft = [...config.minecraft].sort(compareVersions).reverse()
	const rows = minecraft.map(mc => [
		paint(ansi.head, mc),
		...loaders.map(loader => {
			const cell = cells.get(`${loader}|${mc}`)
			return cell ? describe(cell, paint) : paint(ansi.none, '·')
		}),
	])
	const header = ['Minecraft', ...loaders.map(l => paint(ansi.head, l))]
	const width = text => stripVTControlCharacters(text).length
	const widths = header.map((_, i) => Math.max(...[header, ...rows].map(row => width(row[i]))))
	const line = row =>
		row
			.map((cell, i) => cell + ' '.repeat(widths[i] - width(cell)))
			.join('   ')
			.trimEnd()
	const legend = [
		paint(ansi.current, '✓ up to date'),
		paint(ansi.stale, '⚠ outdated'),
		paint(ansi.todo, '✗ to build'),
		paint(ansi.planned, '○ planned'),
		paint(ansi.none, '· none   * disabled'),
	].join('  ')
	const out = [paint(ansi.head, `Mod ${version}`), '', line(header), ...rows.map(line), '', legend]
	if (storage)
		out.push(paint(ansi.none, `${source}: ${formatBytes(storage.totalBytes ?? 0)} (↑ = latest published version)`))
	return out.join('\n')
}

/** Reads the storage report; a missing module or an unreachable storage is silently ignored. */
export async function loadStorageReport(env, importer = () => import('./storage/index.mjs')) {
	try {
		const storage = await importer()
		return typeof storage.storageReport === 'function' ? await storage.storageReport({ env }) : null
	} catch {
		return null
	}
}

/**
 * Reads the public index of the API (what the site sees) instead of S3: the PC sees what is published without S3 keys.
 * An unreachable API gives null (the grid is shown without the published figures).
 */
export async function loadRemoteReport({ apiUrl, fetchImpl, importer = () => import('./remote/index.mjs') }) {
	try {
		const remote = await importer()
		return await remote.remoteReport({ apiUrl, fetchImpl })
	} catch {
		return null
	}
}
