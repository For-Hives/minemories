import { Database } from 'bun:sqlite'
import { realpath } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { coldStorageCandidates, coldStorageInactiveDays } from './cold-storage-policy'

const positiveInteger = /^\d+$/

interface PreviewContext {
	databasePath?: string
	now?: () => number
}

export async function runColdStorageCli(args: string[], context: PreviewContext = {}) {
	const { values } = parseArgs({
		args,
		strict: true,
		allowPositionals: false,
		options: { 'idle-days': { type: 'string' }, limit: { type: 'string' }, help: { type: 'boolean' } },
	})
	if (values.help) return { usage: 'Prévisualiser uniquement : [--idle-days <60-90>] [--limit <1-1000>].' }
	const days = coldStorageInactiveDays(values['idle-days'] ?? process.env.COLD_STORAGE_INACTIVE_DAYS),
		limit = Number(values.limit ?? '100')
	if (values.limit !== undefined && !positiveInteger.test(values.limit)) throw new Error('Invalid preview limit.')
	const path = await realpath(context.databasePath ?? process.env.DATABASE_PATH ?? './data/minemories.sqlite'),
		database = new Database(path, { readonly: true, create: false })
	try {
		const now = (context.now ?? Date.now)(),
			candidates = coldStorageCandidates(database, days, now, limit)
		return {
			mode: 'preview',
			createdAt: now,
			inactiveDays: days,
			limit,
			candidates,
			physicalBytes: candidates.reduce((sum, row) => sum + row.size, 0),
		}
	} finally {
		database.close()
	}
}

export async function executeColdStorageCli(args: string[], context: PreviewContext = {}): Promise<number> {
	try {
		process.stdout.write(`${JSON.stringify(await runColdStorageCli(args, context))}\n`)
		return 0
	} catch {
		console.error('Prévisualisation interrompue : vérifier les options et la base migrée. Aucun objet modifié.')
		return 1
	}
}
if (import.meta.main) process.exitCode = await executeColdStorageCli(Bun.argv.slice(2))
