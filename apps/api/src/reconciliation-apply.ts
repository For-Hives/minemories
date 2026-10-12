import type { Database } from 'bun:sqlite'
import { writeFile } from 'node:fs/promises'
import { validateReconciliationPlan } from './reconciliation-files'
import type { StorageInspection, StorageInventory } from './storage-inventory'
import { classifyStorageCandidate, type DeletionClaim, type ReconciliationProposal } from './storage-reconciliation'
import type { ReconciliationEntry, ReconciliationPlan } from './storage-reconciliation-plan'
import { ObjectReferences } from './storage-references'

export interface ApplyOptions {
	databasePath: string
	backupPath: string
	apiStopped: boolean
	now?: number
}
export interface ApplyReport {
	queued: number
	repaired: number
	skipped: number
	ignored: number
	backupPath: string
}
interface PreparedEntry {
	entry: ReconciliationEntry
	inspection: StorageInspection
}
function observed(value: StorageInspection): string {
	const object = value.object
	return JSON.stringify([
		// Garage LIST retains milliseconds that HTTP Last-Modified cannot represent.
		object ? [object.key, object.size, Math.floor(object.modified / 1000), object.etag] : null,
		value.uploads
			.map(upload => [upload.key, upload.id, upload.created])
			.sort((a, b) => String(a[1]).localeCompare(String(b[1]))),
	])
}
function sameClaim(a: DeletionClaim | null, b: DeletionClaim | null): boolean {
	if (!(a && b)) return a === b
	return a.user_id === b.user_id && a.size === b.size && a.discard_upload === b.discard_upload
}
function sameProposal(a: ReconciliationProposal, b: ReconciliationProposal): boolean {
	return (
		a.action === b.action &&
		a.reason === b.reason &&
		a.owner === b.owner &&
		a.size === b.size &&
		a.discardUpload === b.discardUpload
	)
}
async function prepare(plan: ReconciliationPlan, inventory: StorageInventory, report: ApplyReport) {
	const prepared: PreparedEntry[] = []
	for (const entry of plan.entries) {
		if (entry.proposal.action !== 'queue' && entry.proposal.action !== 'repair') {
			report.ignored++
			continue
		}
		// biome-ignore lint/performance/noAwaitInLoops: One metadata inspection at a time bounds provider requests.
		const inspection = await inventory.inspect(entry.candidate.key)
		if (observed(inspection) !== observed(entry.candidate)) {
			report.skipped++
			continue
		}
		prepared.push({ entry, inspection })
	}
	return prepared
}
function applyEntry(
	database: Database,
	references: ObjectReferences,
	prepared: PreparedEntry,
	now: number,
	report: ApplyReport
) {
	const { entry, inspection } = prepared
	const key = entry.candidate.key
	const job = database
		.query('SELECT user_id, size, discard_upload FROM object_deletions WHERE object_key = ?')
		.get(key) as DeletionClaim | null
	const current = { key, ...inspection, job }
	const proposal = classifyStorageCandidate(references, current, now)
	if (!(sameClaim(job, entry.candidate.job) && sameProposal(proposal, entry.proposal))) {
		report.skipped++
		return
	}
	if (proposal.action === 'queue') {
		database
			.query(`INSERT INTO object_deletions
			(object_key, created_at, user_id, size, discard_upload) VALUES (?, ?, ?, ?, 1)`)
			.run(key, now, proposal.owner, proposal.size)
		report.queued++
	} else {
		database
			.query(`UPDATE object_deletions SET user_id = COALESCE(user_id, ?),
			size = COALESCE(size, ?), discard_upload = ? WHERE object_key = ?`)
			.run(proposal.owner, proposal.size, Number(proposal.discardUpload), key)
		report.repaired++
	}
}
async function backup(database: Database, path: string): Promise<void> {
	await writeFile(path, '', { flag: 'wx', mode: 0o600 })
	database.query('VACUUM INTO ?').run(path)
}
export async function applyReconciliationPlan(
	database: Database,
	inventory: StorageInventory,
	value: ReconciliationPlan,
	options: ApplyOptions
): Promise<ApplyReport> {
	const plan = validateReconciliationPlan(value)
	if (!options.apiStopped) throw new Error('Stop the API before applying a reconciliation plan.')
	if (database.filename !== plan.databasePath || options.databasePath !== plan.databasePath)
		throw new Error('Reconciliation plan targets another database.')
	const now = options.now ?? Date.now()
	if (!Number.isSafeInteger(now) || now < plan.createdAt) throw new Error('Invalid reconciliation application time.')
	if ((await inventory.identity()) !== plan.storageId) throw new Error('Reconciliation plan targets another storage.')
	const report: ApplyReport = { queued: 0, repaired: 0, skipped: 0, ignored: 0, backupPath: options.backupPath }
	await backup(database, options.backupPath)
	const prepared = await prepare(plan, inventory, report)
	if ((await inventory.identity()) !== plan.storageId) throw new Error('Storage changed during reconciliation.')
	const references = new ObjectReferences(database)
	database
		.transaction(() => {
			for (const entry of prepared) applyEntry(database, references, entry, now, report)
		})
		.immediate()
	return report
}
